from fastapi import FastAPI
from routers.talon import router as talon_router

app = FastAPI(title="branivo-ocr", version="1.0.0")
app.include_router(talon_router, prefix="/ocr")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
