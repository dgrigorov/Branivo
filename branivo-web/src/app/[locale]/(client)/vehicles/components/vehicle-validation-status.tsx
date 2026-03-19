'use client';

import React from 'react';
import type { KatStatus, GfStatus } from '@/lib/hooks/use-vehicle-validation';

interface VehicleValidationStatusProps {
  katStatus: KatStatus | null;
  gfStatus: GfStatus | null;
  canProceed: boolean;
  isBlocked: boolean;
  vinError: string | null;
  onKatManualConfirm?: (confirmed: boolean) => void;
  onProceed?: () => void;
}

function KatStatusBadge({ status }: { status: KatStatus | null }) {
  if (!status) return null;
  const config = {
    ok: { label: 'КАТ: Верифициран', className: 'bg-green-100 text-green-800' },
    manual_fallback: { label: 'КАТ: Ръчна проверка', className: 'bg-yellow-100 text-yellow-800' },
    failed: { label: 'КАТ: Неуспешно', className: 'bg-red-100 text-red-800' },
    unavailable: { label: 'КАТ: Недостъпен', className: 'bg-gray-100 text-gray-600' },
  }[status];

  return (
    <span className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function GfStatusBadge({ status }: { status: GfStatus | null }) {
  if (!status) return null;
  const config = {
    clean: { label: 'Гаранционен фонд: OK', className: 'bg-green-100 text-green-800' },
    flagged: { label: 'Гаранционен фонд: Блокиран', className: 'bg-red-100 text-red-800' },
    unavailable: { label: 'Гаранционен фонд: Недостъпен', className: 'bg-gray-100 text-gray-500' },
  }[status];

  return (
    <span className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

export function VehicleValidationStatus({
  katStatus,
  gfStatus,
  canProceed,
  isBlocked,
  vinError,
  onKatManualConfirm,
  onProceed,
}: VehicleValidationStatusProps) {
  const [manualConfirmed, setManualConfirmed] = React.useState(false);

  if (isBlocked) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-400 bg-red-50 p-4"
      >
        <h2 className="font-semibold text-red-800">МПС с нерегламентиран статус</h2>
        <p className="mt-1 text-sm text-red-700">
          Вашето МПС има нерегламентиран статус и не може да бъде застраховано.
        </p>
      </div>
    );
  }

  if (vinError) {
    return (
      <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3">
        <p className="text-sm text-red-700">{vinError}</p>
      </div>
    );
  }

  if (!katStatus && !gfStatus) return null;

  return (
    <div aria-live="polite" className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <KatStatusBadge status={katStatus} />
        <GfStatusBadge status={gfStatus} />
      </div>

      {katStatus === 'manual_fallback' && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3">
          <p className="text-sm text-yellow-800">
            Не успяхме да верифицираме VIN автоматично. Моля, проверете ръчно.
          </p>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manualConfirmed}
              onChange={(e) => {
                setManualConfirmed(e.target.checked);
                onKatManualConfirm?.(e.target.checked);
              }}
            />
            Потвърждавам, че данните са верни
          </label>
        </div>
      )}

      <button
        type="button"
        disabled={!canProceed || (katStatus === 'manual_fallback' && !manualConfirmed)}
        onClick={onProceed}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Продължи към оферти
      </button>
    </div>
  );
}
