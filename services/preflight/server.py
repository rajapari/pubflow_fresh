"""PDF preflight checker — the pre-press gate before PROOF_REVIEW.

Deliberately lighter than a full ISO 15930 PDF/X conformance validator
(veraPDF is the real thing for that, but it's a JVM service and this project
already learned the hard way that stacking JVMs on a modest dev/deploy box
causes real problems — see docs/bots-architecture.md). This checks the three
things from the roadmap that most commonly break real print jobs:

  1. Embedded fonts    — the #1 cause of "looks fine here, wrong on their
                          printer" bugs. Any non-Base-14 font without an
                          embedded font program is a hard fail.
  2. Trim/bleed boxes   — missing TrimBox is a warning (MediaBox-only PDFs
                          are valid, just less precise); a BleedBox smaller
                          than the TrimBox is nonsensical and a hard fail.
  3. PDF/X OutputIntent — presence is checked (a warning if absent), not
                          full ISO conformance of the intent itself. This is
                          the explicit scope line between this service and
                          veraPDF; documented, not silently pretended away.

Plus basic structural sanity: the file opens, has pages, and isn't
encrypted in a way that would block printing.
"""
import base64
import io

import pikepdf
from flask import Flask, request, jsonify

app = Flask(__name__)

# The 14 standard PDF fonts never need embedding — every PDF-compliant
# renderer/printer ships them. Matched case-insensitively against the
# BaseFont name (which often carries a subset tag prefix like "ABCDEF+").
BASE14 = {
    'helvetica', 'helvetica-bold', 'helvetica-oblique', 'helvetica-boldoblique',
    'courier', 'courier-bold', 'courier-oblique', 'courier-boldoblique',
    'times-roman', 'times-bold', 'times-italic', 'times-bolditalic',
    'symbol', 'zapfdingbats', 'arial', 'arial,bold', 'arial-bolditalicmt',
    'arialmt', 'timesnewromanpsmt',
}


def _strip_subset_tag(name):
    # Subsetted fonts are named "ABCDEF+RealName" (6 uppercase letters + '+').
    if len(name) > 7 and name[6] == '+' and name[:6].isupper() and name[:6].isalpha():
        return name[7:]
    return name


def check_fonts_embedded(pdf):
    """Returns (status, detail) — 'pass'/'fail' + list of unembedded fonts."""
    unembedded = set()
    for page in pdf.pages:
        resources = page.get('/Resources', {})
        fonts = resources.get('/Font', {})
        for _, font in dict(fonts).items():
            try:
                base_font = str(font.get('/BaseFont', ''))
            except Exception:
                continue
            clean_name = _strip_subset_tag(base_font.lstrip('/'))
            if clean_name.lower() in BASE14:
                continue
            descriptor = font.get('/FontDescriptor')
            if descriptor is None:
                # Composite (Type0) fonts nest the descriptor under DescendantFonts.
                descendants = font.get('/DescendantFonts')
                if descendants:
                    try:
                        descriptor = descendants[0].get('/FontDescriptor')
                    except Exception:
                        descriptor = None
            embedded = descriptor is not None and any(
                k in descriptor for k in ('/FontFile', '/FontFile2', '/FontFile3')
            )
            if not embedded:
                unembedded.add(clean_name or '(unnamed font)')

    if unembedded:
        return 'fail', f'{len(unembedded)} font(s) not embedded: {", ".join(sorted(unembedded))}'
    return 'pass', 'All non-standard fonts are embedded'


def check_boxes(pdf):
    """TrimBox/BleedBox presence and sanity, worst-case across all pages."""
    missing_trim = 0
    bad_bleed = 0
    for page in pdf.pages:
        trim = page.get('/TrimBox') or page.get('/MediaBox')
        if '/TrimBox' not in page:
            missing_trim += 1
        bleed = page.get('/BleedBox')
        if bleed is not None and trim is not None:
            try:
                bx0, by0, bx1, by1 = [float(v) for v in bleed]
                tx0, ty0, tx1, ty1 = [float(v) for v in trim]
                if bx0 > tx0 or by0 > ty0 or bx1 < tx1 or by1 < ty1:
                    bad_bleed += 1
            except (ValueError, TypeError):
                pass

    if bad_bleed:
        return 'fail', f'{bad_bleed} page(s) have a BleedBox smaller than the TrimBox'
    if missing_trim:
        return 'warn', f'{missing_trim} page(s) have no explicit TrimBox (falls back to MediaBox)'
    return 'pass', 'TrimBox present and BleedBox (where set) encloses it on every page'


def check_pdfx_intent(pdf):
    intents = pdf.Root.get('/OutputIntents')
    if not intents:
        return 'warn', 'No PDF/X OutputIntent declared — not all printers require this, confirm with yours'
    for intent in intents:
        try:
            if str(intent.get('/S', '')).lstrip('/') == 'GTS_PDFX':
                return 'pass', f'PDF/X OutputIntent present ({intent.get("/OutputConditionIdentifier", "unspecified")})'
        except Exception:
            continue
    return 'warn', 'OutputIntent present but not tagged GTS_PDFX'


def check_print_permission(pdf):
    if not pdf.is_encrypted:
        return 'pass', 'Not encrypted'
    try:
        allowed = pdf.allow.print_lowres or pdf.allow.print_highres
    except Exception:
        return 'warn', 'Encrypted — could not determine print permission'
    return ('pass', 'Encrypted but printing is permitted') if allowed else \
           ('fail', 'Encrypted with printing disallowed')


def run_preflight(pdf_bytes):
    checks = []

    def add(check_id, label, status, detail):
        checks.append({'id': check_id, 'label': label, 'status': status, 'detail': detail})

    try:
        pdf = pikepdf.open(io.BytesIO(pdf_bytes))
    except Exception as e:
        add('integrity', 'File integrity', 'fail', f'PDF could not be opened: {e}')
        return {'status': 'fail', 'checks': checks}

    page_count = len(pdf.pages)
    if page_count == 0:
        add('integrity', 'File integrity', 'fail', 'PDF has zero pages')
    else:
        add('integrity', 'File integrity', 'pass', f'{page_count} page(s), opens cleanly')

        for check_id, label, fn in [
            ('fonts', 'Embedded fonts', check_fonts_embedded),
            ('boxes', 'Trim/bleed boxes', check_boxes),
            ('pdfx', 'PDF/X OutputIntent', check_pdfx_intent),
            ('print_permission', 'Print permission', check_print_permission),
        ]:
            status, detail = fn(pdf)
            add(check_id, label, status, detail)

    statuses = [c['status'] for c in checks]
    overall = 'fail' if 'fail' in statuses else ('warn' if 'warn' in statuses else 'pass')
    return {'status': overall, 'checks': checks}


@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'tool': 'pdf-preflight'})


@app.route('/preflight', methods=['POST'])
def preflight():
    data = request.get_json(silent=True) or {}
    pdf_b64 = data.get('pdf')
    if not pdf_b64:
        return jsonify({'error': 'Missing "pdf" (base64-encoded) in request body'}), 400
    try:
        pdf_bytes = base64.b64decode(pdf_b64)
    except Exception:
        return jsonify({'error': 'Invalid base64 in "pdf" field'}), 400

    try:
        report = run_preflight(pdf_bytes)
        return jsonify({'report': report})
    except Exception as e:  # noqa: BLE001 — surface everything to the worker
        return jsonify({'error': str(e)}), 500


@app.route('/merge', methods=['POST'])
def merge():
    """Concatenate PDFs in order (Issue Assembler: ToC + articles → one file).

    Body: {"pdfs": [<base64>, ...]} → {"pdf": <base64>, "pageCount": n}
    """
    data = request.get_json(silent=True) or {}
    pdfs_b64 = data.get('pdfs')
    if not pdfs_b64 or not isinstance(pdfs_b64, list):
        return jsonify({'error': 'Missing "pdfs" (list of base64 PDFs) in request body'}), 400

    try:
        merged = pikepdf.Pdf.new()
        for i, b64 in enumerate(pdfs_b64):
            try:
                part = pikepdf.open(io.BytesIO(base64.b64decode(b64)))
            except Exception as e:
                return jsonify({'error': f'PDF #{i + 1} is unreadable: {e}'}), 400
            merged.pages.extend(part.pages)

        if len(merged.pages) == 0:
            return jsonify({'error': 'Merged document has no pages'}), 400

        out = io.BytesIO()
        merged.save(out)
        return jsonify({
            'pdf': base64.b64encode(out.getvalue()).decode(),
            'pageCount': len(merged.pages),
        })
    except Exception as e:  # noqa: BLE001 — surface everything to the worker
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4200)
