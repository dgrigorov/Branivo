import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { TenantViewProvider } from '@/lib/context/tenant-view-context';

export default function LocaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TenantViewProvider>
      <div className="flex min-h-dvh">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </TenantViewProvider>
  );
}
