'use client';

import { useEffect, useState } from 'react';

export type OfferStatus = 'loading' | 'loaded' | 'error';

export interface InsurerOffer {
  code: string;
  name: string;
  singleEur: number;
  singleBgn: number | null;
  twoInstEur: [number, number];
  twoInstBgn: [number, number] | null;
  fourInstEur: [number, number, number, number];
  fourInstBgn: [number, number, number, number] | null;
  status: OfferStatus;
  isRecommended: boolean;
}

const RAW = [
  { code: 'allianz',  name: 'Allianz',  eur: 94.15,  bgn: 184.15 },
  { code: 'bulstrad', name: 'Булстрад', eur: 103.32, bgn: 202.08 },
  { code: 'bulins',   name: 'Булинс',   eur: 182.53, bgn: null   },
  { code: 'ozk',      name: 'OZK',      eur: 182.46, bgn: 356.86 },
  { code: 'generali', name: 'Generali', eur: 191.00, bgn: 373.56 },
  { code: 'euroins',  name: 'Euroins',  eur: 198.94, bgn: 389.09 },
  { code: 'uniqa',    name: 'UNIQA',    eur: 242.96, bgn: 475.19 },
  { code: 'dzi',      name: 'ДЗИ',      eur: 297.10, bgn: 581.08 },
] as const;

type RawInsurer = (typeof RAW)[number];

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function twoInst(total: number): [number, number] {
  const first = round(total * 0.55);
  return [first, round(total - first)];
}

function fourInst(total: number): [number, number, number, number] {
  const a = round(total * 0.30);
  const b = round(total * 0.25);
  const c = round(total * 0.25);
  return [a, b, c, round(total - a - b - c)];
}

function buildOffer(raw: RawInsurer, status: OfferStatus, isRecommended: boolean): InsurerOffer {
  return {
    code: raw.code,
    name: raw.name,
    singleEur: raw.eur,
    singleBgn: raw.bgn,
    twoInstEur: twoInst(raw.eur),
    twoInstBgn: raw.bgn ? twoInst(raw.bgn) : null,
    fourInstEur: fourInst(raw.eur),
    fourInstBgn: raw.bgn ? fourInst(raw.bgn) : null,
    status,
    isRecommended,
  };
}

const INITIAL_OFFERS: InsurerOffer[] = RAW.map((r, i) =>
  buildOffer(r, 'loading', i === 0),
);

export function useOffersPolling(active: boolean) {
  const [offers, setOffers] = useState<InsurerOffer[]>(INITIAL_OFFERS);
  const [allLoaded, setAllLoaded] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    RAW.forEach((raw, index) => {
      const timer = setTimeout(() => {
        setOffers((prev) =>
          prev.map((o) =>
            o.code === raw.code ? { ...o, status: 'loaded' as const } : o,
          ),
        );
        if (index === RAW.length - 1) setAllLoaded(true);
      }, 400 + index * 350);
      timers.push(timer);
    });

    return () => { timers.forEach(clearTimeout); };
  }, [active]);

  return { offers, allLoaded };
}
