'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaYoutube,
  FaTiktok,
  FaXTwitter,
} from 'react-icons/fa6';
import { Globe, Zap, ChevronRight } from 'lucide-react';

interface FscSyncResponse {
  total: number;
  byCategory: Array<{ categoryKey: string; categoryLabel: string; url: string; imported: number }>;
  syncedAt: string;
}

interface FscSyncStatusResponse {
  runId: string | null;
  status: 'idle' | 'running' | 'success' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  total: number | null;
  byCategory: Array<{ categoryKey: string; categoryLabel: string; url: string; imported: number }>;
  errorMessage: string | null;
  logs: Array<{ at: string; level: 'info' | 'warn' | 'error'; message: string }>;
}

interface FscInsurerRecord {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  name: string;
  eik: string | null;
  officeAddress: string | null;
  website: string | null;
  contactDetails: string | null;
  contactPhone: string | null;
  contactEmails: string[];
  longDescription: string | null;
  logoUrl: string | null;
  socialLinks: string[];
  trustpilotUrl: string | null;
  trustpilotScore: number | null;
  trustpilotReviewsCount: number | null;
  trustpilotEnrichedAt: string | null;
  websiteEnrichedAt: string | null;
  sourceUrl: string;
  scrapedAt: string;
  updatedAt: string;
}

type FscCategoryKey = 'life_insurers' | 'non_life_insurers' | 'insurance_brokers' | 'reinsurers';

const FSC_TABS: Array<{ key: FscCategoryKey; label: string }> = [
  { key: 'life_insurers', label: 'Животозастраховане' },
  { key: 'non_life_insurers', label: 'Общо застраховане' },
  { key: 'insurance_brokers', label: 'Брокери' },
  { key: 'reinsurers', label: 'Презастрахователи' },
];

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok' | 'x' | 'web';

function detectSocialPlatform(url: string): SocialPlatform {
  const lower = url.toLowerCase();
  if (lower.includes('facebook.com')) return 'facebook';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('linkedin.com')) return 'linkedin';
  if (lower.includes('youtube.com')) return 'youtube';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'x';
  return 'web';
}

const SOCIAL_ICON_META: Record<
  SocialPlatform,
  { icon: React.ReactNode; color: string; label: string }
> = {
  facebook: {
    icon: <FaFacebook className="h-3.5 w-3.5" />,
    color: 'bg-[#1877F2] text-white hover:bg-[#0e65d4]',
    label: 'Facebook',
  },
  instagram: {
    icon: <FaInstagram className="h-3.5 w-3.5" />,
    color: 'bg-gradient-to-br from-[#E1306C] to-[#833AB4] text-white hover:opacity-90',
    label: 'Instagram',
  },
  linkedin: {
    icon: <FaLinkedin className="h-3.5 w-3.5" />,
    color: 'bg-[#0A66C2] text-white hover:bg-[#084d93]',
    label: 'LinkedIn',
  },
  youtube: {
    icon: <FaYoutube className="h-3.5 w-3.5" />,
    color: 'bg-[#FF0000] text-white hover:bg-[#cc0000]',
    label: 'YouTube',
  },
  tiktok: {
    icon: <FaTiktok className="h-3.5 w-3.5" />,
    color: 'bg-black text-white hover:bg-slate-800',
    label: 'TikTok',
  },
  x: {
    icon: <FaXTwitter className="h-3.5 w-3.5" />,
    color: 'bg-black text-white hover:bg-slate-800',
    label: 'X / Twitter',
  },
  web: {
    icon: <Globe className="h-3.5 w-3.5" />,
    color: 'bg-slate-200 text-slate-600 hover:bg-slate-300',
    label: 'Website',
  },
};

function SocialIconButton({ url }: { url: string }) {
  const platform = detectSocialPlatform(url);
  const meta = SOCIAL_ICON_META[platform];
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={meta.label}
      className={`flex h-6 w-6 items-center justify-center rounded-full transition-opacity ${meta.color}`}
    >
      {meta.icon}
    </a>
  );
}

function splitPhones(value: string | null): string[] {
  if (!value) return [];
  return value.split(';').map((p) => p.replace(/^тел\.?\s*/i, '').trim()).filter(Boolean);
}

function computeRanking(ins: FscInsurerRecord): number {
  let score = 0;
  if (ins.trustpilotScore !== null && ins.trustpilotScore !== undefined) {
    score += (ins.trustpilotScore / 5) * 60;
  }
  if (ins.website) score += 15;
  if (ins.logoUrl) score += 10;
  score += Math.min((ins.socialLinks?.length ?? 0) * 5, 15);
  return Math.round(score);
}

function StarRating({ score }: { score: number }) {
  const full = Math.floor(score);
  const hasHalf = score - full >= 0.3;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={
            i < full
              ? 'text-yellow-400'
              : i === full && hasHalf
                ? 'text-yellow-300'
                : 'text-gray-300'
          }
        >
          ★
        </span>
      ))}
      <span className="ml-1 text-xs font-semibold text-gray-700">{score.toFixed(1)}</span>
    </span>
  );
}

function InsurerLogoImage({
  logoUrl,
  website,
  name,
  initials,
}: {
  logoUrl: string | null;
  website: string | null;
  name: string;
  initials: string;
}) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [clearbitFailed, setClearbitFailed] = useState(false);

  const clearbitSrc = website ? `https://logo.clearbit.com/${extractDomain(website) ?? ''}` : null;

  if (!primaryFailed && logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className="h-12 w-12 rounded-lg object-contain border border-gray-100 bg-white p-1 flex-shrink-0"
        onError={() => setPrimaryFailed(true)}
      />
    );
  }

  if (!clearbitFailed && clearbitSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={clearbitSrc}
        alt={name}
        className="h-12 w-12 rounded-lg object-contain border border-gray-100 bg-white p-1.5 flex-shrink-0"
        onError={() => setClearbitFailed(true)}
      />
    );
  }

  return (
    <div className="h-12 w-12 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

function InsurerCard({ insurer, locale }: { insurer: FscInsurerRecord; locale: string }) {
  const phones = splitPhones(insurer.contactPhone);
  const ranking = computeRanking(insurer);
  const initials = insurer.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Card header */}
      <div className="flex items-start gap-3 p-4 border-b border-gray-100">
        <InsurerLogoImage
          logoUrl={insurer.logoUrl}
          website={insurer.website}
          name={insurer.name}
          initials={initials}
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/${locale}/insurers/fsc/${insurer.id}`}
            className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 hover:text-blue-600 hover:underline transition-colors"
          >
            {insurer.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {insurer.eik && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                ЕИК {insurer.eik}
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                ranking >= 70
                  ? 'bg-green-100 text-green-700'
                  : ranking >= 40
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              Рейтинг {ranking}/100
            </span>
          </div>
        </div>
      </div>

      {/* Trustpilot */}
      {(insurer.trustpilotScore !== null || insurer.trustpilotUrl) && (
        <div className="px-4 py-2 bg-green-50/60 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              {insurer.trustpilotScore !== null && (
                <StarRating score={insurer.trustpilotScore} />
              )}
              {insurer.trustpilotReviewsCount !== null && (
                <span className="text-xs text-gray-500">
                  {insurer.trustpilotReviewsCount.toLocaleString('bg-BG')} ревюта
                </span>
              )}
            </div>
            {insurer.trustpilotUrl && (
              <a
                href={insurer.trustpilotUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs font-medium text-green-700 hover:underline"
              >
                Trustpilot →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-col gap-2 p-4 flex-1 text-xs text-gray-600">
        {insurer.officeAddress && (
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 text-gray-400">📍</span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(insurer.officeAddress)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-blue-600 hover:underline line-clamp-2"
            >
              {insurer.officeAddress}
            </a>
          </div>
        )}

        {phones.length > 0 && (
          <div className="flex items-start gap-1.5">
            <span className="text-gray-400">📞</span>
            <div className="flex flex-wrap gap-x-2">
              {phones.map((phone) => (
                <a
                  key={phone}
                  href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {phone}
                </a>
              ))}
            </div>
          </div>
        )}

        {insurer.contactEmails.length > 0 && (
          <div className="flex items-start gap-1.5">
            <span className="text-gray-400">✉️</span>
            <div className="flex flex-wrap gap-x-2">
              {insurer.contactEmails.slice(0, 2).map((email) => (
                <a
                  key={email}
                  href={`mailto:${email}`}
                  className="hover:text-blue-600 hover:underline truncate max-w-[180px]"
                >
                  {email}
                </a>
              ))}
            </div>
          </div>
        )}

        {insurer.longDescription && (
          <p className="text-gray-500 line-clamp-3 leading-relaxed">
            {insurer.longDescription}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
        <div className="flex flex-wrap gap-1.5">
          {insurer.socialLinks?.slice(0, 5).map((link) => (
            <SocialIconButton key={link} url={link} />
          ))}
        </div>
        {insurer.website && (
          <a
            href={insurer.website}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[10px] text-blue-600 hover:underline truncate max-w-[120px]"
          >
            {insurer.website.replace(/^https?:\/\/(www\.)?/, '')}
          </a>
        )}
      </div>
    </div>
  );
}

async function syncFscInsurers(): Promise<FscSyncResponse> {
  const res = await fetch('/api/v1/admin/insurers/fsc/sync', {
    method: 'POST',
    credentials: 'include',
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string } & Partial<FscSyncResponse>;
  if (!res.ok) throw new Error(body.message ?? 'Грешка при FSC sync');
  return body as FscSyncResponse;
}

async function enrichTrustpilot(): Promise<{ enriched: number; failed: number; skipped: number }> {
  const res = await fetch('/api/v1/admin/insurers/fsc/trustpilot/enrich', {
    method: 'POST',
    credentials: 'include',
  });
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    enriched?: number;
    failed?: number;
    skipped?: number;
  };
  if (!res.ok) throw new Error(body.message ?? 'Грешка при Trustpilot enrich');
  return { enriched: body.enriched ?? 0, failed: body.failed ?? 0, skipped: body.skipped ?? 0 };
}

async function fetchFscInsurers(): Promise<FscInsurerRecord[]> {
  const res = await fetch('/api/v1/admin/insurers/fsc?limit=500', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch FSC insurers');
  return res.json() as Promise<FscInsurerRecord[]>;
}

async function fetchFscSyncStatus(): Promise<FscSyncStatusResponse> {
  const res = await fetch('/api/v1/admin/insurers/fsc/sync/status', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch FSC sync status');
  return res.json() as Promise<FscSyncStatusResponse>;
}

export default function AdminInsurersPage() {
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'bg';
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncPolling, setIsSyncPolling] = useState(false);
  const [activeFscTab, setActiveFscTab] = useState<FscCategoryKey>('life_insurers');
  const [fscSearch, setFscSearch] = useState('');

  const { data: fscInsurers = [], isLoading: isFscLoading } = useQuery<FscInsurerRecord[]>({
    queryKey: ['admin', 'insurers', 'fsc'],
    queryFn: fetchFscInsurers,
    staleTime: 60_000,
  });

  const { data: syncStatus } = useQuery<FscSyncStatusResponse>({
    queryKey: ['admin', 'insurers', 'fsc', 'sync-status'],
    queryFn: fetchFscSyncStatus,
    enabled: user.role === 'super_admin' && isSyncPolling,
    retry: false,
    refetchInterval: isSyncPolling ? 1500 : false,
    staleTime: 0,
  });

  const syncMutation = useMutation({
    mutationFn: syncFscInsurers,
    onMutate: () => { setIsSyncPolling(true); setSyncMessage('FSC sync стартиран...'); },
    onSuccess: (result) => {
      setSyncMessage(`FSC sync успешно. Импортирани записи: ${result.total}.`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'insurers'] });
    },
    onError: (err: unknown) => {
      setSyncMessage(err instanceof Error ? err.message : 'Грешка при FSC sync');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'insurers', 'fsc', 'sync-status'] });
    },
    onSettled: () => { setIsSyncPolling(false); },
  });

  const trustpilotMutation = useMutation({
    mutationFn: enrichTrustpilot,
    onMutate: () => { setSyncMessage('Trustpilot обогатяване стартирано...'); },
    onSuccess: (result) => {
      setSyncMessage(
        `Trustpilot готово: намерени ${result.enriched}, пропуснати ${result.skipped}, грешки ${result.failed}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'insurers', 'fsc'] });
    },
    onError: (err: unknown) => {
      setSyncMessage(err instanceof Error ? err.message : 'Грешка при Trustpilot enrich');
    },
  });

  const filteredFscInsurers = fscInsurers
    .filter((row) => row.categoryKey === activeFscTab)
    .filter((row) => {
      const q = fscSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.eik ?? '').includes(q) ||
        (row.website ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => computeRanking(b) - computeRanking(a));

  const totalInTab = fscInsurers.filter((r) => r.categoryKey === activeFscTab).length;
  const withTrustpilot = filteredFscInsurers.filter((r) => r.trustpilotScore !== null).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Застрахователи</h1>
        </div>
        {user.role === 'super_admin' && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setSyncMessage(null); syncMutation.mutate(); }}
              disabled={syncMutation.isPending}
              className="rounded-md border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {syncMutation.isPending ? 'Sync...' : 'Sync FSC'}
            </button>
            <button
              onClick={() => { setSyncMessage(null); trustpilotMutation.mutate(); }}
              disabled={trustpilotMutation.isPending}
              className="rounded-md border border-green-400 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
            >
              {trustpilotMutation.isPending ? 'Обогатяване...' : '⭐ Trustpilot Enrich'}
            </button>
          </div>
        )}
      </div>

      {/* API Partners quick-access banner */}
      <Link
        href={`/${locale}/insurers/partners`}
        className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 hover:from-blue-100 hover:to-indigo-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-900">API Партньори</p>
            <p className="text-xs text-blue-600">
              Управление на интеграции, API ключове и мониторинг на реалните застрахователи
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-blue-400 shrink-0" />
      </Link>

      {syncMessage && (
        <p className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {syncMessage}
        </p>
      )}

      {(syncStatus?.logs?.length ?? 0) > 0 && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">FSC Sync Debug</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                syncStatus?.status === 'running'
                  ? 'bg-yellow-100 text-yellow-700'
                  : syncStatus?.status === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
              }`}
            >
              {syncStatus?.status === 'running' ? 'В процес' : syncStatus?.status === 'error' ? 'Грешка' : 'Готово'}
            </span>
          </div>
          {syncStatus?.errorMessage && (
            <p className="mb-2 text-xs text-red-600">{syncStatus.errorMessage}</p>
          )}
          <div className="max-h-56 overflow-auto rounded border border-gray-100 bg-gray-50 p-2 font-mono text-xs text-gray-700">
            {(syncStatus?.logs ?? []).slice().reverse().map((log, idx) => (
              <div key={`${log.at}-${idx}`} className="mb-1">
                [{new Date(log.at).toLocaleTimeString('bg-BG')}] {log.level.toUpperCase()} {log.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FSC Registry — Cards */}
      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">FSC регистър</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isFscLoading ? 'Зареждане...' : `${filteredFscInsurers.length} от ${totalInTab} | ${withTrustpilot} с Trustpilot`}
            </p>
          </div>
          <input
            value={fscSearch}
            onChange={(e) => setFscSearch(e.target.value)}
            placeholder="Търси застраховател..."
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-56"
          />
        </div>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {FSC_TABS.map((tab) => {
            const count = fscInsurers.filter((r) => r.categoryKey === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveFscTab(tab.key); setFscSearch(''); }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  tab.key === activeFscTab ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 text-xs ${tab.key === activeFscTab ? 'opacity-80' : 'text-gray-400'}`}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Cards grid */}
        {isFscLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-48 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filteredFscInsurers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">
            {fscSearch ? 'Няма резултати за търсенето' : 'Няма FSC записи в базата. Натиснете Sync FSC.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredFscInsurers.map((row) => (
              <InsurerCard key={row.id} insurer={row} locale={locale} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
