'use client';

interface ConfirmStatusModalProps {
  tenantName: string;
  action: 'deactivate' | 'reactivate';
  onConfirm: () => void;
  onClose: () => void;
  isLoading: boolean;
}

export function ConfirmStatusModal({
  tenantName,
  action,
  onConfirm,
  onClose,
  isLoading,
}: ConfirmStatusModalProps) {
  const isDeactivate = action === 'deactivate';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isDeactivate ? 'Деактивиране на тенант' : 'Реактивиране на тенант'}
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Затвори"
          >
            ✕
          </button>
        </div>

        <p className="mb-6 text-sm text-gray-700">
          {isDeactivate ? (
            <>
              Сигурни ли сте, че искате да деактивирате{' '}
              <strong>{tenantName}</strong>? Новите продажби ще бъдат блокирани.
            </>
          ) : (
            <>
              Сигурни ли сте, че искате да реактивирате{' '}
              <strong>{tenantName}</strong>? Продажбите ще се възобновят
              веднага.
            </>
          )}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Отказ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              isDeactivate
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isLoading ? 'Зареждане...' : 'Потвърди'}
          </button>
        </div>
      </div>
    </div>
  );
}
