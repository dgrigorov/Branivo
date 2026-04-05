"""POST /ocr/debug/pipeline — return the image(s) that will be sent to Claude.

Since the preprocessing pipeline was removed (replaced by Claude Vision), this
endpoint now returns up to 2 stages:
  1. original — the uploaded image as-is (EXIF-corrected + resized to MAX_DIM)
  2. perspective_corrected — after warpPerspective (only when points are provided)

Used by the Flutter crop-preview to show exactly what Claude will receive.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Optional

import cv2
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from services import preprocessor

logger = logging.getLogger("branivo.ocr.debug")
router = APIRouter()


def _parse_points(raw: Optional[str]) -> Optional[list]:
    """Parse JSON points string → list of [x, y] pairs or None."""
    if not raw:
        return None
    try:
        pts = json.loads(raw)
        if isinstance(pts, list) and len(pts) == 4:
            return pts
    except (json.JSONDecodeError, ValueError):
        pass
    return None


@router.post("/debug/pipeline")
async def pipeline_debug(
    file: UploadFile = File(...),
    step: int = Query(..., ge=1, le=3),
    points: Optional[str] = Form(None),
) -> dict:
    """Return the image(s) that will be passed to Claude for the given step.

    Stages returned:
    - "original": uploaded image after EXIF correction + MAX_DIM resize
    - "perspective_corrected": after 4-point warp (only when points are provided)
    """
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    pts = _parse_points(points)

    result = []

    # Stage 1: original (EXIF-corrected + resized) — always present
    original_bytes = preprocessor.decode_and_resize(image_bytes)
    original_b64 = base64.b64encode(original_bytes).decode("utf-8")
    result.append({"name": "original", "image_b64": original_b64})

    # Stage 2: perspective-corrected — only when crop points are provided
    if pts is not None:
        try:
            cropped_bytes = preprocessor.perspective_crop(image_bytes, pts)
            cropped_b64 = base64.b64encode(cropped_bytes).decode("utf-8")
            result.append({"name": "perspective_corrected", "image_b64": cropped_b64})
        except Exception as exc:
            logger.warning("perspective_crop failed in debug: %s", exc)

    logger.info("pipeline_debug step=%d stages=%s", step, [s["name"] for s in result])
    return {"step": step, "stages": result}
