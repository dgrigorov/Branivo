'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import QRCode from 'qrcode';

interface OnboardingStatus {
  tenantId: string;
  email: string;
  tenantName: string;
  tenantStatus: 'invited' | 'stripe_connected' | 'active';
}

const kfnSchema = z.object({
  kfn_license: z
    .string()
    .min(3, 'КФН номерът трябва да е поне 3 цифри')
    .max(10, 'КФН номерът трябва да е най-много 10 цифри')
    .regex(/^\d+$/, 'КФН номерът трябва да съдържа само цифри'),
});

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Минимум 8 символа')
      .regex(/[A-Z]/, 'Трябва поне 1 главна буква')
      .regex(/\d/, 'Трябва поне 1 цифра')
      .regex(/[^A-Za-z\d]/, 'Трябва поне 1 специален символ'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Паролите не съвпадат',
    path: ['confirmPassword'],
  });

type KfnFormValues = z.infer<typeof kfnSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

function OnboardingContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Невалиден линк за регистрация');
      setIsLoading(false);
      return;
    }

    fetch(`/api/v1/admin/tenants/onboarding/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Невалиден или изтекъл линк');
        return res.json() as Promise<OnboardingStatus>;
      })
      .then((data) => setStatus(data))
      .catch(() =>
        setError(
          'Линкът за регистрация е невалиден или изтекъл. Свържете се с вашия акаунт мениджър за нова покана.',
        ),
      )
      .finally(() => setIsLoading(false));
  }, [token]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Зареждане...</p>
      </div>
    );
  }

  if (error || !status) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold text-red-800">
            Невалидна покана
          </h1>
          <p className="text-sm text-red-700">
            {error ??
              'Свържете се с вашия акаунт мениджър за нова покана.'}
          </p>
        </div>
      </main>
    );
  }

  if (setupComplete && otpauthUrl) {
    return (
      <TotpSetupStep tenantName={status.tenantName} otpauthUrl={otpauthUrl} />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">
            Добре дошли, {status.tenantName}!
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Завършете регистрацията на вашата брокерска организация.
          </p>
        </div>

        {status.tenantStatus === 'invited' && (
          <StripeConnectStep token={token!} tenantId={status.tenantId} />
        )}

        {status.tenantStatus === 'stripe_connected' && (
          <KfnVerifyStep
            token={token!}
            tenantId={status.tenantId}
            onSuccess={() => {
              setStatus((s) => s ? { ...s, tenantStatus: 'active' } : s);
            }}
          />
        )}

        {status.tenantStatus === 'active' && (
          <PasswordSetupStep
            token={token!}
            onSuccess={(url) => {
              setOtpauthUrl(url);
              setSetupComplete(true);
            }}
          />
        )}
      </div>
    </main>
  );
}

function StripeConnectStep({
  token,
  tenantId,
}: {
  token: string;
  tenantId: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  void tenantId;

  const handleStripeConnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/tenants/onboarding/${token}/stripe-connect`,
        { method: 'POST' },
      );
      const body = await res.json() as { onboardingUrl?: string; message?: string };
      if (!res.ok) {
        setError(body.message ?? 'Грешка при свързване с Stripe');
        return;
      }
      if (body.onboardingUrl) {
        window.location.href = body.onboardingUrl;
      }
    } catch {
      setError('Мрежова грешка. Моля, опитайте отново.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-medium">Стъпка 1: Stripe Connect</h2>
      <p className="mb-4 text-sm text-gray-600">
        Свържете вашата организация с Stripe, за да можете да приемате плащания.
      </p>
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        onClick={handleStripeConnect}
        disabled={isLoading}
        className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {isLoading ? 'Пренасочване...' : 'Свържи с Stripe →'}
      </button>
    </div>
  );
}

function KfnVerifyStep({
  token,
  tenantId,
  onSuccess,
}: {
  token: string;
  tenantId: string;
  onSuccess: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  void tenantId;

  const { register, handleSubmit, formState } = useForm<KfnFormValues>({
    resolver: zodResolver(kfnSchema),
  });

  const onSubmit = async (data: KfnFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/tenants/onboarding/${token}/verify-kfn`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) {
        const body = await res.json() as { message?: string };
        setError(body.message ?? 'Невалиден КФН лиценз');
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
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-medium">Стъпка 2: КФН Верификация</h2>
      <p className="mb-4 text-sm text-gray-600">
        Въведете вашия КФН лиценз номер за потвърждение.
      </p>
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            КФН Лиценз №
          </label>
          <input
            {...register('kfn_license')}
            type="text"
            placeholder="123456"
            className="mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {formState.errors.kfn_license && (
            <p className="mt-1 text-xs text-red-600">
              {formState.errors.kfn_license.message}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Верифициране...' : 'Верифицирай →'}
        </button>
      </form>
    </div>
  );
}

function PasswordSetupStep({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (otpauthUrl: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmit = async (data: PasswordFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/tenants/onboarding/${token}/setup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: data.password }),
        },
      );
      const body = await res.json() as {
        otpauthUrl?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(body.message ?? 'Грешка при създаване на акаунт');
        return;
      }
      if (body.otpauthUrl) {
        onSuccess(body.otpauthUrl);
      }
    } catch {
      setError('Мрежова грешка. Моля, опитайте отново.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-medium">Стъпка 3: Задайте парола</h2>
      <p className="mb-4 text-sm text-gray-600">
        Организацията ви е активирана! Задайте парола за достъп до платформата.
      </p>
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Парола
          </label>
          <input
            {...register('password')}
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {formState.errors.password && (
            <p className="mt-1 text-xs text-red-600">
              {formState.errors.password.message}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Потвърди паролата
          </label>
          <input
            {...register('confirmPassword')}
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {formState.errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">
              {formState.errors.confirmPassword.message}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isLoading ? 'Създаване...' : 'Създай акаунт →'}
        </button>
      </form>
    </div>
  );
}

function TotpSetupStep({
  tenantName,
  otpauthUrl,
}: {
  tenantName: string;
  otpauthUrl: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, otpauthUrl, { width: 200 });
    }
  }, [otpauthUrl]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6">
          <h1 className="mb-2 text-2xl font-semibold text-green-800">
            Акаунтът е създаден!
          </h1>
          <p className="text-sm text-green-700">
            {tenantName} е активиран успешно.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Настройте 2FA</h2>
          <p className="mb-4 text-sm text-gray-600">
            Сканирайте QR кода с вашето authenticator приложение (Google
            Authenticator, Authy и др.).
          </p>
          <canvas ref={canvasRef} className="mx-auto" />
          <p className="mt-4 text-xs text-gray-500">
            След сканиране ще можете да влезете в платформата с имейл, парола и
            код от приложението.
          </p>
          <a
            href="/login"
            className="mt-4 inline-block rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Към входа →
          </a>
        </div>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-500">Зареждане...</p>
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
