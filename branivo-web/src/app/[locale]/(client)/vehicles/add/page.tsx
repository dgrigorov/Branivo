'use client';

import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { OcrWizard } from '../components/ocr-wizard';
import { useAnonymousSession } from '@/lib/hooks/use-anonymous-session';
import { useVehicles, type CreateVehiclePayload } from '@/lib/hooks/use-vehicles';
import type { OcrScanResult } from '@/lib/hooks/use-ocr-scanning';

// ─── Form state ───────────────────────────────────────────────────────────────

interface VehicleFormValues {
  vin: string;
  licensePlate: string;
  make: string;
  model: string;
  year: string;
  color: string;
  engineVolume: string;
  fuelType: string;
  firstRegistrationDate: string;
}

const EMPTY_FORM: VehicleFormValues = {
  vin: '',
  licensePlate: '',
  make: '',
  model: '',
  year: '',
  color: '',
  engineVolume: '',
  fuelType: '',
  firstRegistrationDate: '',
};

function ocrResultToForm(result: OcrScanResult): VehicleFormValues {
  const f = result.fields ?? {};
  return {
    vin: f.vin?.value ?? '',
    licensePlate: f.license_plate?.value ?? '',
    make: f.make?.value ?? '',
    model: f.model?.value ?? '',
    year: f.year?.value ?? '',
    color: f.color?.value ?? '',
    engineVolume: f.engine_volume?.value ?? '',
    fuelType: f.fuel_type?.value ?? '',
    firstRegistrationDate: f.first_registration_date?.value ?? '',
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageStep = 'ocr' | 'review' | 'saving';

export default function AddVehiclePage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? 'bg';

  const { sessionId, isLoading: sessionLoading } = useAnonymousSession();
  const { saveVehicle } = useVehicles();

  const [step, setStep] = useState<PageStep>('ocr');
  const [form, setForm] = useState<VehicleFormValues>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleOcrComplete = useCallback((result: OcrScanResult) => {
    setForm(ocrResultToForm(result));
    setStep('review');
  }, []);

  const handleManualEntry = useCallback(() => {
    setForm(EMPTY_FORM);
    setStep('review');
  }, []);

  const handleFieldChange = useCallback(
    (field: keyof VehicleFormValues, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const yearNum = parseInt(form.year, 10);
    if (!form.vin || !form.licensePlate || !form.make || !form.model || isNaN(yearNum)) {
      setSaveError('Моля, попълнете задължителните полета: VIN, Рег. номер, Марка, Модел, Година.');
      return;
    }

    setSaveError(null);
    setStep('saving');

    const payload: CreateVehiclePayload = {
      vin: form.vin,
      licensePlate: form.licensePlate,
      make: form.make,
      model: form.model,
      year: yearNum,
      ...(form.color ? { color: form.color } : {}),
      ...(form.engineVolume ? { engineVolume: form.engineVolume } : {}),
      ...(form.fuelType ? { fuelType: form.fuelType } : {}),
      ...(form.firstRegistrationDate ? { firstRegistrationDate: form.firstRegistrationDate } : {}),
    };

    const saved = await saveVehicle(payload);

    if (!saved) {
      setSaveError('Грешка при запазване на МПС. Моля, опитайте отново.');
      setStep('review');
      return;
    }

    router.push(`/${locale}/vehicles`);
  }, [form, saveVehicle, router, locale]);

  // ─── Session loading ───────────────────────────────────────────────────────

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Зареждане...</p>
      </div>
    );
  }

  // ─── OCR step ─────────────────────────────────────────────────────────────

  if (step === 'ocr') {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <PageHeader locale={locale} title="Добави МПС" />
        <p className="mb-6 text-sm text-gray-600">
          Снимайте малкия талон (Свидетелство за регистрация), за да попълним данните автоматично.
        </p>
        <OcrWizard
          sessionToken={sessionId ?? ''}
          onComplete={handleOcrComplete}
          onManualEntry={handleManualEntry}
        />
      </div>
    );
  }

  // ─── Saving step ──────────────────────────────────────────────────────────

  if (step === 'saving') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-600">Запазване на МПС-то...</p>
        </div>
      </div>
    );
  }

  // ─── Review / edit step ───────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <PageHeader locale={locale} title="Проверете данните" />
      <p className="mb-6 text-sm text-gray-600">
        Прегледайте и коригирайте данните от малкия талон преди запазване.
      </p>

      <div className="space-y-4">
        <FormField
          label="VIN номер *"
          value={form.vin}
          onChange={(v) => handleFieldChange('vin', v)}
        />
        <FormField
          label="Регистрационен номер *"
          value={form.licensePlate}
          onChange={(v) => handleFieldChange('licensePlate', v)}
        />
        <FormField
          label="Марка *"
          value={form.make}
          onChange={(v) => handleFieldChange('make', v)}
        />
        <FormField
          label="Модел *"
          value={form.model}
          onChange={(v) => handleFieldChange('model', v)}
        />
        <FormField
          label="Година *"
          value={form.year}
          onChange={(v) => handleFieldChange('year', v)}
          inputMode="numeric"
        />
        <FormField
          label="Цвят"
          value={form.color}
          onChange={(v) => handleFieldChange('color', v)}
        />
        <FormField
          label="Обем на двигателя"
          value={form.engineVolume}
          onChange={(v) => handleFieldChange('engineVolume', v)}
        />
        <FormField
          label="Вид гориво"
          value={form.fuelType}
          onChange={(v) => handleFieldChange('fuelType', v)}
        />
        <FormField
          label="Дата на първа регистрация"
          value={form.firstRegistrationDate}
          onChange={(v) => handleFieldChange('firstRegistrationDate', v)}
        />
      </div>

      {saveError && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => setStep('ocr')}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Назад
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          Запази МПС
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageHeader({ locale, title }: { locale: string; title: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <a
        href={`/${locale}/vehicles`}
        className="text-sm text-gray-500 hover:text-gray-700"
        aria-label="Обратно към МПС-та"
      >
        ←
      </a>
      <h1 className="text-xl font-semibold">{title}</h1>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        type="text"
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}
