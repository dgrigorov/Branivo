'use client';

import { useState } from 'react';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MONTHS = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];

interface MiniCalendarProps {
  value: string;
  onChange: (isoDate: string) => void;
  minDate?: string;
  maxDate?: string;
}

function toIso(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

function parseIso(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, day ?? 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function buildGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7; // Monday = 0
  const cells: (Date | null)[] = Array<null>(startDow).fill(null);
  for (let d = 1; d <= lastDay; d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function MiniCalendar({ value, onChange, minDate, maxDate }: MiniCalendarProps) {
  const selected = parseIso(value);
  const [view, setView] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));

  const min = minDate ? parseIso(minDate) : null;
  const max = maxDate ? parseIso(maxDate) : null;

  function prevMonth() {
    setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1));
  }

  function nextMonth() {
    setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1));
  }

  function isDisabled(d: Date): boolean {
    if (min && d < min) return true;
    if (max && d > max) return true;
    return false;
  }

  const grid = buildGrid(view.getFullYear(), view.getMonth());

  return (
    <div className="select-none rounded-xl border border-gray-200 bg-white p-4">
      {/* Month nav */}
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={prevMonth} aria-label="Предишен месец"
          className="rounded p-1 hover:bg-gray-100">
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </span>
        <button type="button" onClick={nextMonth} aria-label="Следващ месец"
          className="rounded p-1 hover:bg-gray-100">
          ›
        </button>
      </div>

      {/* Weekday headers */}
      <div role="grid" aria-label="Календар">
        <div className="mb-1 grid grid-cols-7 text-center">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-[10px] font-medium text-gray-400">{wd}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {grid.map((day, idx) => {
            if (!day) return <div key={`e-${idx}`} />;
            const iso = toIso(day);
            const isSel = isSameDay(day, selected);
            const disabled = isDisabled(day);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                aria-selected={isSel}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => !disabled && onChange(iso)}
                className={[
                  'mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors',
                  isSel
                    ? 'bg-[var(--color-primary,#2563eb)] font-bold text-white'
                    : disabled
                      ? 'cursor-not-allowed text-gray-300'
                      : isWeekend
                        ? 'text-red-400 hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100',
                ].join(' ')}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
