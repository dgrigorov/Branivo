'use client';

import { useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const changeRoleSchema = z.object({
  role: z.enum(['broker_admin', 'broker_agent', 'broker_viewer'], {
    error: () => ({ message: 'Изберете валидна роля' }),
  }),
});

type ChangeRoleFormValues = z.infer<typeof changeRoleSchema>;

interface ChangeRoleModalProps {
  userId: string;
  currentRole: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function ChangeRoleModal({
  userId,
  currentRole,
  onSuccess,
  onClose,
}: ChangeRoleModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangeRoleFormValues>({
    resolver: zodResolver(changeRoleSchema),
    defaultValues: {
      role: currentRole as ChangeRoleFormValues['role'],
    },
  });

  const onSubmit = async (data: ChangeRoleFormValues) => {
    setServerError(null);
    try {
      const res = await fetch(`/api/v1/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: data.role }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? 'Грешка при смяна на роля');
      }
      onSuccess();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Неочаквана грешка');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold mb-4">Смяна на роля</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Нова роля</label>
            <SelectField {...register('role')}>
              <option value="broker_admin">Администратор</option>
              <option value="broker_agent">Брокер агент</option>
              <option value="broker_viewer">Само четене</option>
            </SelectField>
            {errors.role && (
              <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>
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
              {isSubmitting ? 'Запазване...' : 'Смени'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
