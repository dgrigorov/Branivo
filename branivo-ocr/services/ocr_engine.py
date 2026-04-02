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
#   6 = Assume a single uniform block of text  (best for a full talona page)
#  11 = Sparse text — find as much text as possible  (fallback)
_PSM_FULL = "--psm 6 --oem 3"
_PSM_SPARSE = "--psm 11 --oem 3"
# Bulgarian vehicle registration certificates have Cyrillic owner data
# and Latin-character field codes (A, E, D.1, C.2.1, etc.)
_LANG = "bul+eng"


def extract_blocks(image: np.ndarray) -> List[Tuple[str, float]]:
    """Run Tesseract OCR and return list of (text, confidence) tuples.

    Each tuple represents one recognised word / token.
    """
    gray = _to_gray(image)
    data = pytesseract.image_to_data(
        gray,
        lang=_LANG,
        config=_PSM_FULL,
        output_type=Output.DICT,
    )

    blocks: List[Tuple[str, float]] = []
    for text, conf in zip(data["text"], data["conf"]):
        text = text.strip()
        conf_val = int(conf) if str(conf).lstrip("-").isdigit() else -1
        if text and conf_val > 0:
            blocks.append((text, conf_val / 100.0))

    # If sparse mode yields more blocks, prefer it
    if len(blocks) < 5:
        data2 = pytesseract.image_to_data(
            gray,
            lang=_LANG,
            config=_PSM_SPARSE,
            output_type=Output.DICT,
        )
        blocks2: List[Tuple[str, float]] = []
        for text, conf in zip(data2["text"], data2["conf"]):
            text = text.strip()
            conf_val = int(conf) if str(conf).lstrip("-").isdigit() else -1
            if text and conf_val > 0:
                blocks2.append((text, conf_val / 100.0))
        if len(blocks2) > len(blocks):
            blocks = blocks2

    return blocks


def full_text(image: np.ndarray) -> str:
    """Return the full OCR output as a single string preserving layout."""
    gray = _to_gray(image)
    return pytesseract.image_to_string(gray, lang=_LANG, config=_PSM_FULL)


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
