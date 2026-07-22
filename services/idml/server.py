"""IDML layout extractor.

Parses an Adobe InDesign IDML package (a zip of XML parts) and returns a
neutral JSON "layout spec": page geometry, margins/bleed, fonts, colors and
paragraph/character styles. The worker's template-porting bot turns that spec
into a Scribus (.sla) or LaTeX template scaffold.

IDML reference: an .idml file contains designmap.xml, MasterSpreads/, Spreads/,
Resources/{Styles,Graphic,Fonts,Preferences}.xml among others.
"""
import base64
import io
import re
import zipfile

from flask import Flask, request, jsonify
from lxml import etree

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB — IDML packages embed fonts/images

# Never resolve DTDs/external entities — an IDML part crafted with an XXE
# payload (<!ENTITY xxe SYSTEM "file:///etc/passwd">) must not be able to
# read local files or reach the network through this parser.
_XML_PARSER = etree.XMLParser(resolve_entities=False, no_network=True, dtd_validation=False, load_dtd=False)

# Zip-bomb guard: a crafted .idml can claim a tiny compressed size but expand
# to gigabytes on read(). Cap both a single part and the package as a whole
# before anything is decompressed.
MAX_ENTRY_UNCOMPRESSED = 50 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED = 300 * 1024 * 1024


def _check_zip_size(z):
    total = 0
    for info in z.infolist():
        if info.file_size > MAX_ENTRY_UNCOMPRESSED:
            raise ValueError(f'{info.filename} exceeds the maximum allowed part size')
        total += info.file_size
        if total > MAX_TOTAL_UNCOMPRESSED:
            raise ValueError('IDML package exceeds the maximum allowed uncompressed size')


def _parse(data):
    return etree.parse(io.BytesIO(data), parser=_XML_PARSER)


# IDML namespaces are noisy; we match on local-name() everywhere instead.


def _local(el):
    return etree.QName(el).localname


def _find_all(tree, local_name):
    return tree.iter('{*}' + local_name)


def _attr(el, name, default=None):
    # IDML attributes are un-namespaced on package elements.
    return el.get(name, default)


def _num(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def extract_preferences(z):
    """Document setup: page size, bleed, columns."""
    spec = {}
    try:
        tree = _parse(z.read('Resources/Preferences.xml'))
    except KeyError:
        return spec
    for prefs in _find_all(tree, 'DocumentPreference'):
        spec['pageWidth'] = _num(_attr(prefs, 'PageWidth'))
        spec['pageHeight'] = _num(_attr(prefs, 'PageHeight'))
        spec['facingPages'] = _attr(prefs, 'FacingPages') == 'true'
        spec['bleedTop'] = _num(_attr(prefs, 'DocumentBleedTopOffset'), 0)
        spec['bleedBottom'] = _num(_attr(prefs, 'DocumentBleedBottomOffset'), 0)
        spec['bleedInside'] = _num(_attr(prefs, 'DocumentBleedInsideOrLeftOffset'), 0)
        spec['bleedOutside'] = _num(_attr(prefs, 'DocumentBleedOutsideOrRightOffset'), 0)
        break
    for margins in _find_all(tree, 'MarginPreference'):
        spec['marginTop'] = _num(_attr(margins, 'Top'))
        spec['marginBottom'] = _num(_attr(margins, 'Bottom'))
        spec['marginLeft'] = _num(_attr(margins, 'Left'))
        spec['marginRight'] = _num(_attr(margins, 'Right'))
        spec['columnCount'] = int(_num(_attr(margins, 'ColumnCount'), 1) or 1)
        spec['columnGutter'] = _num(_attr(margins, 'ColumnGutter'), 12)
        break
    return spec


def extract_margins_from_masters(z, spec):
    """Fallback margins from the first master spread when Preferences lack them."""
    if spec.get('marginTop') is not None:
        return spec
    names = [n for n in z.namelist() if n.startswith('MasterSpreads/')]
    for name in sorted(names)[:1]:
        tree = _parse(z.read(name))
        for margins in _find_all(tree, 'MarginPreference'):
            spec['marginTop'] = _num(_attr(margins, 'Top'), 36)
            spec['marginBottom'] = _num(_attr(margins, 'Bottom'), 36)
            spec['marginLeft'] = _num(_attr(margins, 'Left'), 36)
            spec['marginRight'] = _num(_attr(margins, 'Right'), 36)
            spec['columnCount'] = int(_num(_attr(margins, 'ColumnCount'), 1) or 1)
            spec['columnGutter'] = _num(_attr(margins, 'ColumnGutter'), 12)
            break
    return spec


def extract_fonts(z):
    fonts = []
    try:
        tree = _parse(z.read('Resources/Fonts.xml'))
    except KeyError:
        return fonts
    for family in _find_all(tree, 'FontFamily'):
        name = _attr(family, 'Name')
        if name:
            fonts.append(name)
    return sorted(set(fonts))


def extract_colors(z):
    colors = []
    try:
        tree = _parse(z.read('Resources/Graphic.xml'))
    except KeyError:
        return colors
    for color in _find_all(tree, 'Color'):
        name = (_attr(color, 'Name') or '').strip()
        space = _attr(color, 'Space')
        values = _attr(color, 'ColorValue')
        if not name or name.startswith('$') or values is None:
            continue
        try:
            nums = [float(v) for v in values.split()]
        except ValueError:
            continue
        colors.append({'name': name, 'space': space, 'values': nums})
    return colors


def _style_common(el):
    return {
        'name': re.sub(r'^.*%3a', '', (_attr(el, 'Name') or ''), flags=re.I),
        'fontSize': _num(_attr(el, 'PointSize')),
        'leading': _num(_attr(el, 'Leading')),
        'alignment': _attr(el, 'Justification'),
        'fontFamily': None,
    }


def extract_styles(z):
    para, char = [], []
    try:
        tree = _parse(z.read('Resources/Styles.xml'))
    except KeyError:
        return para, char
    for st in _find_all(tree, 'ParagraphStyle'):
        entry = _style_common(st)
        # AppliedFont lives in Properties/AppliedFont text.
        for prop in _find_all(st, 'AppliedFont'):
            entry['fontFamily'] = prop.text
            break
        entry['spaceBefore'] = _num(_attr(st, 'SpaceBefore'), 0)
        entry['spaceAfter'] = _num(_attr(st, 'SpaceAfter'), 0)
        entry['firstLineIndent'] = _num(_attr(st, 'FirstLineIndent'), 0)
        if entry['name']:
            para.append(entry)
    for st in _find_all(tree, 'CharacterStyle'):
        entry = _style_common(st)
        for prop in _find_all(st, 'AppliedFont'):
            entry['fontFamily'] = prop.text
            break
        if entry['name']:
            char.append(entry)
    return para, char


@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'tool': 'idml-extractor'})


@app.route('/extract', methods=['POST'])
def extract():
    try:
        d = request.get_json(force=True)
        raw = base64.b64decode(d.get('content', ''))
        z = zipfile.ZipFile(io.BytesIO(raw))
        _check_zip_size(z)

        mimetype = ''
        try:
            mimetype = z.read('mimetype').decode('utf-8', 'ignore').strip()
        except KeyError:
            pass
        if mimetype and 'idml' not in mimetype:
            return jsonify({'error': f'Not an IDML package (mimetype={mimetype})'}), 400

        spec = extract_preferences(z)
        spec = extract_margins_from_masters(z, spec)
        para, char = extract_styles(z)
        spec.update({
            # IDML geometry is in points already.
            'units': 'pt',
            'fonts': extract_fonts(z),
            'colors': extract_colors(z),
            'paragraphStyles': para,
            'characterStyles': char,
        })
        # Sensible defaults so generators never see nulls.
        spec.setdefault('pageWidth', 595.276)   # A4 portrait
        spec.setdefault('pageHeight', 841.89)
        for key in ('marginTop', 'marginBottom', 'marginLeft', 'marginRight'):
            if spec.get(key) is None:
                spec[key] = 56.693  # 20 mm
        spec.setdefault('columnCount', 1)
        spec.setdefault('columnGutter', 12)
        for key in ('bleedTop', 'bleedBottom', 'bleedInside', 'bleedOutside'):
            spec.setdefault(key, 0)

        return jsonify({'spec': spec})
    except zipfile.BadZipFile:
        return jsonify({'error': 'File is not a valid IDML (zip) package'}), 400
    except Exception as e:  # noqa: BLE001 — surface everything to the worker
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4100)
