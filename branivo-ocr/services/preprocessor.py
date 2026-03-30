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

import cv2
import numpy as np


MAX_DIM = 2048  # cap longest side to avoid OOM on high-res photos


def light_preprocess(image_bytes: bytes) -> np.ndarray:
    """Light pipeline for EasyOCR — returns BGR color image.

    resize → auto-orient → bilateral → CLAHE → glare inpaint → deskew.
    """
    img = _decode(image_bytes)
    img = _resize(img)
    img = _auto_orient(img)
    img = _bilateral(img)
    img = _clahe(img)
    img = _mask_glare(img)
    return _deskew_color(img)


def crop_mrz_zone(image_bytes: bytes) -> np.ndarray:
    """Crop + light-preprocess the MRZ zone of the image.

    Handles open-booklet shots where the owner/MRZ page is in the top half
    (rotated 90° or 180°): auto-orient is applied before cropping so the MRZ
    ends up at the bottom 30 % as expected.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    img = _resize(img)
    img = _auto_orient(img)
    h = img.shape[0]
    mrz = img[int(h * 0.70):, :]
    mrz = _bilateral(mrz)
    mrz = _clahe(mrz)
    mrz = _mask_glare(mrz)
    return _deskew_color(mrz)


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
    nparr = np.frombuffer(image_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)


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
