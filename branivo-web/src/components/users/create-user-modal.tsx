'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email('Невалиден имейл адрес'),
  role: z.enum(['broker_agent', 'broker_viewer'], {
    error: () => ({ message: 'Изберете валидна роля' }),
  }),
  password: z
    .string()
    .min(8, 'Минимум 8 символа')
    .regex(
      /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/,
      'Трябва да съдържа главна буква, цифра и специален символ',
    ),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

interface CreateUserModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

export function CreateUserModal({ onSuccess, onClose }: CreateUserModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'broker_agent' },
  });

  const onSubmit = async (data: CreateUserFormValues) => {
    setServerError(null);
    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? 'Грешка при създаване на потребител');
      }
      onSuccess();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Неочаквана грешка');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Добавяне на потребител</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Имейл</label>
            <input
              type="email"
              {...register('email')}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="user@example.com"
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Роля</label>
            <select {...register('role')} className="w-full border rounded px-3 py-2 text-sm">
              <option value="broker_agent">Брокер агент</option>
              <option value="broker_viewer">Само четене</option>
            </select>
            {errors.role && (
              <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Парола</label>
            <input
              type="password"
              {...register('password')}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-red-500 text-sm">{serverError}</p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
            >
              Отказ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Запазване...' : 'Добави'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
