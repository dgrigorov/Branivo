import type { TalonSlot } from '@/app/[locale]/(client)/quotes/components/talon-upload-section';

export interface TalonData {
  vin?: string | null;
  registrationNumber?: string | null;
  ownerName?: string | null;
  egn?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  fuel?: string | null;
  engine?: string | null;
  seats?: number | null;
  firstRegistration?: string | null;
}

export interface TalonResponse {
  success: boolean;
  step: number;
  confidence: number;
  data: TalonData;
  complete: boolean;
}

export interface MergedOcrFields {
  reg_number: string;
  vin: string;
  make: string;
  model: string;
  year: string;
}

async function callOcrTalon(slot: TalonSlot, step: 1 | 2 | 3): Promise<TalonData | null> {
  const fd = new FormData();
  fd.append('file', slot.file);
  fd.append('points', JSON.stringify(slot.points));

  const res = await fetch(`/api/v1/ocr/talon?step=${step}`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) return null;
  const body = (await res.json()) as TalonResponse;
  return body.success ? body.data : null;
}

function firstDefined<T>(...values: (T | null | undefined)[]): T | undefined {
  return values.find((v): v is T => v !== null && v !== undefined);
}

function mergeOcrResults(results: (TalonData | null)[]): MergedOcrFields {
  const [r1, r2, r3] = results;
  const year = firstDefined(r1?.year, r2?.year, r3?.year);
  return {
    reg_number: firstDefined(r1?.registrationNumber, r2?.registrationNumber) ?? '',
    vin: firstDefined(r1?.vin, r2?.vin) ?? '',
    make: firstDefined(r1?.make, r2?.make) ?? '',
    model: firstDefined(r1?.model, r2?.model) ?? '',
    year: year !== undefined ? String(year) : '',
  };
}

/**
 * Run OCR for all non-null slots in parallel and return merged form fields.
 * Slots map to OCR steps: slot[0]→step1, slot[1]→step2, slot[2]→step3.
 * Errors per-slot are silenced — if a step fails, that slot contributes null.
 */
export async function runTalonOcr(slots: (TalonSlot | null)[]): Promise<MergedOcrFields> {
  const results = await Promise.all(
    slots.map((slot, idx) =>
      slot ? callOcrTalon(slot, (idx + 1) as 1 | 2 | 3).catch(() => null) : Promise.resolve(null),
    ),
  );
  return mergeOcrResults(results);
}
