"""MRZ parsing for Bulgarian vehicle registration certificates (step 1).

Steps 2 and 3 are handled by Claude Vision directly (JSON output) — no parsing needed here.

EU Directive 1999/37/EC field codes used for fallback:
  A      — Registration number
  C.2.1  — Owner last name (surname)
  C.2.2  — Owner first name + middle name (given names)
  E      — VIN

Bulgarian талон MRZ structure (3 lines):
  Line 1: M<BGR<{doc_number:10}<{series}{check}<{check}<<
    Series field is 6, 7, or 8 characters depending on the region.
    Registration plate is embedded in the series field.
  Line 2: {VIN:17}{EGN:10}...<<<
    Positions [0:17] = VIN.
    Positions [17:27] = Bulgarian personal ID (ЕГН) of the owner — 10 digits.
  Line 3: {LAST_NAME}<<{FIRST_NAME}<{MIDDLE_NAME}<<<
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# ── compiled patterns ──────────────────────────────────────────────────────────

# Field codes in parentheses: (A), (C.2.1.)
# Lookahead stops only at real field codes — NOT at random parenthesised words.
FIELD_CODE_PAT = r"\([A-Z](?:[.\d]+)*\.?\)"
FIELD_RE = re.compile(
    r"\(([A-Z](?:[.\d]+)*\.?)\)\s*(.*?)(?=\s*" + FIELD_CODE_PAT + r"|\Z)",
    re.S,
)
# Loose variant: tolerates a missing opening parenthesis — OCR on wrinkled
# documents sometimes drops the "(" before field codes.
FIELD_RE_LOOSE = re.compile(
    r"(?:^|\n)\s*([A-Z](?:[.\d]+)*\.?)\)\s+(.*?)(?=(?:^|\n)\s*[A-Z](?:[.\d]+)*\.?\)|\Z)",
    re.S | re.M,
)

VIN_RE = re.compile(r"([A-HJ-NPR-Z0-9]{17})")
# Trailing (?![A-Z]) instead of \b — handles reg embedded in MRZ without spaces
# Also accepts O in digit positions (normalised to 0 before matching)
REG_RE = re.compile(r"\b([A-Z]{1,2}[ \-]?[0-9O]{4}[ \-]?[A-Z]{1,2})(?![A-Z])")

# Cyrillic characters that are visually identical to Latin equivalents.
# Normalise them to Latin BEFORE regex matching so VIN/reg extraction works.
# Map: А→A, В→B, С→C, Е→E, К→K, М→M, Н→H, О→O, Р→P, Т→T, Х→X
_CYR_LAT_TABLE = str.maketrans(
    "АВСЕКМНОРТХавсекмнортх",
    "ABCEKMHOPTXabcekmhoptx",
)
# Primary: strict MRZ (correct OCR with '<' preserved)
MRZ_LINE_RE = re.compile(r"^[A-Z0-9<]{20,}$")
# Fallback: tolerate common OCR substitutes for '<' (dash, dot, space)
_MRZ_LOOSE_RE = re.compile(r"^[A-Z0-9<\-.\s]{20,}$")


# ── public API ─────────────────────────────────────────────────────────────────

def parse_step1(text: str) -> Tuple[Dict[str, Optional[str]], float]:
    """Extract MRZ zone fields using positional MRZ parsing + regex fallback.

    Steps 2 and 3 are handled by Claude Vision directly (JSON output) — no
    text parsing needed for those steps.
    """
    mrz_lines = _detect_mrz_lines(text)

    if len(mrz_lines) >= 2:
        data = _parse_mrz_positional(mrz_lines)
    else:
        data = _parse_step1_fallback(text)

    return data, _confidence_step1(data)


# ── MRZ positional parser ──────────────────────────────────────────────────────

def _detect_mrz_lines(text: str) -> List[str]:
    """Return lines that look like MRZ (uppercase + digits + '<', ≥ 20 chars).

    Normalises each line before matching: uppercase + strip OCR-inserted spaces.
    Falls back to loose matching when Tesseract substituted '<' with '-' or '.'.
    """
    result = []
    for line in text.splitlines():
        normalised = line.strip().upper().replace(" ", "")
        if MRZ_LINE_RE.match(normalised):
            result.append(normalised)
            continue
        # Loose pass: if the line looks MRZ-ish, normalise '<' substitutes
        loose = line.strip().upper()
        if _MRZ_LOOSE_RE.match(loose):
            # Replace common Tesseract '<' substitutes: dash, dot, lone space
            fixed = re.sub(r"[-.\s]", "<", loose).replace(" ", "")
            # Only accept if it still meets the strict pattern after fixing
            if MRZ_LINE_RE.match(fixed):
                result.append(fixed)
    return result


def _parse_mrz_positional(lines: List[str]) -> Dict[str, Optional[str]]:
    """Parse VIN, EGN, reg number and owner from Bulgarian талон MRZ lines.

    Line 1: M<BGR<{doc_number:10}<{series}{check}<{check}<<
      Series is 6-8 chars depending on the region/oblast.
      Registration number is embedded in the series field.
      Extracted via _find_reg_in_mrz1() which splits on '<' and matches the reg pattern.

    Line 2: {VIN:17}{EGN:10}...<<<
      Positions [0:17] = VIN.
      Positions [17:27] = Bulgarian personal ID (ЕГН) — 10 digits.

    Line 3: {LAST_NAME}<<{FIRST_NAME}<{MIDDLE_NAME}<<<
    """
    # line 2 → VIN (positions [0:17]) and EGN (positions [17:27])
    line2 = lines[1] if len(lines) >= 2 else ""
    raw_vin = line2[0:17] if len(line2) >= 17 else None
    vin = _normalize_vin(raw_vin) if raw_vin else _find_vin(line2)

    egn: Optional[str] = None
    if len(line2) >= 27:
        raw_egn = line2[17:27]
        if re.fullmatch(r"\d{10}", raw_egn):
            egn = raw_egn

    # line 3 → owner name parts
    owner: Dict[str, Optional[str]] = {"lastName": None, "firstName": None, "middleName": None}
    if len(lines) >= 3:
        owner = _parse_mrz_name(lines[2])

    # Reg number: extract from line 1 fields (split by '<')
    reg = _find_reg_in_mrz1(lines[0]) or _find_reg("\n".join(lines))

    return {
        "vin": vin,
        "registrationNumber": reg,
        "ownerLastName": owner["lastName"],
        "ownerFirstName": owner["firstName"],
        "ownerMiddleName": owner["middleName"],
        "egn": egn,
    }


def _parse_mrz_name(line3: str) -> Dict[str, Optional[str]]:
    """Convert 'PETROV<<IVAN<TESTOV<<<' → {lastName, firstName, middleName}."""
    line3 = line3.rstrip("<")
    parts = line3.split("<<")
    last_name = parts[0].replace("<", " ").strip() or None if parts else None
    given_parts = parts[1].split("<") if len(parts) > 1 else []
    first_name = given_parts[0].strip() or None if given_parts else None
    middle_name = given_parts[1].strip() or None if len(given_parts) > 1 else None
    return {"lastName": last_name, "firstName": first_name, "middleName": middle_name}


def _parse_step1_fallback(text: str) -> Dict[str, Optional[str]]:
    """Regex-based fallback when MRZ lines cannot be detected."""
    fields = _extract_labeled_fields(text)

    # C.2.1 = last name; C.2.2 = first name + middle name (space-separated)
    last_name = fields.get("C.2.1") or fields.get("C21")
    first_middle = fields.get("C.2.2") or fields.get("C22")
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    if first_middle:
        name_parts = first_middle.split()
        first_name = name_parts[0] if name_parts else None
        middle_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else None

    if not last_name:
        last_name = _find_owner_egn_header(text)

    return {
        "vin": fields.get("E") or _find_vin(text),
        "registrationNumber": _clean_reg(fields.get("A")) or _find_reg(text),
        "ownerLastName": last_name,
        "ownerFirstName": first_name,
        "ownerMiddleName": middle_name,
        "egn": _find_egn(text),
    }


# ── labeled-field extractor ────────────────────────────────────────────────────

def _cyr_to_lat(text: str) -> str:
    """Normalise Cyrillic visual lookalikes to Latin equivalents.

    Applied before regex field extraction so that OCR outputs like
    "С1029МА" (Cyrillic С, М, А) are matched as "B0001CC" (Latin).
    """
    return text.translate(_CYR_LAT_TABLE)


def _extract_labeled_fields(text: str) -> Dict[str, str]:
    """Extract (FIELD_CODE) VALUE pairs from OCR text.

    Handles multi-column layouts where multiple fields appear on one line.
    Strips trailing `***` (redacted fields on the talona).
    Falls back to a loose pattern that tolerates a missing opening parenthesis
    (OCR on wrinkled documents sometimes drops the "(" before field codes).
    """
    # Normalise Cyrillic lookalikes before parsing so field codes are Latin
    normalised = _cyr_to_lat(text)
    result: Dict[str, str] = {}
    for match in FIELD_RE.finditer(normalised):
        key = match.group(1).rstrip(".")
        value = match.group(2).strip().rstrip("*").strip()
        # Skip empty / redacted / next-field values; keep first valid occurrence
        if value and value != "***" and not value.startswith("(") and key not in result:
            result[key] = value

    # Loose pass: catch field codes where the opening "(" was dropped by OCR
    for match in FIELD_RE_LOOSE.finditer(normalised):
        key = match.group(1).rstrip(".")
        if key in result:
            continue  # already found via strict pass
        value = match.group(2).strip().rstrip("*").strip()
        if value and value != "***" and not value.startswith(")"):
            result[key] = value

    return result


# ── field value helpers ────────────────────────────────────────────────────────

def _normalize_vin(raw: str) -> Optional[str]:
    """Fix common OCR errors in VINs and validate 17-char format.

    Handles:
    - O/0 and I/1 confusion (universal OCR issue)
    - Cyrillic lookalikes (А→A, С→C, etc.) from bul+eng Tesseract output
    - VIN charset excludes I, O, Q — any such character is an OCR error.
    """
    # First convert Cyrillic lookalikes, then uppercase
    step1 = _cyr_to_lat(raw).upper()
    # Then fix O→0, I→1, Q→0 in VIN charset context
    normalized = step1.replace("O", "0").replace("I", "1").replace("Q", "0")
    # Strip non-VIN characters
    cleaned = re.sub(r"[^A-HJ-NPR-Z0-9]", "", normalized)
    if len(cleaned) >= 17 and VIN_RE.fullmatch(cleaned[:17]):
        return cleaned[:17]
    return None


def _find_reg_in_mrz1(line1: str) -> Optional[str]:
    """Extract reg number from MRZ line 1 '<'-delimited fields.

    Series field is 6-8 chars depending on region; splitting on '<' handles
    all variants automatically.
    e.g. 'M<BGR<0000000002<AA0000BB1<2<' → 'AA0000BB'
    Uppercases each field before matching (OCR may produce lowercase).
    """
    REG_LOOSE = re.compile(r"^([A-Z]{1,2}\d{4}[A-Z]{1,2})")
    for field in line1.split("<"):
        m = REG_LOOSE.match(field.upper())
        if m:
            return m.group(1).upper()
    return None


def _clean_reg(value: Optional[str]) -> Optional[str]:
    """Extract reg number from raw field value. Normalises O→0 in digit positions."""
    if not value:
        return None
    first = (value.splitlines()[0] if value else value).strip()
    m = REG_RE.search(first)
    if m:
        raw = m.group(1).replace(" ", "").replace("-", "")
        return _fix_reg_ocr(raw)
    return None


def _fix_reg_ocr(reg: str) -> str:
    """Normalise OCR errors in Bulgarian reg numbers.

    Format: PREFIX_LETTERS(1-2) + DIGITS(4) + SUFFIX_LETTERS(1-2).
    O in digit positions → 0.
    """
    m = re.match(r"^([A-Z]{1,2})([0-9O]{4})([A-Z]{1,2})$", reg)
    if not m:
        return reg
    prefix, digits, suffix = m.groups()
    return prefix + digits.replace("O", "0") + suffix


def _find_vin(text: str) -> Optional[str]:
    # Normalise Cyrillic lookalikes before VIN search
    m = VIN_RE.search(_cyr_to_lat(text).upper())
    if not m:
        return None
    return _normalize_vin(m.group(1))


def _find_reg(text: str) -> Optional[str]:
    # Normalise Cyrillic lookalikes before reg number search
    normalized = _cyr_to_lat(text).upper()
    m = REG_RE.search(normalized)
    if not m:
        return None
    raw = m.group(1).replace(" ", "").replace("-", "")
    fixed = _fix_reg_ocr(raw)
    # When OCR drops parentheses: "(A) B0001CC" → "AB0001CC".
    # If the match starts at a line boundary and the first character is 'A'
    # (the EU field code for registration number), strip it.
    if len(fixed) == 8 and fixed[0] == 'A':
        candidate = fixed[1:]
        match_pos = m.start(1)
        is_line_start = (match_pos == 0) or (normalized[match_pos - 1] in "\n\r")
        if is_line_start and REG_RE.search(candidate):
            return _fix_reg_ocr(candidate)
    return fixed


def _find_egn(text: str) -> Optional[str]:
    """Find Bulgarian EGN (10 digits) from 'ЕГН/ID' label in OCR text."""
    m = re.search(r"(?:ЕГН|EGN)[^0-9]*(\d{10})", text, re.IGNORECASE)
    if m:
        return m.group(1)
    return None


def _find_owner_egn_header(text: str) -> Optional[str]:
    """Fallback: line before 'ЕГН/ID' often contains the owner last name."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if "ЕГН" in line or "EGN" in line.upper():
            if i > 0:
                candidate = lines[i - 1].strip()
                if candidate and len(candidate) > 3:
                    return candidate
    return None


# ── confidence calculator ──────────────────────────────────────────────────────

def _confidence_step1(data: Dict[str, Optional[str]]) -> float:
    """VIN is the primary field (0.5); reg + owner last name together make up the rest."""
    weights = {"vin": 0.5, "registrationNumber": 0.3, "ownerLastName": 0.2}
    return sum(weights.get(k, 0.0) for k, v in data.items() if v is not None)
