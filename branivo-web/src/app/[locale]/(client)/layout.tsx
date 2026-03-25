import React from 'react';
import { headers } from 'next/headers';
import { RegulatoryFooter } from './components/regulatory-footer';

interface TenantConfig {
  branding?: {
    primary_color?: string;
    secondary_color?: string;
    logo_url?: string;
    brand_name?: string;
  };
  regulatory?: {
    kfn_license?: string | null;
    ein_code?: string | null;
  };
  legal?: {
    legal_name?: string | null;
  };
}

async function fetchTenantConfig(host: string): Promise<TenantConfig> {
  try {
    const res = await fetch(`${process.env.BRANIVO_API_URL}/api/v1/tenants/config`, {
      headers: { Host: host },
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    const body = (await res.json()) as { data: TenantConfig };
    return body.data ?? {};
  } catch {
    return {};
  }
}

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server Component — applies tenant CSS variables and regulatory footer
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost';
  const config = await fetchTenantConfig(host);

  const cssVars: Record<string, string> = {};
  if (config.branding?.primary_color) cssVars['--color-primary'] = config.branding.primary_color;
  if (config.branding?.secondary_color) cssVars['--color-secondary'] = config.branding.secondary_color;

  return (
    <div style={cssVars as React.CSSProperties} className="flex min-h-screen flex-col">
      {children}
      <RegulatoryFooter
        kfnLicense={config.regulatory?.kfn_license ?? null}
        einCode={config.regulatory?.ein_code ?? null}
        legalName={config.legal?.legal_name ?? null}
      />
    </div>
  );
}
