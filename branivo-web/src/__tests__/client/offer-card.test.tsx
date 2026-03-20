import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { OfferCard } from '@/app/[locale]/(client)/quotes/components/offer-card';
import type { QuoteOffer } from '@/lib/hooks/use-quotes';

const successOffer: QuoteOffer = {
  id: 'offer-1',
  insurerCode: 'allianz',
  insurerName: 'Allianz Bulgaria',
  price: 450,
  currency: 'BGN',
  score: 0.75,
  isRecommended: false,
  status: 'success',
  extras: {},
};

const errorOffer: QuoteOffer = {
  id: 'offer-2',
  insurerCode: 'generali',
  insurerName: 'Generali Bulgaria',
  price: null,
  currency: 'BGN',
  score: null,
  isRecommended: false,
  status: 'error',
  extras: {},
  errorReason: 'unavailable',
};

describe('OfferCard', () => {
  it('renders recommended badge when isRecommended is true', () => {
    render(<OfferCard offer={successOffer} isRecommended={true} />);
    expect(screen.getByText('⭐ Препоръчано')).toBeInTheDocument();
  });

  it('does not render badge when isRecommended is false', () => {
    render(<OfferCard offer={successOffer} isRecommended={false} />);
    expect(screen.queryByText('⭐ Препоръчано')).not.toBeInTheDocument();
  });

  it('renders "Временно недостъпен" for error status', () => {
    render(<OfferCard offer={errorOffer} isRecommended={false} />);
    expect(screen.getByText(/Временно недостъпен/i)).toBeInTheDocument();
  });

  it('aria-label contains insurer name for recommended', () => {
    render(<OfferCard offer={successOffer} isRecommended={true} />);
    expect(
      screen.getByRole('article', { name: /Препоръчана оферта от Allianz Bulgaria/i }),
    ).toBeInTheDocument();
  });

  it('aria-label contains insurer name for non-recommended', () => {
    render(<OfferCard offer={successOffer} isRecommended={false} />);
    expect(
      screen.getByRole('article', { name: /Оферта от Allianz Bulgaria/i }),
    ).toBeInTheDocument();
  });

  it('renders price for success offer', () => {
    render(<OfferCard offer={successOffer} isRecommended={false} />);
    expect(screen.getByText(/450\.00/)).toBeInTheDocument();
  });
});
