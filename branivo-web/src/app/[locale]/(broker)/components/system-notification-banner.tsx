'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface SystemNotification {
  id: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  dismissible: boolean;
}

async function fetchActiveNotifications(): Promise<SystemNotification[]> {
  const res = await fetch('/api/v1/admin/notifications/active', {
    credentials: 'include',
  });
  if (!res.ok) return [];
  return res.json() as Promise<SystemNotification[]>;
}

async function dismissNotification(id: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/notifications/${id}/dismiss`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to dismiss notification');
}

const typeStyles: Record<SystemNotification['type'], string> = {
  critical: 'border-red-400 bg-red-50 text-red-700',
  warning: 'border-yellow-400 bg-yellow-50 text-yellow-700',
  info: 'border-blue-400 bg-blue-50 text-blue-700',
};

export default function SystemNotificationBanner() {
  const queryClient = useQueryClient();
  const [locallyDismissed, setLocallyDismissed] = useState<Set<string>>(new Set());

  const { data: notifications = [] } = useQuery({
    queryKey: ['system-notifications', 'active'],
    queryFn: fetchActiveNotifications,
    staleTime: 30_000,
  });

  const dismissMutation = useMutation({
    mutationFn: dismissNotification,
    onMutate: (id: string) => {
      setLocallyDismissed((prev) => new Set(prev).add(id));
      return { id };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['system-notifications', 'active'] });
    },
    onError: (_err, _id, context) => {
      if (context) {
        setLocallyDismissed((prev) => {
          const next = new Set(prev);
          next.delete(context.id);
          return next;
        });
      }
    },
  });

  const visible = notifications.filter((n) => !locallyDismissed.has(n.id));

  if (visible.length === 0) return null;

  return (
    <div role="region" aria-label="System notifications">
      {visible.map((notification) => (
        <div
          key={notification.id}
          className={`border-l-4 p-4 flex items-start justify-between ${typeStyles[notification.type]}`}
          role="alert"
          aria-live="polite"
        >
          <p className="font-medium">{notification.message}</p>
          {notification.dismissible && (
            <button
              type="button"
              aria-label="Dismiss notification"
              className="ml-4 font-bold leading-none"
              onClick={() => dismissMutation.mutate(notification.id)}
            >
              &times;
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
