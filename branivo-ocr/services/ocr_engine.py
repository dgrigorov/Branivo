"""Tesseract OCR wrapper.

Uses pytesseract (Tesseract 5) instead of EasyOCR/PyTorch.
Memory footprint: ~100 MB vs ~1.5 GB for EasyOCR+PyTorch.

Tesseract excels at structured printed text (vehicle registration certificates)
and works on ARM64 without AVX issues.
"""

from __future__ import annotations

import re
from typing import List, Tuple

import cv2
import numpy as np
import pytesseract
from pytesseract import Output


# Tesseract page-segmentation modes:
#   4 = Single column of variable-size text — matches талон labeled-field layout
#   6 = Assume a single uniform block of text  (good for dense pages)
#  11 = Sparse text — find as much text as possible  (fallback)
_PSM_FULL = "--psm 6 --oem 3"
_PSM_COL = "--psm 4 --oem 3"
_PSM_SPARSE = "--psm 11 --oem 3"
# Bulgarian vehicle registration certificates have Cyrillic owner data
# and Latin-character field codes (A, E, D.1, C.2.1, etc.)
_LANG = "bul+eng"

# MRZ zones use OCR-B font with only uppercase Latin, digits, and '<' filler.
# Using bul+eng here is harmful — the Bulgarian model confuses '<' with random
# Cyrillic/Latin characters.  Restrict to eng + explicit char whitelist.
_LANG_MRZ = "eng"
_PSM_MRZ = (
    "--psm 6 --oem 3"
    " -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"
)


def extract_blocks(image: np.ndarray) -> List[Tuple[str, float]]:
    """Run Tesseract OCR and return list of (text, confidence) tuples.

    Each tuple represents one recognised word / token.
    """
    gray = _to_gray(image)
    blocks = _tesseract_blocks(gray, _PSM_FULL)

    # If sparse mode yields more blocks, prefer it
    if len(blocks) < 5:
        blocks2 = _tesseract_blocks(gray, _PSM_SPARSE)
        if len(blocks2) > len(blocks):
            blocks = blocks2

    return blocks


def extract_blocks_step23(image: np.ndarray) -> List[Tuple[str, float]]:
    """Multi-PSM OCR for Ч.I / Ч.II pages (steps 2 and 3).

    These pages use a labeled-field table layout.  PSM 4 (single column of
    variable-size text) matches this structure better than PSM 6 (uniform block).

    Tries PSM 4 and PSM 6 on the supplied image (already preprocessed by
    preprocess_step23 — upscaled + sharpened + adaptive-binarized) and returns
    whichever combination produces the highest confidence-weighted block count.
    """
    best = _tesseract_blocks(image, _PSM_COL)
    for config in (_PSM_FULL, _PSM_SPARSE):
        candidate = _tesseract_blocks(image, config)
        if _score(candidate) > _score(best):
            best = candidate
    return best


def full_text(image: np.ndarray) -> str:
    """Return the full OCR output as a single string preserving layout."""
    gray = _to_gray(image)
    return pytesseract.image_to_string(gray, lang=_LANG, config=_PSM_FULL)


def full_text_mrz(image: np.ndarray) -> str:
    """OCR optimized for MRZ zones (OCR-B font, eng-only, '<' in whitelist).

    Using bul+eng on MRZ is harmful: the Bulgarian model has no concept of
    the '<' filler character and substitutes garbage (dashes, newlines, etc.),
    breaking MRZ positional parsing.  This function uses eng only with an
    explicit character whitelist so Tesseract stays in the correct charset.
    """
    gray = _to_gray(image)
    # Binarize: MRZ text is dark on light background — Otsu gives clean edges
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return pytesseract.image_to_string(binary, lang=_LANG_MRZ, config=_PSM_MRZ)


def blocks_to_text(blocks: List[Tuple[str, float]]) -> str:
    return "\n".join(t for t, _ in blocks)


def avg_confidence(blocks: List[Tuple[str, float]]) -> float:
    if not blocks:
        return 0.0
    return sum(c for _, c in blocks) / len(blocks)


# ── private ────────────────────────────────────────────────────────────────────

def _to_gray(img: np.ndarray) -> np.ndarray:
    """Convert BGR → grayscale; Tesseract works best on grayscale."""
    if img.ndim == 2:
        return img
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _tesseract_blocks(img: np.ndarray, config: str) -> List[Tuple[str, float]]:
    """Run Tesseract with a specific config and return (text, conf) pairs."""
    data = pytesseract.image_to_data(img, lang=_LANG, config=config, output_type=Output.DICT)
    blocks: List[Tuple[str, float]] = []
    for text, conf in zip(data["text"], data["conf"]):
        text = text.strip()
        conf_val = int(conf) if str(conf).lstrip("-").isdigit() else -1
        if text and conf_val > 0:
            blocks.append((text, conf_val / 100.0))
    return blocks


def _score(blocks: List[Tuple[str, float]]) -> float:
    """Confidence-weighted block count — higher is better."""
    if not blocks:
        return 0.0
    return len(blocks) * avg_confidence(blocks)
