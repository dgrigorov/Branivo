'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  FleetExportStatusCard,
  type FleetPdfExportStatus,
  type FleetPdfFailedItem,
} from '@/components/fleet/FleetExportStatusCard';

interface ExportStatusResponse {
  exportId: string;
  status: FleetPdfExportStatus;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  failedPolicyIds: FleetPdfFailedItem[];
  zipS3Key: string | null;
  expiresAt: string | null;
}

interface DownloadUrlResponse {
  downloadUrl: string;
  expiresInSeconds: number;
}

const TERMINAL_STATUSES: FleetPdfExportStatus[] = [
  'completed',
  'partial',
  'failed',
];

async function fetchExportStatus(exportId: string): Promise<ExportStatusResponse> {
  const res = await fetch(`/api/v1/fleet/exports/${exportId}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Грешка при зареждане на статуса');
  return res.json() as Promise<ExportStatusResponse>;
}

export default function FleetExportStatusPage() {
  const params = useParams<{ exportId: string }>();
  const exportId = params.exportId;
  const router = useRouter();

  const { data, error } = useQuery<ExportStatusResponse>({
    queryKey: ['fleet', 'exports', exportId],
    queryFn: () => fetchExportStatus(exportId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || TERMINAL_STATUSES.includes(status)) return false;
      return 2000;
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/fleet/exports/${exportId}/download`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Грешка при генериране на URL за сваляне');
      return res.json() as Promise<DownloadUrlResponse>;
    },
    onSuccess: ({ downloadUrl }) => {
      window.location.href = downloadUrl;
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (policyIds: string[]) => {
      const res = await fetch('/api/v1/fleet/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ policyIds }),
      });
      if (!res.ok) throw new Error('Грешка при стартиране на повторен експорт');
      return res.json() as Promise<{ exportId: string }>;
    },
    onSuccess: ({ exportId: newExportId }) => {
      router.push(`/fleet/exports/${newExportId}`);
    },
  });

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Грешка при зареждане на статуса на експорта</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-gray-500">Зареждане...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => router.push('/fleet')}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          ← Обратно към флота
        </button>
      </div>

      <FleetExportStatusCard
        exportId={data.exportId}
        status={data.status}
        totalCount={data.totalCount}
        completedCount={data.completedCount}
        failedCount={data.failedCount}
        failedPolicyIds={data.failedPolicyIds}
        onDownload={() => downloadMutation.mutate()}
        onRetry={(failedIds) => retryMutation.mutate(failedIds)}
        isDownloading={downloadMutation.isPending}
      />

      {downloadMutation.error && (
        <p className="mt-3 text-sm text-red-500">
          Грешка при сваляне. Моля опитайте отново.
        </p>
      )}
    </div>
  );
}
