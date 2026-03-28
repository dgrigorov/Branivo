'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const DEMO_ACCOUNTS = [
  { label: 'Broker Admin', email: 'admin@branivo.bg', password: 'Admin1234!' },
  { label: 'Broker Agent', email: 'agent@branivo.bg', password: 'Agent1234!' },
  { label: 'Driver', email: 'driver@branivo.bg', password: 'Driver1234!' },
  { label: 'Super Admin', email: 'superadmin@branivo.bg', password: 'SuperAdmin1234!' },
] as const;

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
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="min-h-screen bg-[#0d1117] flex items-center justify-center relative overflow-hidden p-4">
      {/* Indigo glow decoration top-right */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      {/* Subtle glow bottom-left */}
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#1e293b]/90 backdrop-blur-sm border border-indigo-500/20 rounded-2xl p-8 shadow-2xl">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-widest mb-2">BRANIVO</h1>
          <p className="text-slate-400 text-sm">Влезте в своя акаунт</p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">
              Имейл
            </label>
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="broker@example.com"
              className="w-full bg-[#0f172a]/60 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 text-sm"
            />
            {formState.errors.email && (
              <p className="mt-1.5 text-xs text-red-400">{formState.errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">
              Парола
            </label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-[#0f172a]/60 border border-slate-700/50 rounded-xl px-4 py-3 pr-11 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Скрий паролата' : 'Покажи паролата'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            {formState.errors.password && (
              <p className="mt-1.5 text-xs text-red-400">{formState.errors.password.message}</p>
            )}
          </div>

          {/* Forgot password link */}
          <div className="text-right -mt-1">
            <a
              href="/forgot-password"
              className="text-xs text-slate-500 hover:text-indigo-400 transition-colors"
            >
              Забравена парола?
            </a>
          </div>

          {/* Primary button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isLoading ? 'Влизане…' : 'Влез'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-slate-700/60" />
            <span className="text-xs text-slate-600">демо акаунти</span>
            <div className="flex-1 h-px bg-slate-700/60" />
          </div>

          {/* Demo role buttons */}
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  void onSubmit({ email: account.email, password: account.password });
                }}
                className="flex flex-col items-start gap-0.5 border border-slate-700/60 hover:border-indigo-500/50 bg-[#0f172a]/40 hover:bg-indigo-500/10 rounded-xl px-3 py-2.5 transition-all duration-150 text-left group"
              >
                <span className="text-xs font-semibold text-slate-300 group-hover:text-indigo-300 transition-colors leading-none">
                  {account.label}
                </span>
                <span className="text-[10px] text-slate-600 group-hover:text-slate-500 transition-colors leading-none mt-0.5">
                  {account.email}
                </span>
              </button>
            ))}
          </div>
        </form>

        {/* Bottom link */}
        <p className="mt-6 text-center text-xs text-slate-600">
          Нямате акаунт?{' '}
          <span className="text-slate-500">Регистрирайте се от мобилното приложение</span>
        </p>

        {/* Legal text */}
        <p className="mt-3 text-center text-xs text-slate-700">
          Продължавайки, приемате{' '}
          <span className="text-slate-600 hover:text-slate-400 cursor-pointer transition-colors">
            Условията за ползване
          </span>
        </p>
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
  const { setValue, handleSubmit, formState } = form;
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null, null, null]);

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setValue('otp_code', newDigits.join(''));
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i] ?? '';
    }
    setDigits(newDigits);
    setValue('otp_code', newDigits.join(''));
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  return (
    <main className="min-h-screen bg-[#0d1117] flex items-center justify-center relative overflow-hidden p-4">
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#1e293b]/90 backdrop-blur-sm border border-indigo-500/20 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-widest mb-2">BRANIVO</h1>
          <p className="text-slate-400 text-sm">Двуфакторна автентикация</p>
        </div>

        <p className="text-slate-400 text-sm text-center mb-6">
          Въведете 6-цифрения код от вашия автентикатор.
        </p>

        {error && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* 6-box OTP input */}
          <div>
            <div className="flex gap-3 justify-center">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(index, e)}
                  onPaste={index === 0 ? handleDigitPaste : undefined}
                  autoComplete="one-time-code"
                  className="w-12 h-14 bg-[#0f172a]/60 border border-slate-700/50 rounded-xl text-center text-xl font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                />
              ))}
            </div>
            {formState.errors.otp_code && (
              <p className="mt-2 text-xs text-red-400 text-center">{formState.errors.otp_code.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || digits.join('').length < 6}
            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isLoading ? 'Проверка…' : 'Потвърди'}
          </button>

          <button
            type="button"
            onClick={onBack}
            className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors py-1"
          >
            ← Обратно към вход
          </button>
        </form>
      </div>
    </main>
  );
}
