'use client';

import { MiniCalendar } from './mini-calendar';
import type { DatesData } from '../hooks/use-wizard-state';

interface StepDatesProps {
  data: DatesData;
  onChange: (data: DatesData) => void;
  onNext: () => void;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0] ?? iso;
}

function formatBg(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function StepDates({ data, onChange, onNext }: StepDatesProps) {
  const today = new Date().toISOString().split('T')[0] ?? '';
  const maxDate = addDays(today, 30);
  const endDate = addDays(data.startDate, 365);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-bold uppercase tracking-wider text-[var(--color-primary,#2563eb)]">
          Начало на застраховката
        </h1>
        <p className="mt-1 text-sm text-gray-500">Избери начална дата</p>
      </div>

      <MiniCalendar
        value={data.startDate}
        onChange={(iso) => onChange({ startDate: iso })}
        minDate={today}
        maxDate={maxDate}
      />

      {/* Info box */}
      <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700" role="note">
        ℹ Застраховката ще бъде активна 2 часа след началната дата.
      </div>

      {/* Summary rows */}
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">📅 Валидна от:</span>
          <span className="font-semibold text-gray-800">{formatBg(data.startDate)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">📅 Валидна до:</span>
          <span className="font-semibold text-gray-800">{formatBg(endDate)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">✓ Срок:</span>
          <span className="font-semibold text-gray-800">12 месеца</span>
        </div>
      </div>

      <button type="submit"
        className="w-full rounded-full bg-[var(--color-primary,#2563eb)] py-3 font-bold uppercase tracking-wide text-white hover:opacity-90">
        Продължи
      </button>
    </form>
  );
}
