FROM python:3.11-slim

WORKDIR /app

# OpenCV + EasyOCR system dependencies (ARM64 compatible)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download EasyOCR models at build time (~100 MB, ARM-native)
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False, verbose=False)"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
