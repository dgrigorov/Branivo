'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const forgotPasswordSchema = z.object({
  email: z.string().email('Невалиден имейл адрес'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const handleSubmit = async (data: ForgotPasswordFormValues) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json() as { message?: string; error?: string };
        if (res.status === 429) {
          setError('Твърде много заявки. Моля, изчакайте преди да опитате отново.');
        } else {
          setError(typeof body.error === 'string' ? body.error : 'Възникна грешка. Моля, опитайте отново.');
        }
        return;
      }
      setIsSuccess(true);
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
        <h1 className="text-2xl font-semibold">Забравена парола</h1>

        {isSuccess ? (
          <div className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-700">
            Ако имейлът съществува, ще получите линк за смяна на паролата.
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              Въведете имейл адреса си и ще получите линк за смяна на паролата.
            </p>
            {error && (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <form onSubmit={handleFormSubmit(handleSubmit)} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Имейл
                </label>
                <input
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {formState.errors.email && (
                  <p className="text-xs text-red-600">
                    {formState.errors.email.message}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Изпращане…' : 'Изпрати линк'}
              </button>
            </form>
          </>
        )}

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
