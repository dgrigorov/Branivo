"""Field extraction from OCR text of Bulgarian vehicle registration certificates.

EU Directive 1999/37/EC field codes:
  A  — Registration number
  B  — Date of first registration
  C.1 — Owner name
  C.4.1 — Owner EGN / personal ID
  D.1 — Make
  D.3 — Commercial name / model
  E  — VIN
  P.1 — Engine displacement (cc)
  P.2 — Max power (kW)
  P.3 — Fuel type
  S.1 — Number of seats
"""

from __future__ import annotations

import re
from typing import Dict, Optional, Tuple

VIN_RE = re.compile(r"\b([A-HJ-NPR-Z0-9]{17})\b")
REG_RE = re.compile(r"\b([A-Z]{1,2}[\s\-]?\d{4}[\s\-]?[A-Z]{2})\b")
EGN_RE = re.compile(r"\b(\d{10})\b")
DATE_RE = re.compile(r"\b(\d{2}[.\/\-]\d{2}[.\/\-]\d{4})\b")

# Matches labeled fields like "D.1 : VOLKSWAGEN" or "E: WVW..."
FIELD_RE = re.compile(
    r"(?:^|\n)([A-Z](?:\.\d+)*)\s*[:\.\s]\s*(.+?)(?=\n[A-Z](?:\.\d+)*\s*[:\.\s]|\Z)",
    re.M | re.S,
)


def parse_step1(text: str) -> Tuple[Dict[str, Optional[str]], float]:
    """Extract MRZ zone fields: VIN, registration number, owner, EGN."""
    data: Dict[str, Optional[str]] = {
        "vin": _find_vin(text),
        "registrationNumber": _find_reg(text),
        "ownerName": _find_owner(text),
        "egn": _find_egn(text),
    }
    return data, _confidence_step1(data)


def parse_step2(text: str) -> Tuple[Dict[str, Optional[str]], float]:
    """Extract vehicle identity fields: make, model, registration, VIN."""
    fields = _extract_labeled_fields(text)
    data: Dict[str, Optional[str]] = {
        "registrationNumber": fields.get("A") or _find_reg(text),
        "make": fields.get("D.1") or fields.get("D1"),
        "model": fields.get("D.3") or fields.get("D3"),
        "vin": fields.get("E") or _find_vin(text),
        "firstRegistration": fields.get("B") or _find_date(text),
    }
    return data, _confidence_step2(data)


def parse_step3(text: str) -> Tuple[Dict[str, Optional[str]], float]:
    """Extract technical specification fields: engine, fuel, seats."""
    fields = _extract_labeled_fields(text)
    data: Dict[str, Optional[str]] = {
        "engine": fields.get("P.1") or fields.get("P1"),
        "fuel": fields.get("P.3") or fields.get("P3"),
        "seats": fields.get("S.1") or fields.get("S1"),
        "firstRegistration": _find_date(text),
    }
    return data, _confidence_step3(data)


# ── private helpers ────────────────────────────────────────────────────────────

def _extract_labeled_fields(text: str) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for match in FIELD_RE.finditer(text):
        key = match.group(1).strip()
        value = match.group(2).strip()
        if value:
            result[key] = value
    return result


def _find_vin(text: str) -> Optional[str]:
    m = VIN_RE.search(text)
    return m.group(1) if m else None


def _find_reg(text: str) -> Optional[str]:
    m = REG_RE.search(text)
    if not m:
        return None
    return m.group(1).replace(" ", "").replace("-", "")


def _find_egn(text: str) -> Optional[str]:
    m = EGN_RE.search(text)
    return m.group(1) if m else None


def _find_date(text: str) -> Optional[str]:
    m = DATE_RE.search(text)
    return m.group(1) if m else None


def _find_owner(text: str) -> Optional[str]:
    pattern = re.compile(r"C\.?1\s*[:\s]\s*([А-ЯA-Z][А-ЯA-Za-z\s\-]{3,})", re.I)
    m = pattern.search(text)
    return m.group(1).strip() if m else None


def _confidence_step1(data: Dict[str, Optional[str]]) -> float:
    weights = {"vin": 0.5, "registrationNumber": 0.3, "egn": 0.1, "ownerName": 0.1}
    return sum(weights[k] for k, v in data.items() if v is not None)


def _confidence_step2(data: Dict[str, Optional[str]]) -> float:
    weights = {"registrationNumber": 0.3, "make": 0.3, "model": 0.2, "vin": 0.2}
    return sum(weights.get(k, 0.0) for k, v in data.items() if v is not None)


def _confidence_step3(data: Dict[str, Optional[str]]) -> float:
    weights = {"engine": 0.4, "fuel": 0.4, "seats": 0.2}
    return sum(weights.get(k, 0.0) for k, v in data.items() if v is not None)
