'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { type VehicleMake } from './types';

function MakeLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [err, setErr] = useState(false);
  if (logoUrl && !err) {
    return (
      <div className="h-12 w-12 flex items-center justify-center bg-white rounded-xl p-1.5 flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="h-full w-full object-contain" onError={() => setErr(true)} />
      </div>
    );
  }
  const colors = ['#3B82F6','#6B7280','#EF4444','#10B981','#8B5CF6','#F59E0B'];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: bg }}>
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

  const filtered = search.trim()
    ? makes.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    : makes;

  const popular = filtered.filter((m) => m.isPopular && m.isActive);
  const others = filtered.filter((m) => !m.isPopular && m.isActive);
  const sorted = [...popular, ...others];

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'right' ? 320 : -320, behavior: 'smooth' });
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <input
          type="text"
          placeholder="Търси марка..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50"
        />
      </div>

      {/* Carousel */}
      <div className="relative group">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 h-8 w-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"
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
                <div key={i} className="flex-shrink-0 w-24 h-24 rounded-2xl bg-white/5 animate-pulse" />
              ))
            : sorted.map((make) => {
                const isSelected = make.id === selectedId;
                return (
                  <button
                    key={make.id}
                    onClick={() => onSelect(make.id)}
                    className={`flex-shrink-0 flex flex-col items-center gap-2 w-24 p-3 rounded-2xl border transition-all duration-200 ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                        : 'border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/20'
                    }`}
                  >
                    <MakeLogo name={make.name} logoUrl={make.logoUrl} />
                    <span className={`text-[11px] font-medium text-center leading-tight line-clamp-2 ${isSelected ? 'text-amber-400' : 'text-white/70'}`}>
                      {make.name}
                    </span>
                    {make.isPopular && !isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
                    )}
                  </button>
                );
              })}
        </div>

        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 h-8 w-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-white/30">{sorted.length} марки</p>
    </div>
  );
}
