import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SUPPORTED_LOCALES = ['bg', 'en'] as const;
const DEFAULT_LOCALE = 'bg';
const NOT_FOUND_PATH = '/not-found';

// Routes accessible without authentication
const PUBLIC_PATHS = [
  '/login',
  '/not-found',
];

// Routes that should NOT get a locale prefix (handled at root level)
const NO_LOCALE_PREFIX_PATHS = [
  '/login',
  '/not-found',
  '/dashboard',
];

// Locale-prefixed public paths (e.g. /bg/onboarding/...)
const PUBLIC_LOCALE_PREFIXES = ['/onboarding'];

function isPublicPath(pathname: string): boolean {
  // Strip locale prefix first, then check
  const normalized = pathname.replace(/^\/(bg|en)(\/|$)/, '/');
  return (
    PUBLIC_PATHS.some((p) => normalized === p || normalized.startsWith(p + '/')) ||
    PUBLIC_LOCALE_PREFIXES.some((p) => normalized === p || normalized.startsWith(p + '/'))
  );
}

type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Detect locale from:
 * 1. request.geo.country (Vercel edge — production)
 * 2. Accept-Language header (fallback for local dev & non-Vercel)
 */
function detectLocale(request: NextRequest): Locale {
  // Vercel populates request.geo on edge runtime
  const country = request.geo?.country?.toUpperCase();
  if (country === 'BG') return 'bg';
  if (country && country !== 'BG') return 'en';

  // Accept-Language fallback (e.g. "bg-BG,bg;q=0.9,en;q=0.8")
  const acceptLang = request.headers.get('accept-language') ?? '';
  const primary = acceptLang.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
  if (primary?.startsWith('bg')) return 'bg';

  return DEFAULT_LOCALE;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Skip static assets and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Auth guard — redirect to /login if no access_token on protected routes
  if (!isPublicPath(pathname)) {
    const token = request.cookies.get('access_token')?.value;
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // If path already starts with a supported locale, skip locale redirect
  const hasLocale = SUPPORTED_LOCALES.some(
    (loc) => pathname === `/${loc}` || pathname.startsWith(`/${loc}/`),
  );

  const host = request.headers.get('host') ?? '';
  const hostname = host.split(':')[0];

  // Tenant resolution (skip for localhost — single demo tenant)
  let tenantHeaders: Record<string, string> = {};
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const apiUrl = process.env.API_INTERNAL_URL ?? process.env.BRANIVO_API_URL ?? '';
    if (apiUrl) {
      try {
        const res = await fetch(`${apiUrl}/api/v1/tenants/config`, {
          headers: { host: hostname },
          next: { revalidate: 3600 },
        });

        if (!res.ok) {
          return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
        }

        const body = (await res.json()) as {
          data: { id: string; slug: string; name: string };
        };

        tenantHeaders = {
          'x-tenant-id': body.data.id,
          'x-tenant-slug': body.data.slug,
        };
      } catch {
        return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
      }
    }
  }

  // Locale redirect — only for non-locale-prefixed, non-public paths
  const needsLocale =
    !hasLocale &&
    !NO_LOCALE_PREFIX_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (needsLocale) {
    const locale = detectLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname}`;
    const response = NextResponse.redirect(url);
    for (const [k, v] of Object.entries(tenantHeaders)) {
      response.headers.set(k, v);
    }
    return response;
  }

  const response = NextResponse.next();
  for (const [k, v] of Object.entries(tenantHeaders)) {
    response.headers.set(k, v);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
