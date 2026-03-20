'use client';

import { useState } from 'react';
import { OcrTrendChart } from './components/ocr-trend-chart';
import {
  useOcrAnalytics,
  useOcrTrend,
} from '@/lib/hooks/use-ocr-analytics';
import type { OcrFieldStat } from '@/lib/hooks/use-ocr-analytics';

const DAYS_OPTIONS = [7, 30] as const;

export default function OcrAnalyticsPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const [tenantId, setTenantId] = useState('');
  const [selectedField, setSelectedField] = useState<string | null>(null);

  const { data, isLoading, error } = useOcrAnalytics({
    tenantId: tenantId || undefined,
    days,
  });

  const { data: trendData, isLoading: isTrendLoading } = useOcrTrend(
    selectedField ?? '',
    days,
    tenantId || undefined,
  );

  const stats = data?.stats ?? [];
  const hasHighFallback = stats.some((s) => s.fallbackRate > 0.2);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        OCR Analytics Dashboard
      </h1>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label
            htmlFor="tenant-filter"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Тенант ID
          </label>
          <input
            id="tenant-filter"
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="UUID или остави празно"
            className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Период
          </label>
          <div className="flex rounded border border-gray-300 overflow-hidden">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  days === d
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {d} дни
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Alert banner */}
      {hasHighFallback && (
        <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-sm font-medium text-yellow-800">
            ⚠️ Внимание: Едно или повече полета имат fallback rate &gt; 20%
          </p>
        </div>
      )}

      {/* Loading / Error */}
      {isLoading && (
        <div className="text-center py-8 text-gray-500">Зареждане...</div>
      )}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Грешка при зареждане на данните: {error.message}
        </div>
      )}

      {/* Stats Table */}
      {!isLoading && !error && (
        <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Поле
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Avg Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Fallback Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Общо Jobs
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {stats.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-sm text-gray-500"
                  >
                    Няма данни за избрания период
                  </td>
                </tr>
              ) : (
                stats.map((s: OcrFieldStat) => (
                  <tr
                    key={s.fieldName}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {s.fieldName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {(s.avgConfidence * 100).toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          s.fallbackRate > 0.2
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {(s.fallbackRate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {s.totalJobs}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() =>
                          setSelectedField(
                            selectedField === s.fieldName ? null : s.fieldName,
                          )
                        }
                        className="text-blue-600 hover:text-blue-800 underline text-xs"
                      >
                        {selectedField === s.fieldName ? 'Скрий' : 'Покажи trend'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Trend Chart */}
      {selectedField && (
        <div className="mt-6 rounded-lg border border-gray-200 p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">
            Trend за поле: <span className="text-blue-600">{selectedField}</span>
          </h2>
          {isTrendLoading ? (
            <div className="text-center py-4 text-gray-500">Зареждане...</div>
          ) : (
            <OcrTrendChart
              data={trendData ?? []}
              field={selectedField}
            />
          )}
        </div>
      )}

      {data && (
        <p className="mt-4 text-xs text-gray-400">
          Генерирано: {new Date(data.generatedAt).toLocaleString('bg-BG')}
          {data.tenantId ? ` · Тенант: ${data.tenantId}` : ' · Всички тенанти'}
        </p>
      )}
    </div>
  );
}
