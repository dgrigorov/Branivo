'use client';

import { useState } from 'react';
import type { OwnerData } from '../hooks/use-wizard-state';

interface StepOwnerProps {
  data: OwnerData;
  onChange: (data: OwnerData) => void;
  onNext: () => void;
}

const CYRILLIC_RE = /^[А-яЁё\s\-]+$/;

function validateCyrillic(val: string): string | null {
  if (!val.trim()) return 'Полето е задължително.';
  if (!CYRILLIC_RE.test(val)) return 'Моля, използвай кирилица.';
  return null;
}

export function StepOwner({ data, onChange, onNext }: StepOwnerProps) {
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  function set<K extends keyof OwnerData>(key: K, value: OwnerData[K]) {
    onChange({ ...data, [key]: value });
  }

  function validate(): boolean {
    const errs: Partial<Record<string, string>> = {};
    if (data.type === 'individual') {
      const fnErr = validateCyrillic(data.firstName);
      if (fnErr) errs.firstName = fnErr;
      const mnErr = validateCyrillic(data.middleName);
      if (mnErr) errs.middleName = mnErr;
      const lnErr = validateCyrillic(data.lastName);
      if (lnErr) errs.lastName = lnErr;
      if (!data.egn.trim()) errs.egn = 'ЕГН/ЛНЧ е задължително.';
      else if (!/^\d{10}$/.test(data.egn)) errs.egn = 'ЕГН/ЛНЧ трябва да е точно 10 цифри.';
    } else {
      if (!data.companyName.trim()) errs.companyName = 'Наименованието е задължително.';
      if (!data.eik.trim()) errs.eik = 'ЕИК е задължителен.';
      if (!data.mol.trim()) errs.mol = 'МОЛ е задължително.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-bold uppercase tracking-wider text-[var(--color-primary,#2563eb)]">
          Собственик на автомобила
        </h1>
      </div>

      <div>
        <label htmlFor="ownerType" className="mb-1 block text-sm font-medium text-gray-700">Собственик</label>
        <select id="ownerType" value={data.type}
          onChange={(e) => set('type', e.target.value as 'individual' | 'company')}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none">
          <option value="individual">Физическо лице</option>
          <option value="company">Юридическо лице</option>
        </select>
      </div>

      {data.type === 'individual' ? (
        <IndividualFields data={data} onChange={set} errors={errors} />
      ) : (
        <CompanyFields data={data} onChange={set} errors={errors} />
      )}

      <div className="flex items-start gap-2">
        <input type="checkbox" id="ownerIsInsurer" checked={data.ownerIsInsurer}
          onChange={(e) => set('ownerIsInsurer', e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300" />
        <div>
          <label htmlFor="ownerIsInsurer" className="text-sm font-medium text-gray-700 cursor-pointer">
            Собственикът на автомобила е застраховащ
          </label>
          <p className="text-xs text-gray-400">(застраховащ е лицето, сключващо договора)</p>
        </div>
      </div>

      {!data.ownerIsInsurer && data.type === 'individual' && (
        <InsurerFields data={data} onChange={set} errors={errors} />
      )}

      <button type="submit"
        className="w-full rounded-full bg-[var(--color-primary,#2563eb)] py-3 font-bold uppercase tracking-wide text-white hover:opacity-90">
        Продължи
      </button>
    </form>
  );
}

type FieldSetter = <K extends keyof OwnerData>(key: K, value: OwnerData[K]) => void;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p role="alert" className="mt-0.5 text-xs text-red-600">{msg}</p>;
}

function CyrillicInput({ id, label, value, onChange, error }: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input id={id} type="text" value={value} placeholder="Използвай кирилица"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:outline-none" />
      <FieldError msg={error} />
    </div>
  );
}

function IndividualFields({ data, onChange, errors }: { data: OwnerData; onChange: FieldSetter; errors: Partial<Record<string, string>> }) {
  return (
    <>
      <CyrillicInput id="firstName" label="Име" value={data.firstName} onChange={(v) => onChange('firstName', v)} error={errors.firstName} />
      <CyrillicInput id="middleName" label="Презиме" value={data.middleName} onChange={(v) => onChange('middleName', v)} error={errors.middleName} />
      <CyrillicInput id="lastName" label="Фамилия" value={data.lastName} onChange={(v) => onChange('lastName', v)} error={errors.lastName} />
      <div>
        <label htmlFor="egn" className="mb-1 block text-sm font-medium text-gray-700">ЕГН/ЛНЧ</label>
        <input id="egn" type="text" value={data.egn} onChange={(e) => onChange('egn', e.target.value)}
          placeholder="7703041122" maxLength={10}
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:outline-none" />
        <FieldError msg={errors.egn} />
      </div>
    </>
  );
}

function CompanyFields({ data, onChange, errors }: { data: OwnerData; onChange: FieldSetter; errors: Partial<Record<string, string>> }) {
  return (
    <>
      <div>
        <label htmlFor="companyName" className="mb-1 block text-sm font-medium text-gray-700">Наименование на фирма</label>
        <input id="companyName" type="text" value={data.companyName} onChange={(e) => onChange('companyName', e.target.value)}
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:outline-none" />
        <FieldError msg={errors.companyName} />
      </div>
      <div>
        <label htmlFor="eik" className="mb-1 block text-sm font-medium text-gray-700">ЕИК</label>
        <input id="eik" type="text" value={data.eik} onChange={(e) => onChange('eik', e.target.value)}
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:outline-none" />
        <FieldError msg={errors.eik} />
      </div>
      <div>
        <label htmlFor="mol" className="mb-1 block text-sm font-medium text-gray-700">МОЛ</label>
        <input id="mol" type="text" value={data.mol} onChange={(e) => onChange('mol', e.target.value)}
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:outline-none" />
        <FieldError msg={errors.mol} />
      </div>
    </>
  );
}

function InsurerFields({ data, onChange, errors }: { data: OwnerData; onChange: FieldSetter; errors: Partial<Record<string, string>> }) {
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold uppercase tracking-wider text-gray-600">Застраховащ</p>
      <CyrillicInput id="insurerFirstName" label="Име" value={data.insurerFirstName} onChange={(v) => onChange('insurerFirstName', v)} error={errors.insurerFirstName} />
      <CyrillicInput id="insurerMiddleName" label="Презиме" value={data.insurerMiddleName} onChange={(v) => onChange('insurerMiddleName', v)} error={errors.insurerMiddleName} />
      <CyrillicInput id="insurerLastName" label="Фамилия" value={data.insurerLastName} onChange={(v) => onChange('insurerLastName', v)} error={errors.insurerLastName} />
      <div>
        <label htmlFor="insurerEgn" className="mb-1 block text-sm font-medium text-gray-700">ЕГН/ЛНЧ</label>
        <input id="insurerEgn" type="text" value={data.insurerEgn} onChange={(e) => onChange('insurerEgn', e.target.value)}
          maxLength={10}
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:outline-none" />
      </div>
    </div>
  );
}
