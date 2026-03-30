# Force x86 emulation — PaddlePaddle segfaults on ARM Docker (Apple Silicon)
FROM --platform=linux/amd64 python:3.11-slim

WORKDIR /app

# OpenCV system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# NOTE: PaddleOCR models (~600 MB) are downloaded on first request.
# To pre-bake them into the image, run:
#   docker run --rm branivo-ocr python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en', show_log=False)"
# then docker commit the result.

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
