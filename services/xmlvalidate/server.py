"""XML/EPUB validation service (Stage 11).

POST /validate {kind: 'jats'|'epub', content: <base64>} →
  {status: 'pass'|'warn'|'fail', checks: [{level, code, message}, ...]}

JATS: well-formedness plus structural checks with lxml — the elements every
downstream consumer (PMC, Crossref, portals) requires. Full DTD validation
needs the NLM DTD bundle; the structural pass catches the failures that
actually block deposits without a 100MB DTD image.

EPUB: delegated to epubcheck (Java). When Java/epubcheck are unavailable
(local dev), returns status 'warn' with an explanatory check instead of
failing — CI/production images always bundle it.
"""
import base64
import json
import os
import shutil
import subprocess
import tempfile

from flask import Flask, request, jsonify
from lxml import etree

app = Flask(__name__)

EPUBCHECK_JAR = os.environ.get('EPUBCHECK_JAR', '/opt/epubcheck/epubcheck.jar')

FAIL = 'fail'
WARN = 'warn'
PASS = 'pass'


def check(level, code, message):
    return {'level': level, 'code': code, 'message': message}


# ── JATS ─────────────────────────────────────────────────────────────────────

# element → (level-if-missing, human name). Front-matter identifiers matter
# most: without them Crossref/PMC deposits are rejected outright.
JATS_REQUIRED = [
    ('front',                    'error', 'front matter'),
    ('front/journal-meta',       'error', 'journal metadata'),
    ('front/article-meta',       'error', 'article metadata'),
    ('front/article-meta/title-group/article-title', 'error', 'article title'),
    ('front/article-meta/contrib-group', 'warning', 'contributor group (authors)'),
    ('front/article-meta/abstract',      'warning', 'abstract'),
    ('body',                     'warning', 'article body'),
]


def validate_jats(raw: bytes):
    checks = []
    try:
        root = etree.fromstring(raw)
    except etree.XMLSyntaxError as e:
        return FAIL, [check('error', 'not-well-formed', str(e))]

    checks.append(check('info', 'well-formed', 'XML is well-formed'))

    local_root = etree.QName(root).localname
    if local_root != 'article':
        return FAIL, checks + [check(
            'error', 'wrong-root',
            f'Root element is <{local_root}>, JATS requires <article>')]

    dtd_version = root.get('dtd-version')
    if dtd_version:
        checks.append(check('info', 'dtd-version', f'Declares JATS dtd-version {dtd_version}'))
    else:
        checks.append(check('warning', 'no-dtd-version', 'No dtd-version attribute on <article>'))

    has_error = False
    has_warning = not dtd_version
    for path, level, label in JATS_REQUIRED:
        # namespace-agnostic search over local names
        steps = '/'.join(f"*[local-name()='{p}']" for p in path.split('/'))
        found = root.xpath(f'./{steps}')
        if found:
            checks.append(check('info', f'has-{path.split("/")[-1]}', f'Found {label}'))
        else:
            checks.append(check(level, f'missing-{path.split("/")[-1]}', f'Missing {label} (<{path}>)'))
            if level == 'error':
                has_error = True
            else:
                has_warning = True

    # every graphic/inline-graphic should carry an @xlink:href
    for g in root.xpath(".//*[local-name()='graphic' or local-name()='inline-graphic']"):
        href = next((v for k, v in g.attrib.items() if k.endswith('href')), None)
        if not href:
            checks.append(check('warning', 'graphic-no-href', 'A <graphic> has no xlink:href'))
            has_warning = True

    status = FAIL if has_error else (WARN if has_warning else PASS)
    return status, checks


# ── EPUB ─────────────────────────────────────────────────────────────────────

def validate_epub(raw: bytes):
    java = shutil.which('java')
    if not java or not os.path.exists(EPUBCHECK_JAR):
        return WARN, [check(
            'warning', 'epubcheck-unavailable',
            'epubcheck (Java) not installed in this environment — EPUB not validated')]

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'book.epub')
        with open(path, 'wb') as fh:
            fh.write(raw)
        out = os.path.join(tmp, 'report.json')
        subprocess.run(
            [java, '-jar', EPUBCHECK_JAR, path, '--json', out, '--quiet'],
            capture_output=True, text=True, timeout=180,
        )
        # epubcheck exits non-zero on findings; the JSON report is authoritative.
        if not os.path.exists(out):
            return FAIL, [check('error', 'epubcheck-crashed', 'epubcheck produced no report')]
        report = json.load(open(out, encoding='utf-8'))

    checks = []
    has_error = has_warning = False
    for m in report.get('messages', []):
        sev = (m.get('severity') or '').upper()
        level = 'error' if sev in ('ERROR', 'FATAL') else ('warning' if sev == 'WARNING' else 'info')
        has_error = has_error or level == 'error'
        has_warning = has_warning or level == 'warning'
        locations = m.get('locations') or []
        where = f" ({locations[0].get('path')})" if locations else ''
        checks.append(check(level, m.get('ID', 'epubcheck'), f"{m.get('message', '')}{where}"))
    if not checks:
        checks.append(check('info', 'epubcheck-clean', 'epubcheck found no issues'))

    status = FAIL if has_error else (WARN if has_warning else PASS)
    return status, checks


@app.route('/health')
def health():
    return jsonify({
        'status': 'ok', 'tool': 'xmlvalidate',
        'epubcheck': bool(shutil.which('java') and os.path.exists(EPUBCHECK_JAR)),
    })


@app.route('/validate', methods=['POST'])
def validate():
    try:
        d = request.get_json(force=True)
        kind = d.get('kind')
        raw = base64.b64decode(d.get('content', ''))
        if not raw:
            return jsonify({'error': 'content is empty'}), 400
        if kind == 'jats':
            status, checks = validate_jats(raw)
        elif kind == 'epub':
            status, checks = validate_epub(raw)
        else:
            return jsonify({'error': f'unknown kind: {kind}'}), 400
        return jsonify({'status': status, 'checks': checks})
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'validation timed out'}), 504
    except Exception as e:  # noqa: BLE001
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4300)
