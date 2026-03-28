'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowLeft,
  Settings,
  Key,
  Zap,
  Activity,
  Star,
  Clock,
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Globe,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { useInsurerDetail, type InsurerDetail } from '@/lib/hooks/use-insurer-detail';


// ─── Score Gauge ─────────────────────────────────────────────────────────────
function ScoreGauge({
  value,
  max,
  label,
  color,
}: {
  value: number;
  max: number;
  label: string;
  color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const circumference = 2 * Math.PI * 36;
  const dash = (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{value.toFixed(1)}</span>
        </div>
      </div>
      <span className="text-xs text-slate-400 text-center">{label}</span>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function CircuitBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    CLOSED: { label: 'Активен', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    OPEN: { label: 'Прекъснат', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
    HALF_OPEN: { label: 'Тестване', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  };
  const { label, cls } = cfg[state] ?? cfg['CLOSED'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {label}
    </span>
  );
}

// ─── Wizard Step definitions ──────────────────────────────────────────────────
const WIZARD_STEPS = [
  { id: 'info', label: 'Обща информация', icon: Shield },
  { id: 'api', label: 'API Конфигурация', icon: Settings },
  { id: 'key', label: 'API Ключ', icon: Key },
  { id: 'test', label: 'Тест на връзката', icon: Zap },
];

// ─── Wizard ───────────────────────────────────────────────────────────────────
function IntegrationWizard({ insurer, id }: { insurer: InsurerDetail; id: string }) {
  const { updateConfig, isUpdating, setApiKey, isSettingKey, runTest, isTesting, testResult } =
    useInsurerDetail(id);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: insurer.name,
    adapterClass: insurer.adapterClass,
    apiEndpoint: insurer.apiEndpoint ?? '',
    logoUrl: insurer.logoUrl ?? '',
    description: insurer.description ?? '',
    rating: insurer.rating,
    claimSpeed: insurer.claimSpeed,
  });
  const [apiKey, setApiKeyValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savedStep, setSavedStep] = useState<number | null>(null);

  const handleInfoSave = async () => {
    await updateConfig({
      name: form.name,
      logoUrl: form.logoUrl || undefined,
      description: form.description || undefined,
      rating: form.rating,
      claimSpeed: form.claimSpeed,
    });
    setSavedStep(0);
    setStep(1);
  };

  const handleApiSave = async () => {
    await updateConfig({
      adapterClass: form.adapterClass,
      apiEndpoint: form.apiEndpoint || undefined,
    });
    setSavedStep(1);
    setStep(2);
  };

  const handleKeySave = async () => {
    if (!apiKey.trim()) return;
    await setApiKey(apiKey);
    setApiKeyValue('');
    setSavedStep(2);
    setStep(3);
  };

  const inputCls =
    'w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/40 transition-all text-sm';
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5';

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-5">Интеграционен Wizard</h2>

      {/* Step tabs */}
      <div className="flex items-center gap-1 mb-6">
        {WIZARD_STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = savedStep !== null && i <= savedStep;
          return (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                  : isDone
                  ? 'text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {isDone && !isActive ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <Icon className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:block">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Step 0: Info */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Наименование</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>Logo URL</label>
            <input
              className={inputCls}
              placeholder="https://..."
              value={form.logoUrl}
              onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>Описание</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Рейтинг (0–5)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                className={inputCls}
                value={form.rating}
                onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className={labelCls}>Скорост щета (0–10)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                className={inputCls}
                value={form.claimSpeed}
                onChange={(e) => setForm((f) => ({ ...f, claimSpeed: Number(e.target.value) }))}
              />
            </div>
          </div>
          <WizardNav
            onNext={handleInfoSave}
            isLoading={isUpdating}
            nextLabel="Запази и продължи"
          />
        </div>
      )}

      {/* Step 1: API Config */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Adapter Class</label>
            <input
              className={inputCls}
              placeholder="MockInsurerAdapter"
              value={form.adapterClass}
              onChange={(e) => setForm((f) => ({ ...f, adapterClass: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>API Endpoint URL</label>
            <input
              className={inputCls}
              placeholder="https://api.insurer.bg/v1"
              value={form.apiEndpoint}
              onChange={(e) => setForm((f) => ({ ...f, apiEndpoint: e.target.value }))}
            />
          </div>
          <WizardNav onBack={() => setStep(0)} onNext={handleApiSave} isLoading={isUpdating} />
        </div>
      )}

      {/* Step 2: API Key */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            API ключът се записва криптиран с AES-256-GCM и никога не се връща в GET отговор.
          </div>
          <div>
            <label className={labelCls}>Нов API ключ</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                className={inputCls}
                placeholder="Въведи новия API ключ..."
                value={apiKey}
                onChange={(e) => setApiKeyValue(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <Key className="w-4 h-4" />
              </button>
            </div>
          </div>
          <WizardNav
            onBack={() => setStep(1)}
            onNext={handleKeySave}
            isLoading={isSettingKey}
            nextLabel="Запази ключа"
            nextDisabled={apiKey.length < 8}
          />
        </div>
      )}

      {/* Step 3: Test */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Изпрати HEAD заявка до конфигурирания API endpoint и провери connectivity.
          </p>
          <button
            onClick={runTest}
            disabled={isTesting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-medium text-sm transition-all"
          >
            {isTesting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Тестване...</>
            ) : (
              <><Zap className="w-4 h-4" /> Стартирай тест</>
            )}
          </button>

          {testResult && (
            <div
              className={`flex items-start gap-3 p-4 rounded-xl border ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${testResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                  {testResult.success ? 'Успешна връзка' : 'Неуспешна връзка'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{testResult.message}</p>
                <p className="text-xs text-slate-500 mt-0.5">Latency: {testResult.latencyMs}ms</p>
              </div>
            </div>
          )}

          <WizardNav onBack={() => setStep(2)} />
        </div>
      )}
    </div>
  );
}

function WizardNav({
  onBack,
  onNext,
  isLoading,
  nextLabel = 'Продължи',
  nextDisabled = false,
}: {
  onBack?: () => void;
  onNext?: () => void | Promise<void>;
  isLoading?: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Назад
        </button>
      ) : (
        <span />
      )}
      {onNext && (
        <button
          onClick={onNext}
          disabled={isLoading ?? nextDisabled}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-sm font-medium transition-all"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {nextLabel} <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Health Metrics Panel ─────────────────────────────────────────────────────
function HealthPanel({ insurer }: { insurer: InsurerDetail }) {
  const statusColor =
    insurer.circuitState === 'CLOSED'
      ? 'text-emerald-400'
      : insurer.circuitState === 'OPEN'
      ? 'text-red-400'
      : 'text-amber-400';

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">Health Monitor</h2>
        <CircuitBadge state={insurer.circuitState} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Metric
          label="Error Rate (5m)"
          value={`${insurer.errorRate5min.toFixed(2)}%`}
          icon={AlertCircle}
          color={insurer.errorRate5min > 5 ? 'text-red-400' : 'text-emerald-400'}
        />
        <Metric
          label="Avg Latency"
          value={`${insurer.avgLatencyMs}ms`}
          icon={Clock}
          color={insurer.avgLatencyMs > 3000 ? 'text-amber-400' : 'text-blue-400'}
        />
        <Metric
          label="Calls (5m)"
          value={String(insurer.totalCalls5min)}
          icon={Activity}
          color="text-purple-400"
        />
      </div>

      <div className="border-t border-slate-700/50 pt-4">
        <p className={`text-xs font-medium ${statusColor}`}>
          Circuit breaker: {insurer.circuitState}
        </p>
        {insurer.isManuallyDisabled && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
            Ръчно деактивиран: {insurer.disabledReason}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-slate-800/40 rounded-xl p-3 text-center">
      <Icon className={`w-5 h-5 mx-auto mb-1.5 ${color}`} />
      <p className="text-white font-semibold text-sm">{value}</p>
      <p className="text-slate-500 text-xs mt-0.5">{label}</p>
    </div>
  );
}

// ─── FSC Data Panel ───────────────────────────────────────────────────────────
function FscPanel({ insurer }: { insurer: InsurerDetail }) {
  const fsc = insurer.fsc;
  if (!fsc) return null;

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">FSC Данни</h2>

      {fsc.trustpilotScore !== null && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-slate-800/40 rounded-xl">
          <div className="text-2xl font-bold text-emerald-400">{fsc.trustpilotScore}</div>
          <div>
            <p className="text-sm text-white font-medium">Trustpilot Score</p>
            <p className="text-xs text-slate-400">{fsc.trustpilotReviewsCount ?? 0} ревюта</p>
          </div>
          {fsc.trustpilotUrl && (
            <a href={fsc.trustpilotUrl} target="_blank" rel="noreferrer" className="ml-auto">
              <ExternalLink className="w-4 h-4 text-slate-400 hover:text-white" />
            </a>
          )}
        </div>
      )}

      {fsc.website && (
        <a
          href={fsc.website}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 mb-3"
        >
          <Globe className="w-4 h-4" /> {fsc.website}
        </a>
      )}

      {fsc.officeAddress && (
        <p className="text-xs text-slate-400 mb-2">{fsc.officeAddress}</p>
      )}
      {fsc.contactPhone && (
        <p className="text-xs text-slate-400 mb-2">Тел: {fsc.contactPhone}</p>
      )}
      {fsc.contactEmails.length > 0 && (
        <p className="text-xs text-slate-400 mb-2">
          Email: {fsc.contactEmails.join(', ')}
        </p>
      )}

      {fsc.longDescription && (
        <p className="text-xs text-slate-500 mt-3 leading-relaxed line-clamp-4">
          {fsc.longDescription}
        </p>
      )}
    </div>
  );
}

// ─── Page Inner ───────────────────────────────────────────────────────────────
function InsurerDetailInner({ id }: { id: string }) {
  const router = useRouter();
  const { insurer, isLoading, error } = useInsurerDetail(id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error || !insurer) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-white font-medium">Застрахователят не е намерен</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-blue-400 hover:text-blue-300"
          >
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  const logoSrc =
    insurer.logoUrl ??
    insurer.fsc?.logoUrl ??
    `https://logo.clearbit.com/${insurer.fsc?.website?.replace(/^https?:\/\//, '') ?? insurer.code + '.bg'}`;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Hero Section ── */}
      <div className="relative overflow-hidden">
        {/* Animated gradient background */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(ellipse at 20% 50%, #1d4ed8 0%, transparent 60%),
                         radial-gradient(ellipse at 80% 50%, #7c3aed 0%, transparent 60%)`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950" />

        <div className="relative max-w-6xl mx-auto px-6 py-10">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Назад към застрахователи
          </button>

          <div className="flex items-start gap-6">
            {/* Logo */}
            <div className="w-20 h-20 rounded-2xl bg-slate-800/60 border border-slate-700/50 overflow-hidden shrink-0 flex items-center justify-center">
              <Image
                src={logoSrc}
                alt={insurer.name}
                width={80}
                height={80}
                className="object-contain p-2"
                unoptimized
              />
            </div>

            {/* Name + badges */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-2">{insurer.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-lg bg-slate-700/60 text-slate-300 text-xs font-mono">
                  {insurer.code}
                </span>
                <CircuitBadge state={insurer.circuitState} />
                {insurer.isManuallyDisabled && (
                  <span className="px-2 py-0.5 rounded-lg bg-red-500/20 text-red-300 text-xs border border-red-500/30">
                    Деактивиран
                  </span>
                )}
              </div>
              {insurer.description && (
                <p className="mt-3 text-sm text-slate-400 max-w-2xl">{insurer.description}</p>
              )}
            </div>

            {/* Score gauges */}
            <div className="hidden lg:flex items-center gap-6">
              <ScoreGauge
                value={insurer.rating}
                max={5}
                label="Рейтинг"
                color="#22c55e"
              />
              <ScoreGauge
                value={insurer.claimSpeed}
                max={10}
                label="Скорост щета"
                color="#3b82f6"
              />
              <ScoreGauge
                value={insurer.errorRate5min > 0 ? Math.max(0, 100 - insurer.errorRate5min * 10) : 100}
                max={100}
                label="Uptime Score"
                color="#a855f7"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Content Grid ── */}
      <div className="max-w-6xl mx-auto px-6 pb-12">
        {/* Mobile gauges */}
        <div className="lg:hidden flex items-center justify-center gap-8 mb-6 p-4 bg-slate-900/40 rounded-2xl border border-slate-700/40">
          <ScoreGauge value={insurer.rating} max={5} label="Рейтинг" color="#22c55e" />
          <ScoreGauge value={insurer.claimSpeed} max={10} label="Щети" color="#3b82f6" />
          <ScoreGauge
            value={insurer.errorRate5min > 0 ? Math.max(0, 100 - insurer.errorRate5min * 10) : 100}
            max={100}
            label="Uptime"
            color="#a855f7"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Integration Wizard — full width on top, then left col */}
          <div className="lg:col-span-2 space-y-6">
            <IntegrationWizard insurer={insurer} id={id} />

            {/* Scoring weights visualization */}
            <ScoringWeightsPanel />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <HealthPanel insurer={insurer} />
            <FscPanel insurer={insurer} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scoring Weights Visual ───────────────────────────────────────────────────
function ScoringWeightsPanel() {
  const weights = [
    { label: 'Цена', pct: 40, color: '#3b82f6', icon: Star },
    { label: 'Рейтинг', pct: 30, color: '#22c55e', icon: Shield },
    { label: 'Скорост щета', pct: 20, color: '#f59e0b', icon: Clock },
    { label: 'Екстри', pct: 10, color: '#a855f7', icon: Activity },
  ];

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-1">Алгоритъм за класиране</h2>
      <p className="text-xs text-slate-500 mb-5">
        Стандартни тегла — клиентите могат да ги персонализират чрез NLP предпочитания.
      </p>
      <div className="space-y-3">
        {weights.map((w) => {
          const Icon = w.icon;
          return (
            <div key={w.label} className="flex items-center gap-3">
              <Icon className="w-4 h-4 shrink-0" style={{ color: w.color }} />
              <span className="text-sm text-slate-300 w-28 shrink-0">{w.label}</span>
              <div className="flex-1 bg-slate-800/60 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${w.pct}%`, background: w.color }}
                />
              </div>
              <span className="text-sm font-semibold text-white w-8 text-right">{w.pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page Export ──────────────────────────────────────────────────────────────
export default function InsurerDetailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <InsurerDetailInner id={params.id} />
    </QueryClientProvider>
  );
}
