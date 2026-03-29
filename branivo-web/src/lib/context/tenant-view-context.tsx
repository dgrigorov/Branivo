'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'branivo-admin-tenant-view';

export interface TenantView {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
}

interface TenantViewContextValue {
  tenantView: TenantView | null;
  setTenantView: (view: TenantView) => void;
  clearTenantView: () => void;
}

const TenantViewContext = createContext<TenantViewContextValue>({
  tenantView: null,
  setTenantView: () => undefined,
  clearTenantView: () => undefined,
});

export function TenantViewProvider({ children }: { children: ReactNode }) {
  const [tenantView, setTenantViewState] = useState<TenantView | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      setTenantViewState(JSON.parse(stored) as TenantView);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const setTenantView = useCallback((view: TenantView) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
    setTenantViewState(view);
  }, []);

  const clearTenantView = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTenantViewState(null);
  }, []);

  return (
    <TenantViewContext.Provider value={{ tenantView, setTenantView, clearTenantView }}>
      {children}
    </TenantViewContext.Provider>
  );
}

export function useTenantView(): TenantViewContextValue {
  return useContext(TenantViewContext);
}
