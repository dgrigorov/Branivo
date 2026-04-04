import collections
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from routers.debug import router as debug_router
from routers.talon import router as talon_router

app = FastAPI(title="branivo-ocr", version="2.0.0")
app.include_router(talon_router, prefix="/ocr")
app.include_router(debug_router, prefix="/ocr")

# ── rate limiting (10 requests / min / IP) ────────────────────────────────────

_RATE_LIMIT = 10           # requests
_RATE_WINDOW = 60.0        # seconds
# {ip: deque of timestamps}
_rate_buckets: dict[str, collections.deque] = collections.defaultdict(
    lambda: collections.deque()
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if not request.url.path.startswith("/ocr/talon"):
        return await call_next(request)

    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    bucket = _rate_buckets[ip]

    # Evict timestamps outside the current window
    while bucket and now - bucket[0] > _RATE_WINDOW:
        bucket.popleft()

    if len(bucket) >= _RATE_LIMIT:
        return JSONResponse(
            status_code=429,
            content={
                "message": "Твърде много заявки. Опитайте след малко.",
                "retry_after": _RATE_WINDOW,
            },
            headers={"Retry-After": str(int(_RATE_WINDOW))},
        )

    bucket.append(now)
    return await call_next(request)


# ── health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
