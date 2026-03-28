'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MakesCarousel } from './_components/makes-carousel';
import { ModelsCarousel } from './_components/models-carousel';
import { ModificationsTable } from './_components/modifications-table';
import { SyncPanel } from './_components/sync-panel';
import { type VehicleMake, type VehicleModel, type VehicleModification, type SyncRun } from './_components/types';

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? 'API грешка');
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'POST', credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Грешка');
  return data;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VehicleCatalogPage() {
  const queryClient = useQueryClient();
  const [selectedMakeId, setSelectedMakeId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [syncRunId, setSyncRunId] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['vc'] }),
    [queryClient],
  );

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: makes = [], isLoading: makesLoading } = useQuery<VehicleMake[]>({
    queryKey: ['vc', 'makes'],
    queryFn: () => apiFetch('/api/v1/admin/vehicle-catalog/makes?limit=1000'),
    staleTime: 60_000,
  });

  const { data: models = [], isLoading: modelsLoading } = useQuery<VehicleModel[]>({
    queryKey: ['vc', 'models', selectedMakeId],
    queryFn: () =>
      apiFetch(`/api/v1/admin/vehicle-catalog/models?limit=2000&makeId=${selectedMakeId ?? ''}`),
    enabled: Boolean(selectedMakeId),
    staleTime: 60_000,
  });

  const { data: modifications = [], isLoading: modsLoading } = useQuery<VehicleModification[]>({
    queryKey: ['vc', 'mods', selectedModelId],
    queryFn: () =>
      apiFetch(`/api/v1/admin/vehicle-catalog/modifications?modelId=${selectedModelId ?? ''}`),
    enabled: Boolean(selectedModelId),
    staleTime: 60_000,
  });

  const { data: syncStatus } = useQuery<SyncRun | null>({
    queryKey: ['vc', 'sync'],
    queryFn: () => apiFetch<SyncRun | null>('/api/v1/admin/vehicle-catalog/sync/status'),
    refetchInterval: 15_000,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const startSyncMutation = useMutation({
    mutationFn: () => apiPost<SyncRun>('/api/v1/admin/vehicle-catalog/sync/start'),
    onSuccess: (run) => { setSyncRunId(run.id); },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка'),
  });

  const importOnlyMutation = useMutation({
    mutationFn: () => apiPost<SyncRun>('/api/v1/admin/vehicle-catalog/sync/import-only'),
    onSuccess: async (run) => {
      setSyncRunId(run.id);
      await invalidate();
    },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка'),
  });

  // ─── Derived ────────────────────────────────────────────────────────────────

  const selectedMake = useMemo(() => makes.find((m) => m.id === selectedMakeId) ?? null, [makes, selectedMakeId]);
  const selectedModel = useMemo(() => models.find((m) => m.id === selectedModelId) ?? null, [models, selectedModelId]);

  const handleSelectMake = (id: string) => {
    setSelectedMakeId((prev) => (prev === id ? null : id));
    setSelectedModelId(null);
  };

  const handleSelectModel = (id: string) => {
    setSelectedModelId((prev) => (prev === id ? null : id));
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#07070f] text-white">
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(251,191,36,0.06) 0%, transparent 60%)',
        }}
      />

      <div className="relative max-w-[1400px] mx-auto px-6 py-8 space-y-10">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-widest mb-2">Admin · Vehicle Catalog</p>
            <h1 className="text-3xl font-bold tracking-tight">Каталог автомобили</h1>
            <p className="text-white/40 text-sm mt-1">
              {makes.length.toLocaleString()} марки · {' '}
              {syncStatus?.totalImported != null
                ? `${syncStatus.totalImported.toLocaleString()} модификации`
                : 'зарежда...'}
            </p>
          </div>
        </div>

        {/* Section 1: Makes */}
        <section>
          <MakesCarousel
            makes={makes}
            selectedId={selectedMakeId}
            isLoading={makesLoading}
            onSelect={handleSelectMake}
          />
        </section>

        {/* Section 2: Models (slides in) */}
        {selectedMakeId && selectedMake && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="h-px bg-white/5 mb-8" />
            <ModelsCarousel
              models={models}
              selectedId={selectedModelId}
              makeName={selectedMake.name}
              isLoading={modelsLoading}
              onSelect={handleSelectModel}
            />
          </section>
        )}

        {/* Section 3: Modifications (slides in) */}
        {selectedModelId && selectedModel && selectedMake && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="h-px bg-white/5 mb-8" />
            <ModificationsTable
              modifications={modifications}
              make={selectedMake}
              model={selectedModel}
              isLoading={modsLoading}
            />
          </section>
        )}

        {/* Sync panel (admin) */}
        <div className="h-px bg-white/5" />
        <SyncPanel
          syncStatus={syncStatus}
          onStartSync={() => startSyncMutation.mutate()}
          onImportOnly={() => importOnlyMutation.mutate()}
          syncPending={startSyncMutation.isPending}
          importPending={importOnlyMutation.isPending}
          syncRunId={syncRunId}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-zinc-800 border border-white/10 text-sm text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          {toast}
        </div>
      )}
    </div>
  );
}
