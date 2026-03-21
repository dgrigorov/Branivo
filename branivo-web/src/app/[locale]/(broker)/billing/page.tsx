'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface CommissionPolicyItem {
  id: string;
  insurerId: string;
  insurerName: string;
  productType: string;
  premiumAmount: number;
  commissionPct: number;
  commissionAmount: number;
  commissionStatus: 'confirmed' | 'pending';
  createdAt: string;
}

interface CommissionByInsurer {
  insurerId: string;
  insurerName: string;
  policiesCount: number;
  totalPremium: number;
  totalCommission: number;
}

interface CommissionSummary {
  totalPolicies: number;
  totalPremium: number;
  totalCommission: number;
  currency: string;
}

interface CommissionDashboardResponse {
  summary: CommissionSummary;
  byInsurer: CommissionByInsurer[];
  policies: CommissionPolicyItem[];
}

interface ApiResponse {
  data: CommissionDashboardResponse;
}

interface FetchParams {
  dateFrom?: string;
  dateTo?: string;
  insurerId?: string;
}

async function fetchDashboard(
  params: FetchParams,
): Promise<CommissionDashboardResponse> {
  const query = new URLSearchParams();
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);
  if (params.insurerId) query.set('insurerId', params.insurerId);

  const url = `/api/v1/commissions${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Грешка при зареждане на данните');
  const body = await res.json() as ApiResponse;
  return body.data;
}

function formatBgn(amount: number): string {
  return new Intl.NumberFormat('bg-BG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function StatusBadge({ status }: { status: 'confirmed' | 'pending' }) {
  if (status === 'confirmed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        Потвърден
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
      Обработва се
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-24" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-32" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-12" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-20" /></td>
    </tr>
  );
}

export default function CommissionDashboardPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [insurerFilter, setInsurerFilter] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);

  const fetchParams: FetchParams = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    insurerId: insurerFilter || undefined,
  };

  const { data, isLoading, error } = useQuery<CommissionDashboardResponse>({
    queryKey: ['commissions', 'dashboard', fetchParams],
    queryFn: () => fetchDashboard(fetchParams),
    staleTime: 30_000,
    refetchInterval: false,
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Комисионен Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Общо полици</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {isLoading ? (
              <span className="inline-block h-8 w-12 bg-gray-200 rounded animate-pulse" />
            ) : (
              (data?.summary.totalPolicies ?? 0)
            )}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Обща премия</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {isLoading ? (
              <span className="inline-block h-8 w-20 bg-gray-200 rounded animate-pulse" />
            ) : (
              `${formatBgn(data?.summary.totalPremium ?? 0)} ${data?.summary.currency ?? 'BGN'}`
            )}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Обща комисиона</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {isLoading ? (
              <span className="inline-block h-8 w-20 bg-gray-200 rounded animate-pulse" />
            ) : (
              `${formatBgn(data?.summary.totalCommission ?? 0)} ${data?.summary.currency ?? 'BGN'}`
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 flex gap-4 items-end">
        <div>
          <label
            htmlFor="filter-date-from"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            От дата
          </label>
          <input
            id="filter-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="filter-date-to"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            До дата
          </label>
          <input
            id="filter-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Застраховател
          </label>
          <select
            value={insurerFilter}
            onChange={(e) => setInsurerFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
            aria-label="Застраховател"
          >
            <option value="">Всички</option>
            {data?.byInsurer.map((ins) => (
              <option key={ins.insurerId} value={ins.insurerId}>
                {ins.insurerName}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            setDateFrom('');
            setDateTo('');
            setInsurerFilter('');
            setSelectedPolicyId(null);
          }}
          className="px-3 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50"
        >
          Изчисти
        </button>
      </div>

      {/* By Insurer Breakdown */}
      {!isLoading && data && data.byInsurer.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="font-medium text-gray-800">По застраховател</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Застраховател</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Полици</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Премия (BGN)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Комисиона (BGN)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.byInsurer.map((row) => (
                <tr
                  key={row.insurerId}
                  className={`hover:bg-gray-50 cursor-pointer ${
                    insurerFilter === row.insurerId ? 'bg-blue-50' : ''
                  }`}
                  onClick={() =>
                    setInsurerFilter(
                      insurerFilter === row.insurerId ? '' : row.insurerId,
                    )
                  }
                >
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {row.insurerName}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {row.policiesCount}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatBgn(row.totalPremium)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">
                    {formatBgn(row.totalCommission)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-blue-600 hover:underline">
                      {insurerFilter === row.insurerId
                        ? 'Изчисти филтър'
                        : 'Филтрирай'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Policies List */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="font-medium text-gray-800">Комисиони по полица</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Застраховател</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Продукт</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Премия (BGN)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">% Комисиона</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Комисиона (BGN)</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            )}
            {!isLoading && error && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-red-500">
                  Грешка при зареждане на данните
                </td>
              </tr>
            )}
            {!isLoading && !error && data?.policies.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Няма комисиони за избрания период
                </td>
              </tr>
            )}
            {!isLoading &&
              !error &&
              data?.policies.map((policy) => (
                <tr
                  key={policy.id}
                  className={`cursor-pointer hover:bg-gray-50 ${
                    selectedPolicyId === policy.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''
                  }`}
                  onClick={() =>
                    setSelectedPolicyId(
                      selectedPolicyId === policy.id ? null : policy.id,
                    )
                  }
                >
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(policy.createdAt).toLocaleDateString('bg-BG')}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{policy.insurerName}</td>
                  <td className="px-4 py-3 text-gray-700">{policy.productType}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatBgn(policy.premiumAmount)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {(policy.commissionPct * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">
                    {formatBgn(policy.commissionAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={policy.commissionStatus} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
