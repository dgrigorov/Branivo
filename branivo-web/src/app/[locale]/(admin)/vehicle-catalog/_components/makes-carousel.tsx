'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { type VehicleMake } from './types';

function MakeLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [err, setErr] = useState(false);
  if (logoUrl && !err) {
    return (
      <div className="h-16 w-16 flex items-center justify-center bg-white rounded-2xl p-2 flex-shrink-0 border border-gray-100 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="h-full w-full object-contain" onError={() => setErr(true)} />
      </div>
    );
  }
  const colors = ['#3B82F6','#6B7280','#EF4444','#10B981','#8B5CF6','#F59E0B'];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-white font-bold text-base flex-shrink-0" style={{ background: bg }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

interface Props {
  makes: VehicleMake[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
}

export function MakesCarousel({ makes, selectedId, isLoading, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const activeMakes = makes.filter((m) => m.isActive);

  // Letters that have at least one active make
  const availableLetters = Array.from(
    new Set(activeMakes.map((m) => m.name[0]?.toUpperCase() ?? '')),
  )
    .filter(Boolean)
    .sort();

  // Sort: popular first, then alphabetical
  const popular = activeMakes.filter((m) => m.isPopular);
  const others = activeMakes.filter((m) => !m.isPopular);
  const allSorted = [...popular, ...others];

  // Apply search
  const sorted = search.trim()
    ? allSorted.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    : allSorted;

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'right' ? 320 : -320, behavior: 'smooth' });
  };

  const handleLetterClick = (letter: string) => {
    const next = activeLetter === letter ? null : letter;
    setActiveLetter(next);
    setSearch('');
    if (!next) return;
    // Scroll to first make starting with this letter
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const target = el.querySelector<HTMLElement>(`[data-firstletter="${letter}"]`);
      if (target) {
        const containerLeft = el.getBoundingClientRect().left;
        const targetLeft = target.getBoundingClientRect().left;
        el.scrollBy({ left: targetLeft - containerLeft - 12, behavior: 'smooth' });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Top row: search + letter filter */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Търси марка..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveLetter(null); }}
            className="bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 shadow-sm w-48"
          />
        </div>

        {/* Letter filter */}
        {!isLoading && availableLetters.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {availableLetters.map((letter) => (
              <button
                key={letter}
                onClick={() => handleLetterClick(letter)}
                className={`h-7 w-7 rounded-lg text-xs font-semibold transition-all ${
                  activeLetter === letter
                    ? 'bg-amber-400 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600 shadow-sm'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Carousel */}
      <div className="relative group">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 h-8 w-8 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scroll-smooth pb-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-28 h-28 rounded-2xl bg-gray-100 animate-pulse" />
              ))
            : sorted.map((make) => {
                const isSelected = make.id === selectedId;
                const firstLetter = make.name[0]?.toUpperCase() ?? '';
                return (
                  <button
                    key={make.id}
                    data-firstletter={firstLetter}
                    onClick={() => onSelect(make.id)}
                    className={`flex-shrink-0 flex flex-col items-center gap-2.5 w-28 p-3.5 rounded-2xl border transition-all duration-200 ${
                      isSelected
                        ? 'border-amber-400 bg-amber-50 shadow-md shadow-amber-100'
                        : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm'
                    }`}
                  >
                    <MakeLogo name={make.name} logoUrl={make.logoUrl} />
                    <span className={`text-[11px] font-medium text-center leading-tight line-clamp-2 ${isSelected ? 'text-amber-600' : 'text-gray-700'}`}>
                      {make.name}
                    </span>
                    {make.isPopular && !isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
        </div>

        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 h-8 w-8 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-gray-400">{sorted.length} марки</p>
    </div>
  );
}
