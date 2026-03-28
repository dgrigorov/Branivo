'use client';

import { useState } from 'react';
import { ChevronDown, Gauge, Fuel, Zap, Settings2, Car } from 'lucide-react';
import { type VehicleModification, type VehicleMake, type VehicleModel, BODY_TYPE_LABELS, ENGINE_TYPE_LABELS } from './types';

const ENGINE_COLORS: Record<string, string> = {
  petrol: 'text-amber-400 bg-amber-400/10',
  diesel: 'text-slate-300 bg-slate-300/10',
  electric: 'text-emerald-400 bg-emerald-400/10',
  hybrid: 'text-teal-400 bg-teal-400/10',
  lpg: 'text-blue-400 bg-blue-400/10',
  cng: 'text-purple-400 bg-purple-400/10',
};

function SpecRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-white/5">
      <span className="text-xs text-white/40 shrink-0">{label}</span>
      <span className="text-xs text-white/80 text-right">{String(value)}</span>
    </div>
  );
}

function ModificationRow({
  mod,
  makeName,
  modelName,
  modelImageUrl,
}: {
  mod: VehicleModification;
  makeName: string;
  modelName: string;
  modelImageUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const photo = (mod.imageUrl && !imgErr) ? mod.imageUrl : modelImageUrl;
  const engineColor = ENGINE_COLORS[mod.engineType ?? ''] ?? 'text-white/50 bg-white/5';
  const yearRange = [mod.yearFrom, mod.yearTo].filter(Boolean).join(' – ');

  return (
    <div className={`border-b border-white/5 transition-colors ${open ? 'bg-white/3' : 'hover:bg-white/2'}`}>
      {/* Summary row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white leading-snug">
            {makeName} {modelName} {mod.name}
          </p>
          {yearRange && <p className="text-xs text-white/35 mt-0.5">{yearRange}</p>}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {mod.engineType && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${engineColor}`}>
              {mod.engineType === 'electric' ? <Zap className="inline h-2.5 w-2.5 mr-0.5" /> : <Fuel className="inline h-2.5 w-2.5 mr-0.5" />}
              {ENGINE_TYPE_LABELS[mod.engineType] ?? mod.engineType}
            </span>
          )}
          {mod.powerHp && (
            <span className="text-xs text-white/50 hidden sm:block">{mod.powerHp} к.с.</span>
          )}
          {mod.transmission && (
            <span className="text-[10px] text-white/35 hidden md:block">
              {mod.transmission === 'automatic' ? 'Авт.' : 'Ръч.'}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="px-4 pb-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Photo */}
          <div className="lg:col-span-1">
            {photo && !imgErr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mod.imageUrl ?? photo}
                alt={`${makeName} ${modelName} ${mod.name}`}
                className="w-full rounded-xl object-cover aspect-video"
                onError={() => setImgErr(true)}
              />
            ) : (
              <div className="w-full rounded-xl bg-white/5 aspect-video flex items-center justify-center">
                <Car className="h-12 w-12 text-white/10" />
              </div>
            )}
          </div>

          {/* Core specs */}
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Gauge className="h-3 w-3" /> Технически данни
            </p>
            <SpecRow label="Двигател" value={mod.engineSizeCc ? `${mod.engineSizeCc} cc` : null} />
            <SpecRow label="Мощност" value={mod.powerHp ? `${mod.powerHp} к.с. / ${mod.powerKw ?? '–'} kW` : null} />
            <SpecRow label="Купе" value={mod.bodyType ? BODY_TYPE_LABELS[mod.bodyType] : null} />
            <SpecRow label="Врати / Места" value={(mod.doors || mod.seats) ? `${mod.doors ?? '–'} / ${mod.seats ?? '–'}` : null} />
            <SpecRow label="Скоростна кутия" value={mod.transmission === 'automatic' ? 'Автоматична' : mod.transmission === 'manual' ? 'Механична' : mod.transmission} />
            <SpecRow label="Задвижване" value={mod.drive?.toUpperCase()} />
            <SpecRow label="Мах. скорост" value={mod.maxSpeedKmh ? `${mod.maxSpeedKmh} км/ч` : null} />
            <SpecRow label="0–100 км/ч" value={mod.acceleration0100 ? `${mod.acceleration0100} сек` : null} />
            <SpecRow label="Тегло" value={mod.weightKg ? `${mod.weightKg} кг` : null} />
            {mod.engineCode && <SpecRow label="Код двигател" value={mod.engineCode} />}
          </div>

          {/* Fuel consumption + raw extras */}
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Fuel className="h-3 w-3" /> Разход на гориво
            </p>
            <SpecRow label="Градско" value={mod.fuelConsumptionCity ? `${mod.fuelConsumptionCity} л/100км` : null} />
            <SpecRow label="Извънградско" value={mod.fuelConsumptionHighway ? `${mod.fuelConsumptionHighway} л/100км` : null} />
            <SpecRow label="Комбинирано" value={mod.fuelConsumptionCombined ? `${mod.fuelConsumptionCombined} л/100км` : null} />

            {mod.rawData && Object.keys(mod.rawData).length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mt-4 mb-2 flex items-center gap-1.5">
                  <Settings2 className="h-3 w-3" /> Пълни характеристики
                </p>
                {Object.entries(mod.rawData)
                  .filter(([k]) => !['Марка','Модел','Генерация'].includes(k))
                  .map(([k, v]) => <SpecRow key={k} label={k} value={v} />)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  modifications: VehicleModification[];
  make: VehicleMake;
  model: VehicleModel;
  isLoading: boolean;
}

export function ModificationsTable({ modifications, make, model, isLoading }: Props) {
  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden bg-white/2">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Модификации</p>
          <p className="text-sm font-semibold text-white mt-0.5">
            {make.name} · {model.name}
            {(model.yearFrom ?? model.yearTo) ? (
              <span className="text-white/40 font-normal ml-2">
                {[model.yearFrom, model.yearTo].filter(Boolean).join(' – ')}
              </span>
            ) : null}
          </p>
        </div>
        <span className="text-xs text-white/30">{modifications.length} версии</span>
      </div>

      {/* Rows */}
      {isLoading ? (
        <div className="space-y-px">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-white/3 animate-pulse" />
          ))}
        </div>
      ) : modifications.length === 0 ? (
        <div className="py-16 text-center text-white/25 text-sm">Няма намерени модификации</div>
      ) : (
        modifications.map((mod) => (
          <ModificationRow
            key={mod.id}
            mod={mod}
            makeName={make.name}
            modelName={model.name}
            modelImageUrl={model.imageUrl}
          />
        ))
      )}
    </div>
  );
}
