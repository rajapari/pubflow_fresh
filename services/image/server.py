"""Artwork QA / processing service — DPI, color mode, ICC metadata,
thumbnails, format conversion for the Image QA bot (Stage 7, artwork
processing).

Pillow-only (no ImageMagick/GraphicsMagick dependency, no color-managed
ICC transform library) — deliberately lighter than a full prepress color
pipeline, matching the resource-conscious choices already made for
services/preflight (pikepdf over veraPDF) in this deployment. Scope:

  - EXTRACT_METADATA / VALIDATE_DPI / VALIDATE_COLORMODE: read width,
    height, DPI, color mode, and embedded ICC profile name from the
    original image. The DPI/color-mode *comparison* against the job's
    target values happens in the worker (apps/worker/src/processors/
    image.ts) — this service only needs to report what the image
    actually is.
  - GENERATE_THUMBNAIL: resize (max 400px on the long edge, aspect
    preserved) to produce the `processed` derivative.
  - OPTIMIZE_WEB: re-encode for smaller file size (JPEG for opaque
    images, optimized PNG when alpha is present).
  - CONVERT_FORMAT: normalize `processed` to PNG. The job schema
    (packages/types/src/jobs.ts ImageJob) has no target-format field,
    so there's nothing to convert *to* beyond this fixed default —
    documented here rather than silently pretended more capable.
  - APPLY_ICC: reports the embedded profile (same as EXTRACT_METADATA)
    but does NOT perform a color-managed transform — that needs a
    target profile the job schema doesn't carry. Flagged in `errors`
    so this isn't silently mistaken for a real conversion.

Multiple tasks combine into one output image: GENERATE_THUMBNAIL and
OPTIMIZE_WEB both apply (thumbnail first, then re-encode) if requested
together. If neither is requested, `processed` is just the original
re-encoded as PNG, so the worker's contract (always get a processed
derivative) is met even for a metadata-only request.
"""
import base64
import io

from flask import Flask, request, jsonify
from PIL import Image

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB — high-res print figures

THUMBNAIL_MAX_DIM = 400

# Pillow mode -> the ColorMode enum the app understands (packages/db
# ColorMode: RGB, CMYK, GRAYSCALE, LAB).
MODE_MAP = {
    'RGB': 'RGB', 'RGBA': 'RGB', 'P': 'RGB',
    'CMYK': 'CMYK',
    'L': 'GRAYSCALE', 'LA': 'GRAYSCALE', '1': 'GRAYSCALE',
    'LAB': 'LAB',
}


def _color_mode(img):
    return MODE_MAP.get(img.mode)


def _dpi(img):
    dpi = img.info.get('dpi')
    if not dpi:
        return None
    try:
        return round(float(dpi[0]))
    except (TypeError, ValueError, IndexError):
        return None


def _icc_profile_name(img):
    raw = img.info.get('icc_profile')
    if not raw:
        return None
    try:
        from PIL import ImageCms
        profile = ImageCms.ImageCmsProfile(io.BytesIO(raw))
        return ImageCms.getProfileName(profile).strip()
    except Exception:
        return 'embedded (unreadable name)'


def extract_metadata(img):
    return {
        'width': img.width,
        'height': img.height,
        'dpi': _dpi(img),
        'colorMode': _color_mode(img),
        'iccProfile': _icc_profile_name(img),
    }


def build_thumbnail(img):
    thumb = img.copy()
    thumb.thumbnail((THUMBNAIL_MAX_DIM, THUMBNAIL_MAX_DIM))
    return thumb


def encode_optimized(img):
    """Returns (bytes, mime_type) — JPEG for opaque images, PNG when alpha
    is present (JPEG can't carry transparency)."""
    has_alpha = img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)
    buf = io.BytesIO()
    if has_alpha:
        img.save(buf, format='PNG', optimize=True)
        return buf.getvalue(), 'image/png'
    rgb = img.convert('RGB') if img.mode != 'RGB' else img
    rgb.save(buf, format='JPEG', quality=82, optimize=True)
    return buf.getvalue(), 'image/jpeg'


def encode_png(img):
    # PNG can't encode every Pillow mode (CMYK notably) — convert to RGB for
    # the derivative. The real color mode is still reported in metadata for
    # QA purposes; this "processed" copy is a preview, not a press file.
    if img.mode not in ('RGB', 'RGBA', 'L', 'LA', 'P', '1'):
        img = img.convert('RGB')
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue(), 'image/png'


def run_process(image_bytes, tasks, target_dpi=None, target_color_mode=None):
    errors = []
    img = Image.open(io.BytesIO(image_bytes))
    img.load()  # force a full decode now, not lazily during a later step

    metadata = extract_metadata(img)

    if 'APPLY_ICC' in tasks and not metadata['iccProfile']:
        pass  # nothing to report; not an error on its own
    elif 'APPLY_ICC' in tasks:
        errors.append(
            'APPLY_ICC: color-managed conversion not performed (no target '
            'profile in the job schema) — reporting the embedded profile only.'
        )

    out_img = img
    if 'GENERATE_THUMBNAIL' in tasks:
        out_img = build_thumbnail(out_img)

    if 'OPTIMIZE_WEB' in tasks:
        processed_bytes, mime_type = encode_optimized(out_img)
    else:
        # Covers CONVERT_FORMAT (fixed PNG default) and the metadata-only
        # case (no transform tasks at all) — always produce a derivative.
        processed_bytes, mime_type = encode_png(out_img)

    return {
        'processed': base64.b64encode(processed_bytes).decode(),
        'mimeType': mime_type,
        'metadata': metadata,
        'errors': errors,
    }


@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'tool': 'image-qa'})


@app.route('/process', methods=['POST'])
def process():
    data = request.get_json(silent=True) or {}
    image_b64 = data.get('image')
    if not image_b64:
        return jsonify({'error': 'Missing "image" (base64-encoded) in request body'}), 400
    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        return jsonify({'error': 'Invalid base64 in "image" field'}), 400

    tasks = data.get('tasks') or []

    try:
        result = run_process(image_bytes, tasks)
        return jsonify(result)
    except Exception as e:  # noqa: BLE001 — surface everything to the worker
        return jsonify({'error': f'Could not process image: {e}'}), 400


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)
