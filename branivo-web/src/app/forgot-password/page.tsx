'use client';

import { useState, useRef } from 'react';

type Step = 1 | 2 | 3;

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>(1);
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null, null, null]);

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!emailOrPhone.trim()) {
      setError('Моля, въведете имейл или телефон.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        if (res.status === 429) {
          setError('Твърде много заявки. Моля, изчакайте преди да опитате отново.');
        } else {
          setError(typeof body.error === 'string' ? body.error : 'Възникна грешка. Моля, опитайте отново.');
        }
        return;
      }
      setStep(2);
      startResendCooldown();
    } catch {
      setError('Мрежова грешка. Моля, опитайте отново.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const otp = otpDigits.join('');
    if (otp.length < 6) {
      setError('Моля, въведете 6-цифрения код.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone, otp }),
      });
      const body = await res.json() as { reset_token?: string; error?: string };
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Невалиден или изтекъл код.');
        return;
      }
      setResetToken(body.reset_token ?? '');
      setStep(3);
    } catch {
      setError('Мрежова грешка. Моля, опитайте отново.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Set new password
  const handleSetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Паролата трябва да е поне 8 символа.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Паролите не съвпадат.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/confirm-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(typeof body.error === 'string' ? body.error : 'Възникна грешка. Моля, опитайте отново.');
        return;
      }
      window.location.href = '/login?reset=success';
    } catch {
      setError('Мрежова грешка. Моля, опитайте отново.');
    } finally {
      setIsLoading(false);
    }
  };

  const startResendCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(typeof body.error === 'string' ? body.error : 'Възникна грешка.');
        return;
      }
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
      startResendCooldown();
    } catch {
      setError('Мрежова грешка. Моля, опитайте отново.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i] ?? '';
    }
    setOtpDigits(newDigits);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  const inputClass =
    'w-full bg-[#0f172a]/60 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 text-sm';
  const primaryBtnClass =
    'w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm';
  const labelClass = 'block text-sm font-medium text-slate-400 mb-1.5';

  return (
    <main className="min-h-screen bg-[#0d1117] flex items-center justify-center relative overflow-hidden p-4">
      {/* Glow decorations */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#1e293b]/90 backdrop-blur-sm border border-indigo-500/20 rounded-2xl p-8 shadow-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-widest mb-2">BRANIVO</h1>
          {step === 1 && (
            <>
              <p className="text-slate-200 text-base font-medium mt-1">Забравена парола?</p>
              <p className="text-slate-400 text-sm mt-1">
                Въведете имейл или телефон — ще изпратим 6-цифрен код
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-slate-200 text-base font-medium mt-1">Въведете кода</p>
              <p className="text-slate-400 text-sm mt-1">
                Изпратихме 6-цифрен код на{' '}
                <span className="text-indigo-400">{emailOrPhone}</span>
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <p className="text-slate-200 text-base font-medium mt-1">Нова парола</p>
              <p className="text-slate-400 text-sm mt-1">Задайте нова парола за вашия акаунт</p>
            </>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6 justify-center">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step
                  ? 'w-8 bg-indigo-500'
                  : s < step
                  ? 'w-4 bg-indigo-700'
                  : 'w-4 bg-slate-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* STEP 1: Email or phone */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} className="space-y-5">
            <div>
              <label className={labelClass}>Имейл или телефон</label>
              <input
                type="text"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder="broker@example.com или +359..."
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <button type="submit" disabled={isLoading} className={primaryBtnClass}>
              {isLoading ? 'Изпращане…' : 'Изпрати код'}
            </button>
          </form>
        )}

        {/* STEP 2: OTP boxes */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
              <div className="flex gap-3 justify-center">
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { otpRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    onPaste={index === 0 ? handleOtpPaste : undefined}
                    autoComplete="one-time-code"
                    className="w-12 h-14 bg-[#0f172a]/60 border border-slate-700/50 rounded-xl text-center text-xl font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || otpDigits.join('').length < 6}
              className={primaryBtnClass}
            >
              {isLoading ? 'Проверка…' : 'Потвърди'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || isLoading}
                className="text-sm text-slate-500 hover:text-indigo-400 disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
              >
                {resendCooldown > 0
                  ? `Изпрати отново (${resendCooldown}с)`
                  : 'Изпрати отново'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: New password */}
        {step === 3 && (
          <form onSubmit={handleSetPassword} className="space-y-5">
            <div>
              <label className={labelClass}>Нова парола</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showNewPassword ? 'Скрий паролата' : 'Покажи паролата'}
                >
                  {showNewPassword ? (
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
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="mt-1.5 text-xs text-red-400">Паролата трябва да е поне 8 символа.</p>
              )}
            </div>

            <div>
              <label className={labelClass}>Потвърди парола</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Скрий паролата' : 'Покажи паролата'}
                >
                  {showConfirmPassword ? (
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
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <p className="mt-1.5 text-xs text-red-400">Паролите не съвпадат.</p>
              )}
            </div>

            <button type="submit" disabled={isLoading} className={primaryBtnClass}>
              {isLoading ? 'Запазване…' : 'Запази парола'}
            </button>
          </form>
        )}

        {/* Back to login */}
        <a
          href="/login"
          className="block text-center text-sm text-slate-600 hover:text-slate-400 transition-colors mt-6"
        >
          ← Обратно към вход
        </a>
      </div>
    </main>
  );
}
