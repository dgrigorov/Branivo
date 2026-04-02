"""Image preprocessing pipeline for Bulgarian vehicle registration certificates.

Two pipelines are provided:
  - light_preprocess: bilateral → CLAHE → glare mask → deskew (color output)
    Designed for EasyOCR, which has its own internal binarization and works
    best on color or lightly processed images.
  - preprocess: full pipeline ending with adaptive threshold + closing (grayscale)
    Kept for reference; binarization hurts EasyOCR accuracy significantly.

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
    Scales to pixel coords, computes homography, warps to axis-aligned output.
    Returns the corrected image as JPEG bytes (max MAX_DIM on longest side).
    """
    img = _decode(image_bytes)
    img = _resize(img)
    h, w = img.shape[:2]

    src = np.float32([[p[0] * w, p[1] * h] for p in points])
    tl, tr, br, bl = src

    out_w = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    out_h = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
    if out_w < 4 or out_h < 4:
        # Degenerate quad — return original resized image
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return buf.tobytes()

    dst = np.float32([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]])
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(img, M, (out_w, out_h))
    _, buf = cv2.imencode(".jpg", warped, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return buf.tobytes()


def light_preprocess(image_bytes: bytes) -> np.ndarray:
    """Light pipeline for Tesseract — returns BGR color image.

    resize → bilateral → CLAHE → glare inpaint.
    EXIF orientation is handled in _decode, so _auto_orient is not needed.
    _deskew_color is omitted: it uses dark pixel distribution to detect skew,
    which is unreliable for hand-held photos with significant background.
    """
    img = _decode(image_bytes)
    img = _resize(img)
    img = _bilateral(img)
    img = _clahe(img)
    img = _mask_glare(img)
    return img


def crop_mrz_zone(image_bytes: bytes) -> np.ndarray:
    """Crop + light-preprocess the MRZ zone (bottom 38 % of image).

    Auto-orient and deskew are intentionally skipped here:
    - Auto-orient was rotating hand-held portrait photos CCW, moving the
      owner-text region into the crop window instead of the MRZ lines.
    - Deskew on a partial card image picks up background/hand pixels and
      applies large incorrect rotations that break OCR.
    The MRZ is always at the physical bottom of a correctly-held registration
    certificate, so a generous bottom crop (38 %) reliably captures it without
    orientation guessing.  Bilateral + CLAHE + glare inpaint are still applied
    to improve contrast on laminated card surfaces.
    """
    img = _decode(image_bytes)   # EXIF rotation applied here
    img = _resize(img)
    h = img.shape[0]
    mrz = img[int(h * 0.62):, :]
    mrz = _bilateral(mrz)
    mrz = _clahe(mrz)
    mrz = _mask_glare(mrz)
    return mrz


# ── private helpers ────────────────────────────────────────────────────────────

def _resize(img: np.ndarray) -> np.ndarray:
    """Resize so the longest side does not exceed MAX_DIM (prevents OOM on high-res photos)."""
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= MAX_DIM:
        return img
    scale = MAX_DIM / longest
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _decode(image_bytes: bytes) -> np.ndarray:
    """Decode image bytes to BGR, applying EXIF orientation if present.

    OpenCV's imdecode ignores EXIF rotation tags, producing upside-down or
    sideways images for phone photos.  PIL reads EXIF and corrects orientation
    before we convert back to a BGR numpy array for OpenCV.
    """
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


def _bilateral(img: np.ndarray) -> np.ndarray:
    return cv2.bilateralFilter(img, d=9, sigmaColor=75, sigmaSpace=75)


def _clahe(img: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    merged = cv2.merge((l, a, b))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def _mask_glare(img: np.ndarray) -> np.ndarray:
    """Remove laminate glare via inpainting (reconstructs texture under highlights).

    Replaces overexposed pixels using Navier-Stokes inpainting rather than
    flat grey fill — preserves text that partially overlaps with the glare.
    """
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 220]), np.array([180, 30, 255]))
    if not mask.any():
        return img
    kernel = np.ones((3, 3), np.uint8)
    mask_dilated = cv2.dilate(mask, kernel, iterations=1)
    return cv2.inpaint(img, mask_dilated, inpaintRadius=3, flags=cv2.INPAINT_TELEA)


def _auto_orient(img: np.ndarray) -> np.ndarray:
    """Rotate portrait images 90° CCW so text runs horizontally.

    Open-booklet photos are often taken with the document oriented sideways
    (pages run top-to-bottom in the photo). Detecting this: if the image is
    significantly taller than wide AND gradient energy is higher on the
    vertical axis (text columns), rotate 90° CCW.
    """
    h, w = img.shape[:2]
    if h <= w * 1.3:          # already roughly landscape or square — skip
        return img
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
    ex = float(np.sum(np.abs(gx)))
    ey = float(np.sum(np.abs(gy)))
    # If vertical gradients dominate, text is running top-to-bottom → rotate CCW
    if ey > ex * 1.2:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def _deskew_color(img: np.ndarray) -> np.ndarray:
    """Correct skew on a BGR color image."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    coords = np.column_stack(np.where(gray < 128))
    if len(coords) < 10:
        return img
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90.0 + angle
    if abs(angle) < 0.5:
        return img
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
