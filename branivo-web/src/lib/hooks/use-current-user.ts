'use client';

import { useEffect, useState } from 'react';

export type UserRole =
  | 'client'
  | 'end_client'
  | 'broker_admin'
  | 'broker_agent'
  | 'fleet_admin'
  | 'fleet_viewer'
  | 'driver'
  | 'admin'
  | 'super_admin';

export interface CurrentUser {
  role: UserRole | null;
  userId: string | null;
  tenantId: string | null;
}

interface MeResponse {
  role: string | null;
  userId: string | null;
  tenantId: string | null;
}

export function useCurrentUser(): CurrentUser {
  const [user, setUser] = useState<CurrentUser>({
    role: null,
    userId: null,
    tenantId: null,
  });

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data: MeResponse) => {
        setUser({
          role: (data.role as UserRole | null) ?? null,
          userId: data.userId,
          tenantId: data.tenantId,
        });
      })
      .catch(() => {
        // stay with null role — sidebar will show AUTH section only
      });
  }, []);

  return user;
}
