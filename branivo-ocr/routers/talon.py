"""POST /ocr/talon?step=1|2|3

step=1  MRZ zone → VIN + reg number + owner + EGN → VIN decode
        If confidence >= 0.90 → complete=true (caller may stop here)
step=2  Vehicle identity page (A, D.1, D.3, E, B)
step=3  Technical specs page  (P.1, P.3, S.1)

All images are processed in-memory. No disk writes.
"""

from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from models.talon_response import TalonData, TalonResponse
from services import mrz_parser, ocr_engine, preprocessor, vin_service

router = APIRouter()

COMPLETE_THRESHOLD = 0.90


@router.post("/talon", response_model=TalonResponse)
async def process_talon(
    file: UploadFile = File(...),
    step: int = Query(..., ge=1, le=3),
) -> TalonResponse:
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    if step == 1:
        return await _step1(image_bytes)
    return _step_n(image_bytes, step)


# ── step handlers ──────────────────────────────────────────────────────────────

async def _step1(image_bytes: bytes) -> TalonResponse:
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

    return TalonResponse(
        success=True,
        step=1,
        confidence=confidence,
        data=data,
        complete=confidence >= COMPLETE_THRESHOLD,
    )


def _step_n(image_bytes: bytes, step: int) -> TalonResponse:
    img = preprocessor.preprocess(image_bytes)
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

    return TalonResponse(
        success=True,
        step=step,
        confidence=confidence,
        data=data,
        complete=False,
    )


# ── helpers ────────────────────────────────────────────────────────────────────

def _to_int(value: Optional[str]) -> Optional[int]:
    """Convert string to int. Handles 'N+1' seat notation (e.g. '4+1' → 5)."""
    if value is None:
        return None
    stripped = str(value).strip()
    if stripped.isdigit():
        return int(stripped)
    # Handle seat notation like "4+1"
    parts = re.split(r"[+]", stripped)
    numeric = [p.strip() for p in parts if p.strip().isdigit()]
    if numeric:
        return sum(int(p) for p in numeric)
    return None
