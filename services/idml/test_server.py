"""Tests for the IDML layout extractor.

Builds a synthetic-but-representative IDML package (zip of XML parts with the
adobe namespace layout) and drives the Flask app through its test client.

Run: python -m pytest services/idml/test_server.py -q
"""
import base64
import io
import json
import zipfile

import pytest

from server import app

IDMLPKG = 'http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging'


def build_idml(
    page_width='595.2755905511812',
    page_height='841.8897637795276',
    with_preferences=True,
    with_styles=True,
    with_graphic=True,
    with_fonts=True,
    mimetype='application/vnd.adobe.indesign-idml-package',
):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('mimetype', mimetype)
        z.writestr('designmap.xml', '<?xml version="1.0"?><Document/>')

        if with_preferences:
            z.writestr('Resources/Preferences.xml', f'''<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Preferences xmlns:idPkg="{IDMLPKG}">
  <DocumentPreference PageWidth="{page_width}" PageHeight="{page_height}"
    FacingPages="true"
    DocumentBleedTopOffset="8.503937007874017"
    DocumentBleedBottomOffset="8.503937007874017"
    DocumentBleedInsideOrLeftOffset="8.503937007874017"
    DocumentBleedOutsideOrRightOffset="8.503937007874017"/>
  <MarginPreference Top="56.69291338582678" Bottom="70.86614173228347"
    Left="51.02362204724409" Right="51.02362204724409"
    ColumnCount="2" ColumnGutter="14.173228346456694"/>
</idPkg:Preferences>''')

        if with_styles:
            z.writestr('Resources/Styles.xml', f'''<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Styles xmlns:idPkg="{IDMLPKG}">
  <RootParagraphStyleGroup>
    <ParagraphStyle Self="ParagraphStyle/Body" Name="Body Text" PointSize="9.5"
      Leading="12" Justification="LeftJustified" SpaceBefore="0" SpaceAfter="4"
      FirstLineIndent="14">
      <Properties><AppliedFont type="string">Minion Pro</AppliedFont></Properties>
    </ParagraphStyle>
    <ParagraphStyle Self="ParagraphStyle/H1" Name="Heading 1" PointSize="18"
      Leading="21.6" Justification="CenterAlign">
      <Properties><AppliedFont type="string">Myriad Pro</AppliedFont></Properties>
    </ParagraphStyle>
  </RootParagraphStyleGroup>
  <RootCharacterStyleGroup>
    <CharacterStyle Self="CharacterStyle/Emph" Name="Emphasis" PointSize="9.5">
      <Properties><AppliedFont type="string">Minion Pro Italic</AppliedFont></Properties>
    </CharacterStyle>
  </RootCharacterStyleGroup>
</idPkg:Styles>''')

        if with_graphic:
            z.writestr('Resources/Graphic.xml', f'''<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Graphic xmlns:idPkg="{IDMLPKG}">
  <Color Self="Color/JournalBlue" Name="JournalBlue" Space="CMYK"
    ColorValue="100 60 0 10"/>
  <Color Self="Color/AccentRed" Name="AccentRed" Space="RGB"
    ColorValue="200 30 45"/>
  <Color Self="Color/$Internal" Name="$Internal" Space="CMYK" ColorValue="0 0 0 100"/>
</idPkg:Graphic>''')

        if with_fonts:
            z.writestr('Resources/Fonts.xml', f'''<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Fonts xmlns:idPkg="{IDMLPKG}">
  <FontFamily Self="ff1" Name="Minion Pro"/>
  <FontFamily Self="ff2" Name="Myriad Pro"/>
</idPkg:Fonts>''')

    return buf.getvalue()


@pytest.fixture()
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def post_extract(client, raw):
    return client.post('/extract', json={'content': base64.b64encode(raw).decode()})


def test_health(client):
    res = client.get('/health')
    assert res.status_code == 200
    assert res.get_json()['tool'] == 'idml-extractor'


def test_full_extraction(client):
    res = post_extract(client, build_idml())
    assert res.status_code == 200, res.get_data(as_text=True)
    spec = res.get_json()['spec']

    assert spec['pageWidth'] == pytest.approx(595.2755905511812)
    assert spec['pageHeight'] == pytest.approx(841.8897637795276)
    assert spec['facingPages'] is True
    assert spec['bleedTop'] == pytest.approx(8.503937007874017)
    assert spec['marginTop'] == pytest.approx(56.69291338582678)
    assert spec['marginBottom'] == pytest.approx(70.86614173228347)
    assert spec['columnCount'] == 2
    assert spec['columnGutter'] == pytest.approx(14.173228346456694)
    assert spec['units'] == 'pt'
    assert spec['fonts'] == ['Minion Pro', 'Myriad Pro']

    colors = {c['name']: c for c in spec['colors']}
    assert colors['JournalBlue']['space'] == 'CMYK'
    assert colors['JournalBlue']['values'] == [100.0, 60.0, 0.0, 10.0]
    assert colors['AccentRed']['space'] == 'RGB'
    # internal $-prefixed swatches are skipped
    assert '$Internal' not in colors

    para = {p['name']: p for p in spec['paragraphStyles']}
    assert para['Body Text']['fontSize'] == pytest.approx(9.5)
    assert para['Body Text']['leading'] == pytest.approx(12)
    assert para['Body Text']['fontFamily'] == 'Minion Pro'
    assert para['Body Text']['alignment'] == 'LeftJustified'
    assert para['Body Text']['firstLineIndent'] == pytest.approx(14)
    assert para['Heading 1']['alignment'] == 'CenterAlign'

    char = {c['name']: c for c in spec['characterStyles']}
    assert char['Emphasis']['fontFamily'] == 'Minion Pro Italic'


def test_missing_parts_fall_back_to_defaults(client):
    raw = build_idml(with_preferences=False, with_styles=False,
                     with_graphic=False, with_fonts=False)
    res = post_extract(client, raw)
    assert res.status_code == 200
    spec = res.get_json()['spec']
    # A4 defaults + 20mm margins
    assert spec['pageWidth'] == pytest.approx(595.276)
    assert spec['pageHeight'] == pytest.approx(841.89)
    for key in ('marginTop', 'marginBottom', 'marginLeft', 'marginRight'):
        assert spec[key] == pytest.approx(56.693)
    assert spec['columnCount'] == 1
    assert spec['fonts'] == []
    assert spec['colors'] == []
    assert spec['paragraphStyles'] == []


def test_rejects_non_idml_mimetype(client):
    res = post_extract(client, build_idml(mimetype='application/epub+zip'))
    assert res.status_code == 400
    assert 'Not an IDML' in res.get_json()['error']


def test_rejects_corrupt_zip(client):
    res = post_extract(client, b'this is definitely not a zip archive')
    assert res.status_code == 400
    assert 'zip' in res.get_json()['error'].lower()


def test_rejects_empty_body(client):
    res = client.post('/extract', json={'content': ''})
    assert res.status_code == 400
