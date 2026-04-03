from contextlib import asynccontextmanager

from fastapi import FastAPI

from routers.debug import router as debug_router
from routers.talon import router as talon_router
from services import ocr_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-initialise both PaddleOCR models before the first request arrives.
    # Without this the first OCR call triggers a 3-5 s model load that causes
    # timeouts in CI and a bad user experience on first app launch.
    ocr_engine.warm_up()
    yield


app = FastAPI(title="branivo-ocr", version="1.0.0", lifespan=lifespan)
app.include_router(talon_router, prefix="/ocr")
app.include_router(debug_router, prefix="/ocr")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
