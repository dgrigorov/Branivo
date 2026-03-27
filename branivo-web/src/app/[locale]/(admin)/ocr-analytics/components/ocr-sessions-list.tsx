'use client';

import { useState } from 'react';
import type { OcrSessionDto } from '@/lib/hooks/use-ocr-analytics';
import { VehicleRegistrationCard } from './vehicle-registration-card';

interface Props {
  sessions: OcrSessionDto[];
  total: number;
  page: number;
  limit: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  ml_kit: 'ML Kit (on-device)',
  google_vision: 'Google Vision',
  aws_textract: 'AWS Textract',
};

function providerBadge(provider: string | null): string {
  if (provider === 'ml_kit') return 'bg-blue-100 text-blue-700';
  if (provider === 'google_vision') return 'bg-purple-100 text-purple-700';
  if (provider === 'aws_textract') return 'bg-orange-100 text-orange-700';
  return 'bg-gray-100 text-gray-600';
}

function fieldCount(session: OcrSessionDto): number {
  if (!session.result) return 0;
  return Object.values(session.result).filter((f) => f?.value !== null).length;
}

function avgConfidence(session: OcrSessionDto): number | null {
  if (!session.confidenceScores) return null;
  const values = Object.values(session.confidenceScores);
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function OcrSessionsList({ sessions, total, page, limit, isLoading, onPageChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const totalPages = Math.ceil(total / limit);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-gray-500">Зареждане...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        Няма сесии за избрания период
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Дата / Час
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Тенант
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Доставчик
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Полета
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Ср. достоверност
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Талон
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sessions.map((session) => {
              const isExpanded = expandedId === session.id;
              const conf = avgConfidence(session);
              const detected = fieldCount(session);

              return (
                <>
                  <tr
                    key={session.id}
                    className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                      {new Date(session.createdAt).toLocaleString('bg-BG')}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono truncate max-w-[120px]">
                      {session.tenantId.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${providerBadge(session.provider)}`}>
                        {PROVIDER_LABELS[session.provider ?? ''] ?? session.provider ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {detected} / 13
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {conf !== null ? (
                        <span className={`font-semibold ${conf >= 0.85 ? 'text-green-600' : conf >= 0.70 ? 'text-amber-600' : 'text-red-600'}`}>
                          {(conf * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : session.id)}
                        className="text-blue-600 hover:text-blue-800 text-xs underline font-medium"
                      >
                        {isExpanded ? '▲ Скрий' : '▼ Виж талон'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${session.id}-expanded`}>
                      <td colSpan={6} className="px-4 py-4 bg-gray-50">
                        <VehicleRegistrationCard
                          result={session.result}
                          readOnly
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            Показани {(page - 1) * limit + 1}–{Math.min(page * limit, total)} от {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              ← Предишна
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Следваща →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
