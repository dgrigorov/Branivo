"""POST /ocr/debug/pipeline — return all preprocessing stages as base64 JPEG.

Used by Super Admin to diagnose why the OCR pipeline produces bad results.
Returns each intermediate stage so every transformation is visible:
  original → after_bilateral → after_clahe → after_glare_mask → mrz_crop_final (step 1 only)
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
    """Return all preprocessing stages for a given image and OCR step.

    Each stage is a base64-encoded JPEG so the caller can render it directly.
    The stages list mirrors the real OCR pipeline in execution order.
    """
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    pts = _parse_points(points)
    stages = preprocessor.preprocess_stages(image_bytes, points=pts, step=step)

    result = []
    for name, img in stages:
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
        b64 = base64.b64encode(buf).decode("utf-8")
        result.append({
            "name": name,
            "image_b64": b64,
            "shape": list(img.shape[:2]),
        })
        logger.info("pipeline_debug step=%d stage=%s shape=%s", step, name, img.shape[:2])

    return {"step": step, "stages": result}
