'use client';

export type FleetPdfExportStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'assembling';

export interface FleetPdfFailedItem {
  policyId: string;
  error: string;
}

interface FleetExportStatusCardProps {
  exportId: string;
  status: FleetPdfExportStatus;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  failedPolicyIds: FleetPdfFailedItem[];
  onDownload: () => void;
  onRetry: (failedPolicyIds: string[]) => void;
  isDownloading?: boolean;
}

const STATUS_LABELS: Record<FleetPdfExportStatus, string> = {
  pending: 'Изчакване',
  processing: 'Генериране...',
  assembling: 'Компресиране...',
  completed: 'Завършен',
  partial: 'Частично завършен',
  failed: 'Неуспешен',
};

const STATUS_COLORS: Record<FleetPdfExportStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  processing: 'bg-blue-100 text-blue-700',
  assembling: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

export function FleetExportStatusCard({
  exportId,
  status,
  totalCount,
  completedCount,
  failedCount,
  failedPolicyIds,
  onDownload,
  onRetry,
  isDownloading = false,
}: FleetExportStatusCardProps) {
  const processed = completedCount + failedCount;
  const progressPercent = totalCount > 0 ? (processed / totalCount) * 100 : 0;
  const isReady = status === 'completed' || status === 'partial';
  const isProcessing = status === 'pending' || status === 'processing' || status === 'assembling';

  return (
    <div className="bg-white border rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Пакетен PDF Експорт</h2>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      <p className="text-sm text-gray-500 mb-4">ID: {exportId}</p>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Прогрес</span>
          <span>
            {processed} / {totalCount} документа обработени
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Download button */}
      {isReady && (
        <button
          onClick={onDownload}
          disabled={isDownloading}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 mb-4"
        >
          {isDownloading ? 'Зареждане...' : 'Изтегли ZIP архив'}
        </button>
      )}

      {isProcessing && (
        <div className="text-center py-2 text-sm text-gray-500">
          Моля изчакайте докато документите се генерират...
        </div>
      )}

      {status === 'failed' && (
        <div className="text-center py-2 text-sm text-red-500">
          Всички документи са неуспешни. Моля опитайте отново.
        </div>
      )}

      {/* Failed items */}
      {failedCount > 0 && failedPolicyIds.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-red-700">
              Неуспешни документи ({failedCount})
            </h3>
            <button
              onClick={() => onRetry(failedPolicyIds.map((f) => f.policyId))}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Повтори неуспешните
            </button>
          </div>
          <ul className="space-y-2">
            {failedPolicyIds.map((item) => (
              <li
                key={item.policyId}
                className="flex items-start gap-2 text-xs text-gray-600 bg-red-50 rounded p-2"
              >
                <span className="font-mono text-red-600 shrink-0">
                  {item.policyId.slice(0, 8)}...
                </span>
                <span className="text-red-500">{item.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
