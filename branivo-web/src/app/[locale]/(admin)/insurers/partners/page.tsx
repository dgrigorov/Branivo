'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Shield,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronRight,
  Loader2,
  Zap,
} from 'lucide-react';


interface PartnerInsurer {
  insurerId: string;
  insurerName: string;
  insurerCode: string;
  circuitState: string;
  errorRate5min: number;
  avgLatencyMs: number;
  totalCalls5min: number;
  isManuallyDisabled: boolean;
  disabledReason: string | null;
}

async function fetchPartners(): Promise<PartnerInsurer[]> {
  const res = await fetch('/api/v1/admin/insurers/monitor');
  if (!res.ok) throw new Error('Failed to load partners');
  return res.json() as Promise<PartnerInsurer[]>;
}

function CircuitDot({ state }: { state: string }) {
  const color =
    state === 'CLOSED'
      ? 'bg-emerald-400'
      : state === 'OPEN'
      ? 'bg-red-400'
      : 'bg-amber-400';
  return <span className={`w-2 h-2 rounded-full ${color} animate-pulse`} />;
}

function PartnerCard({ p, locale }: { p: PartnerInsurer; locale: string }) {
  return (
    <Link
      href={`/${locale}/insurers/${p.insurerId}`}
      className="group block bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 hover:border-blue-500/40 hover:bg-slate-800/60 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm group-hover:text-blue-300 transition-colors">
              {p.insurerName}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{p.insurerCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CircuitDot state={p.circuitState} />
          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="text-center">
          <p
            className={`text-sm font-bold ${
              p.errorRate5min > 5 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {p.errorRate5min.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Error rate</p>
        </div>
        <div className="text-center">
          <p
            className={`text-sm font-bold ${
              p.avgLatencyMs > 3000 ? 'text-amber-400' : 'text-blue-400'
            }`}
          >
            {p.avgLatencyMs}ms
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Latency</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-purple-400">{p.totalCalls5min}</p>
          <p className="text-xs text-slate-500 mt-0.5">Calls (5m)</p>
        </div>
      </div>

      {p.isManuallyDisabled && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-300">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          {p.disabledReason ?? 'Ръчно деактивиран'}
        </div>
      )}
    </Link>
  );
}

function PartnersContent() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'bg';

  const { data: partners, isLoading, error } = useQuery({
    queryKey: ['insurer-partners'],
    queryFn: fetchPartners,
    refetchInterval: 30_000,
  });

  const healthy = partners?.filter((p) => p.circuitState === 'CLOSED' && !p.isManuallyDisabled).length ?? 0;
  const total = partners?.length ?? 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">API Партньори</h1>
          </div>
          <p className="text-slate-400 text-sm">
            Активни застрахователни интеграции с реално-времеви Circuit Breaker мониторинг.
          </p>

          {partners && (
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300">{healthy} здрави</span>
              </div>
              {total - healthy > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-300">{total - healthy} с проблеми</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Activity className="w-4 h-4" />
                <span>Обновява се на 30s</span>
              </div>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300">
            <XCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">Грешка при зареждане на партньорите.</p>
          </div>
        )}

        {partners && partners.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Няма конфигурирани API партньори.</p>
          </div>
        )}

        {partners && partners.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {partners.map((p) => (
              <PartnerCard key={p.insurerId} p={p} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PartnersPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <PartnersContent />
    </QueryClientProvider>
  );
}
