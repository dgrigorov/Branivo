from fastapi import FastAPI

from routers.debug import router as debug_router
from routers.talon import router as talon_router

app = FastAPI(title="branivo-ocr", version="2.0.0")
app.include_router(talon_router, prefix="/ocr")
app.include_router(debug_router, prefix="/ocr")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
