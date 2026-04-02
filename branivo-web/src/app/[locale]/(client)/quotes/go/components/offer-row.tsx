'use client';

import type { InsurerOffer } from '../hooks/use-offers-polling';
import type { SelectedOffer } from '../hooks/use-wizard-state';

type InstallmentTab = 1 | 2 | 4;

interface OfferRowProps {
  offer: InsurerOffer;
  tab: InstallmentTab;
  onSelect: (offer: SelectedOffer) => void;
}

function PriceLoading() {
  return (
    <span aria-busy="true" className="flex items-center gap-1 text-sm text-gray-400">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
        <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      Зареждане на цени
    </span>
  );
}

function SinglePrice({ offer }: { offer: InsurerOffer }) {
  return (
    <div className="text-right">
      <div className="text-base font-bold text-gray-900">{offer.singleEur.toFixed(2)} €</div>
      {offer.singleBgn && (
        <div className="text-xs text-gray-500">{offer.singleBgn.toFixed(2)} лв.</div>
      )}
    </div>
  );
}

function TwoInstPrice({ offer }: { offer: InsurerOffer }) {
  const [f, s] = offer.twoInstEur;
  return (
    <div className="text-right text-xs">
      <div className="font-medium text-gray-800">1-ва: {f.toFixed(2)} €{offer.twoInstBgn && ` / ${offer.twoInstBgn[0].toFixed(2)} лв.`}</div>
      <div className="font-medium text-gray-800">2-ра: {s.toFixed(2)} €{offer.twoInstBgn && ` / ${offer.twoInstBgn[1].toFixed(2)} лв.`}</div>
      <div className="mt-0.5 text-gray-500">{offer.singleEur.toFixed(2)} € общо</div>
    </div>
  );
}

function FourInstPrice({ offer }: { offer: InsurerOffer }) {
  return (
    <div className="text-right text-xs">
      {offer.fourInstEur.map((amt, i) => (
        <div key={i} className="font-medium text-gray-800">
          {i + 1}-та: {amt.toFixed(2)} €
        </div>
      ))}
      <div className="mt-0.5 text-gray-500">{offer.singleEur.toFixed(2)} € общо</div>
    </div>
  );
}

export function OfferRow({ offer, tab, onSelect }: OfferRowProps) {
  const isUnavailable = offer.status === 'error';
  const isLoading = offer.status === 'loading';

  function handleSelect() {
    onSelect({
      insurerCode: offer.code,
      insurerName: offer.name,
      installments: tab,
      totalEur: offer.singleEur,
      totalBgn: offer.singleBgn,
    });
  }

  return (
    <div
      role="listitem"
      className={[
        'flex items-center justify-between rounded-xl border p-3 transition-all duration-200',
        offer.isRecommended ? 'border-2 border-[var(--color-primary,#2563eb)]' : 'border-gray-200',
        isUnavailable ? 'opacity-50' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-16 items-center justify-center rounded-lg bg-gray-100">
          <span className="text-xs font-bold text-gray-700">{offer.name}</span>
        </div>
        {offer.isRecommended && (
          <span className="rounded-full bg-[var(--color-primary,#2563eb)] px-2 py-0.5 text-[10px] font-bold text-white">
            ⭐ Препоръчано
          </span>
        )}
        {isUnavailable && <span className="text-xs text-gray-400">ℹ Временно недостъпен</span>}
      </div>

      <div className="flex items-center gap-3">
        {isLoading ? <PriceLoading /> :
         isUnavailable ? null :
         tab === 1 ? <SinglePrice offer={offer} /> :
         tab === 2 ? <TwoInstPrice offer={offer} /> :
                     <FourInstPrice offer={offer} />}

        {!isLoading && !isUnavailable && (
          <button
            type="button"
            onClick={handleSelect}
            className="rounded-full bg-[var(--color-primary,#2563eb)] px-4 py-1.5 text-sm font-bold text-white hover:opacity-90"
          >
            ИЗБЕРИ
          </button>
        )}
      </div>
    </div>
  );
}
