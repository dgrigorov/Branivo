'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const inviteSchema = z.object({
  name: z.string().min(1, 'Името е задължително'),
  slug: z
    .string()
    .min(1, 'Slug-ът е задължителен')
    .regex(/^[a-z0-9-]+$/, 'Само малки букви, цифри и тирета'),
  email: z.string().email('Невалиден имейл адрес'),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

interface InviteTenantModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function InviteTenantModal({ onSuccess, onClose }: InviteTenantModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState } =
    useForm<InviteFormValues>({
      resolver: zodResolver(inviteSchema),
      defaultValues: { name: '', slug: '', email: '' },
    });

  const nameValue = watch('name');

  useEffect(() => {
    if (nameValue) {
      setValue('slug', slugify(nameValue), { shouldValidate: false });
    }
  }, [nameValue, setValue]);

  const slugValue = watch('slug');

  const onSubmit = async (data: InviteFormValues) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/admin/tenants/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json() as { message?: string };
        setError(body.message ?? 'Грешка при изпращане на покана');
        return;
      }
      onSuccess();
    } catch {
      setError('Мрежова грешка. Моля, опитайте отново.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Покани нов брокер</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Затвори"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Организация"
            error={formState.errors.name?.message}
          >
            <input
              {...register('name')}
              type="text"
              placeholder="Застрахователен брокер ЕООД"
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField
            label="Slug"
            error={formState.errors.slug?.message}
          >
            <input
              {...register('slug')}
              type="text"
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {slugValue && (
              <p className="mt-1 text-xs text-gray-500">
                Домейн: <strong>{slugValue}.branivo.bg</strong>
              </p>
            )}
          </FormField>

          <FormField
            label="Имейл на брокера"
            error={formState.errors.email?.message}
          >
            <input
              {...register('email')}
              type="email"
              placeholder="broker@example.com"
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Отказ
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Изпращане...' : 'Изпрати покана'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
