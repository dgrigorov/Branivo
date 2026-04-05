'use client';

import { useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { webFetch, webPost, webPatch } from '@/lib/web-fetch';

interface SystemNotification {
  id: string;
  adminId: string;
  target: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  dismissible: boolean;
  isActive: boolean;
  sentAt: string;
}

interface CreateNotificationBody {
  message: string;
  type: 'info' | 'warning' | 'critical';
  tenantId?: string;
}

async function fetchNotifications(): Promise<SystemNotification[]> {
  return webFetch<SystemNotification[]>('/api/v1/admin/notifications');
}

async function createNotification(body: CreateNotificationBody): Promise<SystemNotification> {
  return webPost<SystemNotification>('/api/v1/admin/notifications', body);
}

async function deactivateNotification(id: string): Promise<void> {
  await webPatch<unknown>(`/api/v1/admin/notifications/${id}/deactivate`);
}

const TYPE_BADGE: Record<SystemNotification['type'], { label: string; className: string }> = {
  info: { label: 'Info', className: 'bg-blue-100 text-blue-700' },
  warning: { label: 'Warning', className: 'bg-yellow-100 text-yellow-700' },
  critical: { label: 'Critical', className: 'bg-red-100 text-red-700' },
};

export default function SystemNotificationsPage() {
  const queryClient = useQueryClient();

  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'warning' | 'critical'>('info');
  const [tenantId, setTenantId] = useState('');
  const [formError, setFormError] = useState('');
  const [deactivateError, setDeactivateError] = useState('');

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: fetchNotifications,
  });

  const createMutation = useMutation({
    mutationFn: createNotification,
    onSuccess: () => {
      setMessage('');
      setType('info');
      setTenantId('');
      setFormError('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
    },
    onError: () => {
      setFormError('Грешка при изпращане на известието. Опитайте отново.');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateNotification,
    onSuccess: () => {
      setDeactivateError('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
    },
    onError: () => {
      setDeactivateError('Грешка при деактивиране. Опитайте отново.');
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!message.trim()) {
      setFormError('Съобщението не може да е празно.');
      return;
    }
    const body: CreateNotificationBody = { message: message.trim(), type };
    if (tenantId.trim()) {
      body.tenantId = tenantId.trim();
    }
    createMutation.mutate(body);
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Системни известия</h1>

      {/* New notification form */}
      <section className="mb-8 bg-white border rounded p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Ново известие</h2>
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="message" className="block text-sm font-medium mb-1">
              Съобщение
            </label>
            <textarea
              id="message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border rounded p-2 text-sm"
              placeholder="Въведете текст на известието..."
            />
          </div>

          <div className="mb-4">
            <label htmlFor="type" className="block text-sm font-medium mb-1">
              Тип
            </label>
            <SelectField
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as 'info' | 'warning' | 'critical')}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </SelectField>
          </div>

          <div className="mb-4">
            <label htmlFor="tenantId" className="block text-sm font-medium mb-1">
              Тенант ID (оставете празно за всички тенанти)
            </label>
            <input
              id="tenantId"
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full border rounded p-2 text-sm"
              placeholder="UUID на тенанта или празно за broadcast"
            />
          </div>

          {formError && (
            <p className="text-red-600 text-sm mb-3">{formError}</p>
          )}

          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {createMutation.isPending ? 'Изпращане…' : 'Изпрати известие'}
          </button>
        </form>
      </section>

      {/* Notification list */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Изпратени известия</h2>
        {deactivateError && (
          <p className="text-red-600 text-sm mb-3">{deactivateError}</p>
        )}
        {isLoading && <p className="text-sm text-gray-500">Зареждане…</p>}
        {!isLoading && notifications.length === 0 && (
          <p className="text-sm text-gray-500">Няма изпратени известия.</p>
        )}
        <ul className="space-y-3">
          {notifications.map((n) => {
            const badge = TYPE_BADGE[n.type];
            return (
              <li key={n.id} className="bg-white border rounded p-4 shadow-sm flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${n.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {n.isActive ? 'Активно' : 'Неактивно'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {n.target === 'all' ? 'Всички тенанти' : `Тенант: ${n.target}`}
                    </span>
                  </div>
                  <p className="text-sm">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(n.sentAt).toLocaleString('bg-BG')}
                  </p>
                </div>
                {n.isActive && (
                  <button
                    type="button"
                    onClick={() => deactivateMutation.mutate(n.id)}
                    disabled={deactivateMutation.isPending}
                    className="ml-4 text-sm text-red-600 hover:underline disabled:opacity-50"
                    aria-label={`Деактивирай известие ${n.id}`}
                  >
                    Деактивирай
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
