#!/usr/bin/env python3
"""Diagnostic script: test each preprocessing step and measure Tesseract confidence.

Usage (from branivo-ocr/):
  python tools/diagnose_preprocess.py [--dir tests/fixtures] [--step 2]

For each fixture image, applies preprocessing cumulatively and reports
the average Tesseract word confidence after each stage.
Skips NLM denoising (slow, ~20s/image) — tested separately via --nlm flag.
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import cv2
import numpy as np
import pytesseract
from PIL import Image, ExifTags
from pytesseract import Output

_LANG = "bul+eng"
_PSM_COL  = "--psm 4 --oem 3"
_PSM_FULL = "--psm 6 --oem 3"


# ── Tesseract measurement ────────────────────────────────────────────────────

def _measure(img: np.ndarray) -> float:
    """Average word-level confidence from the best of PSM 4 and PSM 6."""
    gray = img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    best = 0.0
    for cfg in (_PSM_COL, _PSM_FULL):
        data = pytesseract.image_to_data(
            gray, lang=_LANG, config=cfg, output_type=Output.DICT
        )
        confs = [
            int(c) for c, t in zip(data["conf"], data["text"])
            if t.strip() and str(c).lstrip("-").isdigit() and int(c) > 0
        ]
        if confs:
            val = sum(confs) / len(confs) / 100.0
            best = max(best, val)
    return best


# ── transforms ───────────────────────────────────────────────────────────────

def _exif_orient(img: Image.Image) -> Image.Image:
    try:
        exif = img._getexif()  # type: ignore[attr-defined]
    except Exception:
        exif = None
    if not exif:
        return img
    tag = next((t for t, n in ExifTags.TAGS.items() if n == "Orientation"), None)
    if tag is None:
        return img
    deg = {3: 180, 6: 270, 8: 90}.get(exif.get(tag))
    return img.rotate(deg, expand=True) if deg else img


def decode(b: bytes) -> np.ndarray:
    pil = Image.open(io.BytesIO(b))
    pil = _exif_orient(pil)
    return cv2.cvtColor(np.array(pil.convert("RGB")), cv2.COLOR_RGB2BGR)


def resize(img: np.ndarray, mx: int = 2048) -> np.ndarray:
    h, w = img.shape[:2]
    s = max(h, w)
    if s <= mx:
        return img
    r = mx / s
    return cv2.resize(img, (int(w * r), int(h * r)), interpolation=cv2.INTER_AREA)


def upscale(img: np.ndarray, mn: int = 1600) -> np.ndarray:
    h, w = img.shape[:2]
    s = max(h, w)
    if s >= mn:
        return img
    r = mn / s
    return cv2.resize(img, (int(w * r), int(h * r)), interpolation=cv2.INTER_LANCZOS4)


def bilateral(img: np.ndarray, d: int = 9, sc: int = 75, ss: int = 75) -> np.ndarray:
    return cv2.bilateralFilter(img, d=d, sigmaColor=sc, sigmaSpace=ss)


def clahe(img: np.ndarray, clip: float = 3.0, tile: int = 8) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    cl = cv2.createCLAHE(clipLimit=clip, tileGridSize=(tile, tile))
    l = cl.apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def mask_glare(img: np.ndarray, thresh: int = 220) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, thresh]), np.array([180, 30, 255]))
    if not mask.any():
        return img
    k = np.ones((3, 3), np.uint8)
    return cv2.inpaint(img, cv2.dilate(mask, k, iterations=1), 3, cv2.INPAINT_TELEA)


def nlm_denoise(gray: np.ndarray, h: float = 10) -> np.ndarray:
    return cv2.fastNlMeansDenoising(gray, h=h, templateWindowSize=7, searchWindowSize=21)


def sharpen(gray: np.ndarray, sigma: float = 2.0, alpha: float = 1.5) -> np.ndarray:
    blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=sigma)
    return cv2.addWeighted(gray, alpha, blurred, -(alpha - 1), 0)


def otsu(gray: np.ndarray) -> np.ndarray:
    _, b = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return b


def adaptive(gray: np.ndarray) -> np.ndarray:
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
    )


def morph_open(b: np.ndarray, k: int = 2) -> np.ndarray:
    return cv2.morphologyEx(b, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))


def gamma(gray: np.ndarray, g: float = 1.5) -> np.ndarray:
    table = np.array([(i / 255.0) ** (1.0 / g) * 255 for i in range(256)], dtype=np.uint8)
    return cv2.LUT(gray, table)


# ── report row ────────────────────────────────────────────────────────────────

def row(label: str, img: np.ndarray, baseline: float) -> float:
    conf = _measure(img)
    delta = conf - baseline
    flag = "▲" if delta > 0.005 else ("▼" if delta < -0.005 else " ")
    harm = "  ← HURTS" if delta < -0.01 else ""
    print(f"  {label:<45} {conf:6.3f}  {flag}{abs(delta):5.3f}{harm}")
    return conf


# ── main diagnostic ──────────────────────────────────────────────────────────

def run_step23(image_bytes: bytes, label: str, run_nlm: bool = False) -> None:
    print(f"\n{'═' * 72}")
    print(f"  {label}")
    print(f"{'═' * 72}")
    print(f"  {'Stage':<45} {'Conf':>6}  {'Δ':>6}")
    print(f"  {'-'*45} {'-'*6}  {'-'*6}")

    img = decode(image_bytes)
    img = resize(img)

    # ── baseline: raw gray ────────────────────────────────────────────────
    gray0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    prev = row("0. raw grayscale (no preprocess)", gray0, 0.0)

    # ── upscale ───────────────────────────────────────────────────────────
    img_up = upscale(img)
    gray_up = cv2.cvtColor(img_up, cv2.COLOR_BGR2GRAY)
    prev = row("1. + upscale (Lanczos, ≥1600px)", gray_up, prev)

    # ── bilateral ─────────────────────────────────────────────────────────
    img_bi = bilateral(img_up, d=9, sc=75, ss=75)
    gray_bi = cv2.cvtColor(img_bi, cv2.COLOR_BGR2GRAY)
    conf_bi = _measure(gray_bi)

    img_bi_soft = bilateral(img_up, d=5, sc=30, ss=30)
    gray_bi_soft = cv2.cvtColor(img_bi_soft, cv2.COLOR_BGR2GRAY)
    conf_bi_soft = _measure(gray_bi_soft)

    if conf_bi_soft > conf_bi + 0.005:
        img_bi, gray_bi = img_bi_soft, gray_bi_soft
        prev = row("2. + bilateral (d=5 σ=30/30) ← softer wins", gray_bi, prev)
    elif conf_bi < prev - 0.005:
        # bilateral hurts — skip it
        img_bi, gray_bi = img_up, gray_up
        prev = row("2. bilateral SKIPPED (hurts)", gray_bi, prev)
    else:
        prev = row("2. + bilateral (d=9 σ=75/75)", gray_bi, prev)

    # ── CLAHE ─────────────────────────────────────────────────────────────
    best_clahe_conf, best_clahe_img = 0.0, img_bi
    best_clip = 0.0
    for clip in (2.0, 3.0, 4.0):
        c = clahe(img_bi, clip=clip)
        g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY)
        cf = _measure(g)
        if cf > best_clahe_conf:
            best_clahe_conf, best_clahe_img, best_clip = cf, c, clip

    img_cl = best_clahe_img
    gray_cl = cv2.cvtColor(img_cl, cv2.COLOR_BGR2GRAY)
    if best_clahe_conf < prev - 0.005:
        img_cl = img_bi
        gray_cl = gray_bi
        prev = row("3. CLAHE SKIPPED (hurts)", gray_cl, prev)
    else:
        prev = row(f"3. + CLAHE (clip={best_clip})", gray_cl, prev)

    # ── glare mask ────────────────────────────────────────────────────────
    img_gl = mask_glare(img_cl)
    gray_gl = cv2.cvtColor(img_gl, cv2.COLOR_BGR2GRAY)
    conf_gl = _measure(gray_gl)
    if conf_gl < prev - 0.005:
        img_gl, gray_gl = img_cl, gray_cl
        prev = row("4. glare mask SKIPPED (hurts)", gray_gl, prev)
    else:
        prev = row("4. + glare mask (inpaint)", gray_gl, prev)

    # ── gamma correction ──────────────────────────────────────────────────
    best_gm_conf, best_gm_gray, best_gm = 0.0, gray_gl, 1.0
    for g_val in (1.0, 1.2, 1.5, 2.0):
        g_img = gamma(gray_gl, g_val) if g_val != 1.0 else gray_gl
        cf = _measure(g_img)
        if cf > best_gm_conf:
            best_gm_conf, best_gm_gray, best_gm = cf, g_img, g_val

    if best_gm != 1.0 and best_gm_conf > prev + 0.005:
        gray_gl = best_gm_gray
        prev = row(f"5. + gamma correction (γ={best_gm})", gray_gl, prev)
    else:
        prev = row("5. gamma SKIPPED (no benefit)", gray_gl, prev)

    # ── NLM denoising (slow — only if --nlm flag) ─────────────────────────
    gray_after_nlm = gray_gl
    if run_nlm:
        print("  (running NLM — may take ~20s per image...)")
        best_nlm_conf, best_nlm_gray, best_h = 0.0, gray_gl, 0
        for h_val in (5, 10, 15):
            g_img = nlm_denoise(gray_gl, h=h_val)
            cf = _measure(g_img)
            if cf > best_nlm_conf:
                best_nlm_conf, best_nlm_gray, best_h = cf, g_img, h_val

        if best_nlm_conf > prev + 0.005:
            gray_after_nlm = best_nlm_gray
            prev = row(f"6. + NLM denoise (h={best_h}) — HELPS", gray_after_nlm, prev)
        else:
            prev = row(f"6. NLM SKIPPED (no benefit, best h={best_h} gave {best_nlm_conf:.3f})", gray_gl, prev)
    else:
        print(f"  {'6. NLM denoising (skipped — use --nlm to test)':<45} {'(skip)':>6}")

    # ── sharpening ────────────────────────────────────────────────────────
    best_sh_conf, best_sh_gray, best_sh_cfg = 0.0, gray_after_nlm, "none"
    for sigma, alpha in ((2.0, 1.5), (1.5, 1.5), (2.0, 2.0), (1.0, 1.5)):
        g_img = sharpen(gray_after_nlm, sigma=sigma, alpha=alpha)
        cf = _measure(g_img)
        if cf > best_sh_conf:
            best_sh_conf, best_sh_gray = cf, g_img
            best_sh_cfg = f"σ={sigma} α={alpha}"

    if best_sh_conf > prev + 0.005:
        gray_sh = best_sh_gray
        prev = row(f"7. + sharpen ({best_sh_cfg})", gray_sh, prev)
    else:
        gray_sh = gray_after_nlm
        prev = row("7. sharpen SKIPPED (no benefit)", gray_sh, prev)

    # ── binarization ─────────────────────────────────────────────────────
    gray_otsu = otsu(gray_sh)
    gray_adapt = adaptive(gray_sh)
    conf_otsu = _measure(gray_otsu)
    conf_adapt = _measure(gray_adapt)

    if conf_adapt > conf_otsu + 0.01:
        gray_bin = gray_adapt
        prev = row("8. + adaptive threshold ← wins over Otsu", gray_bin, prev)
    elif conf_otsu > prev + 0.005:
        gray_bin = gray_otsu
        prev = row("8. + Otsu binarize", gray_bin, prev)
    else:
        gray_bin = gray_sh
        prev = row("8. binarize SKIPPED (no benefit)", gray_bin, prev)

    # ── morph open ────────────────────────────────────────────────────────
    if set(np.unique(gray_bin)).issubset({0, 255}):
        for k_size in (2, 3):
            gray_mo = morph_open(gray_bin, k=k_size)
            conf_mo = _measure(gray_mo)
            if conf_mo > prev + 0.005:
                prev = row(f"9. + morph open ({k_size}×{k_size})", gray_mo, prev)
                break
            elif conf_mo < prev - 0.01:
                prev = row(f"9. morph open SKIPPED (hurts at k={k_size})", gray_bin, prev)
                break
        else:
            prev = row("9. morph open SKIPPED (no benefit)", gray_bin, prev)

    print(f"\n  FINAL confidence: {prev:.3f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="tests/fixtures")
    parser.add_argument("--step", type=int, default=2, choices=[1, 2, 3])
    parser.add_argument("--doc", default=None)
    parser.add_argument("--nlm", action="store_true", help="Include NLM denoising test (slow)")
    args = parser.parse_args()

    fixtures = Path(args.dir)
    if not fixtures.exists():
        print(f"ERROR: {fixtures} not found. Run from branivo-ocr/", file=sys.stderr)
        sys.exit(1)

    found = 0
    for doc_dir in sorted(fixtures.iterdir()):
        if not doc_dir.is_dir() or not doc_dir.name.startswith("doc-"):
            continue
        if args.doc and doc_dir.name != args.doc:
            continue
        for img_path in sorted(doc_dir.glob(f"step{args.step}*.jpg")):
            found += 1
            run_step23(
                img_path.read_bytes(),
                f"{doc_dir.name}/{img_path.name}  (step {args.step})",
                run_nlm=args.nlm,
            )

    if found == 0:
        print(f"No images for step={args.step} in {fixtures}")
        sys.exit(1)

    print(f"\n✓ Diagnosed {found} image(s). Legend: ▲=improved  ▼=degraded  ' '=neutral")


if __name__ == "__main__":
    main()
