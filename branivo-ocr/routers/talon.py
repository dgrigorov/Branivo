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

_STEP2_FIELDS = ["vin", "registrationNumber", "certNumber", "color", "make", "model", "year"]
_STEP3_FIELDS = ["engine", "fuel", "seats", "firstRegistration"]


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
    # Claude returns JSON: mrz lines + labeled owner fields (C.2.1, C.2.2, C.2.3, EGN)
    extracted = ocr_engine.extract_step1(image_bytes)

    # MRZ positional parsing for VIN + registration number (most reliable source)
    mrz_text = "\n".join(extracted.get("mrz") or [])
    parsed, _ = mrz_parser.parse_step1(mrz_text)

    # Claude-read labeled fields take priority for owner data (printed text,
    # may be Cyrillic); fall back to MRZ transliteration if Claude returned null
    owner_last = extracted.get("ownerLastName") or parsed.get("ownerLastName")
    owner_first = extracted.get("ownerFirstName") or parsed.get("ownerFirstName")
    owner_middle = extracted.get("ownerMiddleName") or parsed.get("ownerMiddleName")
    egn = extracted.get("egn") or parsed.get("egn")

    # Confidence: VIN(0.5) + reg(0.3) + ownerLastName(0.2) — after merge
    confidence = round(
        (0.5 if parsed.get("vin") else 0.0)
        + (0.3 if parsed.get("registrationNumber") else 0.0)
        + (0.2 if owner_last else 0.0),
        3,
    )

    vin_decoded: dict = {}
    if parsed.get("vin"):
        vin_decoded = await vin_service.decode_vin(parsed["vin"])

    # NHTSA vPIC is US-centric: make/model are reliable but year/fuel/engine
    # are inaccurate for EU VINs (e.g. year from position 10 is wrong for PSA/VW).
    # year → step 2 reads field B; fuel/engine → step 3 reads fields P.1/P.3.
    data = TalonData(
        vin=parsed.get("vin"),
        registrationNumber=parsed.get("registrationNumber"),
        ownerLastName=owner_last,
        ownerFirstName=owner_first,
        ownerMiddleName=owner_middle,
        ownerAddress=extracted.get("ownerAddress"),
        egn=egn,
        make=vin_decoded.get("make"),
        model=vin_decoded.get("model"),
    )

    _log_step(1, confidence, parsed)
    return TalonResponse(
        success=True,
        step=1,
        confidence=confidence,
        data=data,
        complete=confidence >= COMPLETE_THRESHOLD,
        raw_text=mrz_text or None,
        debug_info={
            "mrz_parsed": {k: v for k, v in parsed.items() if v is not None},
            "claude_extracted": {k: v for k, v in extracted.items() if v is not None and k != "mrz"},
        } if debug else None,
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
            certNumber=extracted.get("certNumber"),
            color=extracted.get("color"),
            make=make_val,
            model=model_val,
            year=_to_int(extracted.get("year")) or _year_from_date(extracted.get("firstRegistration")),
            ownerLastName=extracted.get("ownerLastName"),
            ownerFirstName=extracted.get("ownerFirstName"),
            ownerMiddleName=extracted.get("ownerMiddleName"),
            egn=extracted.get("egn"),
        )
    else:
        extracted = ocr_engine.extract_step3(image_bytes)
        confidence = _claude_confidence(extracted, _STEP3_FIELDS)
        # Derive year from firstRegistration date (DD.MM.YYYY → YYYY)
        first_reg = extracted.get("firstRegistration")
        year_from_reg = _year_from_date(first_reg)
        data = TalonData(
            engine=extracted.get("engine"),
            powerKw=extracted.get("powerKw"),
            fuel=extracted.get("fuel"),
            seats=_to_int(extracted.get("seats")),
            vehicleCategory=extracted.get("vehicleCategory"),
            firstRegistration=first_reg,
            registrationValidity=extracted.get("registrationValidity"),
            certNumber=extracted.get("certNumber"),
            year=year_from_reg,
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


def _year_from_date(date_str: Optional[str]) -> Optional[int]:
    """Extract 4-digit year from DD.MM.YYYY date string."""
    if not date_str:
        return None
    parts = str(date_str).strip().split(".")
    if len(parts) == 3 and parts[2].isdigit() and len(parts[2]) == 4:
        return int(parts[2])
    return None


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
