'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAnonymousSession, type UpdateSessionPayload } from '../../../../lib/hooks/use-anonymous-session';

export default function QuotesPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const { sessionId, isLoading, isExpired, requiresLogin, updateSessionData } = useAnonymousSession();

  useEffect(() => {
    if (requiresLogin) {
      router.push(`/${params.locale}/login`);
    }
  }, [requiresLogin, router, params.locale]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const payload: UpdateSessionPayload = {
      vehicle_data: {
        reg_number: (data.get('reg_number') as string) || undefined,
        vin: (data.get('vin') as string) || undefined,
        make: (data.get('make') as string) || undefined,
        model: (data.get('model') as string) || undefined,
        year: data.get('year') ? Number(data.get('year')) : undefined,
      },
    };

    void updateSessionData(payload);
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
      {/* Cross-device limitation banner — always visible */}
      <div
        className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700"
        role="note"
        aria-label="cross-device-banner"
      >
        Офертите важат 48 часа. Отворете от същото устройство за да продължите по-късно.
      </div>

      {/* Expiry banner */}
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reg_number" className="block text-sm font-medium text-gray-700">
            Регистрационен номер
          </label>
          <input
            id="reg_number"
            name="reg_number"
            type="text"
            placeholder="CA1234AB"
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
            className="mt-1 block w-full rounded border border-gray-300 p-2"
          />
        </div>

        <button
          type="submit"
          disabled={!sessionId}
          className="w-full rounded bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary, #2563eb)' }}
        >
          Сравни оферти
        </button>
      </form>
    </div>
  );
}
