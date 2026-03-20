'use client';

import type { QuoteOffer } from '../../../../../lib/hooks/use-quotes';

interface OfferCardProps {
  offer: QuoteOffer;
  isRecommended: boolean;
  onSelect?: () => void;
}

export function OfferCard({ offer, isRecommended, onSelect }: OfferCardProps) {
  const isUnavailable = offer.status === 'error' || offer.status === 'timeout';

  const ariaLabel = isRecommended
    ? `Препоръчана оферта от ${offer.insurerName}`
    : `Оферта от ${offer.insurerName}`;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !isUnavailable && onSelect) {
      onSelect();
    }
  }

  return (
    <article
      role="article"
      aria-label={ariaLabel}
      tabIndex={isUnavailable ? -1 : 0}
      onKeyDown={handleKeyDown}
      onClick={isUnavailable ? undefined : onSelect}
      className={[
        'rounded-xl border p-4 transition-all duration-200',
        isRecommended
          ? 'border-blue-500 border-2 shadow-md'
          : isUnavailable
            ? 'border-gray-200 opacity-50'
            : 'border-gray-300 hover:border-blue-300',
        !isUnavailable && onSelect ? 'cursor-pointer' : '',
      ].join(' ')}
    >
      {isUnavailable ? (
        <div className="flex items-center gap-2 text-gray-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            <strong>{offer.insurerName}</strong> — Временно недостъпен
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{offer.insurerName}</h3>
            {isRecommended && (
              <span className="rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white">
                ⭐ Препоръчано
              </span>
            )}
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-600">
            {offer.price !== null
              ? `${offer.price.toFixed(2)} ${offer.currency}`
              : 'Цената не е налична'}
          </p>
        </>
      )}
    </article>
  );
}
