'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAnonymousSession, type UpdateSessionPayload } from '../../../../lib/hooks/use-anonymous-session';
import { createQuoteRequest, useQuotesBySession, type QuoteSession } from '../../../../lib/hooks/use-quotes';
import { useCurrentUser } from '../../../../lib/hooks/use-current-user';
import { runTalonOcr } from '../../../../lib/hooks/use-talon-ocr';
import { OfferCard } from './components/offer-card';
import { TalonUploadSection, type TalonSlot } from './components/talon-upload-section';
import { TalonDebugPanel } from './components/ocr-pipeline-debug';

interface FormValues {
  reg_number: string;
  vin: string;
  make: string;
  model: string;
  year: string;
}

function OfferResultsList({ sessionToken }: { sessionToken: string }) {
  const { data, isPending, isError, error } = useQuotesBySession(sessionToken);

  if (isPending) {
    return (
      <div className="mt-6 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-700">
        Грешка при зареждане на оферти: {error.message}
      </div>
    );
  }

  if (!data || data.offers.length === 0) {
    return <p className="mt-6 text-center text-gray-500">Няма налични оферти.</p>;
  }

  return (
    <div className="mt-6 space-y-3" aria-label="Оферти за застраховка">
      <h2 className="text-xl font-bold">Оферти</h2>
      {data.offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} isRecommended={offer.isRecommended} />
      ))}
    </div>
  );
}

export default function QuotesPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const { sessionId, isLoading, isExpired, requiresLogin, updateSessionData } = useAnonymousSession();
  const { role } = useCurrentUser();
  const [quoteSession, setQuoteSession] = useState<QuoteSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [talonSlots, setTalonSlots] = useState<(TalonSlot | null)[]>([null, null, null]);
  const [formValues, setFormValues] = useState<FormValues>({
    reg_number: '',
    vin: '',
    make: '',
    model: '',
    year: '',
  });

  useEffect(() => {
    if (requiresLogin) router.push(`/${params.locale}/login`);
  }, [requiresLogin, router, params.locale]);

  const setField = (field: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormValues((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!sessionId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    // Run OCR on any uploaded talon photos before sending quote request
    const hasPhotos = talonSlots.some((s) => s !== null);
    let merged = { ...formValues };
    if (hasPhotos) {
      try {
        const ocr = await runTalonOcr(talonSlots);
        merged = {
          reg_number: formValues.reg_number || ocr.reg_number,
          vin: formValues.vin || ocr.vin,
          make: formValues.make || ocr.make,
          model: formValues.model || ocr.model,
          year: formValues.year || ocr.year,
        };
        setFormValues(merged);
      } catch {
        // Non-fatal — proceed with whatever the user typed manually
      }
    }

    const payload: UpdateSessionPayload = {
      vehicle_data: {
        reg_number: merged.reg_number || undefined,
        vin: merged.vin || undefined,
        make: merged.make || undefined,
        model: merged.model || undefined,
        year: merged.year ? Number(merged.year) : undefined,
      },
    };

    void updateSessionData(payload);

    try {
      const session = await createQuoteRequest(sessionId);
      setQuoteSession(session);
    } catch {
      setSubmitError('Грешка при получаване на оферти. Моля, опитайте отново.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">Зареждане...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div
        className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700"
        role="note"
        aria-label="cross-device-banner"
      >
        Офертите важат 48 часа. Отворете от същото устройство за да продължите по-късно.
      </div>

      {isExpired && (
        <div
          className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700"
          role="alert"
          aria-label="session-expired-banner"
        >
          Сесията ви изтече — моля, въведете данните отново
        </div>
      )}

      <h1 className="mb-6 text-2xl font-bold">Сравни застрахователни оферти</h1>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {/* Talon photo upload — slot 0=step1(MRZ), slot 1=step2(front), slot 2=step3(Ч.II) */}
        <TalonUploadSection onSlotsChange={setTalonSlots} />

        <hr className="border-gray-200" />

        <div>
          <label htmlFor="reg_number" className="block text-sm font-medium text-gray-700">
            Регистрационен номер
          </label>
          <input
            id="reg_number"
            name="reg_number"
            type="text"
            placeholder="CA1234AB"
            value={formValues.reg_number}
            onChange={setField('reg_number')}
            className="mt-1 block w-full rounded border border-gray-300 p-2"
          />
        </div>

        <div>
          <label htmlFor="vin" className="block text-sm font-medium text-gray-700">
            VIN номер (незадължително)
          </label>
          <input
            id="vin"
            name="vin"
            type="text"
            placeholder="WVWZZZ1KZAM123456"
            value={formValues.vin}
            onChange={setField('vin')}
            className="mt-1 block w-full rounded border border-gray-300 p-2"
          />
        </div>

        <div>
          <label htmlFor="make" className="block text-sm font-medium text-gray-700">
            Марка
          </label>
          <input
            id="make"
            name="make"
            type="text"
            placeholder="Volkswagen"
            value={formValues.make}
            onChange={setField('make')}
            className="mt-1 block w-full rounded border border-gray-300 p-2"
          />
        </div>

        <div>
          <label htmlFor="model" className="block text-sm font-medium text-gray-700">
            Модел
          </label>
          <input
            id="model"
            name="model"
            type="text"
            placeholder="Golf"
            value={formValues.model}
            onChange={setField('model')}
            className="mt-1 block w-full rounded border border-gray-300 p-2"
          />
        </div>

        <div>
          <label htmlFor="year" className="block text-sm font-medium text-gray-700">
            Година
          </label>
          <input
            id="year"
            name="year"
            type="number"
            min="1990"
            max="2030"
            placeholder="2020"
            value={formValues.year}
            onChange={setField('year')}
            className="mt-1 block w-full rounded border border-gray-300 p-2"
          />
        </div>

        {submitError && (
          <p role="alert" className="text-sm text-red-600">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={!sessionId || isSubmitting}
          className="w-full rounded bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary, #2563eb)' }}
        >
          {isSubmitting
            ? talonSlots.some((s) => s !== null)
              ? 'OCR обработка…'
              : 'Търсене на оферти…'
            : 'Сравни оферти'}
        </button>
      </form>

      {/* Super Admin: preprocessing pipeline debugger */}
      {role === 'super_admin' && (
        <div className="mt-6">
          <TalonDebugPanel slots={talonSlots} />
        </div>
      )}

      {quoteSession && (
        <Suspense
          fallback={
            <div className="mt-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
              ))}
            </div>
          }
        >
          <OfferResultsList sessionToken={quoteSession.sessionToken} />
        </Suspense>
      )}
    </div>
  );
}
