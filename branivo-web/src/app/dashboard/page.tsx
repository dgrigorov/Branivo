import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return typeof parsed.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const headersList = await headers();
  const cookieStore = await cookies();
  const acceptLang = headersList.get('accept-language') ?? '';
  const primary = acceptLang.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
  const locale = primary?.startsWith('bg') ? 'bg' : 'en';

  const token = cookieStore.get('access_token')?.value;
  const role = token ? decodeJwtRole(token) : null;

  if (role === 'super_admin') {
    redirect(`/${locale}/tenants`);
  }

  redirect(`/${locale}/users`);
}
