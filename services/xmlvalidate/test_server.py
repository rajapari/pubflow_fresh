"""Tests for the XML/EPUB validation service.

Run: python -m pytest services/xmlvalidate/test_server.py -q
"""
import base64

import pytest

from server import app

GOOD_JATS = b'''<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="1.3">
  <front>
    <journal-meta><journal-id>jt</journal-id></journal-meta>
    <article-meta>
      <title-group><article-title>A Complete Test Article</article-title></title-group>
      <contrib-group><contrib><name><surname>Doe</surname></name></contrib></contrib-group>
      <abstract><p>An abstract of sufficient substance.</p></abstract>
    </article-meta>
  </front>
  <body><p>Body text. <graphic xlink:href="fig1.png"/></p></body>
</article>'''


@pytest.fixture()
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def validate(client, kind, raw):
    return client.post('/validate', json={
        'kind': kind, 'content': base64.b64encode(raw).decode(),
    })


def test_health(client):
    res = client.get('/health')
    assert res.status_code == 200
    assert res.get_json()['tool'] == 'xmlvalidate'


def test_complete_jats_passes(client):
    res = validate(client, 'jats', GOOD_JATS)
    assert res.status_code == 200
    body = res.get_json()
    assert body['status'] == 'pass'
    codes = [c['code'] for c in body['checks']]
    assert 'well-formed' in codes
    assert 'dtd-version' in codes


def test_malformed_xml_fails(client):
    res = validate(client, 'jats', b'<article><unclosed>')
    assert res.get_json()['status'] == 'fail'
    assert res.get_json()['checks'][0]['code'] == 'not-well-formed'


def test_wrong_root_fails(client):
    res = validate(client, 'jats', b'<html><body>not jats</body></html>')
    body = res.get_json()
    assert body['status'] == 'fail'
    assert any(c['code'] == 'wrong-root' for c in body['checks'])


def test_missing_title_is_error(client):
    raw = b'''<article dtd-version="1.3"><front>
      <journal-meta/><article-meta><contrib-group/><abstract/></article-meta>
    </front><body/></article>'''
    body = validate(client, 'jats', raw).get_json()
    assert body['status'] == 'fail'
    assert any(c['code'] == 'missing-article-title' and c['level'] == 'error'
               for c in body['checks'])


def test_missing_abstract_only_warns(client):
    raw = b'''<article dtd-version="1.3"><front>
      <journal-meta/>
      <article-meta>
        <title-group><article-title>T</article-title></title-group>
        <contrib-group/>
      </article-meta>
    </front><body/></article>'''
    body = validate(client, 'jats', raw).get_json()
    assert body['status'] == 'warn'
    assert any(c['code'] == 'missing-abstract' and c['level'] == 'warning'
               for c in body['checks'])


def test_graphic_without_href_warns(client):
    raw = GOOD_JATS.replace(b'<graphic xlink:href="fig1.png"/>', b'<graphic/>')
    body = validate(client, 'jats', raw).get_json()
    assert body['status'] == 'warn'
    assert any(c['code'] == 'graphic-no-href' for c in body['checks'])


def test_epub_without_java_warns_not_fails(client, monkeypatch):
    # Local dev boxes may lack Java — the service must degrade, not error.
    import server
    monkeypatch.setattr(server.shutil, 'which', lambda _: None)
    body = validate(client, 'epub', b'PK\x03\x04fakeepub').get_json()
    assert body['status'] == 'warn'
    assert body['checks'][0]['code'] == 'epubcheck-unavailable'


def test_unknown_kind_rejected(client):
    res = validate(client, 'docx', b'x')
    assert res.status_code == 400


def test_empty_content_rejected(client):
    res = client.post('/validate', json={'kind': 'jats', 'content': ''})
    assert res.status_code == 400
