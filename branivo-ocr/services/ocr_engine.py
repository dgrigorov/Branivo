"""Claude Vision OCR engine for Bulgarian vehicle registration certificates.

Replaces the previous PaddleOCR/Tesseract implementation.

Why Claude Vision:
- 100% accuracy on fixture documents (vs ~33% with PaddleOCR).
- No local model weights — zero GPU/RAM overhead, Docker limit drops from 3 GB → 512 MB.
- Direct JSON output for steps 2/3 — no regex parsing needed.
- Handles laminate glare, Cyrillic/Latin mixing, and arbitrary orientations natively.

API:
  extract_step1(image_bytes) → raw MRZ text (parsed by mrz_parser.py)
  extract_step2(image_bytes) → dict {vin, registrationNumber, make, model}
  extract_step3(image_bytes) → dict {engine, fuel, seats}
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from typing import Optional

import anthropic

logger = logging.getLogger("branivo.ocr")

MODEL = "claude-sonnet-4-6"
TIMEOUT = 30.0
MAX_RETRIES = 1

_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY environment variable is not set")
        _client = anthropic.Anthropic(api_key=api_key, timeout=TIMEOUT)
    return _client


def _media_type(image_bytes: bytes) -> str:
    """Detect image MIME type from magic bytes."""
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def _call_claude(prompt: str, image_bytes: bytes) -> str:
    """Call Claude Vision API with one retry on timeout."""
    client = _get_client()
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
    mime = _media_type(image_bytes)

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=512,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": mime,
                                    "data": b64,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            )
            return response.content[0].text
        except anthropic.APITimeoutError:
            if attempt < MAX_RETRIES:
                logger.warning("Claude API timeout — retrying (attempt %d)", attempt + 1)
                time.sleep(1)
                continue
            raise
    return ""  # unreachable


_STEP1_PROMPT = (
    "This is a Bulgarian vehicle registration certificate (талон). "
    "Extract ALL of the following and return a single JSON object with no markdown fences and no explanation:\n"
    '{"mrz": ["<MRZ line 1>", "<MRZ line 2>", "<MRZ line 3>"], '
    '"ownerLastName": "owner surname from field C.2.1 — as printed on the document (may be Cyrillic)", '
    '"ownerFirstName": "owner first name — first token of field C.2.2", '
    '"ownerMiddleName": "owner middle/patronymic name — second token of field C.2.2, or null if absent", '
    '"ownerAddress": "permanent address from field C.2.3 — full text as printed", '
    '"egn": "10-digit Bulgarian personal ID (ЕГН) shown after the ЕГН/ID label, or null if not visible"}\n'
    "The mrz array must contain the 3 lines of the machine-readable zone at the bottom of the document "
    "(uppercase Latin letters, digits, and \'<\' characters). "
    "Use null for any field you cannot read clearly."
)

_STEP2_PROMPT = (
    "This is the vehicle identity page of a Bulgarian registration certificate. "
    "Extract the following fields and return a JSON object with no markdown fences and no explanation:\n"
    '{"vin": "17-character VIN from field E", '
    '"registrationNumber": "registration plate number from field A", '
    '"certNumber": "certificate serial number printed in the top-right corner of the document (format: № followed by 9 digits, e.g. 008888485) — return only the digits", '
    '"make": "vehicle manufacturer in Latin script from field D.1 — the first word(s) before the model designation (e.g. PEUGEOT, KAWASAKI, MERCEDES)", '
    '"model": "model designation from the same line as field D.1 — NOTE: field D.3 is always redacted (***) on Bulgarian talons so read the model token that appears after the make name on the D.1 line (e.g. if D.1 reads \'PEUGEOT 307\' the model is \'307\') — do NOT include the make name in this field", '
    '"year": "4-digit year of first registration from field B (e.g. if field B shows 13.05.2002 return 2002)", '
    '"color": "vehicle color in English from field R (e.g. WHITE, BLACK, RED, SILVER, BLUE, GREY) — translate from Bulgarian if needed", '
    '"ownerLastName": "owner surname from field C.2.1", '
    '"ownerFirstName": "first token of field C.2.2 (owner first name)", '
    '"ownerMiddleName": "second token of field C.2.2 (owner middle/patronymic name), or null if absent", '
    '"egn": "10-digit Bulgarian personal ID shown after the ЕГН/ID label, or null if not visible"}\n'
    "Use null for any field you cannot read clearly."
)

_STEP3_PROMPT = (
    "This is the technical specifications page of a Bulgarian registration certificate. "
    "Extract the following fields and return a JSON object with no markdown fences and no explanation:\n"
    '{"engine": "engine displacement in cc as a plain number string from field P.1", '
    '"powerKw": "engine power in kW as a plain number string from field P.2", '
    '"fuel": "fuel type in English — one of: PETROL, DIESEL, GAS, ELECTRIC, HYBRID — from field P.3", '
    '"seats": "total seat count as a plain number string from field S.1 (e.g. \'4+1\' or \'5\')", '
    '"vehicleCategory": "vehicle category code from field J (e.g. M1, N1, L3)", '
    '"firstRegistration": "first registration date from field B in DD.MM.YYYY format (e.g. 13.05.2002)", '
    '"registrationValidity": "date of current registration from field I in DD.MM.YYYY format (e.g. 29.03.2018)", '
    '"certNumber": "certificate serial number from № in the bottom-right corner — digits only (e.g. 008888485)"}\n'
    "Use null for any field you cannot read clearly."
)


def extract_step1(image_bytes: bytes) -> dict:
    """Return dict with mrz lines + labeled owner fields for step 1 processing.

    Keys: mrz (list[str]), ownerLastName, ownerFirstName, ownerMiddleName,
          ownerAddress, egn.
    The mrz lines are passed to mrz_parser for VIN/reg extraction.
    Owner fields are read directly from the printed document (may be Cyrillic).
    """
    raw = _call_claude(_STEP1_PROMPT, image_bytes)
    result = _parse_json(raw)
    # Normalise mrz to list[str]; tolerate Claude returning a plain string
    mrz = result.get("mrz")
    if isinstance(mrz, str):
        result["mrz"] = [line for line in mrz.splitlines() if line.strip()]
    elif not isinstance(mrz, list):
        result["mrz"] = []
    return result


def extract_step2(image_bytes: bytes) -> tuple[dict, str]:
    """Return (parsed_dict, raw_text) for vehicle identity fields."""
    raw = _call_claude(_STEP2_PROMPT, image_bytes)
    return _parse_json(raw), raw


def extract_step3(image_bytes: bytes) -> tuple[dict, str]:
    """Return (parsed_dict, raw_text) for technical spec fields."""
    raw = _call_claude(_STEP3_PROMPT, image_bytes)
    return _parse_json(raw), raw


def _parse_json(raw: str) -> dict:
    """Parse JSON from Claude response, tolerating accidental markdown fences."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        end = -1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[1:end])
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
    except (json.JSONDecodeError, ValueError):
        logger.warning("Failed to parse Claude JSON response: %.200s", raw)
    return {}
