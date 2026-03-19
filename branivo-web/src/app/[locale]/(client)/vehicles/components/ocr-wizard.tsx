'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOcrScanning, OcrScanResult } from '@/lib/hooks/use-ocr-scanning';

const STEPS = [
  { label: 'Снимайте лицевата страна на Свидетелство за регистрация — Част I', part: 'part-i-front' },
  { label: 'Снимайте обратната страна на Свидетелство за регистрация — Част II', part: 'part-ii' },
];

interface OcrField {
  value: string | null;
  confidence: number;
  auto_filled: boolean;
}

interface OcrWizardProps {
  sessionToken: string;
  onComplete: (result: OcrScanResult) => void;
  onManualEntry: () => void;
}

export function OcrWizard({ sessionToken, onComplete, onManualEntry }: OcrWizardProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [step, setStep] = useState(0);
  const [capturedImages, setCapturedImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { scan, status, result, error, isLoading } = useOcrScanning();

  const handleCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const next = [...capturedImages, file];
      setCapturedImages(next);

      if (step < STEPS.length - 1) {
        setStep((s) => s + 1);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        void scan(next, sessionToken).then((res) => {
          if (res) onComplete(res);
        });
      }
    },
    [capturedImages, step, scan, sessionToken, onComplete],
  );

  if (status === 'failed' || error) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-lg border border-red-300 bg-red-50 p-4"
      >
        <p className="text-sm text-red-700">
          Не успяхме да разчетем документа. Моля, попълнете ръчно.
        </p>
        <button
          type="button"
          onClick={onManualEntry}
          className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Попълни ръчно
        </button>
      </div>
    );
  }

  if (status === 'completed' && result) {
    return <OcrResultsView result={result} onManualEntry={onManualEntry} />;
  }

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 p-6"
      >
        {prefersReducedMotion ? (
          <div className="h-8 w-8 rounded-full bg-blue-500" />
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        )}
        <p className="text-sm text-gray-600">Обработваме документа…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s.part}
            className={`h-2 flex-1 rounded-full ${
              i < step ? 'bg-green-500' : i === step ? 'bg-blue-500' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Camera guide */}
      <div
        className="relative flex h-48 items-center justify-center rounded-lg border-4 border-yellow-400 bg-gray-100"
        role="img"
        aria-label={STEPS[step]?.label}
      >
        <span className="text-center text-sm text-gray-600 px-4">
          {STEPS[step]?.label ?? 'Готово'}
        </span>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Стъпка {step + 1} от {STEPS.length}
      </p>

      <label className="block">
        <span className="sr-only">Снимай документ</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={handleCapture}
          className="hidden"
          aria-label="Избери снимка от камерата"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-lg bg-blue-600 py-3 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          📷 Снимай
        </button>
      </label>

      <button
        type="button"
        onClick={onManualEntry}
        className="w-full text-sm text-gray-500 underline"
      >
        Въведи ръчно
      </button>
    </div>
  );
}

function OcrResultsView({
  result,
  onManualEntry,
}: {
  result: OcrScanResult;
  onManualEntry: () => void;
}) {
  const FIELD_LABELS: Record<string, string> = {
    license_plate: 'Регистрационен номер',
    vin: 'VIN номер',
    make: 'Марка',
    model: 'Модел',
    year: 'Година',
    color: 'Цвят',
    engine_volume: 'Обем на двигателя',
    fuel_type: 'Вид гориво',
    first_registration_date: 'Дата на първа регистрация',
  };

  const fields = result.fields ?? {};

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-gray-900">Разпознати данни</h3>
      {Object.entries(FIELD_LABELS).map(([key, label]) => {
        const field = fields[key] as OcrField | undefined;
        const isLowConfidence = field && field.confidence < 0.85;

        return (
          <div key={key} className="space-y-1">
            <label className="text-xs text-gray-500">{label}</label>
            <div className="relative">
              <input
                type="text"
                defaultValue={field?.value ?? ''}
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  isLowConfidence
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-green-400 bg-green-50'
                }`}
                aria-describedby={isLowConfidence ? `${key}-warning` : undefined}
              />
              {isLowConfidence && (
                <span
                  id={`${key}-warning`}
                  className="absolute right-2 top-2 text-amber-500"
                  title="Моля, проверете тази информация"
                  aria-label="Ниска точност — моля проверете"
                >
                  ⚠
                </span>
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onManualEntry}
        className="text-sm text-blue-600 underline"
      >
        Редактирай ръчно
      </button>
    </div>
  );
}
