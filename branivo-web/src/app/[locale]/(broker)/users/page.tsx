'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateUserModal } from '@/components/users/create-user-modal';
import { ChangeRoleModal } from '@/components/users/change-role-modal';

interface UserItem {
  id: string;
  tenantId: string;
  email: string;
  role: 'broker_admin' | 'broker_agent' | 'broker_viewer';
  twoFaEnabled: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<UserItem['role'], string> = {
  broker_admin: 'Администратор',
  broker_agent: 'Брокер агент',
  broker_viewer: 'Само четене',
};

const ROLE_BADGE_CLASSES: Record<UserItem['role'], string> = {
  broker_admin: 'bg-purple-100 text-purple-800',
  broker_agent: 'bg-blue-100 text-blue-800',
  broker_viewer: 'bg-gray-100 text-gray-700',
};

async function fetchUsers(): Promise<UserItem[]> {
  const res = await fetch('/api/v1/users', { credentials: 'include' });
  if (!res.ok) throw new Error('Грешка при зареждане на потребителите');
  return res.json() as Promise<UserItem[]>;
}

async function deleteUser(userId: string): Promise<void> {
  const res = await fetch(`/api/v1/users/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Грешка при изтриване на потребителя');
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [changeRoleUser, setChangeRoleUser] = useState<UserItem | null>(null);

  const { data: users, isLoading, error } = useQuery<UserItem[]>({
    queryKey: ['users', 'list'],
    queryFn: fetchUsers,
  });

  const handleDelete = async (userId: string) => {
    if (!confirm('Сигурни ли сте, че искате да изтриете този потребител?')) return;
    try {
      await deleteUser(userId);
      await queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
    } catch {
      alert('Грешка при изтриване');
    }
  };

  if (isLoading) {
    return <div className="p-6 text-gray-500">Зареждане...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-500">Грешка при зареждане на потребителите</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Потребители</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          + Добави потребител
        </button>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
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
            {users?.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">{user.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}
                  >
                    {ROLE_LABELS[user.role]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {user.twoFaEnabled ? '✓' : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString('bg-BG')}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setChangeRoleUser(user)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Смяна на роля
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      Изтрий
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Няма потребители
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserModal
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {changeRoleUser && (
        <ChangeRoleModal
          userId={changeRoleUser.id}
          currentRole={changeRoleUser.role}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
            setChangeRoleUser(null);
          }}
          onClose={() => setChangeRoleUser(null)}
        />
      )}
    </div>
  );
}
