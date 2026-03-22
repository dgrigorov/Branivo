'use client';

interface BulkPurchaseSuccessItem {
  vehicleId: string;
  quoteId: string;
  clientSecret: string;
  paymentId: string;
}

interface BulkPurchaseFailedItem {
  vehicleId: string;
  quoteId: string;
  error: string;
}

export interface BulkPurchaseResultProps {
  succeeded: BulkPurchaseSuccessItem[];
  failed: BulkPurchaseFailedItem[];
  summary: { total: number; succeeded: number; failed: number };
  onRetry?: (failedItems: BulkPurchaseFailedItem[]) => void;
}

export function BulkPurchaseResult({
  succeeded,
  failed,
  summary,
  onRetry,
}: BulkPurchaseResultProps) {
  const allSucceeded = summary.failed === 0;
  const allFailed = summary.succeeded === 0;

  return (
    <div
      className={`rounded-lg border p-4 ${
        allSucceeded
          ? 'bg-green-50 border-green-200'
          : allFailed
            ? 'bg-red-50 border-red-200'
            : 'bg-yellow-50 border-yellow-200'
      }`}
      role="status"
      aria-live="polite"
    >
      <h2
        className={`font-semibold mb-2 ${
          allSucceeded
            ? 'text-green-800'
            : allFailed
              ? 'text-red-800'
              : 'text-yellow-800'
        }`}
      >
        {allSucceeded
          ? '✅ Всички полици са закупени'
          : allFailed
            ? '❌ Закупуването е неуспешно'
            : '⚠️ Частично успешно закупуване'}
      </h2>

      <p className="text-sm text-gray-700 mb-3">
        Успешни: {summary.succeeded} / {summary.total}
        {summary.failed > 0 && ` · Неуспешни: ${summary.failed}`}
      </p>

      {succeeded.length > 0 && (
        <ul className="space-y-1 mb-3">
          {succeeded.map((item) => (
            <li key={item.paymentId} className="text-sm text-green-700">
              ✓ Полица закупена — плащане {item.paymentId}
            </li>
          ))}
        </ul>
      )}

      {failed.length > 0 && (
        <div className="space-y-2">
          <ul className="space-y-1">
            {failed.map((item) => (
              <li key={item.vehicleId} className="text-sm text-red-600">
                ✗ МПС {item.vehicleId.slice(0, 8)}…: {item.error}
              </li>
            ))}
          </ul>
          {onRetry && (
            <button
              onClick={() => onRetry(failed)}
              className="mt-2 px-4 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors"
            >
              Retry неуспешните ({failed.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
