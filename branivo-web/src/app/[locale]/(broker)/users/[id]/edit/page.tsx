'use client';

import { useEffect, useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { useRouter, useParams } from 'next/navigation';
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

interface UserData {
  id: string;
  email: string;
  role: string;
  twoFaEnabled: boolean;
  createdAt: string;
}

export default function UserEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { role } = useCurrentUser();

  const [user, setUser] = useState<UserData | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (role && role !== 'super_admin' && role !== 'admin') {
      router.replace('/bg/tenants');
    }
  }, [role, router]);

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/v1/users/${params.id}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Потребителят не е намерен');
        return res.json() as Promise<UserData>;
      })
      .then((data) => {
        setUser(data);
        setSelectedRole(data.role);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Грешка при зареждане');
        setLoading(false);
      });
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/users/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: selectedRole }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? 'Грешка при запазване');
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
        <h1 className="text-xl font-semibold">Редактиране на потребител</h1>
      </div>

      <div className="bg-white rounded-lg border p-6">
        {loading ? (
          <div className="text-gray-400 text-sm">Зареждане...</div>
        ) : error && !user ? (
          <div className="text-red-500 text-sm">{error}</div>
        ) : user ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Имейл</label>
              <input
                type="text"
                value={user.email}
                disabled
                className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Роля</label>
              <SelectField
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectField>
            </div>

            <div className="flex gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              <span>2FA: {user.twoFaEnabled ? 'Включено' : 'Изключено'}</span>
              <span>·</span>
              <span>Добавен: {new Date(user.createdAt).toLocaleDateString('bg-BG')}</span>
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
                disabled={submitting || selectedRole === user.role}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Запазване...' : 'Запази промените'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
