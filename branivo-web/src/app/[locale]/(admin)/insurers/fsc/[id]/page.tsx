'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowLeft,
  Globe,
  Phone,
  Mail,
  MapPin,
  Star,
  ExternalLink,
  FileText,
  Shield,
  Building2,
  Loader2,
  XCircle,
} from 'lucide-react';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaYoutube,
  FaTiktok,
  FaXTwitter,
} from 'react-icons/fa6';

const queryClient = new QueryClient();

interface FscInsurer {
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
  sourceUrl: string;
  scrapedAt: string;
  updatedAt: string;
}

async function fetchFscInsurer(id: string): Promise<FscInsurer> {
  const res = await fetch(`/api/v1/admin/insurers/fsc/${id}`);
  if (!res.ok) throw new Error('Not found');
  return res.json() as Promise<FscInsurer>;
}

// ─── Social icon detector ─────────────────────────────────────────────────────
function SocialIcon({ url }: { url: string }) {
  const lower = url.toLowerCase();
  const cls = 'w-5 h-5';

  if (lower.includes('facebook')) return <FaFacebook className={cls} />;
  if (lower.includes('instagram')) return <FaInstagram className={cls} />;
  if (lower.includes('linkedin')) return <FaLinkedin className={cls} />;
  if (lower.includes('youtube')) return <FaYoutube className={cls} />;
  if (lower.includes('tiktok')) return <FaTiktok className={cls} />;
  if (lower.includes('twitter') || lower.includes('x.com')) return <FaXTwitter className={cls} />;
  return <Globe className={cls} />;
}

function SocialLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"
    >
      <SocialIcon url={url} />
    </a>
  );
}

// ─── Star rating visual ───────────────────────────────────────────────────────
function StarRating({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-5 h-5 ${
            i <= Math.round(score)
              ? 'fill-green-500 text-green-500'
              : 'text-gray-200 fill-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 py-4 border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
          <Icon className="h-4 w-4 text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">{label}</p>
          <div className="text-sm text-slate-800 break-words">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Trade Registry auto-submit ───────────────────────────────────────────────
const REGISTRY_VERIFICATION_URL =
  'https://portal.registryagency.bg/CR/Reports/VerificationPersonOrg';
const REGISTRY_ACTIVE_URL =
  'https://portal.registryagency.bg/CR/Reports/ActiveCondition';

function openRegistryPage(url: string, eik: string): void {
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) return;
  const eikSafe = eik.replace(/[^0-9]/g, '');
  win.document.write(`<!DOCTYPE html>
<html lang="bg">
<head><meta charset="utf-8"><title>Търговски регистър</title></head>
<body>
<form id="f" method="POST" action="${url}">
  <input type="hidden" name="UIC" value="${eikSafe}" />
</form>
<script>document.getElementById('f').submit();</script>
</body>
</html>`);
  win.document.close();
}

// ─── Category badge ───────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  life_insurers: 'bg-emerald-100 text-emerald-700',
  non_life_insurers: 'bg-blue-100 text-blue-700',
  insurance_brokers: 'bg-purple-100 text-purple-700',
  reinsurers: 'bg-orange-100 text-orange-700',
};

// ─── Phone number list ────────────────────────────────────────────────────────
function splitPhones(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
}

// ─── Page Inner ───────────────────────────────────────────────────────────────
function FscInsurerDetailInner({ id }: { id: string }) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'bg';

  const { data: insurer, isLoading, error } = useQuery({
    queryKey: ['fsc-insurer', id],
    queryFn: () => fetchFscInsurer(id),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !insurer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white">
        <XCircle className="mb-3 h-12 w-12 text-red-400" />
        <p className="font-medium text-gray-700">Застрахователят не е намерен</p>
        <Link href={`/${locale}/insurers`} className="mt-4 text-sm text-blue-500 hover:underline">
          ← Обратно към списъка
        </Link>
      </div>
    );
  }

  const logoSrc =
    insurer.logoUrl ??
    `https://logo.clearbit.com/${insurer.website?.replace(/^https?:\/\/(www\.)?/, '') ?? ''}`;

  const phones = splitPhones(insurer.contactPhone);
  const categoryColor = CATEGORY_COLORS[insurer.categoryKey] ?? 'bg-gray-100 text-gray-600';
  const trustpilotPct = insurer.trustpilotScore ? (insurer.trustpilotScore / 5) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <Link
            href={`/${locale}/insurers`}
            className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Обратно към застрахователи
          </Link>

          <div className="flex items-start gap-6">
            {/* Logo */}
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center justify-center">
              <Image
                src={logoSrc}
                alt={insurer.name}
                width={80}
                height={80}
                className="object-contain p-2"
                unoptimized
                onError={undefined}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryColor}`}>
                  {insurer.categoryLabel}
                </span>
                {insurer.eik && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
                    ЕИК {insurer.eik}
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold text-slate-900 leading-tight mb-3">
                {insurer.name}
              </h1>

              <div className="flex flex-wrap items-center gap-4">
                {insurer.website && (
                  <a
                    href={insurer.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {insurer.website.replace(/^https?:\/\/(www\.)?/, '')}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                )}
                {insurer.socialLinks.length > 0 && (
                  <div className="flex items-center gap-2">
                    {insurer.socialLinks.map((link) => (
                      <SocialLink key={link} url={link} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Trustpilot score — right */}
            {insurer.trustpilotScore !== null && (
              <div className="shrink-0 text-center">
                <div className="inline-flex flex-col items-center gap-1 rounded-2xl border border-green-200 bg-green-50 px-5 py-3">
                  <span className="text-3xl font-bold text-green-600">
                    {insurer.trustpilotScore.toFixed(1)}
                  </span>
                  <StarRating score={insurer.trustpilotScore} />
                  <span className="text-xs text-slate-500">
                    {insurer.trustpilotReviewsCount
                      ? `${insurer.trustpilotReviewsCount.toLocaleString('bg-BG')} ревюта`
                      : 'Trustpilot'}
                  </span>
                  {insurer.trustpilotUrl && (
                    <a
                      href={insurer.trustpilotUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 text-xs text-green-700 hover:underline inline-flex items-center gap-1"
                    >
                      Виж ревютата <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Content grid ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left col — main info */}
        <div className="lg:col-span-2 space-y-6">

          {/* About */}
          {insurer.longDescription && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" /> За компанията
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {insurer.longDescription}
              </p>
            </div>
          )}

          {/* Trustpilot score bar (if scored) */}
          {insurer.trustpilotScore !== null && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Star className="h-4 w-4 text-green-500" /> Оценка от клиенти
              </h2>
              <div className="flex items-center gap-4 mb-4">
                <span className="text-5xl font-extrabold text-slate-900">
                  {insurer.trustpilotScore.toFixed(1)}
                </span>
                <div>
                  <StarRating score={insurer.trustpilotScore} />
                  <p className="text-xs text-slate-400 mt-1">
                    {insurer.trustpilotReviewsCount
                      ? `Базирано на ${insurer.trustpilotReviewsCount.toLocaleString('bg-BG')} ревюта в Trustpilot`
                      : 'Trustpilot'}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-700"
                  style={{ width: `${trustpilotPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0</span><span>5.0</span>
              </div>

              {insurer.trustpilotUrl && (
                <a
                  href={insurer.trustpilotUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                >
                  <Star className="h-4 w-4" /> Виж всички ревюта в Trustpilot
                  <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                </a>
              )}
            </div>
          )}

          {/* Documents & Licenses */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" /> Лицензи и документи
            </h2>

            <div className="space-y-3">
              {/* FSC License — confirmed by presence in registry */}
              <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <Shield className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">
                    Лиценз от КФН (Комисия за финансов надзор)
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Дружеството е вписано в регистъра на КФН като{' '}
                    <strong>{insurer.categoryLabel}</strong>.
                  </p>
                  <a
                    href={insurer.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:underline font-medium"
                  >
                    Провери в регистъра на КФН <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              {insurer.eik && (
                <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 p-4">
                  <Building2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800">
                      Търговски регистър
                    </p>
                    <p className="text-xs text-blue-600 mt-0.5 mb-3">
                      ЕИК: <strong>{insurer.eik}</strong>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openRegistryPage(REGISTRY_VERIFICATION_URL, insurer.eik!)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        <FileText className="h-3 w-3" />
                        Справка за дружество
                        <ExternalLink className="h-3 w-3 opacity-70" />
                      </button>
                      <button
                        onClick={() => openRegistryPage(REGISTRY_ACTIVE_URL, insurer.eik!)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                      >
                        <Shield className="h-3 w-3" />
                        Актуално състояние
                        <ExternalLink className="h-3 w-3 opacity-70" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 pt-1">
                Последно обновено: {new Date(insurer.updatedAt).toLocaleDateString('bg-BG')}
              </p>
            </div>
          </div>
        </div>

        {/* Right col — contact info */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-2">
              Контактна информация
            </h2>

            {insurer.officeAddress && (
              <InfoRow icon={MapPin} label="Адрес">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(insurer.officeAddress)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:text-blue-600 hover:underline"
                >
                  {insurer.officeAddress}
                </a>
              </InfoRow>
            )}

            {phones.length > 0 && (
              <InfoRow icon={Phone} label="Телефон">
                <div className="space-y-1">
                  {phones.map((p) => (
                    <a
                      key={p}
                      href={`tel:${p.replace(/\s/g, '')}`}
                      className="block hover:text-blue-600"
                    >
                      {p}
                    </a>
                  ))}
                </div>
              </InfoRow>
            )}

            {insurer.contactEmails.length > 0 && (
              <InfoRow icon={Mail} label="Имейл">
                <div className="space-y-1">
                  {insurer.contactEmails.map((e) => (
                    <a
                      key={e}
                      href={`mailto:${e}`}
                      className="block hover:text-blue-600 break-all"
                    >
                      {e}
                    </a>
                  ))}
                </div>
              </InfoRow>
            )}

            {insurer.website && (
              <InfoRow icon={Globe} label="Уебсайт">
                <a
                  href={insurer.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  {insurer.website.replace(/^https?:\/\/(www\.)?/, '')}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </InfoRow>
            )}
          </div>

          {/* Social links */}
          {insurer.socialLinks.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Социални мрежи
              </h2>
              <div className="flex flex-wrap gap-2">
                {insurer.socialLinks.map((link) => (
                  <SocialLink key={link} url={link} />
                ))}
              </div>
            </div>
          )}

          {/* FSC source */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs text-slate-400 mb-2">Официален източник</p>
            <a
              href={insurer.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 break-all"
            >
              КФН регистър <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function FscInsurerDetailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <FscInsurerDetailInner id={params.id} />
    </QueryClientProvider>
  );
}
