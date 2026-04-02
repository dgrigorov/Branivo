'use client';

import { useState } from 'react';
import { OfferRow } from './offer-row';
import { useOffersPolling } from '../hooks/use-offers-polling';
import type { SelectedOffer } from '../hooks/use-wizard-state';

interface StepOffersProps {
  onSelect: (offer: SelectedOffer) => void;
}

type TabCount = 1 | 2 | 4;

const TABS: { count: TabCount; label: string }[] = [
  { count: 1, label: 'Еднократно' },
  { count: 2, label: '2 вноски'   },
  { count: 4, label: '4 вноски'   },
];

export function StepOffers({ onSelect }: StepOffersProps) {
  const [tab, setTab] = useState<TabCount>(1);
  const { offers, allLoaded } = useOffersPolling(true);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-bold uppercase tracking-wider text-[var(--color-primary,#2563eb)]">
          Оферти
        </h1>
        <p className="mt-1 text-sm text-gray-500">Сравнете и изберете най-доброто за вас</p>
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-full bg-gray-100 p-1" role="tablist" aria-label="Брой вноски">
        {TABS.map(({ count, label }) => (
          <button
            key={count}
            type="button"
            role="tab"
            aria-selected={tab === count}
            onClick={() => setTab(count)}
            className={[
              'flex-1 rounded-full py-2 text-xs font-semibold transition-all',
              tab === count
                ? 'bg-[var(--color-primary,#2563eb)] text-white shadow'
                : 'text-gray-600 hover:text-gray-900',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Offer list */}
      <div role="list" aria-label="Оферти за застраховка" className="space-y-2">
        {offers.map((offer) => (
          <OfferRow key={offer.code} offer={offer} tab={tab} onSelect={onSelect} />
        ))}
      </div>

      {!allLoaded && (
        <p className="text-center text-xs text-gray-400">Зареждане на оферти от застрахователите…</p>
      )}
    </div>
  );
}
