'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/hooks/use-current-user';

const ROLE_OPTIONS = [
  { value: 'broker_admin', label: 'Брокер Админ' },
  { value: 'broker_agent', label: 'Брокер Агент' },
  { value: 'broker_viewer', label: 'Само четене' },
  { value: 'fleet_admin', label: 'Fleet Админ' },
  { value: 'fleet_viewer', label: 'Fleet Viewer' },
  { value: 'admin', label: 'Администратор' },
];

interface FormState {
  email: string;
  role: string;
  password: string;
}

export default function UserNewPage() {
  const router = useRouter();
  const { role } = useCurrentUser();

  const [form, setForm] = useState<FormState>({ email: '', role: 'broker_agent', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (role && role !== 'super_admin' && role !== 'admin') {
      router.replace('/bg/tenants');
    }
  }, [role, router]);

  const handleChange = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.email || !form.password || !form.role) {
      setError('Всички полета са задължителни');
      return;
    }
    if (form.password.length < 8) {
      setError('Паролата трябва да е минимум 8 символа');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? 'Грешка при създаване');
      }
      router.push('/bg/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неочаквана грешка');
    } finally {
      setSubmitting(false);
    }
  };

  if (!role) return <div className="p-6 text-gray-400">Зареждане...</div>;
  if (role !== 'super_admin' && role !== 'admin') return null;

  return (
    <div className="p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/bg/users" className="text-sm text-gray-500 hover:text-gray-700">
          ← Потребители
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-semibold">Нов потребител</h1>
      </div>

      <div className="bg-white rounded-lg border p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Имейл</label>
            <input
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              placeholder="user@example.com"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Роля</label>
            <select
              value={form.role}
              onChange={handleChange('role')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Парола</label>
            <input
              type="password"
              value={form.password}
              onChange={handleChange('password')}
              placeholder="Минимум 8 символа"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Link
              href="/bg/users"
              className="flex-1 text-center px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              Отказ
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Запазване...' : 'Добави потребител'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
