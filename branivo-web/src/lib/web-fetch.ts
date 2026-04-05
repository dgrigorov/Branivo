'use client';

/**
 * Shared fetch utility for client-side admin pages.
 *
 * On 401: automatically calls /api/auth/refresh and retries once.
 * On failed refresh: redirects to /login.
 *
 * Use webFetch / webPost / webPatch / webDelete instead of raw fetch
 * in all admin page components.
 */

async function refreshTokens(): Promise<boolean> {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  return res.ok;
}

function redirectToLogin(): never {
  if (typeof window !== 'undefined') {
    window.location.href = `/login?from=${encodeURIComponent(window.location.pathname)}`;
  }
  throw new Error('Session expired');
}

export async function webFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' });

  if (res.status === 401) {
    const refreshed = await refreshTokens();
    if (!refreshed) redirectToLogin();

    const retry = await fetch(url, { ...options, credentials: 'include' });
    if (retry.status === 401) redirectToLogin();
    if (!retry.ok) {
      const err = (await retry.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message ?? 'API грешка');
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? 'API грешка');
  }
  return res.json() as Promise<T>;
}

export async function webPost<T>(url: string, body?: unknown): Promise<T> {
  return webFetch<T>(url, {
    method: 'POST',
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
}

export async function webPatch<T>(url: string, body?: unknown): Promise<T> {
  return webFetch<T>(url, {
    method: 'PATCH',
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
}

export async function webDelete(url: string): Promise<void> {
  await webFetch<unknown>(url, { method: 'DELETE' });
}
