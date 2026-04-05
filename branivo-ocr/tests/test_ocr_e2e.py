"""End-to-end OCR accuracy tests for branivo-ocr.

Fixture layout
--------------
tests/fixtures/
  doc-001/            ← one folder per registration certificate
    step1.jpg         ← owner / MRZ page          (POST /ocr/talon?step=1)
    step1b.jpg        ← alternate shot of same page (also tested as step=1)
    step2.jpg         ← vehicle identity page      (POST /ocr/talon?step=2)
    step3.jpg         ← technical specs page       (POST /ocr/talon?step=3)
    expected.json     ← ground truth for all steps
  doc-002/
    ...

Naming convention
-----------------
  doc-NNN/            NNN = zero-padded sequence (001, 002, ...)
  step1.jpg           canonical shot for step 1
  step1b.jpg          alternate shot (different angle/lighting) — also step 1
  step1c.jpg          another alternate — still step 1
  step2.jpg / step2b.jpg / ...
  step3.jpg / step3b.jpg / ...

Adding a new document
---------------------
1.  mkdir tests/fixtures/doc-NNN
2.  Copy your JPEG(s) using the naming above
3.  Create expected.json (copy from doc-001/expected.json as template)
4.  Run:  pytest tests/ -k doc-NNN -v

expected.json schema
--------------------
{
  "description": "Human-readable label (make/model — owner)",
  "step1": {
    "vin":                "WDDTESTVIN0000001",   ← null → field is not asserted
    "registrationNumber": "AA0000BB",
    "ownerLastName":      "ПЕТРОВ",            ← Cyrillic as printed on document
    "ownerFirstName":     "ДАНИЕЛ",
    "ownerMiddleName":    "ТЕСТОВ",
    "ownerAddress":       null,                  ← null skips assertion
    "egn":                "0000000000"
  },
  "step2": {
    "registrationNumber": "AA0000BB",
    "vin":                "WDDTESTVIN0000001",
    "make":               "MERCEDES",
    "model":              "MERCEDES S 350"
  },
  "step3": {
    "engine": "3498",
    "fuel":   "PETROL",
    "seats":  5
  }
}

Matching rules
--------------
  string  → case-insensitive, whitespace-normalised
  integer → exact numeric equality
  null    → field is SKIPPED (not asserted; useful for fields not yet legible)
  key absent from expected.json step → field is SKIPPED
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import httpx
import pytest

# ---------------------------------------------------------------------------
# Fixtures root
# ---------------------------------------------------------------------------

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# ---------------------------------------------------------------------------
# Test-case discovery
# ---------------------------------------------------------------------------

def _step_num(filename: str) -> int:
    """Extract step number from filename: 'step2b.jpg' → 2."""
    m = re.match(r"step(\d)", filename)
    return int(m.group(1)) if m else 0


def _collect_cases() -> list[tuple[str, int, Path, dict]]:
    """Return list of (doc_id, step_num, image_path, expected_step_dict)."""
    cases: list[tuple[str, int, Path, dict]] = []
    for doc_dir in sorted(FIXTURES_DIR.iterdir()):
        if not doc_dir.is_dir() or not doc_dir.name.startswith("doc-"):
            continue
        expected_file = doc_dir / "expected.json"
        if not expected_file.exists():
            continue
        expected = json.loads(expected_file.read_text())
        for img in sorted(doc_dir.glob("step*.jpg")):
            step = _step_num(img.name)
            if step == 0:
                continue
            step_key = f"step{step}"
            if step_key not in expected:
                # Image exists but no ground truth for this step — skip
                continue
            cases.append((doc_dir.name, step, img, expected[step_key]))
    return cases


_CASES = _collect_cases()
_CASE_IDS = [f"{doc}:{img.stem}" for doc, _step, img, _ in _CASES]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize(value: Any) -> str:
    """Normalize a field value for comparison."""
    return re.sub(r"\s+", " ", str(value)).strip().upper()


def _matches(actual: Any, expected: Any) -> bool:
    if isinstance(expected, int):
        try:
            return int(actual) == expected
        except (TypeError, ValueError):
            return False
    return _normalize(actual) == _normalize(expected)


def _call_ocr(api_url: str, image_path: Path, step: int) -> dict:
    with image_path.open("rb") as fh:
        resp = httpx.post(
            f"{api_url}/ocr/talon",
            params={"step": step, "debug": "true"},
            files={"file": (image_path.name, fh, "image/jpeg")},
            timeout=30,
        )
    resp.raise_for_status()
    return resp.json()

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("doc_id,step,image_path,expected_fields", _CASES, ids=_CASE_IDS)
def test_ocr_fields(
    doc_id: str,
    step: int,
    image_path: Path,
    expected_fields: dict,
    api_url: str,
) -> None:
    """Assert each expected field matches the OCR response."""
    result = _call_ocr(api_url, image_path, step)
    data: dict = result.get("data", {})
    confidence: float = result.get("confidence", 0.0)

    failures: list[str] = []
    skipped: list[str] = []
    passed: list[str] = []

    for field, expected_value in expected_fields.items():
        if expected_value is None:
            skipped.append(field)
            continue
        actual_value = data.get(field)
        if _matches(actual_value, expected_value):
            passed.append(f"  ✓ {field}: {actual_value!r}")
        else:
            failures.append(
                f"  ✗ {field}:\n"
                f"      expected: {expected_value!r}\n"
                f"      got:      {actual_value!r}"
            )

    summary_lines = [
        f"\ndoc={doc_id}  step={step}  image={image_path.name}  confidence={confidence:.3f}",
        f"passed: {len(passed)}/{len(passed) + len(failures)}",
    ]
    if passed:
        summary_lines += passed
    if skipped:
        summary_lines.append(f"  – skipped (null): {', '.join(skipped)}")

    assert not failures, "\n".join(summary_lines + ["\nFAILURES:"] + failures)


@pytest.mark.parametrize("doc_id,step,image_path,expected_fields", _CASES, ids=_CASE_IDS)
def test_ocr_confidence(
    doc_id: str,
    step: int,
    image_path: Path,
    expected_fields: dict,
    api_url: str,
) -> None:
    """Assert OCR confidence is above the minimum acceptable threshold."""
    min_confidence = 0.35  # below this = preprocessing failure, not just OCR noise
    result = _call_ocr(api_url, image_path, step)
    confidence = result.get("confidence", 0.0)
    assert confidence >= min_confidence, (
        f"{doc_id} step={step} {image_path.name}: "
        f"confidence {confidence:.3f} < {min_confidence} — "
        "likely a preprocessing or orientation failure"
    )
