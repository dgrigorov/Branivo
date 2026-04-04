"""Minimal image preprocessing for branivo-ocr.

Claude Vision works best with the original, unprocessed photo — no blurring,
no CLAHE, no glare inpainting.

Only one public function is exposed:
  perspective_crop  — 4-point perspective correction when the Flutter crop
                      editor provides corner points.  The image is returned
                      as a JPEG.  If no points are provided the original
                      image bytes are passed to Claude as-is.

EXIF orientation is corrected on decode so portrait/landscape photos from
phones appear upright regardless of how the camera stored the metadata.
The longest side is capped at 2048 px to prevent container OOM on
high-res phone photos.
"""

from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image, ExifTags


MAX_DIM = 2048  # cap longest side to avoid OOM on high-res photos


def perspective_crop(image_bytes: bytes, points: list[list[float]]) -> bytes:
    """Apply 4-point perspective correction and return JPEG bytes.

    points: [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] — normalized 0..1 in image space.
    Order: top-left, top-right, bottom-right, bottom-left.
    """
    img = _decode(image_bytes)
    img = _resize(img)
    h, w = img.shape[:2]

    src = np.float32([[p[0] * w, p[1] * h] for p in points])
    tl, tr, br, bl = src

    out_w = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    out_h = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
    if out_w < 4 or out_h < 4:
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return buf.tobytes()

    dst = np.float32([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]])
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(img, M, (out_w, out_h))
    _, buf = cv2.imencode(".jpg", warped, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return buf.tobytes()


# ── private helpers ────────────────────────────────────────────────────────────

def _decode(image_bytes: bytes) -> np.ndarray:
    """Decode image bytes to BGR, applying EXIF orientation if present."""
    pil_img = Image.open(io.BytesIO(image_bytes))
    pil_img = _apply_exif_orientation(pil_img)
    rgb = np.array(pil_img.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def _apply_exif_orientation(img: Image.Image) -> Image.Image:
    """Rotate/flip a PIL image according to its EXIF Orientation tag."""
    try:
        exif = img._getexif()  # type: ignore[attr-defined]
    except Exception:
        exif = None
    if not exif:
        return img
    orient_tag = next(
        (tag for tag, name in ExifTags.TAGS.items() if name == "Orientation"), None
    )
    if orient_tag is None:
        return img
    orientation = exif.get(orient_tag)
    rotations = {3: 180, 6: 270, 8: 90}
    degrees = rotations.get(orientation)
    if degrees:
        img = img.rotate(degrees, expand=True)
    return img


def _resize(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= MAX_DIM:
        return img
    scale = MAX_DIM / longest
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
