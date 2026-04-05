export interface VehicleMake {
  id: string;
  name: string;
  vpicMakeId: number | null;
  logoUrl: string | null;
  autodata24Slug: string | null;
  isActive: boolean;
  isPopular: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleModel {
  id: string;
  makeId: string;
  makeName: string;
  name: string;
  vpicModelId: number | null;
  autodata24Slug: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  bodyType: string | null;
  imageUrl: string | null;
  modificationsCount: number;
  isActive: boolean;
  source: string;
}

export interface VehicleModification {
  id: string;
  modelId: string;
  name: string;
  imageUrl: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  engineType: string | null;
  engineSizeCc: number | null;
  powerKw: number | null;
  powerHp: number | null;
  bodyType: string | null;
  doors: number | null;
  seats: number | null;
  transmission: string | null;
  drive: string | null;
  maxSpeedKmh: number | null;
  acceleration0100: number | null;
  fuelConsumptionCity: number | null;
  fuelConsumptionHighway: number | null;
  fuelConsumptionCombined: number | null;
  weightKg: number | null;
  engineCode: string | null;
  rawData: Record<string, string> | null;
  source: string;
  isActive: boolean;
}

export interface SyncRun {
  id: string;
  status: 'pending' | 'scraping' | 'importing' | 'done' | 'failed';
  totalScraped: number | null;
  totalImported: number | null;
  errorMessage: string | null;
  logLines: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SyncProgressEvent {
  type: 'log' | 'status' | 'done';
  line?: string;
  status?: SyncRun['status'];
  totalScraped?: number | null;
  totalImported?: number | null;
}

export const BODY_TYPE_LABELS: Record<string, string> = {
  sedan: 'Седан',
  hatchback: 'Хечбек',
  station_wagon: 'Комби',
  suv: 'SUV',
  crossover: 'Кросовър',
  coupe: 'Купе',
  convertible: 'Кабриолет',
  minivan: 'Миниван',
  van: 'Ван',
  pickup: 'Пикап',
  minibus: 'Минибус',
  other: 'Друг',
};

/** Upgrade cdn3.focus.bg thumbnail URLs to their large equivalent. */
export function hdUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('cdn3.focus.bg')) {
    return url
      .replace('/thumb/', '/large/')
      .replace('/small/', '/large/')
      .replace('/medium/', '/large/');
  }
  return url;
}

export const ENGINE_TYPE_LABELS: Record<string, string> = {
  petrol: 'Бензин',
  diesel: 'Дизел',
  electric: 'Електрически',
  hybrid: 'Хибрид',
  lpg: 'LPG',
  cng: 'CNG',
  other: 'Друг',
};
