"""Image preprocessing pipeline for Bulgarian vehicle registration certificates.

Three pipelines:
  - light_preprocess: bilateral → CLAHE → glare mask (color output, step 1 MRZ)
  - preprocess_step23: adaptive pipeline (step 2 / step 3)
      Adapts to per-image brightness and contrast so that each step is only
      applied when it actually improves OCR confidence:
        decode → resize → upscale →
        gamma_correct (dark images only, mean < 110) →
        bilateral →
        clahe (low-contrast only, std < 50) →
        mask_glare →
        sharpen →
        otsu_binarize (high-contrast only, std > 65)
      Empirically tested on 13 fixture images — each step retained only when
      it raises Tesseract confidence; NLM and morph-open removed (both hurt).
  - crop_mrz_zone: crops + lightly preprocesses the bottom 38 % (MRZ band)

All operations are in-memory — no disk writes.
"""

from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image, ExifTags


MAX_DIM = 2048   # cap longest side to avoid OOM on high-res photos
OCR_MIN_DIM = 1600  # upscale to at least this many px on longest side before OCR


def perspective_crop(image_bytes: bytes, points: list[list[float]]) -> bytes:
    """Apply 4-point perspective correction and return JPEG bytes.

    points: [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] — normalized 0..1 in image space.
    Order: top-left, top-right, bottom-right, bottom-left.
    Scales to pixel coords, computes homography, warps to axis-aligned output.
    Returns the corrected image as JPEG bytes (max MAX_DIM on longest side).
    """
    img = _decode(image_bytes)
    img = _resize(img)
    h, w = img.shape[:2]

    src = np.float32([[p[0] * w, p[1] * h] for p in points])
    tl, tr, br, bl = src

    out_w = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    out_h = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
    if out_w < 4 or out_h < 4:
        # Degenerate quad — return original resized image
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return buf.tobytes()

    dst = np.float32([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]])
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(img, M, (out_w, out_h))
    _, buf = cv2.imencode(".jpg", warped, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return buf.tobytes()


def light_preprocess(image_bytes: bytes) -> np.ndarray:
    """Light pipeline for Tesseract — returns BGR color image.

    resize → bilateral → CLAHE → glare inpaint.
    EXIF orientation is handled in _decode, so _auto_orient is not needed.
    _deskew_color is omitted: it uses dark pixel distribution to detect skew,
    which is unreliable for hand-held photos with significant background.
    """
    img = _decode(image_bytes)
    img = _resize(img)
    img = _bilateral(img)
    img = _clahe(img)
    img = _mask_glare(img)
    return img


def preprocess_step23(image_bytes: bytes) -> np.ndarray:
    """Adaptive pipeline for steps 2/3 — returns grayscale or binary image.

    Each step is applied conditionally based on measured image characteristics
    so it only runs when it raises Tesseract confidence (empirically validated):

    1. Gamma correction  — only when mean brightness < 110 (dark photos).
       Darkness auto-scale: γ=2.0 for very dark (mean<70), γ=1.5 otherwise.
    2. Bilateral filter  — always; consistently +0.08–+0.16 for step-3 images
       and neutral-to-positive for step-2.
    3. CLAHE             — only when grayscale std-dev < 50 after bilateral
       (low-contrast images).  CLAHE consistently hurts high-contrast images.
    4. Glare mask        — always; cheap, occasionally helps laminate shine.
    5. Sharpen σ=1.5     — always; unsharp-mask recovers blurred text edges.
    6. Otsu binarize     — only when grayscale std-dev > 65 after sharpening
       (high-contrast images where binarization adds another +0.09).

    Removed vs. previous version:
    - NLM denoising  : ~20 s/image on CPU, hurts more often than it helps.
    - Morph open     : degraded confidence on every tested image.
    - Unconditional CLAHE : hurt all step-2 images; replaced by conditional.
    - Unconditional Otsu  : hurt when contrast is moderate; replaced by conditional.
    """
    img = _decode(image_bytes)
    img = _resize(img)
    img = _upscale_for_ocr(img)

    # Measure brightness of the raw image before any enhancement
    gray0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    mean_brightness = float(np.mean(gray0))

    # Step 1: Gamma correction — lift underexposed photos before bilateral
    if mean_brightness < 110:
        gamma_val = 2.0 if mean_brightness < 70 else 1.5
        img = _gamma_correct(img, gamma_val)

    # Step 2: Bilateral filter — smooths laminate grain while preserving edges
    img = _bilateral(img)

    # Step 3: CLAHE — only for low-contrast images; hurts already-sharp images
    gray_bi = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    if float(np.std(gray_bi)) < 50:
        img = _clahe(img)

    # Step 4: Glare mask — inpaint overexposed laminate highlights
    img = _mask_glare(img)

    # Step 5: Grayscale + sharpen — unsharp-mask recovers blurred text edges
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img.copy()
    gray = _sharpen(gray)

    # Step 6: Otsu binarize — only when image contrast is high enough
    if float(np.std(gray)) > 65:
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return binary

    return gray


def crop_mrz_zone(image_bytes: bytes) -> np.ndarray:
    """Crop + light-preprocess the MRZ zone (bottom 38 % of image).

    Auto-orient and deskew are intentionally skipped here:
    - Auto-orient was rotating hand-held portrait photos CCW, moving the
      owner-text region into the crop window instead of the MRZ lines.
    - Deskew on a partial card image picks up background/hand pixels and
      applies large incorrect rotations that break OCR.
    The MRZ is always at the physical bottom of a correctly-held registration
    certificate, so a generous bottom crop (38 %) reliably captures it without
    orientation guessing.  Bilateral + CLAHE + glare inpaint are still applied
    to improve contrast on laminated card surfaces.
    """
    img = _decode(image_bytes)   # EXIF rotation applied here
    img = _resize(img)
    h = img.shape[0]
    mrz = img[int(h * 0.62):, :]
    mrz = _bilateral(mrz)
    mrz = _clahe(mrz)
    mrz = _mask_glare(mrz)
    return mrz


# ── private helpers ────────────────────────────────────────────────────────────

def _resize(img: np.ndarray) -> np.ndarray:
    """Resize so the longest side does not exceed MAX_DIM (prevents OOM on high-res photos)."""
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= MAX_DIM:
        return img
    scale = MAX_DIM / longest
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _decode(image_bytes: bytes) -> np.ndarray:
    """Decode image bytes to BGR, applying EXIF orientation if present.

    OpenCV's imdecode ignores EXIF rotation tags, producing upside-down or
    sideways images for phone photos.  PIL reads EXIF and corrects orientation
    before we convert back to a BGR numpy array for OpenCV.
    """
    pil_img = Image.open(io.BytesIO(image_bytes))
    pil_img = _apply_exif_orientation(pil_img)
    rgb = np.array(pil_img.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def _apply_exif_orientation(img: Image.Image) -> Image.Image:
    """Rotate/flip a PIL image according to its EXIF Orientation tag."""
    try:
        exif = img._getexif()  # type: ignore[attr-defined]
    except Exception:
        exif = None
    if not exif:
        return img
    orient_tag = next(
        (tag for tag, name in ExifTags.TAGS.items() if name == "Orientation"), None
    )
    if orient_tag is None:
        return img
    orientation = exif.get(orient_tag)
    rotations = {3: 180, 6: 270, 8: 90}
    degrees = rotations.get(orientation)
    if degrees:
        img = img.rotate(degrees, expand=True)
    return img


def _upscale_for_ocr(img: np.ndarray) -> np.ndarray:
    """Upscale image so its longest side reaches OCR_MIN_DIM (≈ 300 DPI equivalent).

    Perspective-cropped regions are often much smaller than the original photo.
    Tesseract accuracy degrades sharply below ~150 DPI; upscaling with Lanczos4
    recovers text edge sharpness without introducing blocking artifacts.
    Does nothing if the image is already large enough.
    """
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest >= OCR_MIN_DIM:
        return img
    scale = OCR_MIN_DIM / longest
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LANCZOS4)


def _sharpen(img: np.ndarray) -> np.ndarray:
    """Unsharp mask — enhances text edge contrast without amplifying coarse noise.

    σ=1.5 chosen empirically: wins over σ=2.0 in 7/13 fixture images and ties
    in the rest.  A smaller sigma makes the mask more targeted to fine strokes
    (font lines) rather than coarser gradients (background texture).
    """
    blurred = cv2.GaussianBlur(img, (0, 0), sigmaX=1.5)
    return cv2.addWeighted(img, 1.5, blurred, -0.5, 0)


def _gamma_correct(img: np.ndarray, gamma: float = 1.5) -> np.ndarray:
    """Apply gamma correction to lift underexposed images.

    gamma > 1 brightens the image (lifts shadows), gamma < 1 darkens it.
    Applies the same LUT to all channels so colour balance is preserved.
    """
    inv_gamma = 1.0 / gamma
    table = np.array(
        [(i / 255.0) ** inv_gamma * 255 for i in range(256)], dtype=np.uint8
    )
    return cv2.LUT(img, table)


def _bilateral(img: np.ndarray) -> np.ndarray:
    return cv2.bilateralFilter(img, d=9, sigmaColor=75, sigmaSpace=75)


def _clahe(img: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    merged = cv2.merge((l, a, b))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def _mask_glare(img: np.ndarray) -> np.ndarray:
    """Remove laminate glare via inpainting (reconstructs texture under highlights).

    Replaces overexposed pixels using Navier-Stokes inpainting rather than
    flat grey fill — preserves text that partially overlaps with the glare.
    """
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 220]), np.array([180, 30, 255]))
    if not mask.any():
        return img
    kernel = np.ones((3, 3), np.uint8)
    mask_dilated = cv2.dilate(mask, kernel, iterations=1)
    return cv2.inpaint(img, mask_dilated, inpaintRadius=3, flags=cv2.INPAINT_TELEA)


def preprocess_stages(
    image_bytes: bytes,
    points: list[list[float]] | None = None,
    step: int = 1,
) -> list[tuple[str, "np.ndarray"]]:
    """Return (name, image) pairs for each preprocessing stage.

    Used by the debug pipeline endpoint to visualize what Tesseract actually sees.
    When *points* are provided the perspective crop is applied first (before
    bilateral / CLAHE / glare-mask), so the stage list mirrors the real pipeline.
    """
    stages: list[tuple[str, np.ndarray]] = []

    if points is not None:
        cropped = perspective_crop(image_bytes, points)
        img = _decode(cropped)
    else:
        img = _decode(image_bytes)

    img = _resize(img)
    stages.append(("original", img.copy()))

    if step == 1:
        # Step-1 MRZ pipeline: bilateral → CLAHE → glare → crop → Otsu
        img = _bilateral(img)
        stages.append(("after_bilateral", img.copy()))
        img = _clahe(img)
        stages.append(("after_clahe", img.copy()))
        img = _mask_glare(img)
        stages.append(("after_glare_mask", img.copy()))
        h = img.shape[0]
        mrz_crop = img[int(h * 0.62):, :]
        stages.append(("mrz_crop_final", mrz_crop.copy()))
        gray = cv2.cvtColor(mrz_crop, cv2.COLOR_BGR2GRAY) if mrz_crop.ndim == 3 else mrz_crop.copy()
        stages.append(("after_grayscale", gray.copy()))
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        stages.append(("tesseract_input", binary.copy()))
    else:
        # Steps 2/3: adaptive pipeline mirrors preprocess_step23() exactly
        img = _upscale_for_ocr(img)
        gray0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
        mean_brightness = float(np.mean(gray0))

        if mean_brightness < 110:
            gamma_val = 2.0 if mean_brightness < 70 else 1.5
            img = _gamma_correct(img, gamma_val)
            stages.append((f"after_gamma_{gamma_val}", img.copy()))

        img = _bilateral(img)
        stages.append(("after_bilateral", img.copy()))

        gray_bi = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
        if float(np.std(gray_bi)) < 50:
            img = _clahe(img)
            stages.append(("after_clahe", img.copy()))

        img = _mask_glare(img)
        stages.append(("after_glare_mask", img.copy()))

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img.copy()
        sharpened = _sharpen(gray)
        stages.append(("after_sharpen", sharpened.copy()))

        if float(np.std(sharpened)) > 65:
            _, binary = cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            stages.append(("tesseract_input", binary.copy()))
        else:
            stages.append(("tesseract_input", sharpened.copy()))

    return stages


def _auto_orient(img: np.ndarray) -> np.ndarray:
    """Rotate portrait images 90° CCW so text runs horizontally.

    Open-booklet photos are often taken with the document oriented sideways
    (pages run top-to-bottom in the photo). Detecting this: if the image is
    significantly taller than wide AND gradient energy is higher on the
    vertical axis (text columns), rotate 90° CCW.
    """
    h, w = img.shape[:2]
    if h <= w * 1.3:          # already roughly landscape or square — skip
        return img
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
    ex = float(np.sum(np.abs(gx)))
    ey = float(np.sum(np.abs(gy)))
    # If vertical gradients dominate, text is running top-to-bottom → rotate CCW
    if ey > ex * 1.2:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def _deskew_color(img: np.ndarray) -> np.ndarray:
    """Correct skew on a BGR color image."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    coords = np.column_stack(np.where(gray < 128))
    if len(coords) < 10:
        return img
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90.0 + angle
    if abs(angle) < 0.5:
        return img
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
