"""POST /ocr/talon?step=1|2|3

step=1  MRZ zone → Claude extracts raw MRZ text → mrz_parser parses VIN/reg/owner/EGN → VIN decode
        If confidence >= 0.90 → complete=true (caller may stop here)
step=2  Vehicle identity page → Claude returns {vin, registrationNumber, make, model} as JSON
step=3  Technical specs page  → Claude returns {engine, fuel, seats} as JSON

Optional params:
  points  — JSON string [[x,y]×4] normalized 0..1 (top-left, top-right,
            bottom-right, bottom-left).  When present, perspective crop is
            applied BEFORE the OCR call.
  debug   — boolean; when true the response includes debug_info with extracted fields.

All images are processed in-memory. No disk writes.
"""

from __future__ import annotations

import base64
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

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

_STEP2_FIELDS = ["vin", "registrationNumber", "make", "model"]
_STEP3_FIELDS = ["engine", "fuel", "seats"]


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
        try:
            image_bytes = preprocessor.perspective_crop(image_bytes, pts)
        except Exception as exc:
            logger.warning("perspective_crop failed — using original: %s", exc)

    try:
        if step == 1:
            return await _step1(image_bytes, debug=debug)
        return _step_n(image_bytes, step, debug=debug)
    except Exception as exc:
        logger.error("OCR step %d error: %s", step, exc, exc_info=True)
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/preview")
async def debug_preview(
    file: UploadFile = File(...),
    step: int = Query(..., ge=1, le=3),
    points: Optional[str] = Form(None),
) -> dict:
    """Debug: return the image that will be sent to Claude (perspective-cropped if points provided)."""
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    pts = _parse_points(points)
    if pts is not None:
        image_bytes = preprocessor.perspective_crop(image_bytes, pts)

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return {"step": step, "image_b64": b64}


# ── step handlers ──────────────────────────────────────────────────────────────

async def _step1(image_bytes: bytes, *, debug: bool = False) -> TalonResponse:
    text = ocr_engine.extract_step1(image_bytes)
    parsed, field_conf = mrz_parser.parse_step1(text)
    confidence = round(field_conf, 3)

    vin_decoded: dict = {}
    if parsed.get("vin"):
        vin_decoded = await vin_service.decode_vin(parsed["vin"])

    data = TalonData(
        vin=parsed.get("vin"),
        registrationNumber=parsed.get("registrationNumber"),
        ownerLastName=parsed.get("ownerLastName"),
        ownerFirstName=parsed.get("ownerFirstName"),
        ownerMiddleName=parsed.get("ownerMiddleName"),
        egn=parsed.get("egn"),
        make=vin_decoded.get("make"),
        model=vin_decoded.get("model"),
        year=_to_int(vin_decoded.get("year")),
        fuel=vin_decoded.get("fuel"),
        engine=vin_decoded.get("engine"),
    )

    _log_step(1, confidence, parsed)
    return TalonResponse(
        success=True,
        step=1,
        confidence=confidence,
        data=data,
        complete=confidence >= COMPLETE_THRESHOLD,
        raw_text=text,
        debug_info={"field_confidence": field_conf, "parsed_fields": {k: v for k, v in parsed.items() if v is not None}} if debug else None,
        preview_b64=base64.b64encode(image_bytes).decode("utf-8") if debug else None,
    )


def _step_n(image_bytes: bytes, step: int, *, debug: bool = False) -> TalonResponse:
    if step == 2:
        extracted = ocr_engine.extract_step2(image_bytes)
        confidence = _claude_confidence(extracted, _STEP2_FIELDS)
        make_val = extracted.get("make")
        model_val = extracted.get("model")
        # Prefix model with make when the model designation doesn't already include it
        if make_val and model_val and not model_val.upper().startswith(make_val.upper()):
            model_val = f"{make_val} {model_val}"
        data = TalonData(
            vin=extracted.get("vin"),
            registrationNumber=extracted.get("registrationNumber"),
            make=make_val,
            model=model_val,
            ownerLastName=extracted.get("ownerLastName"),
            ownerFirstName=extracted.get("ownerFirstName"),
            ownerMiddleName=extracted.get("ownerMiddleName"),
            egn=extracted.get("egn"),
        )
    else:
        extracted = ocr_engine.extract_step3(image_bytes)
        confidence = _claude_confidence(extracted, _STEP3_FIELDS)
        data = TalonData(
            engine=extracted.get("engine"),
            fuel=extracted.get("fuel"),
            seats=_to_int(extracted.get("seats")),
        )

    _log_step(step, confidence, extracted)
    return TalonResponse(
        success=True,
        step=step,
        confidence=confidence,
        data=data,
        complete=False,
        debug_info={"extracted": extracted} if debug else None,
        preview_b64=base64.b64encode(image_bytes).decode("utf-8") if debug else None,
    )


# ── helpers ────────────────────────────────────────────────────────────────────

def _claude_confidence(data: dict, required_keys: list[str]) -> float:
    """0.95 if all required fields present, 0.5 if partial, 0.0 if empty."""
    filled = sum(1 for k in required_keys if data.get(k) is not None)
    if filled == len(required_keys):
        return 0.95
    if filled > 0:
        return 0.5
    return 0.0


def _parse_points(raw: Optional[str]) -> Optional[list]:
    if not raw:
        return None
    try:
        pts = json.loads(raw)
        if isinstance(pts, list) and len(pts) == 4:
            return pts
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _log_step(step: int, confidence: float, parsed: dict) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "step": step,
        "confidence": round(confidence, 3),
        "parsed_fields": {k: v for k, v in parsed.items() if v is not None},
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
