'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, Gauge, Fuel, Zap, Settings2, Car,
  Cog, Timer, Weight, DoorOpen,
  Users, ArrowRightLeft, Droplets, X,
} from 'lucide-react';
import { type VehicleModification, type VehicleMake, type VehicleModel, BODY_TYPE_LABELS, ENGINE_TYPE_LABELS } from './types';
import { SelectField } from '@/components/ui/select-field';

// ─── Constants ────────────────────────────────────────────────────────────────

const ENGINE_COLORS: Record<string, string> = {
  petrol:   'text-amber-700 bg-amber-50 border-amber-200',
  diesel:   'text-slate-700 bg-slate-100 border-slate-200',
  electric: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  hybrid:   'text-teal-700 bg-teal-50 border-teal-200',
  lpg:      'text-blue-700 bg-blue-50 border-blue-200',
  cng:      'text-purple-700 bg-purple-50 border-purple-200',
};

const TRANSMISSION_LABELS: Record<string, string> = {
  automatic: 'Автоматик',
  manual:    'Ръчна',
};

const DRIVE_LABELS: Record<string, string> = {
  fwd:  'Предно',
  rwd:  'Задно',
  awd:  'AWD',
  '4wd': '4WD',
};

// ─── Range buckets ────────────────────────────────────────────────────────────

interface Bucket { label: string; min: number | null; max: number | null; }

const POWER_BUCKETS: Bucket[] = [
  { label: 'до 100 к.с.',   min: null, max: 100  },
  { label: '100–150 к.с.',  min: 100,  max: 150  },
  { label: '150–200 к.с.',  min: 150,  max: 200  },
  { label: '200–300 к.с.',  min: 200,  max: 300  },
  { label: '300+ к.с.',     min: 300,  max: null  },
];

const SPEED_BUCKETS: Bucket[] = [
  { label: 'до 160 км/ч',  min: null, max: 160  },
  { label: '160–200 км/ч', min: 160,  max: 200  },
  { label: '200–240 км/ч', min: 200,  max: 240  },
  { label: '240+ км/ч',    min: 240,  max: null  },
];

const ACCEL_BUCKETS: Bucket[] = [
  { label: 'до 6 сек',  min: null, max: 6   },
  { label: '6–8 сек',   min: 6,    max: 8   },
  { label: '8–10 сек',  min: 8,    max: 10  },
  { label: '10+ сек',   min: 10,   max: null },
];

const WEIGHT_BUCKETS: Bucket[] = [
  { label: 'до 1 200 кг',    min: null, max: 1200 },
  { label: '1 200–1 500 кг', min: 1200, max: 1500 },
  { label: '1 500–1 800 кг', min: 1500, max: 1800 },
  { label: '1 800+ кг',      min: 1800, max: null  },
];

function inBucket(value: number | null | undefined, bucket: Bucket): boolean {
  if (value == null) return false;
  if (bucket.min !== null && value < bucket.min) return false;
  if (bucket.max !== null && value >= bucket.max) return false;
  return true;
}

// ─── Spec card ────────────────────────────────────────────────────────────────

function SpecCard({ icon, label, value }: {
  icon: React.ReactNode;
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm text-gray-500">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 leading-none mb-0.5 uppercase tracking-wide font-medium">{label}</p>
        <p className="text-[12px] font-semibold text-gray-800 leading-tight">{String(value)}</p>
      </div>
    </div>
  );
}

// ─── Fuel bar ─────────────────────────────────────────────────────────────────

function FuelBar({ city, highway, combined }: {
  city: number | null; highway: number | null; combined: number | null;
}) {
  if (!city && !highway && !combined) return null;
  return (
    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100">
      <Droplets className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
      {city && <span className="text-xs text-gray-600"><span className="font-semibold text-gray-900">{city}</span><span className="text-gray-400 ml-1">л/100км</span><span className="text-[10px] text-blue-400 ml-1">Град</span></span>}
      {highway && <span className="text-xs text-gray-600"><span className="font-semibold text-gray-900">{highway}</span><span className="text-gray-400 ml-1">л/100км</span><span className="text-[10px] text-blue-400 ml-1">Извън</span></span>}
      {combined && <span className="text-xs text-gray-600"><span className="font-semibold text-gray-900">{combined}</span><span className="text-gray-400 ml-1">л/100км</span><span className="text-[10px] text-blue-400 ml-1">Комб.</span></span>}
    </div>
  );
}

// ─── Raw data grid ────────────────────────────────────────────────────────────

function RawDataGrid({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data).filter(([k]) => !['Марка', 'Модел', 'Генерация'].includes(k));
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <Settings2 className="h-3 w-3" /> Пълни характеристики
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
            <span className="text-[11px] text-gray-400 truncate">{k}</span>
            <span className="text-[11px] text-gray-700 font-medium text-right shrink-0">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modification row ─────────────────────────────────────────────────────────

function ModificationRow({ mod, makeName, modelName }: {
  mod: VehicleModification; makeName: string; modelName: string;
}) {
  const [open, setOpen] = useState(false);
  const engineColor = ENGINE_COLORS[mod.engineType ?? ''] ?? 'text-gray-600 bg-gray-100 border-gray-200';
  const yearRange = [mod.yearFrom, mod.yearTo].filter(Boolean).join(' – ');

  return (
    <div className={`border-b border-gray-100 last:border-0 transition-colors ${open ? 'bg-amber-50/30' : 'hover:bg-gray-50'}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-3.5 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug">{makeName} {modelName} {mod.name}</p>
          {yearRange && <p className="text-xs text-gray-400 mt-0.5">{yearRange}</p>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {mod.engineType && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${engineColor}`}>
              {mod.engineType === 'electric' ? <Zap className="inline h-2.5 w-2.5 mr-0.5" /> : <Fuel className="inline h-2.5 w-2.5 mr-0.5" />}
              {ENGINE_TYPE_LABELS[mod.engineType] ?? mod.engineType}
            </span>
          )}
          {mod.powerHp && <span className="text-xs text-gray-500 hidden sm:block">{mod.powerHp} к.с.</span>}
          {mod.transmission && (
            <span className="text-[10px] text-gray-400 hidden md:block">
              {mod.transmission === 'automatic' ? 'Авт.' : 'Ръч.'}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-6 space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <Gauge className="h-3 w-3" /> Технически данни
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <SpecCard icon={<Cog className="h-4 w-4" />} label="Двигател" value={mod.engineSizeCc ? `${mod.engineSizeCc} cc` : null} />
            <SpecCard icon={<Gauge className="h-4 w-4" />} label="Мощност" value={mod.powerHp ? `${mod.powerHp} к.с.` : null} />
            <SpecCard icon={<DoorOpen className="h-4 w-4" />} label="Врати" value={mod.doors} />
            <SpecCard icon={<Users className="h-4 w-4" />} label="Места" value={mod.seats} />
            <SpecCard icon={<Settings2 className="h-4 w-4" />} label="Скор. кутия" value={mod.transmission === 'automatic' ? 'Авт.' : mod.transmission === 'manual' ? 'Ръч.' : mod.transmission} />
            <SpecCard icon={<ArrowRightLeft className="h-4 w-4" />} label="Задвижване" value={mod.drive?.toUpperCase()} />
            <SpecCard icon={<Gauge className="h-4 w-4" />} label="Мах. скорост" value={mod.maxSpeedKmh ? `${mod.maxSpeedKmh} км/ч` : null} />
            <SpecCard icon={<Timer className="h-4 w-4" />} label="0–100" value={mod.acceleration0100 ? `${mod.acceleration0100} сек` : null} />
            <SpecCard icon={<Weight className="h-4 w-4" />} label="Тегло" value={mod.weightKg ? `${mod.weightKg} кг` : null} />
            {mod.bodyType && <SpecCard icon={<Car className="h-4 w-4" />} label="Купе" value={BODY_TYPE_LABELS[mod.bodyType] ?? mod.bodyType} />}
            {mod.engineCode && <SpecCard icon={<Cog className="h-4 w-4" />} label="Код двиг." value={mod.engineCode} />}
          </div>
          <FuelBar city={mod.fuelConsumptionCity} highway={mod.fuelConsumptionHighway} combined={mod.fuelConsumptionCombined} />
          {mod.rawData && Object.keys(mod.rawData).length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <RawDataGrid data={mod.rawData} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar filter components ────────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{title}</p>
      {children}
    </div>
  );
}

function FilterChip({ label, active, color, onClick }: {
  label: string; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
        active ? color : 'text-gray-500 bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}

function FilterDropdown({ title, buckets, value, mods, getField, onChange }: {
  title: string;
  buckets: Bucket[];
  value: string;
  mods: VehicleModification[];
  getField: (m: VehicleModification) => number | null | undefined;
  onChange: (v: string) => void;
}) {
  const available = buckets.filter((b) => mods.some((m) => inBucket(getField(m), b)));
  if (available.length === 0) return null;
  return (
    <FilterSection title={title}>
      <SelectField value={value} onChange={(e) => onChange(e.target.value)} className="text-[11px] py-1.5 rounded-lg">
        <option value="">Всички</option>
        {available.map((b) => (
          <option key={b.label} value={b.label}>{b.label}</option>
        ))}
      </SelectField>
    </FilterSection>
  );
}

function FilterSelect({ title, options, value, onChange }: {
  title: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <FilterSection title={title}>
      <SelectField value={value} onChange={(e) => onChange(e.target.value)} className="text-[11px] py-1.5 rounded-lg">
        <option value="">Всички</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </SelectField>
    </FilterSection>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

interface Props {
  modifications: VehicleModification[];
  make: VehicleMake;
  model: VehicleModel;
  isLoading: boolean;
}

export function ModificationsTable({ modifications, make, model, isLoading }: Props) {
  // Discrete filters (multi-select via chips)
  const [activeEngineTypes, setActiveEngineTypes] = useState<Set<string>>(new Set());
  const [activeDoors, setActiveDoors] = useState<Set<string>>(new Set());
  const [activeSeats, setActiveSeats] = useState<Set<string>>(new Set());
  const [activeTransmissions, setActiveTransmissions] = useState<Set<string>>(new Set());
  const [activeDrives, setActiveDrives] = useState<Set<string>>(new Set());

  // Categorical dropdown filters
  const [bodyTypeFilter, setBodyTypeFilter] = useState('');

  // Range dropdown filters
  const [powerFilter, setPowerFilter] = useState('');
  const [speedFilter, setSpeedFilter] = useState('');
  const [accelFilter, setAccelFilter] = useState('');
  const [weightFilter, setWeightFilter] = useState('');

  // Reset all filters when model changes
  useEffect(() => {
    setActiveEngineTypes(new Set());
    setActiveDoors(new Set());
    setActiveSeats(new Set());
    setActiveTransmissions(new Set());
    setActiveDrives(new Set());
    setBodyTypeFilter('');
    setPowerFilter('');
    setSpeedFilter('');
    setAccelFilter('');
    setWeightFilter('');
  }, [model.id]);

  // Available discrete options
  const availableEngineTypes = useMemo(
    () => Array.from(new Set(modifications.map((m) => m.engineType).filter((v): v is string => Boolean(v)))).sort(),
    [modifications],
  );
  const availableDoors = useMemo(
    () => Array.from(new Set(modifications.map((m) => m.doors).filter((v): v is number => v != null))).sort((a, b) => a - b).map(String),
    [modifications],
  );
  const availableSeats = useMemo(
    () => Array.from(new Set(modifications.map((m) => m.seats).filter((v): v is number => v != null))).sort((a, b) => a - b).map(String),
    [modifications],
  );
  const availableTransmissions = useMemo(
    () => Array.from(new Set(modifications.map((m) => m.transmission).filter((v): v is string => Boolean(v)))).sort(),
    [modifications],
  );
  const availableDrives = useMemo(
    () => Array.from(new Set(modifications.map((m) => m.drive).filter((v): v is string => Boolean(v)))).sort(),
    [modifications],
  );
  const availableBodyTypes = useMemo(
    () => Array.from(new Set(modifications.map((m) => m.bodyType).filter((v): v is string => Boolean(v)))).sort()
      .map((v) => ({ value: v, label: BODY_TYPE_LABELS[v] ?? v })),
    [modifications],
  );

  // Selected range buckets
  const selectedPower  = POWER_BUCKETS.find((b) => b.label === powerFilter)  ?? null;
  const selectedSpeed  = SPEED_BUCKETS.find((b) => b.label === speedFilter)  ?? null;
  const selectedAccel  = ACCEL_BUCKETS.find((b) => b.label === accelFilter)  ?? null;
  const selectedWeight = WEIGHT_BUCKETS.find((b) => b.label === weightFilter) ?? null;

  // Apply all filters
  const filtered = useMemo(
    () =>
      modifications.filter((m) => {
        if (activeEngineTypes.size > 0 && (!m.engineType || !activeEngineTypes.has(m.engineType))) return false;
        if (activeDoors.size > 0 && (m.doors == null || !activeDoors.has(String(m.doors)))) return false;
        if (activeSeats.size > 0 && (m.seats == null || !activeSeats.has(String(m.seats)))) return false;
        if (activeTransmissions.size > 0 && (!m.transmission || !activeTransmissions.has(m.transmission))) return false;
        if (activeDrives.size > 0 && (!m.drive || !activeDrives.has(m.drive))) return false;
        if (bodyTypeFilter && m.bodyType !== bodyTypeFilter) return false;
        if (selectedPower  && !inBucket(m.powerHp,        selectedPower))  return false;
        if (selectedSpeed  && !inBucket(m.maxSpeedKmh,    selectedSpeed))  return false;
        if (selectedAccel  && !inBucket(m.acceleration0100, selectedAccel)) return false;
        if (selectedWeight && !inBucket(m.weightKg,        selectedWeight)) return false;
        return true;
      }),
    [modifications, activeEngineTypes, activeDoors, activeSeats, activeTransmissions, activeDrives,
     bodyTypeFilter, selectedPower, selectedSpeed, selectedAccel, selectedWeight],
  );

  const toggleChip = (current: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const hasActiveFilters =
    activeEngineTypes.size > 0 || activeDoors.size > 0 || activeSeats.size > 0 ||
    activeTransmissions.size > 0 || activeDrives.size > 0 ||
    bodyTypeFilter || powerFilter || speedFilter || accelFilter || weightFilter;

  const clearAll = () => {
    setActiveEngineTypes(new Set()); setActiveDoors(new Set());
    setActiveSeats(new Set()); setActiveTransmissions(new Set()); setActiveDrives(new Set());
    setBodyTypeFilter(''); setPowerFilter(''); setSpeedFilter('');
    setAccelFilter(''); setWeightFilter('');
  };

  const showSidebar = !isLoading && modifications.length > 0;

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest">Модификации</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">
            {make.name} · {model.name}
            {(model.yearFrom ?? model.yearTo) ? (
              <span className="text-gray-400 font-normal ml-2">
                {[model.yearFrom, model.yearTo].filter(Boolean).join(' – ')}
              </span>
            ) : null}
          </p>
        </div>
        <span className="text-xs text-gray-400">
          {hasActiveFilters ? `${filtered.length} / ${modifications.length}` : modifications.length} версии
        </span>
      </div>

      <div className="flex min-h-0">

        {/* ── Sidebar ── */}
        {showSidebar && (
          <aside className="w-48 flex-shrink-0 border-r border-gray-100 bg-gray-50/60 p-4 space-y-4 overflow-y-auto">

            {availableEngineTypes.length > 1 && (
              <FilterSection title="Двигател">
                {availableEngineTypes.map((t) => (
                  <FilterChip
                    key={t}
                    label={ENGINE_TYPE_LABELS[t] ?? t}
                    active={activeEngineTypes.has(t)}
                    color={ENGINE_COLORS[t] ?? 'text-gray-600 bg-gray-100 border-gray-300'}
                    onClick={() => toggleChip(activeEngineTypes, t, setActiveEngineTypes)}
                  />
                ))}
              </FilterSection>
            )}

            <FilterDropdown
              title="Мощност"
              buckets={POWER_BUCKETS}
              value={powerFilter}
              mods={modifications}
              getField={(m) => m.powerHp}
              onChange={setPowerFilter}
            />

            {availableDoors.length > 1 && (
              <FilterSection title="Врати">
                {availableDoors.map((d) => (
                  <FilterChip
                    key={d}
                    label={`${d} врати`}
                    active={activeDoors.has(d)}
                    color="text-orange-700 bg-orange-50 border-orange-200"
                    onClick={() => toggleChip(activeDoors, d, setActiveDoors)}
                  />
                ))}
              </FilterSection>
            )}

            {availableSeats.length > 1 && (
              <FilterSection title="Места">
                {availableSeats.map((s) => (
                  <FilterChip
                    key={s}
                    label={`${s} места`}
                    active={activeSeats.has(s)}
                    color="text-pink-700 bg-pink-50 border-pink-200"
                    onClick={() => toggleChip(activeSeats, s, setActiveSeats)}
                  />
                ))}
              </FilterSection>
            )}

            {availableTransmissions.length > 1 && (
              <FilterSection title="Скоростна кутия">
                {availableTransmissions.map((t) => (
                  <FilterChip
                    key={t}
                    label={TRANSMISSION_LABELS[t] ?? t}
                    active={activeTransmissions.has(t)}
                    color="text-violet-700 bg-violet-50 border-violet-200"
                    onClick={() => toggleChip(activeTransmissions, t, setActiveTransmissions)}
                  />
                ))}
              </FilterSection>
            )}

            {availableDrives.length > 1 && (
              <FilterSection title="Задвижване">
                {availableDrives.map((d) => (
                  <FilterChip
                    key={d}
                    label={DRIVE_LABELS[d.toLowerCase()] ?? d.toUpperCase()}
                    active={activeDrives.has(d)}
                    color="text-cyan-700 bg-cyan-50 border-cyan-200"
                    onClick={() => toggleChip(activeDrives, d, setActiveDrives)}
                  />
                ))}
              </FilterSection>
            )}

            <FilterDropdown
              title="Макс. скорост"
              buckets={SPEED_BUCKETS}
              value={speedFilter}
              mods={modifications}
              getField={(m) => m.maxSpeedKmh}
              onChange={setSpeedFilter}
            />

            <FilterDropdown
              title="0–100"
              buckets={ACCEL_BUCKETS}
              value={accelFilter}
              mods={modifications}
              getField={(m) => m.acceleration0100}
              onChange={setAccelFilter}
            />

            <FilterDropdown
              title="Тегло"
              buckets={WEIGHT_BUCKETS}
              value={weightFilter}
              mods={modifications}
              getField={(m) => m.weightKg}
              onChange={setWeightFilter}
            />

            {availableBodyTypes.length > 1 && (
              <FilterSelect
                title="Купе"
                options={availableBodyTypes}
                value={bodyTypeFilter}
                onChange={setBodyTypeFilter}
              />
            )}

            {hasActiveFilters && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors pt-1"
              >
                <X className="h-3 w-3" /> Изчисти всички
              </button>
            )}
          </aside>
        )}

        {/* ── Results ── */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="space-y-px">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-50 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              {hasActiveFilters ? 'Няма версии, отговарящи на филтрите' : 'Няма намерени модификации'}
            </div>
          ) : (
            filtered.map((mod) => (
              <ModificationRow
                key={mod.id}
                mod={mod}
                makeName={make.name}
                modelName={model.name}
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
