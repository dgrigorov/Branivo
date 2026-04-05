'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { webPost } from '@/lib/web-fetch';

interface BillingRunBody {
  tenantId?: string;
}

interface BillingRunResponse {
  message?: string;
  error?: string;
}

interface InvoiceRow {
  id: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  policiesCount: number;
  amountDue: number;
  status: 'pending' | 'paid' | 'failed';
}

async function triggerBillingRun(body: BillingRunBody): Promise<BillingRunResponse> {
  return webPost<BillingRunResponse>('/api/v1/admin/billing/run', body);
}

export default function AdminBillingPage() {
  const [tenantIdInput, setTenantIdInput] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: triggerBillingRun,
    onSuccess: (data) => {
      setSuccessMessage(data.message ?? 'Billing run initiated successfully');
    },
  });

  function handleRunAll() {
    setSuccessMessage(null);
    mutation.mutate({});
  }

  function handleRunForTenant() {
    if (!tenantIdInput.trim()) return;
    setSuccessMessage(null);
    mutation.mutate({ tenantId: tenantIdInput.trim() });
  }

  // Mock recent invoices for display
  const mockInvoices: InvoiceRow[] = [
    {
      id: 'inv-001',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      policiesCount: 8,
      amountDue: 279.0,
      status: 'paid',
    },
    {
      id: 'inv-002',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      periodStart: '2025-12-01',
      periodEnd: '2025-12-31',
      policiesCount: 5,
      amountDue: 211.5,
      status: 'paid',
    },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin — Monthly Billing</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Manual Billing Run</h2>

        <div className="flex gap-3 mb-4">
          <button
            onClick={handleRunAll}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Running…' : 'Run Billing for All Tenants'}
          </button>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={tenantIdInput}
            onChange={(e) => setTenantIdInput(e.target.value)}
            placeholder="Tenant UUID (optional)"
            className="border rounded px-3 py-2 flex-1 text-sm"
          />
          <button
            onClick={handleRunForTenant}
            disabled={mutation.isPending || !tenantIdInput.trim()}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
          >
            Run for Tenant
          </button>
        </div>

        {mutation.isPending && (
          <p className="mt-3 text-blue-600 text-sm">Initiating billing run…</p>
        )}

        {successMessage && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
            {successMessage}
          </div>
        )}

        {mutation.isError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
            Error: {mutation.error instanceof Error ? mutation.error.message : 'Unknown error'}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Invoices</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-4">Period</th>
              <th className="pb-2 pr-4">Tenant ID</th>
              <th className="pb-2 pr-4">Policies</th>
              <th className="pb-2 pr-4">Amount Due (BGN)</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {mockInvoices.map((inv) => (
              <tr key={inv.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {inv.periodStart} – {inv.periodEnd}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{inv.tenantId}</td>
                <td className="py-2 pr-4">{inv.policiesCount}</td>
                <td className="py-2 pr-4">{inv.amountDue.toFixed(2)}</td>
                <td className="py-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      inv.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : inv.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {inv.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
