'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'branivo_anon_session_id';

export interface VehicleFormData {
  reg_number?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  owner_name?: string;
}

export interface UpdateSessionPayload {
  vehicle_data?: VehicleFormData;
  selected_quote_id?: string;
}

export interface AnonymousSessionState {
  sessionId: string | null;
  isLoading: boolean;
  isExpired: boolean;
  requiresLogin: boolean;
  updateSessionData: (payload: UpdateSessionPayload) => Promise<void>;
}

async function createNewSession(): Promise<{ session_id: string; expires_at: string } | null> {
  try {
    const res = await fetch('/api/v1/sessions/anonymous', { method: 'POST' });
    if (res.status === 503) {
      const body = (await res.json()) as { requires_login?: boolean };
      if (body.requires_login) return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as { session_id: string; expires_at: string };
  } catch {
    return null;
  }
}

async function checkExistingSession(sessionId: string): Promise<'active' | 'expired' | 'requires_login'> {
  try {
    const res = await fetch(`/api/v1/sessions/anonymous/${sessionId}`, {});
    if (res.status === 404) return 'expired';
    if (res.status === 503) {
      const body = await res.json().catch(() => ({})) as { requires_login?: boolean };
      if (body.requires_login) return 'requires_login';
      return 'expired'; // 503 without requires_login — treat as temporary, retry later
    }
    if (res.ok) return 'active';
    return 'expired';
  } catch {
    return 'expired';
  }
}

export function useAnonymousSession(): AnonymousSessionState {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);

  useEffect(() => {
    // localStorage is only accessible client-side — initialize only at mount
    let cancelled = false;

    async function initialize(): Promise<void> {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const status = await checkExistingSession(stored);

        if (cancelled) return;

        if (status === 'active') {
          setSessionId(stored);
          setIsLoading(false);
          return;
        }

        if (status === 'requires_login') {
          localStorage.removeItem(STORAGE_KEY);
          setRequiresLogin(true);
          setIsLoading(false);
          return;
        }

        // expired — clear and create new
        localStorage.removeItem(STORAGE_KEY);
        setIsExpired(true);
      }

      // No stored session or expired — create new
      const newSession = await createNewSession();

      if (cancelled) return;

      if (!newSession) {
        // 503 requires_login
        setRequiresLogin(true);
        setIsLoading(false);
        return;
      }

      localStorage.setItem(STORAGE_KEY, newSession.session_id);
      setSessionId(newSession.session_id);
      // Do NOT reset isExpired — keep it true so the banner remains visible
      setIsLoading(false);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSessionData = useCallback(
    async (payload: UpdateSessionPayload): Promise<void> => {
      if (!sessionId) return;
      const res = await fetch(`/api/v1/sessions/anonymous/${sessionId}/data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 404) {
        // Session expired mid-browsing — clear and mark expired
        localStorage.removeItem(STORAGE_KEY);
        setSessionId(null);
        setIsExpired(true);
      } else if (res.status === 503) {
        const body = await res.json().catch(() => ({})) as { requires_login?: boolean };
        if (body.requires_login) setRequiresLogin(true);
      }
    },
    [sessionId],
  );

  return { sessionId, isLoading, isExpired, requiresLogin, updateSessionData };
}
