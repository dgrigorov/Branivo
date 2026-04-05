'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Car } from 'lucide-react';
import { type VehicleModel, BODY_TYPE_LABELS } from './types';

function ModelCard({
  model,
  isSelected,
  makeName,
  onClick,
}: {
  model: VehicleModel;
  isSelected: boolean;
  makeName: string;
  onClick: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const years = [model.yearFrom, model.yearTo].filter(Boolean).join(' – ');
  const imageSrc = imgErr ? null : model.imageUrl;

  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-56 rounded-2xl overflow-hidden border transition-all duration-300 ${
        isSelected
          ? 'border-amber-400 ring-2 ring-amber-400/30 shadow-xl shadow-amber-100 scale-[1.02]'
          : 'border-gray-200 hover:border-gray-300 hover:scale-[1.01] shadow-sm hover:shadow-md'
      }`}
    >
      {/* Image area */}
      <div className="relative h-36 bg-gray-100 overflow-hidden flex items-center justify-center">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={`${makeName} ${model.name}`}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-100 to-gray-200">
            <Car className="h-10 w-10 text-gray-300" />
            <span className="text-xs text-gray-400 font-medium">{model.name}</span>
          </div>
        )}

        {/* Body type badge */}
        {model.bodyType && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/90 text-gray-600 border border-gray-200 shadow-sm">
            {BODY_TYPE_LABELS[model.bodyType] ?? model.bodyType}
          </span>
        )}

        {isSelected && (
          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center shadow">
            <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 12 12">
              <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className={`px-3 py-2.5 text-left ${isSelected ? 'bg-amber-50' : 'bg-white'}`}>
        <p className={`text-sm font-semibold leading-tight ${isSelected ? 'text-amber-600' : 'text-gray-900'}`}>
          {model.name}
        </p>
        {years && <p className="text-[11px] text-gray-400 mt-0.5">{years}</p>}
        <p className="text-[10px] text-gray-400 mt-1">
          {model.modificationsCount} {model.modificationsCount === 1 ? 'версия' : 'версии'}
        </p>
      </div>
    </button>
  );
}

interface Props {
  models: VehicleModel[];
  selectedId: string | null;
  makeName: string;
  isLoading: boolean;
  onSelect: (id: string) => void;
}

export function ModelsCarousel({ models, selectedId, makeName, isLoading, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'right' ? 480 : -480, behavior: 'smooth' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
          Модели · {makeName}
        </h3>
        <p className="text-xs text-gray-400">{models.length} модела</p>
      </div>

      <div className="relative group">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 h-8 w-8 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scroll-smooth py-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-56 h-48 rounded-2xl bg-gray-100 animate-pulse" />
              ))
            : models.filter((m) => m.isActive).map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isSelected={model.id === selectedId}
                  makeName={makeName}
                  onClick={() => onSelect(model.id)}
                />
              ))}
        </div>

        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 h-8 w-8 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
