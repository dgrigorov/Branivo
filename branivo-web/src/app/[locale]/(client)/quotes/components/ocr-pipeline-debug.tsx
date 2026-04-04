'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TalonSlot } from './talon-upload-section';
import type { Quad } from './crop-editor';

// ── types ──────────────────────────────────────────────────────────────────────

interface PipelineStage {
  name: string;
  image_b64: string;
}

interface OcrDebugResult {
  success: boolean;
  confidence: number;
  data?: Record<string, string | number | null>;
  raw_text?: string;
  debug_info?: Record<string, Record<string, string | number | null>>;
}

interface FetchedData {
  stages: PipelineStage[];
  ocr: OcrDebugResult | null;
}

// ── constants ──────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  original: 'Оригинал',
  after_bilateral: 'Bilateral',
  after_clahe: 'CLAHE',
  after_glare_mask: 'Без блясък',
  mrz_crop_final: 'MRZ зона',
  after_grayscale: 'Сиво скала',
  after_sharpen: 'Острене',
  tesseract_input: 'Tesseract вход',
};

const FIELD_LABELS: Record<string, string> = {
  vin: 'VIN',
  registrationNumber: 'Рег. номер',
  certNumber: 'Номер на талон',
  ownerLastName: 'Фамилия',
  ownerFirstName: 'Собствено',
  ownerMiddleName: 'Презиме',
  ownerAddress: 'Адрес',
  egn: 'ЕГН',
  make: 'Марка',
  model: 'Модел',
  year: 'Година',
  fuel: 'Гориво',
  engine: 'Двигател (cc)',
  seats: 'Места',
  firstRegistration: 'Първа регистрация',
};

const SLOT_STEP_LABELS = ['Ч.I задна (MRZ)', 'Ч.I предна', 'Ч.II'];

// ── Lightbox ───────────────────────────────────────────────────────────────────

interface LightboxProps { src: string; alt: string; onClose: () => void }

function Lightbox({ src, alt, onClose }: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Увеличено изображение"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        aria-label="Затвори (Escape)"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl text-white hover:bg-white/40"
      >
        ×
      </button>
    </div>
  );
}

// ── OcrPipelineDebug ───────────────────────────────────────────────────────────

interface OcrPipelineDebugProps {
  imageFile: File;
  points: Quad | null;
  step: 1 | 2 | 3;
  label: string;
}

function OcrPipelineDebug({ imageFile, points, step, label }: OcrPipelineDebugProps) {
  const [data, setData] = useState<FetchedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const fetch2 = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const makeForm = () => {
      const fd = new FormData();
      fd.append('file', imageFile);
      if (points) fd.append('points', JSON.stringify(points));
      return fd;
    };
    try {
      const [pipeRes, ocrRes] = await Promise.all([
        fetch(`/api/v1/ocr/pipeline-debug?step=${step}`, { method: 'POST', body: makeForm() }),
        fetch(`/api/v1/ocr/talon?step=${step}&debug=true`, { method: 'POST', body: makeForm() }),
      ]);
      if (!pipeRes.ok) throw new Error(`Pipeline HTTP ${pipeRes.status}`);
      const pipeJson = (await pipeRes.json()) as { stages: PipelineStage[] };
      const ocrJson = ocrRes.ok ? ((await ocrRes.json()) as OcrDebugResult) : null;
      setData({ stages: pipeJson.stages, ocr: ocrJson });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестна грешка');
    } finally {
      setIsLoading(false);
    }
  }, [imageFile, points, step]);

  const confColor = (c: number) =>
    c >= 0.85 ? 'text-green-700' : c >= 0.70 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      {lightbox && <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}

      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-800">Step {step}: {label}</span>
        <button
          type="button"
          onClick={() => void fetch2()}
          disabled={isLoading}
          className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isLoading ? 'Зарежда…' : data ? 'Обнови' : 'Покажи pipeline'}
        </button>
      </div>

      {step === 1 && (
        <p className="mb-2 text-xs text-gray-500">
          ℹ️ Step 1 се фокусира само върху MRZ зоната (долните 38 %) за VIN / ЕГН. Останалите
          полета са в Step 2 и Step 3.
        </p>
      )}

      {error && <p className="mb-1 text-xs text-red-600">{error}</p>}

      {/* Pipeline stages */}
      {data && (
        <>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.stages.map((stage) => {
              const src = `data:image/jpeg;base64,${stage.image_b64}`;
              const alt = STAGE_LABELS[stage.name] ?? stage.name;
              return (
                <button
                  key={stage.name}
                  type="button"
                  onClick={() => setLightbox({ src, alt })}
                  className="flex flex-shrink-0 flex-col items-center gap-1 rounded p-1 hover:bg-amber-50"
                  title="Клик за увеличение"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={alt} className="h-24 w-auto rounded border border-gray-300 object-contain" />
                  <span className="max-w-16 text-center text-xs text-gray-700">{alt}</span>
                </button>
              );
            })}
          </div>

          {/* OCR results */}
          {data.ocr && (
            <div className="mt-3 space-y-2 border-t border-amber-100 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700">OCR резултат</span>
                <span className={`text-xs font-bold ${confColor(data.ocr.confidence)}`}>
                  {(data.ocr.confidence * 100).toFixed(1)}% confidence
                </span>
              </div>

              {data.ocr.data && Object.keys(data.ocr.data).length > 0 && (
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    {Object.entries(data.ocr.data)
                      .filter(([, v]) => v !== null && v !== undefined)
                      .map(([k, v]) => (
                        <tr key={k} className="border-b border-amber-100 last:border-0">
                          <td className="py-1 pr-3 text-gray-500 whitespace-nowrap w-1/3">{FIELD_LABELS[k] ?? k}</td>
                          <td className="py-1 font-medium text-gray-900 break-all">{String(v)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}

              {data.ocr.raw_text && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowRaw((p) => !p)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {showRaw ? 'Скрий raw text' : 'Покажи raw text'}
                  </button>
                  {showRaw && (
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-900 p-2 text-xs text-green-400 whitespace-pre-wrap">
                      {data.ocr.raw_text}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── TalonDebugPanel ────────────────────────────────────────────────────────────

interface TalonDebugPanelProps { slots: (TalonSlot | null)[] }

export function TalonDebugPanel({ slots }: TalonDebugPanelProps) {
  if (!slots.some((s) => s !== null)) return null;
  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="text-xs font-bold text-amber-900">Super Admin — OCR Preprocessing Pipeline</span>
      </div>
      <p className="text-xs text-amber-700">
        Кликнете върху снимка за увеличение. &ldquo;Покажи pipeline&rdquo; зарежда стъпките и разчетения текст.
      </p>
      {slots.map(
        (slot, idx) =>
          slot && (
            <OcrPipelineDebug
              key={idx}
              imageFile={slot.file}
              points={slot.points}
              step={(idx + 1) as 1 | 2 | 3}
              label={SLOT_STEP_LABELS[idx] ?? `Стъпка ${idx + 1}`}
            />
          ),
      )}
    </div>
  );
}
