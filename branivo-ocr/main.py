from contextlib import asynccontextmanager

from fastapi import FastAPI
from routers.talon import router as talon_router
from services import ocr_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load EasyOCR model at startup so first request doesn't time out
    ocr_engine.get_reader()
    yield


app = FastAPI(title="branivo-ocr", version="1.0.0", lifespan=lifespan)
app.include_router(talon_router, prefix="/ocr")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
