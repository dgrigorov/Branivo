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

Bulgarian талон MRZ structure (3 lines, 30 chars each):
  Line 1: M<BGR<{doc_number:10}<{series:6}{check}<{check}<<
    Registration plate is embedded in the series field (positions 18–24).
  Line 2: {VIN:17}{YYMMDD:6}{check:1}{internal:3}<<<
    No EGN — positions 18–23 are the first-registration date, not a personal ID.
  Line 3: {SURNAME}<<{NAME}<{PATRONYMIC}<<<
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# ── compiled patterns ──────────────────────────────────────────────────────────

# Field codes in parentheses: (A), (D.1), (C.2.1.), (S.1)
# Lookahead stops only at real field codes like (A), (D.1) — NOT at (PETROL).
FIELD_CODE_PAT = r"\([A-Z](?:[.\d]+)*\.?\)"
# .*? (zero-or-more lazy) allows empty values — empty fields no longer eat
# the next field's content as their value when .+? required ≥ 1 char.
FIELD_RE = re.compile(
    r"\(([A-Z](?:[.\d]+)*\.?)\)\s*(.*?)(?=\s*" + FIELD_CODE_PAT + r"|\Z)",
    re.S,
)
# Loose variant: tolerates a missing opening parenthesis — OCR on wrinkled
# documents sometimes drops the "(" before field codes like "A)", "D.1)".
# Only matches at the start of a line (after \n or at ^ in MULTILINE mode)
# to avoid false positives on random text containing uppercase letters + ")".
_LOOSE_FIELD_CODE_PAT = r"(?:^|\n)\s*([A-Z](?:[.\d]+)*\.?)\)\s"
FIELD_RE_LOOSE = re.compile(
    r"(?:^|\n)\s*([A-Z](?:[.\d]+)*\.?)\)\s+(.*?)(?=(?:^|\n)\s*[A-Z](?:[.\d]+)*\.?\)|\Z)",
    re.S | re.M,
)

VIN_RE = re.compile(r"([A-HJ-NPR-Z0-9]{17})")
# Trailing (?![A-Z]) instead of \b — handles reg embedded in MRZ without spaces
# Also accepts O in digit positions (normalised to 0 before matching)
REG_RE = re.compile(r"\b([A-Z]{1,2}[ \-]?[0-9O]{4}[ \-]?[A-Z]{1,2})(?![A-Z])")

# Cyrillic characters that are visually identical to Latin equivalents.
# Tesseract (bul+eng) sometimes outputs Cyrillic glyphs for what are actually
# Latin characters on the талон (registration number, make/model, VIN).
# Normalise them to Latin BEFORE regex matching so field extraction works.
# Map: А→A, В→B, С→C, Е→E, К→K, М→M, Н→H (Н ≈ H shape), О→O, Р→P, Т→T, Х→X
_CYR_LAT_TABLE = str.maketrans(
    "АВСЕКМНОРТХавсекмнортх",
    "ABCEKMHOPTXabcekmhoptx",
)
EGN_RE = re.compile(r"(?<!\d)(\d{10})(?!\d)")
DATE_RE = re.compile(r"\b(\d{2}[.\/\-]\d{2}[.\/\-]\d{4})\b")
# Primary: strict MRZ (correct OCR with '<' preserved)
MRZ_LINE_RE = re.compile(r"^[A-Z0-9<]{20,}$")
# Fallback: tolerate common Tesseract substitutes for '<' (dash, dot, space)
# when there are enough uppercase+digit characters to look like an MRZ line
_MRZ_LOOSE_RE = re.compile(r"^[A-Z0-9<\-.\s]{20,}$")

# Matches a pure-Latin-script line (digits, letters, basic punctuation)
LATIN_RE = re.compile(r"^[A-Z0-9\s\-./]+$", re.I)
# Parenthesised English word — used to extract bilingual label (e.g. БЕНЗИН (PETROL))
_PAREN_LATIN_RE = re.compile(r"\(([A-Z][A-Z\s]+)\)")

# Known vehicle manufacturer names — used as a fallback when field codes
# are not readable (wrinkled document).  Ordered by prefix length (longest first)
# so more-specific matches win over shorter prefixes.
_KNOWN_MAKES = [
    "MERCEDES-BENZ", "MERCEDES", "VOLKSWAGEN", "RENAULT", "PEUGEOT",
    "CITROEN", "TOYOTA", "HONDA", "NISSAN", "HYUNDAI", "SUZUKI",
    "MITSUBISHI", "MAZDA", "SUBARU", "VOLVO", "SKODA", "FORD",
    "OPEL", "FIAT", "SEAT", "AUDI", "BMW", "KIA", "DACIA",
    "KAWASAKI", "YAMAHA", "DUCATI", "HARLEY", "TRIUMPH",
]
_MAKE_RE = re.compile(r"\b(" + "|".join(re.escape(m) for m in _KNOWN_MAKES) + r")\b", re.I)
# Model designator patterns: "Z 1000", "307", "S 350", "GOLF", "3 SERIES"
# Kept narrow to avoid noise:  1-3 uppercase letters optionally followed by 2-4 digits
# OR pure 3-4 digit code OR 3-8 uppercase-only letters (like GOLF, POLO, SERIES)
_MODEL_DESIG_RE = re.compile(
    r"([A-Z]{1,3}[ \t\n]?\d{2,4}|\d{3,4}|[A-Z]{3,8})", re.I
)

# Fuel type words that appear on Bulgarian talona (bilingual BG/EN)
_FUEL_WORDS = {
    "PETROL": "PETROL", "BENZIN": "PETROL", "БЕНЗИН": "PETROL",
    "DIESEL": "DIESEL", "ДИЗЕЛ": "DIESEL",
    "GAS": "GAS", "CNG": "CNG", "LPG": "LPG",
    "ELECTRIC": "ELECTRIC", "ЕЛЕКТРИК": "ELECTRIC",
    "HYBRID": "HYBRID", "ХИБРИД": "HYBRID",
}
_FUEL_RE = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in _FUEL_WORDS) + r")\b", re.I
)


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
    raw_vin = _first_line(fields.get("E"))
    make_from_fields = _prefer_latin(fields.get("D.1") or fields.get("D1"))
    model_from_fields = _prefer_latin(fields.get("D.3") or fields.get("D3"))
    make = make_from_fields or _find_make(text)
    data: Dict[str, Optional[str]] = {
        "registrationNumber": _clean_reg(fields.get("A")) or _find_reg(text),
        "make": make,
        "model": model_from_fields or (
            _find_model_near_make(text, make) if make else None
        ),
        "vin": _normalize_vin(raw_vin) if raw_vin else _find_vin(text),
        "firstRegistration": fields.get("B") or _find_date(text),
    }
    return data, _confidence_step2(data)


def parse_step3(text: str) -> Tuple[Dict[str, Optional[str]], float]:
    """Extract technical specification fields: engine, fuel, seats."""
    fields = _extract_labeled_fields(text)
    data: Dict[str, Optional[str]] = {
        "engine": _find_engine_cc(fields.get("P.1") or fields.get("P1")),
        "fuel": _prefer_latin(fields.get("P.3") or fields.get("P3"))
                or _find_fuel(text),
        "seats": _first_line(fields.get("S.1") or fields.get("S1")),
        "firstRegistration": fields.get("B") or _find_date(text),
    }
    return data, _confidence_step3(data)


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
    """Parse VIN, reg number and owner from Bulgarian талон MRZ lines.

    Line 1: M<BGR<{doc_number:10}<{series:6}{check}<{check}<<
      Registration number is embedded in the series field (positions 18-23 or 18-24).
      Extracted via _find_reg_in_mrz1() which splits on '<' and matches the reg pattern.

    Line 2: {VIN:17}{YYMMDD:6}{check:1}{internal:3}<<<
      Positions [0:17] = VIN.
      Positions [17:23] = date of first registration (YYMMDD) — NOT EGN.
      No EGN is present in the Bulgarian vehicle registration MRZ.

    Line 3: {SURNAME}<<{NAME}<{MIDDLENAME}<<<
    """
    # line 2 → VIN only (positions [0:17])
    line2 = lines[1] if len(lines) >= 2 else ""
    raw_vin = line2[0:17] if len(line2) >= 17 else None

    vin = _normalize_vin(raw_vin) if raw_vin else _find_vin(line2)

    # line 3 → owner name
    owner_name: Optional[str] = None
    if len(lines) >= 3:
        owner_name = _parse_mrz_name(lines[2])

    # Reg number: extract from line 1 fields (split by '<')
    reg = _find_reg_in_mrz1(lines[0]) or _find_reg("\n".join(lines))

    return {
        "vin": vin,
        "registrationNumber": reg,
        "ownerName": owner_name,
        "egn": None,
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
        "egn": None,
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

def _prefer_latin(value: Optional[str]) -> Optional[str]:
    """For bilingual BG/EN fields, return the Latin (ASCII) version.

    Priority:
    1. Parenthesised English word — most reliable (e.g. 'БЕНЗИН (PETROL)' → 'PETROL')
    2. A full line that is pure Latin and longer than 2 chars
    3. The first line as-is
    """
    if not value:
        return None
    # Priority 1: parenthesised Latin word (reliable bilingual marker)
    paren = _PAREN_LATIN_RE.search(value)
    if paren:
        return paren.group(1).strip()
    # Priority 2: first full Latin line of meaningful length
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    latin_lines = [l for l in lines if LATIN_RE.match(l) and len(l) > 2]
    if latin_lines:
        return latin_lines[0]
    return lines[0] if lines else value


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


def _first_line(value: Optional[str]) -> Optional[str]:
    """Return only the first non-empty line of a multi-line field value."""
    if not value:
        return None
    for line in value.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return None


def _first_numeric_token(value: Optional[str]) -> Optional[str]:
    """Return the first numeric token from a field value (e.g. '3498\\n...' → '3498')."""
    if not value:
        return None
    for token in re.split(r"[\s\n]+", value):
        token = token.strip()
        if token.isdigit():
            return token
    return None


def _find_reg_in_mrz1(line1: str) -> Optional[str]:
    """Extract reg number from MRZ line 1 '<'-delimited fields.

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


def _find_make(text: str) -> Optional[str]:
    """Fallback: find a known manufacturer name in raw OCR text.

    Used when the (D.1) field code is not readable due to wrinkles.
    Returns the matched manufacturer name in uppercase (normalised).
    """
    m = _MAKE_RE.search(text)
    return m.group(1).upper() if m else None


def _find_model_near_make(text: str, make: str) -> Optional[str]:
    """Fallback: extract model name from the text immediately after the make.

    Handles patterns like "PEUGEOT:307", "KAWASAKI Z 1000", "BMW\n3 SERIES".
    After finding the make in the OCR text, takes up to 20 chars following it
    (stopping before the make name repeats), strips separator characters, and
    extracts the first alphanumeric token sequence.
    Returns "{MAKE} {MODEL_TOKEN}" or None if nothing useful is found.
    """
    m = _MAKE_RE.search(text)
    if not m:
        return None
    # Limit the scan window to 30 chars; stop before the make name repeats
    after_raw = text[m.end():m.end() + 30]
    # If the make name repeats (e.g. "KAWASAKI\nZ\n1000\nKAWASAKI"), cut there
    make_again = re.search(re.escape(make), after_raw, re.I)
    if make_again:
        after_raw = after_raw[:make_again.start()]
    # Strip leading separators (colon, space, newline, period)
    after = re.sub(r"^[:\s.]+", "", after_raw)
    if not after:
        return None
    # Extract model designator using a strict pattern to avoid noise tokens
    model_m = _MODEL_DESIG_RE.match(after)
    if not model_m:
        return None
    # Normalise internal whitespace (newlines → single space)
    model_token = re.sub(r"\s+", " ", model_m.group(1)).strip()
    if not model_token:
        return None
    return f"{make} {model_token}"


def _find_engine_cc(value: Optional[str]) -> Optional[str]:
    """Extract engine displacement from a P.1 field value.

    Requires a 3-4 digit number in the realistic cc range (500–9999).
    Rejects lone digits ("7"), year-like values (outside cc range), etc.
    """
    if not value:
        return None
    for token in re.split(r"[\s\n]+", value):
        token = token.strip()
        if token.isdigit() and 500 <= int(token) <= 9999:
            return token
    return None


def _find_fuel(text: str) -> Optional[str]:
    """Fallback: find fuel type keyword in raw OCR text.

    Used when the (P.3) field code is not readable due to wrinkles.
    Returns a normalised English fuel type string (PETROL, DIESEL, etc.).
    """
    m = _FUEL_RE.search(text)
    if not m:
        return None
    return _FUEL_WORDS.get(m.group(1).upper())


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
    # PaddleOCR often merges the field label 'A' with the registration value
    # (parentheses dropped): "(A) B0001CC" → "AB0001CC".
    # If the result is 8 chars, starts with a single uppercase letter that
    # looks like a field label, and removing it yields a valid 7-char reg,
    # prefer the shorter version — Bulgarian 1-letter prefixes are uncommon.
    # PaddleOCR merges the field label 'A' with the registration value when
    # parentheses are dropped: "(A) B0001CC" → "AB0001CC".  If the match
    # starts at the beginning of a line and the first character is 'A'
    # (the EU field code for registration number), strip it.
    if len(fixed) == 8 and fixed[0] == 'A':
        candidate = fixed[1:]
        match_pos = m.start(1)
        is_line_start = (match_pos == 0) or (normalized[match_pos - 1] in "\n\r")
        if is_line_start and REG_RE.search(candidate):
            return _fix_reg_ocr(candidate)
    return fixed


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
