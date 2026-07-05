"""Contract tests for the LaTeX compile service.

The real compiler isn't available in CI/dev boxes, so subprocess.run is
stubbed to emit a fake PDF. What we verify is the HTTP contract the worker
relies on: key acceptance (source|latex), resource files written next to the
document, and the response shape {pdf, logs, errors, metadata}.

Run: python -m pytest services/latex/test_server.py -q
"""
import base64
import os

import pytest

import server
from server import app


class FakeCompletedProcess:
    def __init__(self):
        self.returncode = 0
        self.stdout = 'This is XeTeX (fake)\nOutput written on doc.pdf.'
        self.stderr = ''


@pytest.fixture()
def client(monkeypatch):
    seen = {'resources': [], 'cmds': []}

    def fake_run(cmd, **kwargs):
        cwd = kwargs.get('cwd')
        seen['cmds'].append(cmd)
        # Record which extra files the handler placed beside the source.
        seen['resources'] = sorted(
            f for f in os.listdir(cwd) if f not in ('doc.tex', 'doc.pdf')
        )
        with open(os.path.join(cwd, 'doc.pdf'), 'wb') as fh:
            fh.write(b'%PDF-1.7 fake\n%%EOF')
        return FakeCompletedProcess()

    monkeypatch.setattr(server.subprocess, 'run', fake_run)
    app.config['TESTING'] = True
    with app.test_client() as c:
        c.seen = seen
        yield c


def test_source_key_and_response_shape(client):
    res = client.post('/compile', json={
        'source': '\\documentclass{article}\\begin{document}Hi\\end{document}',
        'engine': 'xelatex', 'passes': 2,
    })
    assert res.status_code == 200
    body = res.get_json()
    assert base64.b64decode(body['pdf']).startswith(b'%PDF')
    assert body['errors'] == []
    assert 'Pass 1' in body['logs'] and 'Pass 2' in body['logs']
    assert body['metadata'] == {'engine': 'xelatex', 'passes': 2}


def test_legacy_latex_key_still_accepted(client):
    res = client.post('/compile', json={'latex': '\\documentclass{article}x'})
    assert res.status_code == 200
    assert 'pdf' in res.get_json()


def test_resources_written_beside_source(client):
    cls = base64.b64encode(b'\\ProvidesClass{myjournal}').decode()
    logo = base64.b64encode(b'PNGDATA').decode()
    res = client.post('/compile', json={
        'source': '\\documentclass{myjournal}x',
        'resources': {
            'myjournal.cls': cls,
            'logo.png': logo,
            # path traversal must be neutralized to a basename
            '../../etc/evil.sty': base64.b64encode(b'bad').decode(),
        },
    })
    assert res.status_code == 200
    assert 'myjournal.cls' in client.seen['resources']
    assert 'logo.png' in client.seen['resources']
    assert 'evil.sty' in client.seen['resources']
    assert not any('..' in r or '/' in r for r in client.seen['resources'])


def test_invalid_engine_rejected(client):
    res = client.post('/compile', json={'source': 'x', 'engine': 'pdftex-hax'})
    assert res.status_code == 400


def test_passes_clamped_to_four(client):
    res = client.post('/compile', json={'source': 'x', 'passes': 99})
    assert res.status_code == 200
    assert res.get_json()['metadata']['passes'] == 4
    assert len(client.seen['cmds']) == 4
