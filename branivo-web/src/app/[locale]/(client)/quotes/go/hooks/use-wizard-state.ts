'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'branivo-go-wizard';

export type WizardStep = 'vehicle' | 'details' | 'offers' | 'dates' | 'owner' | 'contact';
export const WIZARD_STEPS: WizardStep[] = ['vehicle', 'details', 'offers', 'dates', 'owner', 'contact'];

export interface VehicleData {
  kat: boolean;
  regNumber: string;
  talon: string;
  vin: string;
  make: string;
  model: string;
  year: string;
}

export interface DetailsData {
  experience: string;
  usage: string;
  leftSteering: boolean;
}

export interface SelectedOffer {
  insurerCode: string;
  insurerName: string;
  installments: 1 | 2 | 4;
  totalEur: number;
  totalBgn: number | null;
}

export interface DatesData {
  startDate: string;
}

export interface OwnerData {
  type: 'individual' | 'company';
  firstName: string;
  middleName: string;
  lastName: string;
  egn: string;
  companyName: string;
  eik: string;
  mol: string;
  ownerIsInsurer: boolean;
  insurerFirstName: string;
  insurerMiddleName: string;
  insurerLastName: string;
  insurerEgn: string;
}

export interface ContactData {
  email: string;
  phone: string;
}

export interface WizardFormData {
  vehicle: VehicleData;
  details: DetailsData;
  selectedOffer: SelectedOffer | null;
  dates: DatesData;
  owner: OwnerData;
  contact: ContactData;
}

const DEFAULT_DATA: WizardFormData = {
  vehicle: {
    kat: true,
    regNumber: 'СВ0688ММ',
    talon: '000000002',
    vin: 'WDDTESTVIN0000001',
    make: 'Mercedes',
    model: 'S 350',
    year: '2007',
  },
  details: { experience: '3-5', usage: 'personal', leftSteering: true },
  selectedOffer: null,
  dates: { startDate: new Date().toISOString().split('T')[0] ?? '' },
  owner: {
    type: 'individual',
    firstName: '', middleName: '', lastName: '', egn: '',
    companyName: '', eik: '', mol: '',
    ownerIsInsurer: true,
    insurerFirstName: '', insurerMiddleName: '', insurerLastName: '', insurerEgn: '',
  },
  contact: { email: '', phone: '' },
};

function loadData(): WizardFormData {
  if (typeof window === 'undefined') return DEFAULT_DATA;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;
    return JSON.parse(raw) as WizardFormData;
  } catch {
    return DEFAULT_DATA;
  }
}

function persist(data: WizardFormData): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

export function useWizardState() {
  const [data, setDataRaw] = useState<WizardFormData>(DEFAULT_DATA);

  useEffect(() => {
    setDataRaw(loadData());
  }, []);

  const update = useCallback(<K extends keyof WizardFormData>(
    key: K,
    value: WizardFormData[K],
  ) => {
    setDataRaw((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_KEY);
    setDataRaw(DEFAULT_DATA);
  }, []);

  return { data, update, reset };
}
