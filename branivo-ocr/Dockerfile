FROM python:3.11-slim

WORKDIR /app

# System dependencies for OpenCV + PaddleOCR CPU inference (ARM64 compatible)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Models are downloaded on first use and cached in /root/.paddleocr/.
# Mount a volume there in production to persist the cache across restarts.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
