'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface VehicleMake {
  id: string;
  name: string;
  vpicMakeId: number | null;
  isActive: boolean;
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
  isActive: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
}

interface SyncResponse {
  imported: number;
  updated: number;
  totalProcessed: number;
  syncedAt: string;
}

async function fetchMakes(): Promise<VehicleMake[]> {
  const res = await fetch('/api/v1/admin/vehicle-catalog/makes?limit=1000&includeInactive=true', {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Неуспешно зареждане на марки');
  }
  return res.json() as Promise<VehicleMake[]>;
}

async function fetchModels(makeId: string | null): Promise<VehicleModel[]> {
  if (!makeId) return [];

  const params = new URLSearchParams({
    limit: '2000',
    includeInactive: 'true',
    makeId,
  });
  const res = await fetch(`/api/v1/admin/vehicle-catalog/models?${params.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Неуспешно зареждане на модели');
  }
  return res.json() as Promise<VehicleModel[]>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? 'Грешка при запис');
  }
  return data;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? 'Грешка при промяна');
  }
  return data;
}

async function deleteRow(url: string): Promise<void> {
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (res.status === 204) return;

  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? 'Грешка при изтриване');
  }
}

async function syncAllMakes(): Promise<SyncResponse> {
  const res = await fetch('/api/v1/admin/vehicle-catalog/sync/vpic/makes', {
    method: 'POST',
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as SyncResponse & {
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message ?? 'Грешка при vPIC sync');
  }
  return data;
}

async function syncModelsForMake(makeId: string): Promise<SyncResponse> {
  const res = await fetch(
    `/api/v1/admin/vehicle-catalog/sync/vpic/makes/${makeId}/models`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
  const data = (await res.json().catch(() => ({}))) as SyncResponse & {
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message ?? 'Грешка при vPIC model sync');
  }
  return data;
}

export default function VehicleCatalogPage() {
  const queryClient = useQueryClient();

  const [selectedMakeId, setSelectedMakeId] = useState<string | null>(null);
  const [makeName, setMakeName] = useState('');
  const [makeVpicId, setMakeVpicId] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelYearFrom, setModelYearFrom] = useState('');
  const [modelYearTo, setModelYearTo] = useState('');
  const [modelVpicId, setModelVpicId] = useState('');
  const [uiMessage, setUiMessage] = useState<string | null>(null);

  const {
    data: makes = [],
    isLoading: makesLoading,
    error: makesError,
  } = useQuery<VehicleMake[]>({
    queryKey: ['admin', 'vehicle-catalog', 'makes'],
    queryFn: fetchMakes,
    staleTime: 30_000,
  });

  const {
    data: models = [],
    isLoading: modelsLoading,
    error: modelsError,
  } = useQuery<VehicleModel[]>({
    queryKey: ['admin', 'vehicle-catalog', 'models', selectedMakeId],
    queryFn: () => fetchModels(selectedMakeId),
    enabled: Boolean(selectedMakeId),
    staleTime: 30_000,
  });

  const selectedMake = useMemo(
    () => makes.find((make) => make.id === selectedMakeId) ?? null,
    [makes, selectedMakeId],
  );

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'vehicle-catalog', 'makes'],
    });
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'vehicle-catalog', 'models'],
    });
  };

  const createMakeMutation = useMutation({
    mutationFn: (payload: { name: string; vpicMakeId?: number }) =>
      postJson<VehicleMake>('/api/v1/admin/vehicle-catalog/makes', payload),
    onSuccess: async (created) => {
      setMakeName('');
      setMakeVpicId('');
      setSelectedMakeId(created.id);
      setUiMessage(`Добавена марка: ${created.name}`);
      await invalidateAll();
    },
    onError: (error: unknown) => {
      setUiMessage(error instanceof Error ? error.message : 'Грешка при създаване на марка');
    },
  });

  const createModelMutation = useMutation({
    mutationFn: (payload: {
      makeId: string;
      name: string;
      yearFrom?: number;
      yearTo?: number;
      vpicModelId?: number;
    }) => postJson<VehicleModel>('/api/v1/admin/vehicle-catalog/models', payload),
    onSuccess: async (created) => {
      setModelName('');
      setModelYearFrom('');
      setModelYearTo('');
      setModelVpicId('');
      setUiMessage(`Добавен модел: ${created.name}`);
      await invalidateAll();
    },
    onError: (error: unknown) => {
      setUiMessage(error instanceof Error ? error.message : 'Грешка при създаване на модел');
    },
  });

  const toggleMakeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      patchJson<VehicleMake>(`/api/v1/admin/vehicle-catalog/makes/${id}`, {
        isActive,
      }),
    onSuccess: async () => {
      await invalidateAll();
    },
  });

  const toggleModelMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      patchJson<VehicleModel>(`/api/v1/admin/vehicle-catalog/models/${id}`, {
        isActive,
      }),
    onSuccess: async () => {
      await invalidateAll();
    },
  });

  const deleteMakeMutation = useMutation({
    mutationFn: (id: string) => deleteRow(`/api/v1/admin/vehicle-catalog/makes/${id}`),
    onSuccess: async () => {
      setSelectedMakeId(null);
      setUiMessage('Марката е изтрита');
      await invalidateAll();
    },
  });

  const deleteModelMutation = useMutation({
    mutationFn: (id: string) =>
      deleteRow(`/api/v1/admin/vehicle-catalog/models/${id}`),
    onSuccess: async () => {
      setUiMessage('Моделът е изтрит');
      await invalidateAll();
    },
  });

  const syncMakesMutation = useMutation({
    mutationFn: syncAllMakes,
    onSuccess: async (result) => {
      setUiMessage(
        `vPIC марки sync: нови ${result.imported}, обновени ${result.updated}`,
      );
      await invalidateAll();
    },
    onError: (error: unknown) => {
      setUiMessage(error instanceof Error ? error.message : 'Грешка при sync');
    },
  });

  const syncModelsMutation = useMutation({
    mutationFn: (makeId: string) => syncModelsForMake(makeId),
    onSuccess: async (result) => {
      setUiMessage(
        `vPIC модели sync: нови ${result.imported}, обновени ${result.updated}`,
      );
      await invalidateAll();
    },
    onError: (error: unknown) => {
      setUiMessage(error instanceof Error ? error.message : 'Грешка при sync');
    },
  });

  const onCreateMake = (event: FormEvent) => {
    event.preventDefault();
    const payload: { name: string; vpicMakeId?: number } = {
      name: makeName.trim(),
    };
    if (makeVpicId.trim()) {
      payload.vpicMakeId = Number(makeVpicId);
    }
    createMakeMutation.mutate(payload);
  };

  const onCreateModel = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedMakeId) return;

    const payload: {
      makeId: string;
      name: string;
      yearFrom?: number;
      yearTo?: number;
      vpicModelId?: number;
    } = {
      makeId: selectedMakeId,
      name: modelName.trim(),
    };
    if (modelYearFrom.trim()) payload.yearFrom = Number(modelYearFrom);
    if (modelYearTo.trim()) payload.yearTo = Number(modelYearTo);
    if (modelVpicId.trim()) payload.vpicModelId = Number(modelVpicId);

    createModelMutation.mutate(payload);
  };

  if (makesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Зареждане на автомобилен каталог...</p>
      </div>
    );
  }

  if (makesError) {
    return (
      <div className="p-6">
        <p className="text-red-600">Грешка при зареждане на марки.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Автомобили - Глобален каталог</h1>
          <p className="mt-1 text-sm text-gray-500">
            CRUD за марки и модели + sync от vPIC (NHTSA)
          </p>
        </div>
        <button
          onClick={() => syncMakesMutation.mutate()}
          disabled={syncMakesMutation.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {syncMakesMutation.isPending
            ? 'Синхронизирам марки...'
            : 'Sync марки от vPIC'}
        </button>
      </div>

      {uiMessage ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {uiMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Марки</h2>

          <form onSubmit={onCreateMake} className="mt-4 space-y-3">
            <input
              value={makeName}
              onChange={(event) => setMakeName(event.target.value)}
              placeholder="Нова марка (напр. Toyota)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
            <input
              value={makeVpicId}
              onChange={(event) => setMakeVpicId(event.target.value)}
              placeholder="vPIC Make ID (optional)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              inputMode="numeric"
            />
            <button
              type="submit"
              disabled={createMakeMutation.isPending}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
            >
              Добави марка
            </button>
          </form>

          <div className="mt-5 max-h-[520px] overflow-y-auto">
            <ul className="space-y-2">
              {makes.map((make) => {
                const selected = selectedMakeId === make.id;
                return (
                  <li
                    key={make.id}
                    className={`rounded-md border p-3 ${
                      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => setSelectedMakeId(make.id)}
                      >
                        <p className="font-medium text-gray-900">{make.name}</p>
                        <p className="text-xs text-gray-500">
                          vPIC: {make.vpicMakeId ?? '-'} | {make.isActive ? 'active' : 'inactive'}
                        </p>
                      </button>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            toggleMakeMutation.mutate({
                              id: make.id,
                              isActive: !make.isActive,
                            })
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                        >
                          {make.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextName = window.prompt('Ново име на марката', make.name);
                            if (!nextName || nextName.trim() === make.name) return;
                            patchJson<VehicleMake>(
                              `/api/v1/admin/vehicle-catalog/makes/${make.id}`,
                              { name: nextName.trim() },
                            )
                              .then(async () => {
                                await invalidateAll();
                                setUiMessage('Марка обновена');
                              })
                              .catch((err: unknown) => {
                                setUiMessage(
                                  err instanceof Error ? err.message : 'Грешка при обновяване',
                                );
                              });
                          }}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const ok = window.confirm(`Изтриване на марка ${make.name}?`);
                            if (!ok) return;
                            deleteMakeMutation.mutate(make.id);
                          }}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Модели {selectedMake ? `- ${selectedMake.name}` : ''}
            </h2>
            {selectedMake ? (
              <button
                onClick={() => syncModelsMutation.mutate(selectedMake.id)}
                disabled={syncModelsMutation.isPending}
                className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {syncModelsMutation.isPending
                  ? 'Синхронизирам...'
                  : 'Sync модели за марката'}
              </button>
            ) : null}
          </div>

          {!selectedMake ? (
            <p className="mt-4 text-sm text-gray-500">
              Избери марка отляво, за да видиш и управляваш модели.
            </p>
          ) : (
            <>
              <form onSubmit={onCreateModel} className="mt-4 grid gap-2 sm:grid-cols-2">
                <input
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  placeholder="Модел (напр. Corolla)"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  required
                />
                <input
                  value={modelVpicId}
                  onChange={(event) => setModelVpicId(event.target.value)}
                  placeholder="vPIC Model ID"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  inputMode="numeric"
                />
                <input
                  value={modelYearFrom}
                  onChange={(event) => setModelYearFrom(event.target.value)}
                  placeholder="Year From"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  inputMode="numeric"
                />
                <input
                  value={modelYearTo}
                  onChange={(event) => setModelYearTo(event.target.value)}
                  placeholder="Year To"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  inputMode="numeric"
                />
                <button
                  type="submit"
                  disabled={createModelMutation.isPending}
                  className="sm:col-span-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
                >
                  Добави модел
                </button>
              </form>

              {modelsError ? (
                <p className="mt-4 text-sm text-red-600">Грешка при зареждане на модели.</p>
              ) : modelsLoading ? (
                <p className="mt-4 text-sm text-gray-500">Зареждане на модели...</p>
              ) : (
                <div className="mt-4 max-h-[460px] overflow-auto rounded border border-gray-200">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="px-3 py-2">Модел</th>
                        <th className="px-3 py-2">Години</th>
                        <th className="px-3 py-2">vPIC</th>
                        <th className="px-3 py-2">Статус</th>
                        <th className="px-3 py-2">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.map((model) => (
                        <tr key={model.id} className="border-t border-gray-200">
                          <td className="px-3 py-2">{model.name}</td>
                          <td className="px-3 py-2">
                            {model.yearFrom ?? '-'} - {model.yearTo ?? '-'}
                          </td>
                          <td className="px-3 py-2">{model.vpicModelId ?? '-'}</td>
                          <td className="px-3 py-2">
                            {model.isActive ? 'active' : 'inactive'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleModelMutation.mutate({
                                    id: model.id,
                                    isActive: !model.isActive,
                                  })
                                }
                                className="rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                {model.isActive ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextName = window.prompt('Ново име на модела', model.name);
                                  if (!nextName || nextName.trim() === model.name) return;
                                  patchJson<VehicleModel>(
                                    `/api/v1/admin/vehicle-catalog/models/${model.id}`,
                                    { name: nextName.trim() },
                                  )
                                    .then(async () => {
                                      await invalidateAll();
                                      setUiMessage('Модел обновен');
                                    })
                                    .catch((err: unknown) => {
                                      setUiMessage(
                                        err instanceof Error
                                          ? err.message
                                          : 'Грешка при обновяване',
                                      );
                                    });
                                }}
                                className="rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const ok = window.confirm(`Изтриване на модел ${model.name}?`);
                                  if (!ok) return;
                                  deleteModelMutation.mutate(model.id);
                                }}
                                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
