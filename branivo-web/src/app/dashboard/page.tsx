import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const headersList = await headers();
  const acceptLang = headersList.get('accept-language') ?? '';
  const primary = acceptLang.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
  const locale = primary?.startsWith('bg') ? 'bg' : 'en';
  redirect(`/${locale}/users`);
}
