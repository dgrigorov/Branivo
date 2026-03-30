"""EasyOCR singleton wrapper.

EasyOCR is used instead of PaddleOCR for ARM64 compatibility (Apple Silicon,
AWS Graviton). PaddleOCR segfaults on ARM Docker due to AVX instruction usage.

The Reader is loaded once at first use and reused for all subsequent requests.
"""

from __future__ import annotations

from typing import List, Tuple

import easyocr
import numpy as np

_reader: easyocr.Reader | None = None


def get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _reader


def extract_blocks(image: np.ndarray) -> List[Tuple[str, float]]:
    """Run OCR and return list of (text, confidence) tuples."""
    result = get_reader().readtext(image)
    blocks: List[Tuple[str, float]] = []
    for _bbox, text, conf in result:
        cleaned = text.strip()
        if cleaned:
            blocks.append((cleaned, float(conf)))
    return blocks


def blocks_to_text(blocks: List[Tuple[str, float]]) -> str:
    return "\n".join(t for t, _ in blocks)


def avg_confidence(blocks: List[Tuple[str, float]]) -> float:
    if not blocks:
        return 0.0
    return sum(c for _, c in blocks) / len(blocks)
