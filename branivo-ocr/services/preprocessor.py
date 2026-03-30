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


def light_preprocess(image_bytes: bytes) -> np.ndarray:
    """Light pipeline for EasyOCR — returns BGR color image.

    bilateral → CLAHE → glare mask → deskew (color output, no binarization).
    """
    img = _decode(image_bytes)
    img = _bilateral(img)
    img = _clahe(img)
    img = _mask_glare(img)
    return _deskew_color(img)


def crop_mrz_zone(image_bytes: bytes) -> np.ndarray:
    """Crop + light-preprocess the bottom 30 % of the image (MRZ zone)."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    h = img.shape[0]
    mrz = img[int(h * 0.70):, :]
    mrz = _bilateral(mrz)
    mrz = _clahe(mrz)
    mrz = _mask_glare(mrz)
    return _deskew_color(mrz)


# ── private helpers ────────────────────────────────────────────────────────────

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
    """Replace overexposed (laminate glare) pixels with neutral grey."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 220]), np.array([180, 30, 255]))
    img[mask > 0] = [200, 200, 200]
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
