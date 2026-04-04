"""Image preprocessing utilities for Bulgarian vehicle registration certificates.

Three public functions (Claude Vision does not need heavy preprocessing):
  perspective_crop  — 4-point perspective correction (corner-crop UI)
  light_preprocess  — bilateral + CLAHE + glare mask (used by /preview debug endpoint)
  crop_mrz_zone     — crops + lightly preprocesses the bottom 38 % (MRZ band)

All operations are in-memory — no disk writes.
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


def light_preprocess(image_bytes: bytes) -> np.ndarray:
    """Light pipeline — returns BGR color image (used by /preview debug endpoint)."""
    img = _decode(image_bytes)
    img = _resize(img)
    img = _bilateral(img)
    img = _clahe(img)
    img = _mask_glare(img)
    return img


def crop_mrz_zone(image_bytes: bytes) -> np.ndarray:
    """Crop + light-preprocess the MRZ zone (bottom 38 % of image)."""
    img = _decode(image_bytes)
    img = _resize(img)
    h = img.shape[0]
    mrz = img[int(h * 0.62):, :]
    mrz = _bilateral(mrz)
    mrz = _clahe(mrz)
    mrz = _mask_glare(mrz)
    return mrz


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


def _bilateral(img: np.ndarray) -> np.ndarray:
    return cv2.bilateralFilter(img, d=9, sigmaColor=75, sigmaSpace=75)


def _clahe(img: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def _mask_glare(img: np.ndarray) -> np.ndarray:
    """Remove laminate glare via inpainting."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 220]), np.array([180, 30, 255]))
    if not mask.any():
        return img
    kernel = np.ones((3, 3), np.uint8)
    mask_dilated = cv2.dilate(mask, kernel, iterations=1)
    return cv2.inpaint(img, mask_dilated, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
