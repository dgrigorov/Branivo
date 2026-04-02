'use client';

import { PillToggle } from './pill-toggle';
import type { DetailsData } from '../hooks/use-wizard-state';

interface StepDetailsProps {
  data: DetailsData;
  onChange: (data: DetailsData) => void;
  onNext: () => void;
}

const EXPERIENCE_OPTIONS = [
  { value: 'under1', label: 'До 1 година' },
  { value: '1-3',    label: '1-3 години'  },
  { value: '3-5',    label: '3-5 години'  },
  { value: '5-10',   label: '5-10 години' },
  { value: 'over10', label: 'Над 10 години' },
];

const USAGE_OPTIONS = [
  { value: 'personal', label: 'Лични нужди'         },
  { value: 'business', label: 'Работа/Бизнес'        },
  { value: 'taxi',     label: 'Таксиметров превоз'   },
  { value: 'rental',   label: 'Отдаване под наем'    },
];

const STEERING_OPTIONS = [
  { label: 'Да', value: 'yes' },
  { label: 'Не', value: 'no'  },
] as const;

export function StepDetails({ data, onChange, onNext }: StepDetailsProps) {
  function set<K extends keyof DetailsData>(key: K, value: DetailsData[K]) {
    onChange({ ...data, [key]: value });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-bold uppercase tracking-wider text-[var(--color-primary,#2563eb)]">
          Допълнителни данни
        </h1>
      </div>

      <div>
        <label htmlFor="experience" className="mb-1 block text-sm font-medium text-gray-700">
          Шофьорски стаж
        </label>
        <select
          id="experience"
          value={data.experience}
          onChange={(e) => set('experience', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary,#2563eb)] focus:outline-none"
        >
          {EXPERIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="usage" className="mb-1 block text-sm font-medium text-gray-700">
          Автомобилът се използва за
        </label>
        <select
          id="usage"
          value={data.usage}
          onChange={(e) => set('usage', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary,#2563eb)] focus:outline-none"
        >
          {USAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Автомобилът с ляв волан ли е?
        </label>
        <PillToggle
          name="Ляв волан"
          options={STEERING_OPTIONS}
          value={data.leftSteering ? 'yes' : 'no'}
          onChange={(v) => set('leftSteering', v === 'yes')}
        />
      </div>

      <button type="submit"
        className="w-full rounded-full bg-[var(--color-primary,#2563eb)] py-3 font-bold uppercase tracking-wide text-white hover:opacity-90">
        Продължи
      </button>
    </form>
  );
}
