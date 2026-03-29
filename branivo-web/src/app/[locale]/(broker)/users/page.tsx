'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/hooks/use-current-user';

interface UserItem {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  twoFaEnabled: boolean;
  createdAt: string;
}

interface UsersPage {
  items: UserItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin:  'Супер Админ',
  admin:        'Администратор',
  broker_admin: 'Брокер Админ',
  broker_agent: 'Брокер Агент',
  broker_viewer: 'Само четене',
  fleet_admin:  'Fleet Админ',
  fleet_viewer: 'Fleet Viewer',
  client:       'Клиент',
  driver:       'Шофьор',
};

const ROLE_BADGE: Record<string, string> = {
  super_admin:  'bg-red-100 text-red-700',
  admin:        'bg-purple-100 text-purple-700',
  broker_admin: 'bg-indigo-100 text-indigo-700',
  broker_agent: 'bg-blue-100 text-blue-700',
  broker_viewer: 'bg-gray-100 text-gray-600',
  fleet_admin:  'bg-teal-100 text-teal-700',
  fleet_viewer: 'bg-cyan-100 text-cyan-700',
  client:       'bg-green-100 text-green-700',
  driver:       'bg-orange-100 text-orange-700',
};

const PAGE_SIZE = 20;

async function fetchUsers(page: number, search: string): Promise<UsersPage> {
  const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search) qs.set('search', search);
  const res = await fetch(`/api/v1/users?${qs.toString()}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Грешка при зареждане на потребителите');
  return res.json() as Promise<UsersPage>;
}

async function deleteUser(userId: string): Promise<void> {
  const res = await fetch(`/api/v1/users/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Грешка при изтриване');
}

export default function UsersPage() {
  const router = useRouter();
  const { role } = useCurrentUser();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (role && role !== 'super_admin' && role !== 'admin') {
      router.replace('/bg/tenants');
    }
  }, [role, router]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, error } = useQuery<UsersPage>({
    queryKey: ['users', 'list', page, search],
    queryFn: () => fetchUsers(page, search),
    enabled: role === 'super_admin' || role === 'admin',
  });

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Изтриване на "${email}"?`)) return;
    try {
      await deleteUser(userId);
      await queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
    } catch {
      alert('Грешка при изтриване');
    }
  };

  if (!role) {
    return <div className="p-6 text-gray-400">Зареждане...</div>;
  }

  if (role !== 'super_admin' && role !== 'admin') {
    return null;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Потребители</h1>
        <Link
          href="/bg/users/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + Добави потребител
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Търси по имейл..."
          className="w-full max-w-sm rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Зареждане...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">Грешка при зареждане</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Имейл</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Роля</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">2FA</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Добавен</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.items.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{user.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[user.role] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {user.twoFaEnabled ? '✓' : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString('bg-BG')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/bg/users/${user.id}/edit`}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Редактирай
                      </Link>
                      <button
                        onClick={() => handleDelete(user.id, user.email)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Изтрий
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Няма намерени потребители
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} от {data.total}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Назад
            </button>
            {Array.from({ length: data.totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === data.totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-3 py-1.5 text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`px-3 py-1.5 rounded border ${page === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    {p}
                  </button>
                ),
              )}
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Напред →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
