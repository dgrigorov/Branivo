"""Field extraction from OCR text of Bulgarian vehicle registration certificates.

EU Directive 1999/37/EC field codes (Bulgarian талон format):
  A      — Registration number
  B      — Date of first registration
  C.2.1  — Owner surname
  C.2.2  — Owner given names
  C.2.3  — Owner address
  D      — Vehicle category description
  D.1    — Make  (bilingual BG/EN — we prefer the Latin line)
  D.3    — Commercial name / model
  E      — VIN
  P.1    — Engine displacement (cc)
  P.2    — Max power (kW)
  P.3    — Fuel type
  S.1    — Number of seats  (may be "4+1" — we sum all parts)

Bulgarian талон MRZ structure (3 lines, fixed-width):
  Line 1: M<BGR<{doc_no}<{reg_number}{year_digit}<{check}<
  Line 2: {VIN[0:17]}{EGN[0:10]}{check}<
  Line 3: {SURNAME}<<{NAME}<{PATRONYMIC}<<<
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# ── compiled patterns ──────────────────────────────────────────────────────────

# Field codes in parentheses: (A), (D.1), (C.2.1.), (S.1)
# Lookahead stops only at real field codes like (A), (D.1) — NOT at (PETROL).
FIELD_CODE_PAT = r"\([A-Z](?:[.\d]+)*\.?\)"
FIELD_RE = re.compile(
    r"\(([A-Z](?:[.\d]+)*\.?)\)\s*(.+?)(?=\s*" + FIELD_CODE_PAT + r"|\Z)",
    re.S,
)

VIN_RE = re.compile(r"([A-HJ-NPR-Z0-9]{17})")
# Trailing (?![A-Z]) instead of \b — handles reg embedded in MRZ without spaces
REG_RE = re.compile(r"\b([A-Z]{1,2}[\s\-]?\d{4}[\s\-]?[A-Z]{2})(?![A-Z])")
EGN_RE = re.compile(r"(?<!\d)(\d{10})(?!\d)")
DATE_RE = re.compile(r"\b(\d{2}[.\/\-]\d{2}[.\/\-]\d{4})\b")
MRZ_LINE_RE = re.compile(r"^[A-Z0-9<]{20,}$")

# Matches a pure-Latin-script word (used to prefer the Latin line in bilingual fields)
LATIN_RE = re.compile(r"^[A-Z0-9\s\-./]+$", re.I)


# ── public API ─────────────────────────────────────────────────────────────────

def parse_step1(text: str) -> Tuple[Dict[str, Optional[str]], float]:
    """Extract MRZ zone fields using positional MRZ parsing + regex fallback."""
    mrz_lines = _detect_mrz_lines(text)

    if len(mrz_lines) >= 2:
        data = _parse_mrz_positional(mrz_lines)
    else:
        data = _parse_step1_fallback(text)

    return data, _confidence_step1(data)


def parse_step2(text: str) -> Tuple[Dict[str, Optional[str]], float]:
    """Extract vehicle identity fields: make, model, registration, VIN."""
    fields = _extract_labeled_fields(text)
    data: Dict[str, Optional[str]] = {
        "registrationNumber": _clean_reg(fields.get("A")) or _find_reg(text),
        "make": _prefer_latin(fields.get("D.1") or fields.get("D1")),
        "model": _prefer_latin(fields.get("D.3") or fields.get("D3")),
        "vin": fields.get("E") or _find_vin(text),
        "firstRegistration": fields.get("B") or _find_date(text),
    }
    return data, _confidence_step2(data)


def parse_step3(text: str) -> Tuple[Dict[str, Optional[str]], float]:
    """Extract technical specification fields: engine, fuel, seats."""
    fields = _extract_labeled_fields(text)
    data: Dict[str, Optional[str]] = {
        "engine": fields.get("P.1") or fields.get("P1"),
        "fuel": _prefer_latin(fields.get("P.3") or fields.get("P3")),
        "seats": fields.get("S.1") or fields.get("S1"),
        "firstRegistration": fields.get("B") or _find_date(text),
    }
    return data, _confidence_step3(data)


# ── MRZ positional parser ──────────────────────────────────────────────────────

def _detect_mrz_lines(text: str) -> List[str]:
    """Return lines that look like MRZ (uppercase + digits + '<', ≥ 20 chars)."""
    return [line.strip() for line in text.splitlines() if MRZ_LINE_RE.match(line.strip())]


def _parse_mrz_positional(lines: List[str]) -> Dict[str, Optional[str]]:
    """Parse VIN, EGN, reg number and owner from Bulgarian талон MRZ lines.

    Line 2 layout: [0:17] VIN  [17:27] EGN  [27:] trailing check + filler
    Line 3 layout: SURNAME<<GIVEN<NAMES<<<
    """
    # line 2 → VIN + EGN
    line2 = lines[1] if len(lines) >= 2 else ""
    raw_vin = line2[0:17] if len(line2) >= 17 else None
    raw_egn = line2[17:27] if len(line2) >= 27 else None

    vin = raw_vin if raw_vin and VIN_RE.fullmatch(raw_vin) else _find_vin(line2)
    egn = raw_egn if raw_egn and raw_egn.isdigit() else None

    # line 3 → owner name
    owner_name: Optional[str] = None
    if len(lines) >= 3:
        owner_name = _parse_mrz_name(lines[2])

    # Reg number: extract from MRZ line 1 fields (split by '<')
    reg = _find_reg_in_mrz1(lines[0]) or _find_reg("\n".join(lines))

    return {
        "vin": vin,
        "registrationNumber": reg,
        "ownerName": owner_name,
        "egn": egn,
    }


def _parse_mrz_name(line3: str) -> Optional[str]:
    """Convert 'PETROV<<IVAN<TESTOV<<<' → 'IVAN TESTOV PETROV'."""
    line3 = line3.rstrip("<")
    parts = line3.split("<<")
    if not parts:
        return None
    surname = parts[0].strip("<").replace("<", " ")
    given = parts[1].replace("<", " ").strip() if len(parts) > 1 else ""
    name_parts = [p for p in [given, surname] if p]
    return " ".join(name_parts) if name_parts else None


def _parse_step1_fallback(text: str) -> Dict[str, Optional[str]]:
    """Regex-based fallback when MRZ lines cannot be detected."""
    fields = _extract_labeled_fields(text)
    return {
        "vin": fields.get("E") or _find_vin(text),
        "registrationNumber": _clean_reg(fields.get("A")) or _find_reg(text),
        "ownerName": _find_owner_labeled(fields) or _find_owner_egn_header(text),
        "egn": _find_egn(text),
    }


# ── labeled-field extractor ────────────────────────────────────────────────────

def _extract_labeled_fields(text: str) -> Dict[str, str]:
    """Extract (FIELD_CODE) VALUE pairs from OCR text.

    Handles multi-column layouts where multiple fields appear on one line.
    Strips trailing `***` (redacted fields on the talona).
    """
    result: Dict[str, str] = {}
    for match in FIELD_RE.finditer(text):
        key = match.group(1).rstrip(".")
        value = match.group(2).strip().rstrip("*").strip()
        # Skip empty / redacted fields and values that are actually the next field
        if value and value != "***" and not value.startswith("("):
            result[key] = value
    return result


# ── field value helpers ────────────────────────────────────────────────────────

_PAREN_LATIN_RE = re.compile(r"\(([A-Z][A-Z\s]+)\)")


def _prefer_latin(value: Optional[str]) -> Optional[str]:
    """For bilingual BG/EN fields, return the Latin (ASCII) version.

    Priority:
    1. A full line that is pure Latin (e.g. 'MERCEDES S 350' below a BG line)
    2. Parenthesised Latin word on the same line (e.g. 'БЕНЗИН (PETROL)' → 'PETROL')
    3. The original value as-is
    """
    if not value:
        return None
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    latin_lines = [line for line in lines if LATIN_RE.match(line)]
    if latin_lines:
        return latin_lines[0]
    # Fallback: extract parenthesised Latin word (bilingual same-line format)
    paren = _PAREN_LATIN_RE.search(value)
    if paren:
        return paren.group(1).strip()
    return lines[0] if lines else value


def _find_reg_in_mrz1(line1: str) -> Optional[str]:
    """Extract reg number from MRZ line 1 '<'-delimited fields.

    e.g. 'M<BGR<0000000002<AA0000BB1<2<' → 'AA0000BB'
    """
    REG_LOOSE = re.compile(r"^([A-Z]{1,2}\d{4}[A-Z]{2})")
    for field in line1.split("<"):
        m = REG_LOOSE.match(field)
        if m:
            return m.group(1)
    return None


def _clean_reg(value: Optional[str]) -> Optional[str]:
    """Extract reg number from raw field value (may include document number)."""
    if not value:
        return None
    m = REG_RE.search(value)
    if m:
        return m.group(1).replace(" ", "").replace("-", "")
    return value.split()[0] if value else None


def _find_vin(text: str) -> Optional[str]:
    m = VIN_RE.search(text)
    return m.group(1) if m else None


def _find_reg(text: str) -> Optional[str]:
    m = REG_RE.search(text)
    return _clean_reg(m.group(1)) if m else None


def _find_egn(text: str) -> Optional[str]:
    m = EGN_RE.search(text)
    return m.group(1) if m else None


def _find_date(text: str) -> Optional[str]:
    m = DATE_RE.search(text)
    return m.group(1) if m else None


def _find_owner_labeled(fields: Dict[str, str]) -> Optional[str]:
    """Reconstruct owner name from C.2.1 (surname) + C.2.2 (given names)."""
    surname = fields.get("C.2.1") or fields.get("C21")
    given = fields.get("C.2.2") or fields.get("C22")
    parts = [p.strip() for p in [given, surname] if p]
    return " ".join(parts) if parts else None


def _find_owner_egn_header(text: str) -> Optional[str]:
    """Fallback: line before 'ЕГН/ID' often contains the owner name."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if "ЕГН" in line or "EGN" in line.upper():
            if i > 0:
                candidate = lines[i - 1].strip()
                if candidate and len(candidate) > 3:
                    return candidate
    return None


# ── confidence calculators ─────────────────────────────────────────────────────

def _confidence_step1(data: Dict[str, Optional[str]]) -> float:
    weights = {"vin": 0.5, "registrationNumber": 0.3, "egn": 0.1, "ownerName": 0.1}
    return sum(weights[k] for k, v in data.items() if v is not None)


def _confidence_step2(data: Dict[str, Optional[str]]) -> float:
    weights = {"registrationNumber": 0.3, "make": 0.3, "model": 0.2, "vin": 0.2}
    return sum(weights.get(k, 0.0) for k, v in data.items() if v is not None)


def _confidence_step3(data: Dict[str, Optional[str]]) -> float:
    weights = {"engine": 0.4, "fuel": 0.4, "seats": 0.2}
    return sum(weights.get(k, 0.0) for k, v in data.items() if v is not None)
