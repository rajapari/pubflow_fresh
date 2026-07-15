"""Tests for the artwork QA / processing service.

Builds synthetic images with Pillow directly and drives the Flask app
through its test client — no live server needed.

Run: python -m pytest services/image/test_server.py -q
"""
import base64
import io

import pytest
from PIL import Image, ImageCms

from server import app, run_process

PAGE = (200, 100)  # deliberately non-square, to check aspect preservation


def _encode(img, fmt='PNG', **kwargs):
    buf = io.BytesIO()
    img.save(buf, format=fmt, **kwargs)
    return buf.getvalue()


def rgb_png(dpi=None):
    img = Image.new('RGB', PAGE, color=(10, 20, 30))
    kwargs = {'dpi': dpi} if dpi else {}
    return _encode(img, 'PNG', **kwargs)


def rgba_png():
    img = Image.new('RGBA', PAGE, color=(10, 20, 30, 128))
    return _encode(img, 'PNG')


def grayscale_png():
    img = Image.new('L', PAGE, color=128)
    return _encode(img, 'PNG')


def cmyk_jpeg():
    img = Image.new('CMYK', PAGE, color=(0, 0, 0, 50))
    return _encode(img, 'JPEG')


def png_with_real_icc():
    img = Image.new('RGB', PAGE, color=(200, 50, 50))
    profile = ImageCms.createProfile('sRGB')
    icc_bytes = ImageCms.ImageCmsProfile(profile).tobytes()
    return _encode(img, 'PNG', icc_profile=icc_bytes)


# ── run_process() unit tests ────────────────────────────────────────────────

def test_extracts_width_height_and_dpi():
    result = run_process(rgb_png(dpi=(300, 300)), tasks=['EXTRACT_METADATA'])
    assert result['metadata']['width'] == PAGE[0]
    assert result['metadata']['height'] == PAGE[1]
    assert result['metadata']['dpi'] == 300
    assert result['errors'] == []


def test_missing_dpi_reports_none_not_a_crash():
    result = run_process(rgb_png(), tasks=['VALIDATE_DPI'])
    assert result['metadata']['dpi'] is None


def test_color_mode_rgb():
    result = run_process(rgb_png(), tasks=['VALIDATE_COLORMODE'])
    assert result['metadata']['colorMode'] == 'RGB'


def test_color_mode_grayscale():
    result = run_process(grayscale_png(), tasks=['VALIDATE_COLORMODE'])
    assert result['metadata']['colorMode'] == 'GRAYSCALE'


def test_color_mode_cmyk():
    result = run_process(cmyk_jpeg(), tasks=['VALIDATE_COLORMODE'])
    assert result['metadata']['colorMode'] == 'CMYK'


def test_icc_profile_name_extracted_when_present():
    result = run_process(png_with_real_icc(), tasks=['EXTRACT_METADATA'])
    assert result['metadata']['iccProfile'] is not None
    assert 'rgb' in result['metadata']['iccProfile'].lower()


def test_icc_profile_none_when_absent():
    result = run_process(rgb_png(), tasks=['EXTRACT_METADATA'])
    assert result['metadata']['iccProfile'] is None


def test_apply_icc_without_profile_is_silent():
    result = run_process(rgb_png(), tasks=['APPLY_ICC'])
    assert result['errors'] == []


def test_apply_icc_with_profile_warns_not_a_real_conversion():
    result = run_process(png_with_real_icc(), tasks=['APPLY_ICC'])
    assert any('not performed' in e for e in result['errors'])


def test_generate_thumbnail_shrinks_and_preserves_aspect():
    result = run_process(rgb_png(), tasks=['GENERATE_THUMBNAIL'])
    thumb = Image.open(io.BytesIO(base64.b64decode(result['processed'])))
    assert max(thumb.size) <= 400
    # Original is 200x100 (2:1) — thumbnail must keep that ratio.
    assert thumb.size[0] / thumb.size[1] == pytest.approx(PAGE[0] / PAGE[1], rel=0.05)


def test_no_transform_tasks_still_returns_a_processed_copy():
    result = run_process(rgb_png(), tasks=['EXTRACT_METADATA'])
    copy = Image.open(io.BytesIO(base64.b64decode(result['processed'])))
    assert copy.size == PAGE


def test_optimize_web_opaque_image_becomes_jpeg():
    result = run_process(rgb_png(), tasks=['OPTIMIZE_WEB'])
    assert result['mimeType'] == 'image/jpeg'


def test_optimize_web_alpha_image_stays_png():
    result = run_process(rgba_png(), tasks=['OPTIMIZE_WEB'])
    assert result['mimeType'] == 'image/png'


def test_convert_format_defaults_to_png():
    result = run_process(cmyk_jpeg(), tasks=['CONVERT_FORMAT'])
    assert result['mimeType'] == 'image/png'


def test_thumbnail_and_optimize_combine():
    result = run_process(rgb_png(), tasks=['GENERATE_THUMBNAIL', 'OPTIMIZE_WEB'])
    img = Image.open(io.BytesIO(base64.b64decode(result['processed'])))
    assert max(img.size) <= 400
    assert result['mimeType'] == 'image/jpeg'


def test_corrupt_image_raises():
    with pytest.raises(Exception):
        run_process(b'not an image at all', tasks=['EXTRACT_METADATA'])


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


def test_process_route_happy_path(client):
    res = client.post('/process', json={
        'image': base64.b64encode(rgb_png(dpi=(300, 300))).decode(),
        'tasks': ['EXTRACT_METADATA', 'GENERATE_THUMBNAIL'],
        'targetDpi': 300,
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body['metadata']['dpi'] == 300
    assert 'processed' in body


def test_process_route_missing_image_field(client):
    res = client.post('/process', json={})
    assert res.status_code == 400


def test_process_route_invalid_base64(client):
    res = client.post('/process', json={'image': 'not-valid-base64!!!'})
    assert res.status_code == 400


def test_process_route_corrupt_image_returns_400_not_500(client):
    res = client.post('/process', json={'image': base64.b64encode(b'garbage').decode()})
    assert res.status_code == 400
    assert 'error' in res.get_json()


def test_process_route_defaults_tasks_to_empty_list(client):
    # No `tasks` key at all — should still succeed with a metadata-only pass.
    res = client.post('/process', json={'image': base64.b64encode(rgb_png()).decode()})
    assert res.status_code == 200
