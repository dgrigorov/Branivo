'use client';

import { useState } from 'react';
import type { ContactData } from '../hooks/use-wizard-state';

interface StepContactProps {
  data: ContactData;
  onChange: (data: ContactData) => void;
  onNext: () => void;
}

export function StepContact({ data, onChange, onNext }: StepContactProps) {
  const [errors, setErrors] = useState<{ email?: string; phone?: string }>({});

  function set<K extends keyof ContactData>(key: K, value: string) {
    onChange({ ...data, [key]: value });
  }

  function validate(): boolean {
    const errs: { email?: string; phone?: string } = {};
    if (!data.email.trim()) {
      errs.email = 'Имейл адресът е задължителен.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errs.email = 'Невалиден имейл адрес.';
    }
    if (!data.phone.trim()) {
      errs.phone = 'Телефонният номер е задължителен.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-bold uppercase tracking-wider text-[var(--color-primary,#2563eb)]">
          Данни за контакт
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          (на лицето, сключващо застраховката)
        </p>
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
          Имейл
        </label>
        <input
          id="email"
          type="email"
          value={data.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="someone@somewhere.com"
          autoComplete="email"
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary,#2563eb)] focus:outline-none"
        />
        {errors.email && <p role="alert" className="mt-0.5 text-xs text-red-600">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">
          Телефон
        </label>
        <input
          id="phone"
          type="tel"
          value={data.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="+359 888 888 888"
          autoComplete="tel"
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary,#2563eb)] focus:outline-none"
        />
        {errors.phone && <p role="alert" className="mt-0.5 text-xs text-red-600">{errors.phone}</p>}
      </div>

      <button
        type="submit"
        className="w-full rounded-full bg-[var(--color-primary,#2563eb)] py-3 font-bold uppercase tracking-wide text-white hover:opacity-90"
      >
        Продължи
      </button>
    </form>
  );
}
