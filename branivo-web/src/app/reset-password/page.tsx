'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Паролата трябва да е поне 8 символа'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Паролите не съвпадат',
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const handleSubmit = async (data: ResetPasswordFormValues) => {
    if (!token) {
      setError('Невалиден линк. Моля, поискайте нов.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: data.newPassword }),
      });
      if (!res.ok) {
        const body = await res.json() as { message?: string; error?: string };
        if (res.status === 400) {
          setError('Линкът е изтекъл или вече е използван. Поискайте нов.');
        } else {
          setError(typeof body.error === 'string' ? body.error : 'Възникна грешка. Моля, опитайте отново.');
        }
        return;
      }
      window.location.href = '/login?reset=success';
    } catch {
      setError('Мрежова грешка. Моля, опитайте отново.');
    } finally {
      setIsLoading(false);
    }
  };

  const { register, handleSubmit: handleFormSubmit, formState } = form;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Нова парола</h1>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
            {error.includes('изтекъл') && (
              <span>
                {' '}
                <a href="/forgot-password" className="underline">
                  Поискайте нов линк
                </a>
                .
              </span>
            )}
          </div>
        )}

        <form onSubmit={handleFormSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Нова парола
            </label>
            <input
              {...register('newPassword')}
              type="password"
              autoComplete="new-password"
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {formState.errors.newPassword && (
              <p className="text-xs text-red-600">
                {formState.errors.newPassword.message}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Потвърди парола
            </label>
            <input
              {...register('confirmPassword')}
              type="password"
              autoComplete="new-password"
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {formState.errors.confirmPassword && (
              <p className="text-xs text-red-600">
                {formState.errors.confirmPassword.message}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Запазване…' : 'Запази нова парола'}
          </button>
        </form>

        <a
          href="/login"
          className="block text-center text-sm text-gray-500 hover:text-gray-700"
        >
          Обратно към вход
        </a>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Зареждане…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
