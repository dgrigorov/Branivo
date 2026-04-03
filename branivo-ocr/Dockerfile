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

# Pre-download PaddleOCR models during build so the first request is instant.
# Models are stored in /root/.paddleocr/ and baked into the image layer.
# lang='en'       → Latin text + OCR-B MRZ zones
# lang='cyrillic' → Bulgarian Cyrillic + Latin labels (step 2 / step 3 pages)
RUN python3 -c "
from paddleocr import PaddleOCR
print('Downloading Latin / MRZ model...')
PaddleOCR(use_angle_cls=False, lang='en', use_gpu=False, show_log=False)
print('Downloading Cyrillic / Bulgarian model...')
PaddleOCR(use_angle_cls=False, lang='cyrillic', use_gpu=False, show_log=False)
print('All models ready.')
"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
