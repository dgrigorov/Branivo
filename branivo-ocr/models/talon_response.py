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
