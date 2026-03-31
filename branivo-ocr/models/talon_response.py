from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class TalonData(BaseModel):
    vin: Optional[str] = None
    registrationNumber: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    fuel: Optional[str] = None
    engine: Optional[str] = None
    seats: Optional[int] = None
    firstRegistration: Optional[str] = None
    ownerName: Optional[str] = None
    egn: Optional[str] = None


class TalonResponse(BaseModel):
    success: bool
    step: int
    confidence: float
    data: TalonData
    complete: bool
    error: Optional[str] = None
    # Debug only — base64 JPEG of the preprocessed image sent to Tesseract.
    # Returned only when the request includes debug=true query param.
    preview_b64: Optional[str] = None
