'use client';

import { useCallback, useRef, useState } from 'react';
import { CropEditor, type Quad } from './crop-editor';

export interface TalonSlot {
  file: File;
  points: Quad;
  previewUrl: string;
}

interface TalonUploadSectionProps {
  onSlotsChange: (slots: (TalonSlot | null)[]) => void;
}

const SLOT_META = [
  {
    label: 'Ч.I задна (MRZ)',
    hint: 'Задната страна с баркода',
    step: 1,
  },
  {
    label: 'Ч.I предна',
    hint: 'Марка, рег. номер, собственик',
    step: 2,
  },
  {
    label: 'Ч.II',
    hint: 'Технически данни',
    step: 3,
  },
] as const;

export function TalonUploadSection({ onSlotsChange }: TalonUploadSectionProps) {
  const [slots, setSlots] = useState<(TalonSlot | null)[]>([null, null, null]);
  const [cropTarget, setCropTarget] = useState<{ slotIdx: number; file: File } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotIdx = useRef<number>(0);

  const openFilePicker = useCallback((slotIdx: number) => {
    pendingSlotIdx.current = slotIdx;
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropTarget({ slotIdx: pendingSlotIdx.current, file });
  }, []);

  const handleCropConfirm = useCallback(
    (points: Quad, correctedPreviewUrl: string) => {
      if (!cropTarget) return;
      setSlots((prev) => {
        const next = [...prev] as (TalonSlot | null)[];
        // Revoke previous blob URL if any (only revoke object:// URLs, not data: URLs)
        const old = next[cropTarget.slotIdx];
        if (old?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(old.previewUrl);
        next[cropTarget.slotIdx] = { file: cropTarget.file, points, previewUrl: correctedPreviewUrl };
        onSlotsChange(next);
        return next;
      });
      setCropTarget(null);
    },
    [cropTarget, onSlotsChange],
  );

  const handleCropCancel = useCallback(() => setCropTarget(null), []);

  const handleRemove = useCallback(
    (slotIdx: number) => {
      setSlots((prev) => {
        const next = [...prev] as (TalonSlot | null)[];
        if (next[slotIdx]?.previewUrl) URL.revokeObjectURL(next[slotIdx]!.previewUrl);
        next[slotIdx] = null;
        onSlotsChange(next);
        return next;
      });
    },
    [onSlotsChange],
  );

  // Re-crop reuses the existing file — no new upload needed
  const handleReCrop = useCallback(
    (slotIdx: number) => {
      const slot = slots[slotIdx];
      if (slot) setCropTarget({ slotIdx, file: slot.file });
    },
    [slots],
  );

  if (cropTarget) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="mb-3 text-xs font-semibold text-green-800">
          {SLOT_META[cropTarget.slotIdx]?.label} — настройка на изрязването
        </p>
        <CropEditor
          imageFile={cropTarget.file}
          step={SLOT_META[cropTarget.slotIdx].step}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">
          Снимки на талона
        </span>
        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
          автоматично попълване
        </span>
        <span className="text-xs text-gray-400">по желание</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        aria-hidden="true"
        onChange={handleFileChange}
      />

      <div className="grid grid-cols-3 gap-2">
        {SLOT_META.map((meta, idx) => {
          const slot = slots[idx];
          return (
            <div key={meta.step} className="flex flex-col gap-1">
              {slot ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slot.previewUrl}
                    alt={meta.label}
                    className="h-20 w-full rounded-lg border-2 border-green-400 object-contain bg-gray-900"
                  />
                  {/* Green checkmark */}
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {/* Remove */}
                  <button
                    type="button"
                    aria-label={`Изтрий ${meta.label}`}
                    onClick={() => handleRemove(idx)}
                    className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white hover:bg-red-600"
                  >
                    ×
                  </button>
                  {/* Re-crop */}
                  <button
                    type="button"
                    aria-label={`Кропни отново ${meta.label}`}
                    onClick={() => handleReCrop(idx)}
                    className="absolute left-1 bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white hover:bg-blue-600"
                    title="Кропни отново"
                  >
                    ✂
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openFilePicker(idx)}
                  className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-blue-400 hover:bg-blue-50"
                  aria-label={`Качи снимка: ${meta.label}`}
                >
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs text-gray-400">Качи</span>
                </button>
              )}
              <p className="text-center text-xs leading-tight text-gray-500">
                {meta.label}
              </p>
              <p className="text-center text-xs leading-tight text-gray-400">
                {meta.hint}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
