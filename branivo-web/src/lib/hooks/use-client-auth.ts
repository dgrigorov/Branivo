'use client';

import { useState } from 'react';

export interface ClientUser {
  id: string;
  phone_number: string;
  is_new: boolean;
}

export class RateLimitError extends Error {
  constructor(public readonly retry_after: number) {
    super('429');
    this.name = 'RateLimitError';
  }
}

export class OtpExpiredError extends Error {
  constructor() {
    super('422');
    this.name = 'OtpExpiredError';
  }
}

interface UseClientAuthResult {
  requestOtp: (phoneNumber: string) => Promise<{ expires_in: number }>;
  verifyOtp: (phoneNumber: string, otpCode: string, sessionId?: string) => Promise<ClientUser>;
  isLoading: boolean;
  error: string | null;
}

export function useClientAuth(): UseClientAuthResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp(phoneNumber: string): Promise<{ expires_in: number }> {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/client/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });

      if (res.status === 429) {
        const body = (await res.json()) as { retry_after?: number };
        throw new RateLimitError(body.retry_after ?? 3600);
      }

      if (!res.ok) {
        throw new Error(`request-otp failed: ${res.status}`);
      }

      const data = (await res.json()) as { expires_in: number };
      return data;
    } finally {
      setIsLoading(false);
    }
  }

  async function verifyOtp(
    phoneNumber: string,
    otpCode: string,
    sessionId?: string,
  ): Promise<ClientUser> {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/client/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber,
          otp_code: otpCode,
          ...(sessionId ? { session_id: sessionId } : {}),
        }),
      });

      if (res.status === 429) {
        const body = (await res.json()) as { retry_after?: number };
        throw new RateLimitError(body.retry_after ?? 3600);
      }

      if (res.status === 422) {
        throw new OtpExpiredError();
      }

      if (!res.ok) {
        throw new Error(`verify-otp failed: ${res.status}`);
      }

      const data = (await res.json()) as { user: ClientUser };
      return data.user;
    } finally {
      setIsLoading(false);
    }
  }

  return { requestOtp, verifyOtp, isLoading, error };
}
