import React from 'react';
import { headers } from 'next/headers';

interface TenantBranding {
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string;
  brand_name?: string;
}

async function fetchTenantBranding(host: string): Promise<TenantBranding> {
  try {
    const res = await fetch(`${process.env.BRANIVO_API_URL}/api/v1/tenants/config`, {
      headers: { Host: host },
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    const body = (await res.json()) as { data: { branding?: TenantBranding } };
    return body.data?.branding ?? {};
  } catch {
    return {};
  }
}

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server Component — applies tenant CSS variables
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost';
  const branding = await fetchTenantBranding(host);

  const cssVars: Record<string, string> = {};
  if (branding.primary_color) cssVars['--color-primary'] = branding.primary_color;
  if (branding.secondary_color) cssVars['--color-secondary'] = branding.secondary_color;

  return (
    <div style={cssVars as React.CSSProperties}>
      {children}
    </div>
  );
}
