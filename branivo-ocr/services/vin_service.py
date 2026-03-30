"""VIN validation and decoding via NHTSA vPIC API.

Validation uses format check only (17 chars, valid charset) — the check-digit
algorithm is advisory for European VINs and must not block processing.
Decoding has a 3 s timeout; on failure the caller receives an empty dict.
"""

from __future__ import annotations

import re
from typing import Dict, Optional

import httpx

VIN_PATTERN = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")
NHTSA_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{vin}?format=json"

_CHAR_VALUES: Dict[str, int] = {
    "A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7, "H": 8,
    "J": 1, "K": 2, "L": 3, "M": 4, "N": 5, "P": 7, "R": 9,
    "S": 2, "T": 3, "U": 4, "V": 5, "W": 6, "X": 7, "Y": 8, "Z": 9,
    **{str(i): i for i in range(10)},
}
_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]


def validate_vin(vin: str) -> bool:
    """Format-only validation — safe for EU VINs."""
    return bool(VIN_PATTERN.match(vin.upper()))


def check_digit_valid(vin: str) -> bool:
    """North-American SAE check digit (advisory for EU VINs)."""
    vin = vin.upper()
    try:
        total = sum(_CHAR_VALUES.get(c, 0) * w for c, w in zip(vin, _WEIGHTS))
        remainder = total % 11
        expected = "X" if remainder == 10 else str(remainder)
        return vin[8] == expected
    except IndexError:
        return False


async def decode_vin(vin: str) -> Dict[str, Optional[str]]:
    """Call NHTSA vPIC and return decoded vehicle attributes.

    Returns empty dict on invalid VIN, network error, or timeout.
    """
    if not validate_vin(vin):
        return {}
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(NHTSA_URL.format(vin=vin))
            if resp.status_code != 200:
                return {}
            return _parse_response(resp.json())
    except (httpx.TimeoutException, httpx.RequestError):
        return {}


def _parse_response(data: dict) -> Dict[str, Optional[str]]:
    results = {
        r["Variable"]: r["Value"]
        for r in data.get("Results", [])
        if r.get("Value") and r["Value"] not in ("Not Applicable", "")
    }
    return {
        "make": results.get("Make"),
        "model": results.get("Model"),
        "year": results.get("Model Year"),
        "fuel": results.get("Fuel Type - Primary"),
        "engine": results.get("Displacement (CC)"),
    }
