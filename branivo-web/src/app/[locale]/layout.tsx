import { AppSidebar } from '@/components/app-sidebar';

export default function LocaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
