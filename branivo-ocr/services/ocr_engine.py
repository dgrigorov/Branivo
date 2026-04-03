"""PaddleOCR engine for Bulgarian vehicle registration certificates.

Replaces the previous Tesseract (pytesseract) implementation.

Why PaddleOCR over Tesseract:
- Transformer-based recognition: significantly more accurate on complex
  backgrounds (security lines, laminate glare, wrinkled documents).
- Built-in text detection: finds text regions automatically — no PSM tuning.
- Better mixed-script handling: Cyrillic + Latin on the same document.
- MRZ accuracy: OCR-B font on white background reads near-perfectly.

Two OCR instances are initialised at startup (via warm_up() in main.py):
  _ocr_latin    lang='en'       — MRZ zones (A-Z, 0-9, '<' only)
  _ocr_cyrillic lang='cyrillic' — steps 2/3 (Bulgarian Cyrillic + Latin labels)

Memory: ~900 MB RSS total (vs ~100 MB for Tesseract). Docker limit is 3 GB.
"""

from __future__ import annotations

import re
import threading
from typing import List, Tuple

import cv2
import numpy as np

# ── singleton PaddleOCR instances ─────────────────────────────────────────────
# Lazily initialised; protected by a lock so concurrent startup requests don't
# create duplicate instances.  warm_up() in main.py pre-initialises both before
# the first HTTP request arrives.

_lock = threading.Lock()
_ocr_latin: object | None = None
_ocr_cyrillic: object | None = None


def _get_ocr_latin():
    global _ocr_latin
    if _ocr_latin is None:
        with _lock:
            if _ocr_latin is None:
                from paddleocr import PaddleOCR  # type: ignore[import]
                _ocr_latin = PaddleOCR(
                    use_angle_cls=False,
                    lang="en",
                    use_gpu=False,
                    show_log=False,
                )
    return _ocr_latin


def _get_ocr_cyrillic():
    global _ocr_cyrillic
    if _ocr_cyrillic is None:
        with _lock:
            if _ocr_cyrillic is None:
                from paddleocr import PaddleOCR  # type: ignore[import]
                _ocr_cyrillic = PaddleOCR(
                    use_angle_cls=False,
                    lang="cyrillic",
                    use_gpu=False,
                    show_log=False,
                )
    return _ocr_cyrillic


def warm_up() -> None:
    """Pre-initialise both OCR models.

    Called once at server startup (see main.py lifespan).  Without this the
    first HTTP request triggers model loading (~3–5 s) and times out in CI.
    """
    _get_ocr_latin()
    _get_ocr_cyrillic()


# ── public API (same interface as previous Tesseract implementation) ───────────

def extract_blocks(image: np.ndarray) -> List[Tuple[str, float]]:
    """Run PaddleOCR (Latin model) and return (text, confidence) tuples.

    Used for the MRZ crop confidence measurement in step 1.
    """
    return _run_paddle(_get_ocr_latin(), image)


def extract_blocks_step23(image: np.ndarray) -> List[Tuple[str, float]]:
    """PaddleOCR for steps 2/3 — Bulgarian Cyrillic + Latin field labels.

    The Cyrillic model covers both Cyrillic and Latin characters so a single
    pass suffices for the mixed-script talón pages.
    """
    return _run_paddle(_get_ocr_cyrillic(), image)


def full_text_mrz(image: np.ndarray) -> str:
    """OCR optimised for MRZ zones (OCR-B font, Latin + digits + '<').

    Pre-processes the MRZ crop with Otsu binarisation before passing to
    PaddleOCR: the OCR-B font on a white background binarises cleanly without
    security-line artefacts (the MRZ zone is at the bottom of the card,
    below the printed pattern area).

    Returns lines sorted top-to-bottom, filtered to valid MRZ characters
    (A-Z, 0-9, '<') with common OCR substitutions corrected.
    """
    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    result = _get_ocr_latin().ocr(binary, cls=False)
    if not result or not result[0]:
        return ""

    # Sort detected text boxes top-to-bottom by minimum Y of bounding polygon
    sorted_lines = sorted(result[0], key=lambda x: min(p[1] for p in x[0]))

    mrz_lines: List[str] = []
    for line in sorted_lines:
        if not line or len(line) < 2:
            continue
        raw = str(line[1][0]).strip().upper()
        # Common PaddleOCR substitutions in MRZ context
        raw = raw.replace("О", "0").replace("о", "0")  # Cyrillic O → digit 0
        raw = raw.replace("I", "1").replace("L", "1")  # easy confusion for 1
        # Keep only valid MRZ characters
        filtered = re.sub(r"[^A-Z0-9<]", "", raw)
        if len(filtered) >= 5:
            mrz_lines.append(filtered)

    return "\n".join(mrz_lines)


def blocks_to_text(blocks: List[Tuple[str, float]]) -> str:
    """Join block texts with newlines (preserves document layout for parser)."""
    return "\n".join(t for t, _ in blocks)


def avg_confidence(blocks: List[Tuple[str, float]]) -> float:
    """Mean confidence over all detected text blocks."""
    if not blocks:
        return 0.0
    return sum(c for _, c in blocks) / len(blocks)


# ── private ────────────────────────────────────────────────────────────────────

def _run_paddle(ocr, image: np.ndarray) -> List[Tuple[str, float]]:
    """Run a PaddleOCR instance and return (text, confidence) pairs.

    Detected text boxes are sorted top-to-bottom then left-to-right so that
    the concatenated text preserves the natural reading order of the document.
    This ordering is important for mrz_parser which locates field codes by
    regex over the joined text.
    """
    result = ocr.ocr(image, cls=False)
    if not result or not result[0]:
        return []

    # Sort by (mean_y, mean_x) of the bounding polygon
    def _sort_key(line) -> Tuple[float, float]:
        box = line[0]
        mean_y = sum(p[1] for p in box) / len(box)
        mean_x = sum(p[0] for p in box) / len(box)
        return (mean_y, mean_x)

    sorted_lines = sorted(result[0], key=_sort_key)

    blocks: List[Tuple[str, float]] = []
    for line in sorted_lines:
        if not line or len(line) < 2:
            continue
        text = str(line[1][0]).strip()
        conf = float(line[1][1])
        if text and conf > 0.05:
            blocks.append((text, conf))
    return blocks
