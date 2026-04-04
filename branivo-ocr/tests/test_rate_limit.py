"""Unit tests for the rate limiting middleware in main.py.

Uses Starlette TestClient (bundled with FastAPI) — no extra dependencies.
"""

from __future__ import annotations

import time

import pytest
from starlette.testclient import TestClient

import main
from main import _RATE_LIMIT, _RATE_WINDOW, _rate_buckets


@pytest.fixture(autouse=True)
def clear_buckets():
    """Reset in-memory rate buckets between tests."""
    _rate_buckets.clear()
    yield
    _rate_buckets.clear()


@pytest.fixture
def client():
    with TestClient(main.app, raise_server_exceptions=False) as c:
        yield c


def test_health_not_rate_limited(client):
    """Health endpoint is exempt from rate limiting."""
    for _ in range(_RATE_LIMIT + 5):
        resp = client.get("/health")
        assert resp.status_code == 200


def test_ocr_talon_under_limit(client):
    """Requests under the limit are allowed (may fail validation, but not 429)."""
    for _ in range(_RATE_LIMIT - 1):
        resp = client.post("/ocr/talon", params={"step": 1})
        assert resp.status_code != 429


def test_ocr_talon_over_limit_returns_429(client):
    """11th request within the window returns 429."""
    for _ in range(_RATE_LIMIT):
        client.post("/ocr/talon", params={"step": 1})

    resp = client.post("/ocr/talon", params={"step": 1})
    assert resp.status_code == 429
    body = resp.json()
    assert "retry_after" in body
    assert body["retry_after"] == _RATE_WINDOW
    assert resp.headers["Retry-After"] == str(int(_RATE_WINDOW))


def test_rate_limit_retry_after_header(client):
    """429 response includes Retry-After header."""
    for _ in range(_RATE_LIMIT):
        client.post("/ocr/talon", params={"step": 1})
    resp = client.post("/ocr/talon", params={"step": 1})
    assert "Retry-After" in resp.headers


def test_rate_limit_resets_after_window(client):
    """After the window expires, the counter resets and requests are allowed."""
    now = time.monotonic()
    # Pre-fill the bucket with timestamps just outside the window
    old = now - _RATE_WINDOW - 1.0
    for _ in range(_RATE_LIMIT):
        _rate_buckets["testclient"].append(old)

    # Old entries should be evicted — this request must not be 429
    resp = client.post("/ocr/talon", params={"step": 1})
    assert resp.status_code != 429
