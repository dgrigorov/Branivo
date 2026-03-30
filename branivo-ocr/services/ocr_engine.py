"""PaddleOCR singleton wrapper.

The model is loaded once at first use and reused for all subsequent requests
to avoid the cold-start latency on every call.
"""

from __future__ import annotations

from typing import List, Tuple

import numpy as np
from paddleocr import PaddleOCR

_ocr_instance: PaddleOCR | None = None


def get_ocr() -> PaddleOCR:
    global _ocr_instance
    if _ocr_instance is None:
        _ocr_instance = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _ocr_instance


def extract_blocks(image: np.ndarray) -> List[Tuple[str, float]]:
    """Run OCR and return list of (text, confidence) tuples."""
    result = get_ocr().ocr(image, cls=True)
    blocks: List[Tuple[str, float]] = []
    if not result or not result[0]:
        return blocks
    for line in result[0]:
        text, conf = line[1]
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
