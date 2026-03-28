'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  Car,
  Zap,
  Fuel,
  Settings2,
  Layers,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  RotateCcw,
  Check,
  X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehicleMake {
  id: string;
  name: string;
  vpicMakeId: number | null;
  isActive: boolean;
  isPopular: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
}

interface VehicleModel {
  id: string;
  makeId: string;
  makeName: string;
  name: string;
  vpicModelId: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  bodyType: string | null;
  imageUrl: string | null;
  modificationsCount: number;
  isActive: boolean;
  source: string;
}

interface VehicleModification {
  id: string;
  modelId: string;
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
  engineType: string | null;
  engineSizeCc: number | null;
  powerKw: number | null;
  powerHp: number | null;
  bodyType: string | null;
  doors: number | null;
  seats: number | null;
  transmission: string | null;
  drive: string | null;
  source: string;
  isActive: boolean;
}

interface SyncResponse {
  imported: number;
  updated: number;
  totalProcessed: number;
  syncedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BODY_TYPE_LABELS: Record<string, string> = {
  sedan: 'Седан',
  hatchback: 'Хечбек',
  station_wagon: 'Комби',
  suv: 'SUV',
  crossover: 'Кросовър',
  coupe: 'Купе',
  convertible: 'Кабриолет',
  minivan: 'Миниван',
  van: 'Ван',
  pickup: 'Пикап',
  minibus: 'Минибус',
  other: 'Друг',
};

const ENGINE_TYPE_LABELS: Record<string, string> = {
  petrol: 'Бензин',
  diesel: 'Дизел',
  electric: 'Електрически',
  hybrid: 'Хибрид',
  lpg: 'LPG',
  cng: 'CNG',
  other: 'Друг',
};

const ENGINE_COLORS: Record<string, string> = {
  petrol: 'bg-amber-100 text-amber-700',
  diesel: 'bg-slate-100 text-slate-700',
  electric: 'bg-emerald-100 text-emerald-700',
  hybrid: 'bg-teal-100 text-teal-700',
  lpg: 'bg-blue-100 text-blue-700',
  cng: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-600',
};


// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? 'API грешка');
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Грешка при запис');
  return data;
}

async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Грешка при промяна');
  return data;
}

async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  if (res.status === 204) return;
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(data.message ?? 'Грешка при изтриване');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MakeLogo({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-16 w-16 text-base' };
  const initials = name.slice(0, 2).toUpperCase();
  const colors = [
    'from-blue-500 to-blue-700',
    'from-slate-600 to-slate-800',
    'from-red-500 to-red-700',
    'from-emerald-500 to-emerald-700',
    'from-violet-500 to-violet-700',
    'from-amber-500 to-amber-700',
  ];
  const color = colors[name.charCodeAt(0) % colors.length];

  return (
    <div
      className={`${sizes[size]} rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

function CarImagePlaceholder({ model, bodyType }: { model: string; bodyType: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 bg-gradient-to-b from-slate-50 to-slate-100">
      <Car className="h-12 w-12 text-slate-300" />
      <span className="text-xs text-slate-400 font-medium">{model}</span>
      {bodyType && (
        <span className="text-[10px] text-slate-300">{BODY_TYPE_LABELS[bodyType] ?? bodyType}</span>
      )}
    </div>
  );
}

function EngineTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ENGINE_COLORS[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type === 'electric' ? <Zap className="h-2.5 w-2.5" /> : <Fuel className="h-2.5 w-2.5" />}
      {ENGINE_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VehicleCatalogPage() {
  const queryClient = useQueryClient();

  const [selectedMakeId, setSelectedMakeId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [makeSearch, setMakeSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [activePanel, setActivePanel] = useState<'browse' | 'addMake' | 'addModel' | 'addMod'>('browse');
  const [toast, setToast] = useState<string | null>(null);

  // Form state
  const [makeName, setMakeName] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelYearFrom, setModelYearFrom] = useState('');
  const [modelYearTo, setModelYearTo] = useState('');
  const [modelBodyType, setModelBodyType] = useState('');
  const [modelImageUrl, setModelImageUrl] = useState('');
  const [modName, setModName] = useState('');
  const [modYearFrom, setModYearFrom] = useState('');
  const [modYearTo, setModYearTo] = useState('');
  const [modEngineType, setModEngineType] = useState('');
  const [modEngineCc, setModEngineCc] = useState('');
  const [modPowerHp, setModPowerHp] = useState('');
  const [modTransmission, setModTransmission] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['vehicle-catalog'] });
  }, [queryClient]);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: makes = [], isLoading: makesLoading } = useQuery<VehicleMake[]>({
    queryKey: ['vehicle-catalog', 'makes'],
    queryFn: () => apiFetch('/api/v1/admin/vehicle-catalog/makes?limit=1000&includeInactive=true'),
    staleTime: 30_000,
  });

  const { data: models = [], isLoading: modelsLoading } = useQuery<VehicleModel[]>({
    queryKey: ['vehicle-catalog', 'models', selectedMakeId],
    queryFn: () =>
      apiFetch(
        `/api/v1/admin/vehicle-catalog/models?limit=2000&includeInactive=true&makeId=${selectedMakeId ?? ''}`,
      ),
    enabled: Boolean(selectedMakeId),
    staleTime: 30_000,
  });

  const { data: modifications = [], isLoading: modsLoading } = useQuery<VehicleModification[]>({
    queryKey: ['vehicle-catalog', 'modifications', selectedModelId],
    queryFn: () =>
      apiFetch(
        `/api/v1/admin/vehicle-catalog/modifications?includeInactive=true&modelId=${selectedModelId ?? ''}`,
      ),
    enabled: Boolean(selectedModelId),
    staleTime: 30_000,
  });

  // ─── Derived state ────────────────────────────────────────────────────────

  const selectedMake = useMemo(
    () => makes.find((m) => m.id === selectedMakeId) ?? null,
    [makes, selectedMakeId],
  );

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const filteredMakes = useMemo(() => {
    const q = makeSearch.trim().toLowerCase();
    return q ? makes.filter((m) => m.name.toLowerCase().includes(q)) : makes;
  }, [makes, makeSearch]);

  const popularMakes = useMemo(
    () => filteredMakes.filter((m) => m.isPopular),
    [filteredMakes],
  );

  const otherMakes = useMemo(
    () => filteredMakes.filter((m) => !m.isPopular),
    [filteredMakes],
  );

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return q ? models.filter((m) => m.name.toLowerCase().includes(q)) : models;
  }, [models, modelSearch]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMakeMutation = useMutation({
    mutationFn: (name: string) =>
      apiPost<VehicleMake>('/api/v1/admin/vehicle-catalog/makes', { name }),
    onSuccess: async (m) => {
      setMakeName('');
      setActivePanel('browse');
      setSelectedMakeId(m.id);
      showToast(`Марка "${m.name}" добавена`);
      await invalidate();
    },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка'),
  });

  const deleteMakeMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/admin/vehicle-catalog/makes/${id}`),
    onSuccess: async () => {
      setSelectedMakeId(null);
      showToast('Марката е изтрита');
      await invalidate();
    },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка'),
  });

  const toggleMakeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<VehicleMake>(`/api/v1/admin/vehicle-catalog/makes/${id}`, { isActive }),
    onSuccess: async () => invalidate(),
  });

  const createModelMutation = useMutation({
    mutationFn: (payload: {
      makeId: string;
      name: string;
      yearFrom?: number;
      yearTo?: number;
      bodyType?: string;
      imageUrl?: string;
    }) => apiPost<VehicleModel>('/api/v1/admin/vehicle-catalog/models', payload),
    onSuccess: async (m) => {
      setModelName('');
      setModelYearFrom('');
      setModelYearTo('');
      setModelBodyType('');
      setModelImageUrl('');
      setActivePanel('browse');
      setSelectedModelId(m.id);
      showToast(`Модел "${m.name}" добавен`);
      await invalidate();
    },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка'),
  });

  const deleteModelMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/admin/vehicle-catalog/models/${id}`),
    onSuccess: async () => {
      setSelectedModelId(null);
      showToast('Моделът е изтрит');
      await invalidate();
    },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка'),
  });

  const createModMutation = useMutation({
    mutationFn: (payload: {
      modelId: string;
      name: string;
      yearFrom?: number;
      yearTo?: number;
      engineType?: string;
      engineSizeCc?: number;
      powerHp?: number;
      transmission?: string;
    }) => apiPost<VehicleModification>('/api/v1/admin/vehicle-catalog/modifications', payload),
    onSuccess: async (m) => {
      setModName('');
      setModYearFrom('');
      setModYearTo('');
      setModEngineType('');
      setModEngineCc('');
      setModPowerHp('');
      setModTransmission('');
      setActivePanel('browse');
      showToast(`Модификация "${m.name}" добавена`);
      await invalidate();
    },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка'),
  });

  const deleteModMutation = useMutation({
    mutationFn: (id: string) =>
      apiDelete(`/api/v1/admin/vehicle-catalog/modifications/${id}`),
    onSuccess: async () => {
      showToast('Модификацията е изтрита');
      await invalidate();
    },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка'),
  });

  const syncMakesMutation = useMutation({
    mutationFn: () => apiPost<SyncResponse>('/api/v1/admin/vehicle-catalog/sync/vpic/makes'),
    onSuccess: async (r) => {
      showToast(`vPIC марки: ${r.imported} нови, ${r.updated} обновени`);
      await invalidate();
    },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка при sync'),
  });

  const syncModelsMutation = useMutation({
    mutationFn: (makeId: string) =>
      apiPost<SyncResponse>(`/api/v1/admin/vehicle-catalog/sync/vpic/makes/${makeId}/models`),
    onSuccess: async (r) => {
      showToast(`vPIC модели: ${r.imported} нови, ${r.updated} обновени`);
      await invalidate();
    },
    onError: (e: unknown) => showToast(e instanceof Error ? e.message : 'Грешка при sync'),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectMake = (id: string) => {
    setSelectedMakeId(id === selectedMakeId ? null : id);
    setSelectedModelId(null);
    setActivePanel('browse');
  };

  const handleSelectModel = (id: string) => {
    setSelectedModelId(id === selectedModelId ? null : id);
    setActivePanel('browse');
  };

  const handleCreateModel = () => {
    if (!selectedMakeId || !modelName.trim()) return;
    const payload: Parameters<typeof createModelMutation.mutate>[0] = {
      makeId: selectedMakeId,
      name: modelName.trim(),
    };
    if (modelYearFrom) payload.yearFrom = Number(modelYearFrom);
    if (modelYearTo) payload.yearTo = Number(modelYearTo);
    if (modelBodyType) payload.bodyType = modelBodyType;
    if (modelImageUrl.trim()) payload.imageUrl = modelImageUrl.trim();
    createModelMutation.mutate(payload);
  };

  const handleCreateMod = () => {
    if (!selectedModelId || !modName.trim()) return;
    const payload: Parameters<typeof createModMutation.mutate>[0] = {
      modelId: selectedModelId,
      name: modName.trim(),
    };
    if (modYearFrom) payload.yearFrom = Number(modYearFrom);
    if (modYearTo) payload.yearTo = Number(modYearTo);
    if (modEngineType) payload.engineType = modEngineType;
    if (modEngineCc) payload.engineSizeCc = Number(modEngineCc);
    if (modPowerHp) payload.powerHp = Number(modPowerHp);
    if (modTransmission) payload.transmission = modTransmission;
    createModMutation.mutate(payload);
  };

  // ─── Stats ────────────────────────────────────────────────────────────────

  const totalMakes = makes.length;
  const totalModels = models.length;
  const totalMods = modifications.length;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (makesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Car className="h-12 w-12 mx-auto text-slate-300 mb-3 animate-pulse" />
          <p className="text-slate-500">Зареждане на автомобилен каталог...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          <Check className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
              <Car className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Автомобилен каталог</h1>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span>{totalMakes} марки</span>
                {selectedMakeId && <span>·</span>}
                {selectedMakeId && <span>{totalModels} модела</span>}
                {selectedModelId && <span>·</span>}
                {selectedModelId && <span>{totalMods} модификации</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => syncMakesMutation.mutate()}
              disabled={syncMakesMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncMakesMutation.isPending ? 'animate-spin' : ''}`} />
              Sync vPIC марки
            </button>
            {selectedMake && (
              <button
                onClick={() => syncModelsMutation.mutate(selectedMake.id)}
                disabled={syncModelsMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncModelsMutation.isPending ? 'animate-spin' : ''}`} />
                Sync модели за {selectedMake.name}
              </button>
            )}
          </div>
        </div>

        {/* Breadcrumb navigation */}
        <div className="mt-4 flex items-center gap-2 text-sm">
          <button
            onClick={() => { setSelectedMakeId(null); setSelectedModelId(null); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
              !selectedMakeId ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Всички марки
          </button>
          {selectedMake && (
            <>
              <ChevronDown className="h-4 w-4 text-slate-400 -rotate-90" />
              <button
                onClick={() => setSelectedModelId(null)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  selectedMakeId && !selectedModelId ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <MakeLogo name={selectedMake.name} size="sm" />
                {selectedMake.name}
              </button>
            </>
          )}
          {selectedModel && (
            <>
              <ChevronDown className="h-4 w-4 text-slate-400 -rotate-90" />
              <span className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white">
                <Car className="h-3.5 w-3.5" />
                {selectedModel.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="p-6">

        {/* ── Level 1: Makes grid ── */}
        {!selectedMakeId && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <input
                value={makeSearch}
                onChange={(e) => setMakeSearch(e.target.value)}
                placeholder="Търси марка..."
                className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none"
              />
              {activePanel === 'addMake' ? (
                <button
                  onClick={() => setActivePanel('browse')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
                >
                  <X className="h-4 w-4" /> Отказ
                </button>
              ) : (
                <button
                  onClick={() => setActivePanel('addMake')}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
                >
                  <Plus className="h-4 w-4" /> Добави марка
                </button>
              )}
            </div>

            {/* Add make form */}
            {activePanel === 'addMake' && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-slate-900">Нова марка</h3>
                <div className="flex gap-3">
                  <input
                    value={makeName}
                    onChange={(e) => setMakeName(e.target.value)}
                    placeholder="Напр. Toyota"
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                    onKeyDown={(e) => { if (e.key === 'Enter') createMakeMutation.mutate(makeName); }}
                  />
                  <button
                    onClick={() => createMakeMutation.mutate(makeName)}
                    disabled={!makeName.trim() || createMakeMutation.isPending}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                  >
                    Добави
                  </button>
                </div>
              </div>
            )}

            {/* Popular makes */}
            {!makeSearch && popularMakes.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Популярни ({popularMakes.length})
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {popularMakes.map((make) => (
                    <MakeCard
                      key={make.id}
                      make={make}
                      onSelect={() => handleSelectMake(make.id)}
                      onToggle={() => toggleMakeMutation.mutate({ id: make.id, isActive: !make.isActive })}
                      onDelete={() => {
                        if (window.confirm(`Изтриване на "${make.name}"?`)) {
                          deleteMakeMutation.mutate(make.id);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Other makes */}
            {otherMakes.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {makeSearch ? `Резултати (${otherMakes.length})` : `Всички останали (${otherMakes.length})`}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {otherMakes.map((make) => (
                    <MakeCard
                      key={make.id}
                      make={make}
                      onSelect={() => handleSelectMake(make.id)}
                      onToggle={() => toggleMakeMutation.mutate({ id: make.id, isActive: !make.isActive })}
                      onDelete={() => {
                        if (window.confirm(`Изтриване на "${make.name}"?`)) {
                          deleteMakeMutation.mutate(make.id);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Level 2: Models grid ── */}
        {selectedMakeId && !selectedModelId && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Търси модел..."
                className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedMakeId(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4" /> Всички марки
                </button>
                {activePanel === 'addModel' ? (
                  <button
                    onClick={() => setActivePanel('browse')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600"
                  >
                    <X className="h-4 w-4" /> Отказ
                  </button>
                ) : (
                  <button
                    onClick={() => setActivePanel('addModel')}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
                  >
                    <Plus className="h-4 w-4" /> Добави модел
                  </button>
                )}
              </div>
            </div>

            {/* Add model form */}
            {activePanel === 'addModel' && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-slate-900">Нов модел за {selectedMake?.name}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <input
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="Модел (напр. Corolla)"
                    className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <input
                    value={modelYearFrom}
                    onChange={(e) => setModelYearFrom(e.target.value)}
                    placeholder="От година"
                    inputMode="numeric"
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <input
                    value={modelYearTo}
                    onChange={(e) => setModelYearTo(e.target.value)}
                    placeholder="До година"
                    inputMode="numeric"
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <select
                    value={modelBodyType}
                    onChange={(e) => setModelBodyType(e.target.value)}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="">Вид купе</option>
                    {Object.entries(BODY_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <input
                    value={modelImageUrl}
                    onChange={(e) => setModelImageUrl(e.target.value)}
                    placeholder="URL на снимка (по избор)"
                    className="col-span-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <button
                    onClick={handleCreateModel}
                    disabled={!modelName.trim() || createModelMutation.isPending}
                    className="col-span-2 sm:col-span-3 rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                  >
                    Добави модел
                  </button>
                </div>
              </div>
            )}

            {modelsLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="h-52 rounded-2xl bg-slate-200 animate-pulse" />
                ))}
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center text-slate-400">
                <Car className="mx-auto h-12 w-12 mb-3 opacity-30" />
                <p>Няма модели. Добави ръчно или Sync от vPIC.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {filteredModels.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    onSelect={() => handleSelectModel(model.id)}
                    onDelete={() => {
                      if (window.confirm(`Изтриване на "${model.name}"?`)) {
                        deleteModelMutation.mutate(model.id);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Level 3: Modifications ── */}
        {selectedModelId && selectedModel && (
          <div className="space-y-5">
            {/* Model hero */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex gap-5 p-5">
                <div className="relative h-32 w-48 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {selectedModel.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedModel.imageUrl}
                      alt={selectedModel.name}
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <CarImagePlaceholder model={selectedModel.name} bodyType={selectedModel.bodyType} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        {selectedMake?.name}
                      </p>
                      <h2 className="mt-0.5 text-2xl font-bold text-slate-900">
                        {selectedModel.name}
                      </h2>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm(`Изтриване на "${selectedModel.name}"?`)) {
                          deleteModelMutation.mutate(selectedModel.id);
                        }
                      }}
                      className="flex-shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {selectedModel.yearFrom && (
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {selectedModel.yearFrom}–{selectedModel.yearTo ?? 'сега'}
                      </span>
                    )}
                    {selectedModel.bodyType && (
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {BODY_TYPE_LABELS[selectedModel.bodyType] ?? selectedModel.bodyType}
                      </span>
                    )}
                    <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600">
                      {selectedModel.modificationsCount} модификации
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modifications header + add */}
            <div className="flex items-center justify-between gap-4">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <Settings2 className="h-4 w-4 text-slate-400" />
                Модификации
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedModelId(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4" /> Всички модели
                </button>
                {activePanel === 'addMod' ? (
                  <button
                    onClick={() => setActivePanel('browse')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
                  >
                    <X className="h-4 w-4" /> Отказ
                  </button>
                ) : (
                  <button
                    onClick={() => setActivePanel('addMod')}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
                  >
                    <Plus className="h-4 w-4" /> Добави модификация
                  </button>
                )}
              </div>
            </div>

            {/* Add modification form */}
            {activePanel === 'addMod' && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-slate-900">Нова модификация</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <input
                    value={modName}
                    onChange={(e) => setModName(e.target.value)}
                    placeholder="Напр. 2.0 TDI 150hp"
                    className="col-span-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <input
                    value={modYearFrom}
                    onChange={(e) => setModYearFrom(e.target.value)}
                    placeholder="От година"
                    inputMode="numeric"
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <input
                    value={modYearTo}
                    onChange={(e) => setModYearTo(e.target.value)}
                    placeholder="До година"
                    inputMode="numeric"
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <select
                    value={modEngineType}
                    onChange={(e) => setModEngineType(e.target.value)}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="">Тип двигател</option>
                    {Object.entries(ENGINE_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <input
                    value={modEngineCc}
                    onChange={(e) => setModEngineCc(e.target.value)}
                    placeholder="Обем (cc)"
                    inputMode="numeric"
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <input
                    value={modPowerHp}
                    onChange={(e) => setModPowerHp(e.target.value)}
                    placeholder="Мощност (к.с.)"
                    inputMode="numeric"
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <select
                    value={modTransmission}
                    onChange={(e) => setModTransmission(e.target.value)}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="">Скоростна кутия</option>
                    <option value="manual">Ръчна</option>
                    <option value="automatic">Автоматична</option>
                    <option value="dsg">DSG/DCT</option>
                    <option value="cvt">CVT</option>
                  </select>
                  <button
                    onClick={handleCreateMod}
                    disabled={!modName.trim() || createModMutation.isPending}
                    className="col-span-2 sm:col-span-3 rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                  >
                    Добави модификация
                  </button>
                </div>
              </div>
            )}

            {/* Modifications list */}
            {modsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-slate-200 animate-pulse" />
                ))}
              </div>
            ) : modifications.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center text-slate-400">
                <Layers className="mx-auto h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Няма модификации. Добави ръчно или импортирай от autodoc.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Модификация
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Двигател
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Години
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Трансмисия
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modifications.map((mod) => (
                      <tr key={mod.id} className={`transition-colors hover:bg-slate-50 ${!mod.isActive ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {mod.name}
                          {mod.powerHp && (
                            <span className="ml-2 text-xs text-slate-400">{mod.powerHp} к.с.</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <EngineTypeBadge type={mod.engineType} />
                            {mod.engineSizeCc && (
                              <span className="text-xs text-slate-500">
                                {(mod.engineSizeCc / 1000).toFixed(1)}L
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {mod.yearFrom ?? '–'}–{mod.yearTo ?? 'сега'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 capitalize">
                          {mod.transmission ?? '–'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              if (window.confirm(`Изтриване на "${mod.name}"?`)) {
                                deleteModMutation.mutate(mod.id);
                              }
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MakeCard ─────────────────────────────────────────────────────────────────

function MakeCard({
  make,
  onSelect,
  onToggle,
  onDelete,
}: {
  make: VehicleMake;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border transition-all ${
        make.isActive
          ? 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'
          : 'border-slate-100 bg-slate-50 opacity-60'
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col items-center gap-3 p-4 text-center"
      >
        <MakeLogo name={make.name} size="lg" />
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">{make.name}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">{make.source}</p>
        </div>
      </button>

      {/* Hover actions */}
      {showActions && (
        <div className="absolute right-1.5 top-1.5 flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            title={make.isActive ? 'Деактивирай' : 'Активирай'}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-slate-500 shadow-sm hover:text-amber-500"
          >
            {make.isActive ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Изтрий"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-slate-500 shadow-sm hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ModelCard ────────────────────────────────────────────────────────────────

function ModelCard({
  model,
  onSelect,
  onDelete,
}: {
  model: VehicleModel;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border transition-all ${
        model.isActive
          ? 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'
          : 'border-slate-100 bg-slate-50 opacity-60'
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Car image / placeholder */}
      <button type="button" onClick={onSelect} className="block w-full">
        <div className="relative h-36 overflow-hidden bg-slate-100">
          {model.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={model.imageUrl}
              alt={model.name}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <CarImagePlaceholder model={model.name} bodyType={model.bodyType} />
          )}

          {/* Modifications count badge */}
          {model.modificationsCount > 0 && (
            <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-medium text-white">
              {model.modificationsCount} модиф.
            </span>
          )}
        </div>

        <div className="p-3">
          <p className="font-semibold text-slate-900">{model.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {model.yearFrom && (
              <span className="text-[10px] text-slate-400">
                {model.yearFrom}–{model.yearTo ?? 'сега'}
              </span>
            )}
            {model.bodyType && (
              <span className="text-[10px] text-slate-400">
                · {BODY_TYPE_LABELS[model.bodyType] ?? model.bodyType}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Hover actions */}
      {showActions && (
        <div className="absolute right-2 top-2 flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-slate-400 shadow-sm hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-slate-400 shadow-sm hover:text-indigo-600"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
