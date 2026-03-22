'use client';

import { useQuery } from '@tanstack/react-query';
import SystemNotificationBanner from './components/system-notification-banner';

interface TenantConfig {
  status: string;
}

async function fetchTenantConfig(): Promise<TenantConfig> {
  const res = await fetch('/api/v1/tenants/config', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch tenant config');
  const body = await res.json() as { data: TenantConfig };
  return body.data;
}

export default function BrokerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: config } = useQuery({
    queryKey: ['tenant', 'config'],
    queryFn: fetchTenantConfig,
    staleTime: 60_000,
  });

  const isSuspended = config?.status === 'suspended';

  return (
    <div>
      <SystemNotificationBanner />
      {isSuspended && (
        <div
          className="border-l-4 border-red-400 bg-red-50 p-4"
          role="alert"
          aria-live="polite"
        >
          <p className="font-medium text-red-700">
            Акаунтът е временно деактивиран. Само преглед на данни е разрешен.
          </p>
        </div>
      )}
      {children}
    </div>
  );
}
