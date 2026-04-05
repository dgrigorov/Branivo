'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

// Normalized image coordinates (0..1 relative to image dimensions)
type Pt = [number, number];
// Corners in order: top-left, top-right, bottom-right, bottom-left
export type Quad = [Pt, Pt, Pt, Pt];

interface ImageBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropEditorProps {
  imageFile: File;
  step: 1 | 2 | 3;
  onConfirm: (points: Quad, correctedPreviewUrl: string) => void;
  onCancel: () => void;
}

const CANVAS_H = 440;
const CORNER_HALF = 11; // half-size of corner square handle (px)
const MID_R = 7;        // midpoint circle radius (px)
const HIT_R = 24;       // pointer hit area radius (px)
const DEFAULT_INSET = 0.05;

function computeBounds(cw: number, ch: number, iw: number, ih: number): ImageBounds {
  const scale = Math.min(cw / iw, ch / ih);
  const bw = iw * scale;
  const bh = ih * scale;
  return { x: (cw - bw) / 2, y: (ch - bh) / 2, w: bw, h: bh };
}

function normToCanvas(p: Pt, b: ImageBounds): [number, number] {
  return [b.x + p[0] * b.w, b.y + p[1] * b.h];
}

function canvasToNorm(cx: number, cy: number, b: ImageBounds): Pt {
  return [
    Math.max(0, Math.min(1, (cx - b.x) / b.w)),
    Math.max(0, Math.min(1, (cy - b.y) / b.h)),
  ];
}

type Phase = 'edit' | 'loading' | 'preview';

export function CropEditor({ imageFile, step, onConfirm, onCancel }: CropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const quadRef = useRef<Quad>([
    [DEFAULT_INSET, DEFAULT_INSET],
    [1 - DEFAULT_INSET, DEFAULT_INSET],
    [1 - DEFAULT_INSET, 1 - DEFAULT_INSET],
    [DEFAULT_INSET, 1 - DEFAULT_INSET],
  ]);
  const dragIdxRef = useRef<number | null>(null);
  const [canvasW, setCanvasW] = useState(360);
  const [phase, setPhase] = useState<Phase>('edit');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const b = computeBounds(cw, ch, img.naturalWidth, img.naturalHeight);
    const quad = quadRef.current;
    const pts = quad.map((p) => normToCanvas(p, b));

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, b.x, b.y, b.w, b.h);

    // Semi-transparent fill
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,200,80,0.12)';
    ctx.fill();

    // Green border
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Corner squares
    pts.forEach(([x, y]) => {
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(x - CORNER_HALF, y - CORNER_HALF, CORNER_HALF * 2, CORNER_HALF * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - CORNER_HALF, y - CORNER_HALF, CORNER_HALF * 2, CORNER_HALF * 2);
    });

    // Midpoint circles
    const mids: [number, number][] = [
      [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2],
      [(pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2],
      [(pts[2][0] + pts[3][0]) / 2, (pts[2][1] + pts[3][1]) / 2],
      [(pts[3][0] + pts[0][0]) / 2, (pts[3][1] + pts[0][1]) / 2],
    ];
    mids.forEach(([mx, my]) => {
      ctx.beginPath();
      ctx.arc(mx, my, MID_R, 0, Math.PI * 2);
      ctx.fillStyle = '#16a34a';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, []);

  // Load image on mount
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [imageFile, draw]);

  useEffect(() => {
    draw();
  }, [canvasW, draw]);

  // Observe container width for responsive canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = canvas.parentElement ?? canvas;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setCanvasW(Math.floor(e.contentRect.width));
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, []);

  const getCanvasCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): { cx: number; cy: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        cx: (e.clientX - rect.left) * (canvas.width / rect.width),
        cy: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return;
      const { cx, cy } = getCanvasCoords(e);
      const b = computeBounds(canvas.width, CANVAS_H, img.naturalWidth, img.naturalHeight);

      let closest = -1;
      let minDist = HIT_R;
      quadRef.current.forEach((p, i) => {
        const [px, py] = normToCanvas(p, b);
        const d = Math.hypot(cx - px, cy - py);
        if (d < minDist) { minDist = d; closest = i; }
      });

      if (closest >= 0) {
        dragIdxRef.current = closest;
        canvas.setPointerCapture(e.pointerId);
      }
    },
    [getCanvasCoords],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragIdxRef.current === null) return;
      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return;
      const { cx, cy } = getCanvasCoords(e);
      const b = computeBounds(canvas.width, CANVAS_H, img.naturalWidth, img.naturalHeight);
      const quad = [...quadRef.current] as Quad;
      quad[dragIdxRef.current] = canvasToNorm(cx, cy, b);
      quadRef.current = quad;
      requestAnimationFrame(draw);
    },
    [draw, getCanvasCoords],
  );

  const onPointerUp = useCallback(() => {
    dragIdxRef.current = null;
  }, []);

  const handleConfirmClick = useCallback(async () => {
    setPhase('loading');
    setPreviewError(null);

    try {
      const fd = new FormData();
      fd.append('file', imageFile);
      fd.append('points', JSON.stringify(quadRef.current));

      const res = await fetch(`/api/v1/ocr/preview?step=${step}`, {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        throw new Error(`Preview failed: ${res.status}`);
      }

      const json = await res.json() as { image_b64?: string };
      if (!json.image_b64) throw new Error('No preview image returned');

      setPreviewSrc(`data:image/jpeg;base64,${json.image_b64}`);
      setPhase('preview');
    } catch {
      setPreviewError('Неуспешен преглед. Опитайте отново.');
      setPhase('edit');
    }
  }, [imageFile, step]);

  // ── Preview phase ────────────────────────────────────────────────────────────
  if (phase === 'preview' && previewSrc) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-center text-xs text-gray-500">
          Така изглежда изправеният талон — проверете дали е четлив
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
          alt="Изрязан и изправен талон"
          className="w-full rounded-xl border border-green-300 object-contain"
          style={{ maxHeight: CANVAS_H, background: '#111827' }}
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setPhase('edit')}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Назад
          </button>
          <button
            type="button"
            onClick={() => onConfirm(quadRef.current, previewSrc)}
            className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Анализирай
          </button>
        </div>
      </div>
    );
  }

  // ── Edit phase ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs text-gray-500">
        Влачете ъглите така, че зелената рамка да покрива само талона
      </p>
      {previewError && (
        <p className="text-center text-xs text-red-500">{previewError}</p>
      )}
      <div className="w-full" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={CANVAS_H}
          className="w-full cursor-crosshair rounded-xl"
          style={{ display: 'block' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Отказ
        </button>
        <button
          type="button"
          onClick={() => { void handleConfirmClick(); }}
          disabled={phase === 'loading'}
          className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {phase === 'loading' ? 'Зарежда…' : 'Потвърди изрязването'}
        </button>
      </div>
    </div>
  );
}
