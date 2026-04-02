'use client';

import { useState } from 'react';
import { PillToggle } from './pill-toggle';
import type { VehicleData } from '../hooks/use-wizard-state';

interface StepVehicleProps {
  data: VehicleData;
  onChange: (data: VehicleData) => void;
  onNext: () => void;
}

const KAT_OPTIONS = [
  { label: 'Да', value: 'yes' },
  { label: 'Не', value: 'no' },
] as const;

export function StepVehicle({ data, onChange, onNext }: StepVehicleProps) {
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof VehicleData>(key: K, value: VehicleData[K]) {
    onChange({ ...data, [key]: value });
  }

  function handleKat(val: string) {
    set('kat', val === 'yes');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (data.kat && !data.regNumber.trim()) {
      setError('Регистрационният номер е задължителен.');
      return;
    }
    setError(null);
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-bold uppercase tracking-wider text-[var(--color-primary,#2563eb)]">
          Данни за автомобил
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Използваме тези данни само за изчисляване на оферта и ги споделяме единствено със застрахователите
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Регистриран ли е в КАТ?
        </label>
        <PillToggle
          name="Регистрация в КАТ"
          options={KAT_OPTIONS}
          value={data.kat ? 'yes' : 'no'}
          onChange={handleKat}
        />
      </div>

      {data.kat ? (
        <>
          <div>
            <label htmlFor="regNumber" className="mb-1 block text-sm font-medium text-gray-700">
              Регистрационен номер
            </label>
            <input
              id="regNumber"
              type="text"
              value={data.regNumber}
              onChange={(e) => set('regNumber', e.target.value)}
              placeholder="СВ0688ММ"
              className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary,#2563eb)] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="talon" className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
              Номер на малък талон
              <span title="8-цифрен номер от талона" className="cursor-help text-gray-400">ⓘ</span>
            </label>
            <input
              id="talon"
              type="text"
              value={data.talon}
              onChange={(e) => set('talon', e.target.value)}
              placeholder="000000002"
              className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary,#2563eb)] focus:outline-none"
            />
          </div>
        </>
      ) : (
        <>
          <VinField value={data.vin} onChange={(v) => set('vin', v)} />
          <MakeModelFields data={data} onChange={onChange} />
        </>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <button type="submit"
        className="w-full rounded-full bg-[var(--color-primary,#2563eb)] py-3 font-bold uppercase tracking-wide text-white hover:opacity-90">
        Продължи
      </button>
    </form>
  );
}

function VinField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="vin" className="mb-1 block text-sm font-medium text-gray-700">VIN номер</label>
      <input id="vin" type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="WDDTESTVIN0000001"
        className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary,#2563eb)] focus:outline-none" />
    </div>
  );
}

function MakeModelFields({ data, onChange }: { data: VehicleData; onChange: (d: VehicleData) => void }) {
  function set<K extends keyof VehicleData>(key: K, value: VehicleData[K]) {
    onChange({ ...data, [key]: value });
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor="make" className="mb-1 block text-sm font-medium text-gray-700">Марка</label>
        <input id="make" type="text" value={data.make} onChange={(e) => set('make', e.target.value)}
          placeholder="Mercedes"
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary,#2563eb)] focus:outline-none" />
      </div>
      <div>
        <label htmlFor="model" className="mb-1 block text-sm font-medium text-gray-700">Модел</label>
        <input id="model" type="text" value={data.model} onChange={(e) => set('model', e.target.value)}
          placeholder="S 350"
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary,#2563eb)] focus:outline-none" />
      </div>
    </div>
  );
}
