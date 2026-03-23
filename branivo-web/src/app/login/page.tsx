'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const twoFaSchema = z.object({
  otp_code: z
    .string()
    .length(6, 'Code must be 6 digits')
    .regex(/^\d{6}$/, 'Code must be numeric'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type TwoFAFormValues = z.infer<typeof twoFaSchema>;

export default function LoginPage() {
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const twoFaForm = useForm<TwoFAFormValues>({
    resolver: zodResolver(twoFaSchema),
  });

  const handleLogin = async (data: LoginFormValues) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json() as {
        requires_2fa?: boolean;
        temp_token?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 429) {
          setError('Account temporarily locked. Please try again in 15 minutes.');
        } else {
          setError((body.error as string) || 'Invalid credentials');
        }
        return;
      }
      if (body.requires_2fa && body.temp_token) {
        setTempToken(body.temp_token);
      } else {
        window.location.href = '/dashboard';
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FA = async (data: TwoFAFormValues) => {
    if (!tempToken) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, otp_code: data.otp_code }),
      });
      const body = await res.json() as { error?: string };
      if (!res.ok) {
        setError((body.error as string) || 'Invalid 2FA code');
        return;
      }
      window.location.href = '/dashboard';
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (tempToken) {
    return (
      <TwoFAForm
        form={twoFaForm}
        onSubmit={handle2FA}
        isLoading={isLoading}
        error={error}
        onBack={() => setTempToken(null)}
      />
    );
  }

  return (
    <CredentialsForm
      form={loginForm}
      onSubmit={handleLogin}
      isLoading={isLoading}
      error={error}
    />
  );
}

function CredentialsForm({
  form,
  onSubmit,
  isLoading,
  error,
}: {
  form: ReturnType<typeof useForm<LoginFormValues>>;
  onSubmit: (data: LoginFormValues) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}) {
  const { register, handleSubmit, formState } = form;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Email"
            error={formState.errors.email?.message}
          >
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
          <FormField
            label="Password"
            error={formState.errors.password?.message}
          >
            <input
              {...register('password')}
              type="password"
              autoComplete="current-password"
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
          <div className="text-right">
            <a
              href="/forgot-password"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Забравена парола?
            </a>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}

function TwoFAForm({
  form,
  onSubmit,
  isLoading,
  error,
  onBack,
}: {
  form: ReturnType<typeof useForm<TwoFAFormValues>>;
  onSubmit: (data: TwoFAFormValues) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  const { register, handleSubmit, formState } = form;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Two-Factor Authentication</h1>
        <p className="text-sm text-gray-600">Enter the 6-digit code from your authenticator app.</p>
        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Authentication code"
            error={formState.errors.otp_code?.message}
          >
            <input
              {...register('otp_code')}
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              className="w-full rounded border px-3 py-2 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="w-full text-sm text-gray-500 hover:text-gray-700"
          >
            Back to login
          </button>
        </form>
      </div>
    </main>
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
