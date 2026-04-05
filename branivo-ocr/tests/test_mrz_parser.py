"""Unit tests for mrz_parser.parse_step1 and its helpers.

These tests run without the OCR server — pure Python, no network calls.
"""

from __future__ import annotations

import pytest

from services.mrz_parser import (
    _find_egn,
    _find_reg,
    _find_reg_in_mrz1,
    _find_vin,
    _normalize_vin,
    _parse_mrz_name,
    _parse_mrz_positional,
    parse_step1,
)


# ── _normalize_vin ─────────────────────────────────────────────────────────────

class TestNormalizeVin:
    def test_valid_vin_unchanged(self):
        assert _normalize_vin("WDDTESTVIN0000001") == "WDDTESTVIN0000001"

    def test_o_replaced_with_zero(self):
        # 'O' is not a valid VIN character — replaced with '0'
        assert _normalize_vin("WDDO210561A08O259") == "WDD0210561A080259"

    def test_i_replaced_with_one(self):
        assert _normalize_vin("WDDI210561A080259") == "WDD1210561A080259"

    def test_cyrillic_lookalikes(self):
        # Cyrillic А (U+0410) → Latin A; both look identical on a scanned document
        # Input: WDD2210561 + Cyrillic А + 080259 → WDDTESTVIN0000001
        assert _normalize_vin("WDD2210561\u0410080259") == "WDDTESTVIN0000001"

    def test_too_short_returns_none(self):
        assert _normalize_vin("WDD221056") is None

    def test_non_vin_chars_stripped(self):
        assert _normalize_vin("VF3TESTVIN0000003") == "VF3TESTVIN0000003"


# ── _parse_mrz_name ────────────────────────────────────────────────────────────

class TestParseMrzName:
    def test_standard_name(self):
        result = _parse_mrz_name("PETROV<<IVAN<TESTOV<<<")
        assert result == {"lastName": "PETROV", "firstName": "DANIEL", "middleName": "TESTOV"}

    def test_single_given_name(self):
        result = _parse_mrz_name("PETROV<<IVAN<<<")
        assert result == {"lastName": "PETROV", "firstName": "IVAN", "middleName": None}

    def test_three_name_parts(self):
        result = _parse_mrz_name("IVANOVA<<ELENA<PETROVA<<<<<")
        assert result == {"lastName": "IVANOVA", "firstName": "MARIANA", "middleName": "PETROVA"}

    def test_empty_line(self):
        result = _parse_mrz_name("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<")
        assert result == {"lastName": None, "firstName": None, "middleName": None}


# ── _find_reg_in_mrz1 ─────────────────────────────────────────────────────────

class TestFindRegInMrz1:
    def test_6char_series(self):
        # Series field is 6 chars: AA0000BB + check digit
        line1 = "M<BGR<0000000002<AA0000BB1<2<"
        assert _find_reg_in_mrz1(line1) == "AA0000BB"

    def test_7char_series(self):
        # Series field is 7 chars: A0000BC + check digit
        line1 = "M<BGR<1234567890<A0000BC1<1<<"
        assert _find_reg_in_mrz1(line1) == "A0000BC"

    def test_8char_series(self):
        # Series field is 8 chars: СА1234КА + check digit
        line1 = "M<BGR<9876543210<SA1234KA1<1<"
        assert _find_reg_in_mrz1(line1) == "SA1234KA"

    def test_no_plate_returns_none(self):
        assert _find_reg_in_mrz1("M<BGR<0000000000<<<<<<<<<<<<<<<") is None


# ── _find_reg ─────────────────────────────────────────────────────────────────

class TestFindReg:
    def test_standard_reg(self):
        assert _find_reg("Рег. номер: AA0000BB") == "AA0000BB"

    def test_reg_with_spaces(self):
        assert _find_reg("CB 0688 MM") == "AA0000BB"

    def test_strips_field_label_a(self):
        # When OCR drops parentheses: "(A) B0001CC" → "AB0001CC"
        result = _find_reg("AB0001CC\nsome other text")
        assert result == "B0001CC"

    def test_o_normalised_to_zero(self):
        # 'O' in digit position → '0'
        assert _find_reg("CB06O8MM") == "CB0608MM"


# ── _find_vin ─────────────────────────────────────────────────────────────────

class TestFindVin:
    def test_vin_in_text(self):
        assert _find_vin("E) VF3TESTVIN0000003\n") == "VF3TESTVIN0000003"

    def test_no_vin_returns_none(self):
        assert _find_vin("no vin here") is None

    def test_cyrillic_normalised(self):
        # Cyrillic А (U+0410) → Latin A before VIN search
        assert _find_vin("VF33CNFUB824\u04103450") == "VF33CNFUB824A3450"


# ── _find_egn ─────────────────────────────────────────────────────────────────

class TestFindEgn:
    def test_egn_after_label(self):
        assert _find_egn("ЕГН/ ID 8501010001") == "8501010001"

    def test_egn_latin_label(self):
        assert _find_egn("EGN 0000000001") == "0000000001"

    def test_no_egn_returns_none(self):
        assert _find_egn("no personal id here") is None


# ── _parse_mrz_positional ─────────────────────────────────────────────────────

class TestParseMrzPositional:
    def test_mercedes_mrz_with_egn(self):
        # Line 2: VIN(17) + EGN(10) + filler
        lines = [
            "M<BGR<0000000002<AA0000BB1<2<",
            "WDDTESTVIN00000018501010001<<",
            "PETROV<<IVAN<TESTOV<<<",
        ]
        data = _parse_mrz_positional(lines)
        assert data["vin"] == "WDDTESTVIN0000001"
        assert data["registrationNumber"] == "AA0000BB"
        assert data["ownerLastName"] == "PETROV"
        assert data["ownerFirstName"] == "DANIEL"
        assert data["ownerMiddleName"] == "TESTOV"
        assert data["egn"] == "8501010001"

    def test_kawasaki_mrz_with_egn(self):
        lines = [
            "M<BGR<1234567890<A0000B<<1<1<",
            "JKATESTVIN00000029910156789<<",
            "PETROV<<IVAN<<<",
        ]
        data = _parse_mrz_positional(lines)
        assert data["vin"] == "JKATESTVIN0000002"
        assert data["egn"] == "9910156789"
        assert data["ownerLastName"] == "PETROV"
        assert data["ownerFirstName"] == "IVAN"
        assert data["ownerMiddleName"] is None

    def test_egn_invalid_when_contains_non_digits(self):
        # Positions [17:27] have '<' chars — not a valid EGN
        lines = [
            "M<BGR<0000000000<A0000B<<1<1<",
            "JKATESTVIN0000002<<<<<<<<<<<<",
            "PETROV<<IVAN<TESTOV<<<",
        ]
        data = _parse_mrz_positional(lines)
        assert data["egn"] is None


# ── parse_step1 (integration) ─────────────────────────────────────────────────

class TestParseStep1:
    def test_full_mrz_text(self):
        text = (
            "M<BGR<0000000002<AA0000BB1<2<\n"
            "WDDTESTVIN00000018501010001<<\n"
            "PETROV<<IVAN<TESTOV<<<"
        )
        data, conf = parse_step1(text)
        assert data["vin"] == "WDDTESTVIN0000001"
        assert data["registrationNumber"] == "AA0000BB"
        assert data["ownerLastName"] == "PETROV"
        assert data["ownerFirstName"] == "DANIEL"
        assert data["ownerMiddleName"] == "TESTOV"
        assert data["egn"] == "8501010001"
        assert conf == pytest.approx(1.0)  # vin(0.5) + reg(0.3) + ownerLastName(0.2)

    def test_missing_owner_reduces_confidence(self):
        text = (
            "M<BGR<0000000002<AA0000BB1<2<\n"
            "WDDTESTVIN00000018501010001<<\n"
        )
        data, conf = parse_step1(text)
        assert data["vin"] == "WDDTESTVIN0000001"
        assert conf == pytest.approx(0.8)  # no ownerLastName → vin(0.5) + reg(0.3)

    def test_fallback_when_no_mrz_lines(self):
        text = "(A) AA0000BB\n(E) WDDTESTVIN0000001\n"
        data, conf = parse_step1(text)
        assert data["registrationNumber"] == "AA0000BB"
        assert data["vin"] == "WDDTESTVIN0000001"

    def test_egn_from_mrz_line2(self):
        text = (
            "M<BGR<0000000002<AA0000BB1<2<\n"
            "WDDTESTVIN00000018501010001<<\n"
            "PETROV<<IVAN<TESTOV<<<"
        )
        data, _ = parse_step1(text)
        assert data["egn"] == "8501010001"

    def test_fallback_egn_from_label(self):
        text = "(A) AA0000BB\n(E) WDDTESTVIN0000001\nЕГН/ ID 0000000001\n"
        data, _ = parse_step1(text)
        assert data["egn"] == "0000000001"
