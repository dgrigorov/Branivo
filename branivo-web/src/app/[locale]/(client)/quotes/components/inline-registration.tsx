'use client';

import { useEffect, useRef, useState } from 'react';
import { useClientAuth, type ClientUser } from '../../../../../lib/hooks/use-client-auth';

type RegistrationState =
  | 'idle'
  | 'phone_entry'
  | 'otp_sent'
  | 'otp_entry'
  | 'verifying'
  | 'success'
  | 'error';

interface InlineRegistrationProps {
  sessionId?: string;
  onSuccess: (user: ClientUser) => void;
  onClose: () => void;
}

const OTP_TTL_SECONDS = 300;

export function InlineRegistration({ sessionId, onSuccess, onClose }: InlineRegistrationProps) {
  const [phase, setPhase] = useState<RegistrationState>('phone_entry');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [announcement, setAnnouncement] = useState('');

  const { requestOtp, verifyOtp, isLoading } = useClientAuth();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Announce expansion for screen readers
  useEffect(() => {
    setAnnouncement('Регистрационен формуляр се разгъна');
  }, []);

  // OTP countdown timer
  useEffect(() => {
    if (phase === 'otp_entry') {
      setSecondsLeft(OTP_TTL_SECONDS);
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setPhase('error');
            setErrorMsg('Кодът изтече. Поискайте нов код.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  async function handlePhoneSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorMsg('');
    try {
      await requestOtp(phone);
      setPhase('otp_entry');
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('429')) {
        setErrorMsg('Изпратихте твърде много кодове. Опитайте след 1 час.');
      } else {
        setErrorMsg('Неуспешно изпращане. Опитайте отново.');
      }
      setPhase('error');
    }
  }

  async function handleOtpSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorMsg('');
    setPhase('verifying');
    try {
      const user = await verifyOtp(phone, otp, sessionId);
      setPhase('success');
      onSuccess(user);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('429')) {
          setErrorMsg('Твърде много опити. Опитайте след 1 час.');
        } else if (err.message.includes('422')) {
          setErrorMsg('Кодът изтече. Поискайте нов код.');
        } else {
          setErrorMsg('Грешен код. Опитайте отново.');
        }
      }
      setPhase('otp_entry');
    }
  }

  async function handleResend(): Promise<void> {
    setErrorMsg('');
    try {
      await requestOtp(phone);
      setPhase('otp_entry');
    } catch {
      setErrorMsg('Неуспешно изпращане. Опитайте отново.');
    }
  }

  return (
    <div
      className="overflow-hidden transition-all duration-300"
      style={{ maxHeight: '600px' }}
    >
      {/* WCAG aria-live announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Регистрация / Вход</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Затвори формуляра"
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div role="alert" className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {(phase === 'phone_entry' || phase === 'error') && (
          <form onSubmit={(e) => void handlePhoneSubmit(e)} className="space-y-3">
            <div>
              <label htmlFor="reg-phone" className="block text-sm font-medium text-gray-700">
                Телефонен номер
              </label>
              <input
                id="reg-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+359 88 123 456"
                required
                className="mt-1 block w-full rounded border border-gray-300 p-2"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !phone}
              className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            >
              {isLoading ? 'Изпращане...' : 'Изпрати код'}
            </button>
          </form>
        )}

        {(phase === 'otp_entry' || phase === 'verifying') && (
          <form onSubmit={(e) => void handleOtpSubmit(e)} className="space-y-3">
            <p className="text-sm text-gray-600">
              Изпратихме код на {phone}. Валиден {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, '0')} мин.
            </p>
            <div>
              <label htmlFor="reg-otp" className="block text-sm font-medium text-gray-700">
                Код от SMS
              </label>
              <input
                id="reg-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
                className="mt-1 block w-full rounded border border-gray-300 p-2 text-center text-2xl tracking-widest"
              />
            </div>
            <button
              type="submit"
              disabled={phase === 'verifying' || otp.length !== 6}
              className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            >
              {phase === 'verifying' ? 'Проверка...' : 'Потвърди'}
            </button>
            <button
              type="button"
              onClick={() => void handleResend()}
              className="w-full text-sm text-blue-600 hover:underline"
            >
              Изпрати нов код
            </button>
          </form>
        )}

        {phase === 'success' && (
          <p className="text-green-600">Добре дошъл! Данните ти са запазени.</p>
        )}
      </div>
    </div>
  );
}
