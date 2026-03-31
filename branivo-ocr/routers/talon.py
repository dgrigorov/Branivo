"""POST /ocr/talon?step=1|2|3

step=1  MRZ zone → VIN + reg number + owner + EGN → VIN decode
        If confidence >= 0.90 → complete=true (caller may stop here)
step=2  Vehicle identity page (A, D.1, D.3, E, B)
step=3  Technical specs page  (P.1, P.3, S.1)

Optional params:
  points  — JSON string [[x,y]×4] normalized 0..1 (top-left, top-right,
            bottom-right, bottom-left).  When present, perspective crop is
            applied BEFORE the normal preprocessing pipeline.
  debug   — boolean; when true the response includes preview_b64 (base64
            JPEG of the image that Tesseract actually processes).

All images are processed in-memory. No disk writes.
"""

from __future__ import annotations

import base64
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

import cv2
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from models.talon_response import TalonData, TalonResponse
from services import mrz_parser, ocr_engine, preprocessor, vin_service

logger = logging.getLogger("branivo.ocr")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)

router = APIRouter()

COMPLETE_THRESHOLD = 0.90


@router.post("/talon", response_model=TalonResponse)
async def process_talon(
    file: UploadFile = File(...),
    step: int = Query(..., ge=1, le=3),
    points: Optional[str] = Form(None),
    debug: bool = Query(False),
) -> TalonResponse:
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    pts = _parse_points(points)
    if pts is not None:
        image_bytes = preprocessor.perspective_crop(image_bytes, pts)

    if step == 1:
        return await _step1(image_bytes, debug=debug)
    return _step_n(image_bytes, step, debug=debug)


@router.post("/preview")
async def debug_preview(
    file: UploadFile = File(...),
    step: int = Query(..., ge=1, le=3),
    points: Optional[str] = Form(None),
) -> dict:
    """Debug: return the preprocessed image Tesseract will actually see.

    Useful for diagnosing why OCR fails — call this endpoint with the same
    image + points as /ocr/talon to see the exact input to the OCR engine.
    """
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    pts = _parse_points(points)
    if pts is not None:
        image_bytes = preprocessor.perspective_crop(image_bytes, pts)

    img = preprocessor.crop_mrz_zone(image_bytes) if step == 1 else preprocessor.light_preprocess(image_bytes)

    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
    b64 = base64.b64encode(buf).decode("utf-8")
    return {"step": step, "image_b64": b64, "shape": list(img.shape[:2])}


# ── step handlers ──────────────────────────────────────────────────────────────

async def _step1(image_bytes: bytes, *, debug: bool = False) -> TalonResponse:
    mrz_img = preprocessor.crop_mrz_zone(image_bytes)
    blocks = ocr_engine.extract_blocks(mrz_img)
    text = ocr_engine.blocks_to_text(blocks)
    ocr_conf = ocr_engine.avg_confidence(blocks)

    parsed, field_conf = mrz_parser.parse_step1(text)
    confidence = round(ocr_conf * 0.6 + field_conf * 0.4, 3)

    vin_decoded: dict = {}
    if parsed.get("vin"):
        vin_decoded = await vin_service.decode_vin(parsed["vin"])

    data = TalonData(
        vin=parsed.get("vin"),
        registrationNumber=parsed.get("registrationNumber"),
        ownerName=parsed.get("ownerName"),
        egn=parsed.get("egn"),
        make=vin_decoded.get("make"),
        model=vin_decoded.get("model"),
        year=_to_int(vin_decoded.get("year")),
        fuel=vin_decoded.get("fuel"),
        engine=vin_decoded.get("engine"),
    )

    _log_step(1, text, blocks, ocr_conf, field_conf, confidence, parsed)
    return TalonResponse(
        success=True,
        step=1,
        confidence=confidence,
        data=data,
        complete=confidence >= COMPLETE_THRESHOLD,
        preview_b64=_encode_preview(mrz_img) if debug else None,
    )


def _step_n(image_bytes: bytes, step: int, *, debug: bool = False) -> TalonResponse:
    img = preprocessor.light_preprocess(image_bytes)
    blocks = ocr_engine.extract_blocks(img)
    text = ocr_engine.blocks_to_text(blocks)
    ocr_conf = ocr_engine.avg_confidence(blocks)

    if step == 2:
        parsed, field_conf = mrz_parser.parse_step2(text)
    else:
        parsed, field_conf = mrz_parser.parse_step3(text)

    confidence = round(ocr_conf * 0.6 + field_conf * 0.4, 3)

    data = TalonData(
        vin=parsed.get("vin"),
        registrationNumber=parsed.get("registrationNumber"),
        make=parsed.get("make"),
        model=parsed.get("model"),
        year=_to_int(parsed.get("year")),
        fuel=parsed.get("fuel"),
        engine=parsed.get("engine"),
        seats=_to_int(parsed.get("seats")),
        firstRegistration=parsed.get("firstRegistration"),
    )

    _log_step(step, text, blocks, ocr_conf, field_conf, confidence, parsed)
    return TalonResponse(
        success=True,
        step=step,
        confidence=confidence,
        data=data,
        complete=False,
        preview_b64=_encode_preview(img) if debug else None,
    )


# ── helpers ────────────────────────────────────────────────────────────────────

def _parse_points(raw: Optional[str]) -> Optional[list]:
    """Parse JSON points string → list of [x,y] pairs or None."""
    if not raw:
        return None
    try:
        pts = json.loads(raw)
        if isinstance(pts, list) and len(pts) == 4:
            return pts
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _encode_preview(img) -> str:
    """Encode numpy BGR image as base64 JPEG (low quality for transfer)."""
    import numpy as np
    if not isinstance(img, np.ndarray):
        return ""
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 65])
    return base64.b64encode(buf).decode("utf-8")


def _log_step(
    step: int,
    raw_text: str,
    blocks: list,
    ocr_conf: float,
    field_conf: float,
    merged_conf: float,
    parsed: dict,
) -> None:
    """Structured JSON log for every OCR step — use docker logs for analysis."""
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "step": step,
        "ocr_confidence": round(ocr_conf, 3),
        "field_confidence": round(field_conf, 3),
        "merged_confidence": round(merged_conf, 3),
        "blocks_count": len(blocks),
        "parsed_fields": {k: v for k, v in parsed.items() if v is not None},
        "raw_text_preview": raw_text[:600].replace("\n", "↵"),
    }
    logger.info("OCR_STEP %s", json.dumps(payload, ensure_ascii=False))


def _to_int(value: Optional[str]) -> Optional[int]:
    """Convert string to int. Handles 'N+1' seat notation (e.g. '4+1' → 5)."""
    if value is None:
        return None
    stripped = str(value).strip()
    if stripped.isdigit():
        return int(stripped)
    parts = re.split(r"[+]", stripped)
    numeric = [p.strip() for p in parts if p.strip().isdigit()]
    if numeric:
        return sum(int(p) for p in numeric)
    return None
