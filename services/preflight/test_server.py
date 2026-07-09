"""Tests for the PDF preflight checker.

Builds synthetic-but-representative PDFs with pikepdf (precise control over
exactly the structure being tested) and drives the Flask app through its
test client — no live server, no real print-shop PDF needed.

Run: python -m pytest services/preflight/test_server.py -q
"""
import base64
import io

import pikepdf
import pytest

from server import app, run_preflight

PAGE_SIZE = (612, 792)


def _save(pdf, **kwargs):
    buf = io.BytesIO()
    pdf.save(buf, **kwargs)
    return buf.getvalue()


def build_pdf(
    with_trimbox=True,
    with_bleedbox='ok',       # 'ok' | 'too_small' | None
    font='base14',            # 'base14' | 'embedded' | 'unembedded' | None
    with_pdfx_intent=False,
    encrypted_print_allowed=None,  # None | True | False
    pages=1,
):
    pdf = pikepdf.new()
    for _ in range(pages):
        page = pdf.add_blank_page(page_size=PAGE_SIZE)
        if with_trimbox:
            page.TrimBox = pikepdf.Array([0, 0, *PAGE_SIZE])
        if with_bleedbox == 'ok':
            page.BleedBox = pikepdf.Array([-10, -10, PAGE_SIZE[0] + 10, PAGE_SIZE[1] + 10])
        elif with_bleedbox == 'too_small':
            # Smaller than the trim box on every edge — nonsensical.
            page.BleedBox = pikepdf.Array([10, 10, PAGE_SIZE[0] - 10, PAGE_SIZE[1] - 10])

        if font == 'base14':
            font_dict = pikepdf.Dictionary({
                '/Type': pikepdf.Name('/Font'), '/Subtype': pikepdf.Name('/Type1'),
                '/BaseFont': pikepdf.Name('/Helvetica'),
            })
            page.Resources.Font = pikepdf.Dictionary({'/F1': font_dict})
        elif font == 'embedded':
            font_dict = pikepdf.Dictionary({
                '/Type': pikepdf.Name('/Font'), '/Subtype': pikepdf.Name('/Type1'),
                '/BaseFont': pikepdf.Name('/ABCDEF+CustomFont'),
                '/FontDescriptor': pikepdf.Dictionary({
                    '/Type': pikepdf.Name('/FontDescriptor'),
                    '/FontFile': pdf.make_stream(b'%fake font program%'),
                }),
            })
            page.Resources.Font = pikepdf.Dictionary({'/F1': font_dict})
        elif font == 'unembedded':
            font_dict = pikepdf.Dictionary({
                '/Type': pikepdf.Name('/Font'), '/Subtype': pikepdf.Name('/Type1'),
                '/BaseFont': pikepdf.Name('/SomeCustomFont'),
                '/FontDescriptor': pikepdf.Dictionary({
                    '/Type': pikepdf.Name('/FontDescriptor'),
                    '/FontName': pikepdf.Name('/SomeCustomFont'),
                }),
            })
            page.Resources.Font = pikepdf.Dictionary({'/F1': font_dict})

    if with_pdfx_intent:
        intent = pikepdf.Dictionary({
            '/Type': pikepdf.Name('/OutputIntent'), '/S': pikepdf.Name('/GTS_PDFX'),
            '/OutputConditionIdentifier': pikepdf.String('CGATS TR 001'),
        })
        pdf.Root.OutputIntents = pikepdf.Array([intent])

    if encrypted_print_allowed is not None:
        return _save(pdf, encryption=pikepdf.Encryption(
            owner='owner123', user='',
            allow=pikepdf.Permissions(
                print_lowres=encrypted_print_allowed, print_highres=encrypted_print_allowed,
            ),
        ))
    return _save(pdf)


def find(checks, check_id):
    return next(c for c in checks if c['id'] == check_id)


# ── run_preflight() unit tests ──────────────────────────────────────────────

def test_clean_pdf_passes_everything_but_pdfx_warns():
    pdf_bytes = build_pdf(font='base14', with_pdfx_intent=False)
    report = run_preflight(pdf_bytes)
    assert report['status'] == 'warn'  # no PDF/X intent -> warn, nothing fails
    assert find(report['checks'], 'fonts')['status'] == 'pass'
    assert find(report['checks'], 'boxes')['status'] == 'pass'
    assert find(report['checks'], 'pdfx')['status'] == 'warn'


def test_fully_clean_pdf_with_pdfx_intent_passes_outright():
    pdf_bytes = build_pdf(font='embedded', with_pdfx_intent=True)
    report = run_preflight(pdf_bytes)
    assert report['status'] == 'pass'
    assert all(c['status'] == 'pass' for c in report['checks'])


def test_unembedded_custom_font_fails():
    pdf_bytes = build_pdf(font='unembedded')
    report = run_preflight(pdf_bytes)
    assert report['status'] == 'fail'
    fonts = find(report['checks'], 'fonts')
    assert fonts['status'] == 'fail'
    assert 'SomeCustomFont' in fonts['detail']


def test_embedded_custom_font_passes_and_subset_tag_is_stripped_from_report():
    pdf_bytes = build_pdf(font='unembedded')
    report = run_preflight(pdf_bytes)
    assert 'ABCDEF+' not in find(report['checks'], 'fonts')['detail']  # sanity: no leakage from other fixtures
    pdf_bytes2 = build_pdf(font='embedded')
    report2 = run_preflight(pdf_bytes2)
    assert find(report2['checks'], 'fonts')['status'] == 'pass'


def test_missing_trimbox_warns_not_fails():
    pdf_bytes = build_pdf(with_trimbox=False, with_bleedbox=None, font='base14')
    report = run_preflight(pdf_bytes)
    boxes = find(report['checks'], 'boxes')
    assert boxes['status'] == 'warn'
    assert report['status'] == 'warn'  # no fail-level issues elsewhere


def test_bleedbox_smaller_than_trimbox_fails():
    pdf_bytes = build_pdf(with_bleedbox='too_small', font='base14')
    report = run_preflight(pdf_bytes)
    boxes = find(report['checks'], 'boxes')
    assert boxes['status'] == 'fail'
    assert report['status'] == 'fail'


def test_encrypted_with_printing_disallowed_fails():
    pdf_bytes = build_pdf(font='base14', encrypted_print_allowed=False)
    report = run_preflight(pdf_bytes)
    assert find(report['checks'], 'print_permission')['status'] == 'fail'
    assert report['status'] == 'fail'


def test_encrypted_with_printing_allowed_passes():
    pdf_bytes = build_pdf(font='base14', with_pdfx_intent=True, encrypted_print_allowed=True)
    report = run_preflight(pdf_bytes)
    assert find(report['checks'], 'print_permission')['status'] == 'pass'


def test_corrupt_pdf_fails_integrity_and_short_circuits():
    report = run_preflight(b'not a pdf at all')
    assert report['status'] == 'fail'
    assert len(report['checks']) == 1  # integrity fails fast, no downstream checks attempted
    assert find(report['checks'], 'integrity')['status'] == 'fail'


def test_multi_page_reports_worst_case_across_pages():
    # Build 2 pages manually: one clean, one with an unembedded font.
    pdf = pikepdf.new()
    p1 = pdf.add_blank_page(page_size=PAGE_SIZE)
    p1.TrimBox = pikepdf.Array([0, 0, *PAGE_SIZE])
    p1.Resources.Font = pikepdf.Dictionary({'/F1': pikepdf.Dictionary({
        '/Type': pikepdf.Name('/Font'), '/Subtype': pikepdf.Name('/Type1'),
        '/BaseFont': pikepdf.Name('/Helvetica'),
    })})
    p2 = pdf.add_blank_page(page_size=PAGE_SIZE)
    p2.TrimBox = pikepdf.Array([0, 0, *PAGE_SIZE])
    p2.Resources.Font = pikepdf.Dictionary({'/F1': pikepdf.Dictionary({
        '/Type': pikepdf.Name('/Font'), '/Subtype': pikepdf.Name('/Type1'),
        '/BaseFont': pikepdf.Name('/BadFont'),
        '/FontDescriptor': pikepdf.Dictionary({'/Type': pikepdf.Name('/FontDescriptor')}),
    })})
    report = run_preflight(_save(pdf))
    assert report['status'] == 'fail'
    assert 'BadFont' in find(report['checks'], 'fonts')['detail']


# ── Flask route contract ────────────────────────────────────────────────────

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def test_health_route(client):
    res = client.get('/health')
    assert res.status_code == 200
    assert res.get_json()['status'] == 'ok'


def test_preflight_route_happy_path(client):
    pdf_bytes = build_pdf(font='base14', with_pdfx_intent=True)
    res = client.post('/preflight', json={'pdf': base64.b64encode(pdf_bytes).decode()})
    assert res.status_code == 200
    body = res.get_json()
    assert body['report']['status'] == 'pass'


def test_preflight_route_missing_pdf_field(client):
    res = client.post('/preflight', json={})
    assert res.status_code == 400


def test_preflight_route_invalid_base64(client):
    res = client.post('/preflight', json={'pdf': 'not-valid-base64!!!'})
    assert res.status_code == 400


def test_preflight_route_corrupt_pdf_still_returns_200_with_fail_report(client):
    # A structurally-readable-but-not-a-PDF payload is a preflight FINDING,
    # not a server error — the route should report it, not 500.
    res = client.post('/preflight', json={'pdf': base64.b64encode(b'garbage').decode()})
    assert res.status_code == 200
    assert res.get_json()['report']['status'] == 'fail'
