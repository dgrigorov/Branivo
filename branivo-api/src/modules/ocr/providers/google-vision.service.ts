import { Injectable, Logger } from '@nestjs/common';
import { OcrField, OcrFieldResult } from '../entities/ocr-job.entity';

export class GoogleVisionTimeoutError extends Error {
  constructor() {
    super('Google Vision API timed out');
    this.name = 'GoogleVisionTimeoutError';
  }
}

const VISION_TIMEOUT_MS = 10_000;
const CONFIDENCE_THRESHOLD = 0.85;

@Injectable()
export class GoogleVisionService {
  private readonly logger = new Logger(GoogleVisionService.name);

  async analyzeImages(imageBuffers: Buffer[]): Promise<OcrFieldResult> {
    const { ImageAnnotatorClient } = await import('@google-cloud/vision');
    const client = new ImageAnnotatorClient();

    const requests = imageBuffers.map((buf) => ({
      image: { content: buf.toString('base64') },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
    }));

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new GoogleVisionTimeoutError()),
        VISION_TIMEOUT_MS,
      ),
    );

    try {
      const [results] = await Promise.race([
        client.batchAnnotateImages({ requests }),
        timeoutPromise,
      ]);

      type VisionResponse = { fullTextAnnotation?: { text?: string } };
      type BatchResponse = { responses?: VisionResponse[] };
      const batchResult = results as BatchResponse;
      const fullText =
        batchResult.responses
          ?.map((r) => r.fullTextAnnotation?.text ?? '')
          .join('\n') ?? '';

      return this.parseVehicleRegistration(fullText);
    } catch (err) {
      if (err instanceof GoogleVisionTimeoutError) throw err;
      this.logger.error('Google Vision API error', err);
      throw err;
    }
  }

  private buildField(value: string | null, confidence = 0.9): OcrField {
    const v = value && value.length > 0 ? value : null;
    return {
      value: v,
      confidence: v !== null ? confidence : 0.0,
      auto_filled: v !== null && confidence >= CONFIDENCE_THRESHOLD,
    };
  }

  /**
   * Extracts the value that follows (CODE) on the same line, stopping at the
   * next field-code marker or a "No" label.  Also returns the next continuation
   * line (used when a value is placed on the line after the code).
   *
   * Handles compound lines: "(J) M1   (B) 28.07.2006   (I) 14.09.2023   (H)"
   */
  private extractByCode(
    lines: string[],
    code: string,
  ): { value: string | null; nextLine: string | null } {
    const escaped = code.split('.').join('\\.');
    const re = new RegExp(`\\(${escaped}\\)\\**\\s*(.*)`, 'i');

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;

      // Stop at the next field-code token or a "No" label on the same line.
      const val = m[1]
        .split(/\s{2,}|\t|\s+\([A-Z]|\s+No\b/)[0]
        .replace(/\*+/g, '')
        .trim();

      // The next non-code line is a continuation (e.g. Latin transliteration).
      const nextRaw = i + 1 < lines.length ? lines[i + 1] : null;
      const nextLine =
        nextRaw && !nextRaw.startsWith('(') && !/^No\b/i.test(nextRaw)
          ? nextRaw.replace(/\*+/g, '').trim() || null
          : null;

      return { value: val || null, nextLine };
    }
    return { value: null, nextLine: null };
  }

  private normalizeFuel(raw: string | null): string | null {
    if (!raw) return null;
    const u = raw.toUpperCase();
    if (u.includes('БЕНЗИН') || u.includes('PETROL')) return 'Бензин';
    if (u.includes('ДИЗЕЛ') || u.includes('DIESEL')) return 'Дизел';
    if (u.includes('ГАЗ') || u.includes('LPG')) return 'Газ (LPG)';
    if (u.includes('ЕЛЕКТР') || u.includes('ELECTR')) return 'Електрически';
    if (u.includes('ХИБРИД') || u.includes('HYBRID')) return 'Хибрид';
    return raw;
  }

  /**
   * Parses raw OCR text from a Bulgarian vehicle registration certificate
   * (малък талон) following EU Directive 1999/37/EC field codes.
   */
  parseVehicleRegistration(text: string): OcrFieldResult {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // ── (A) License plate ────────────────────────────────────────────────────
    const aRaw = this.extractByCode(lines, 'A');
    const lpMatch = aRaw.value?.match(/[А-ЯA-Z]{1,2}\d{3,4}[А-ЯA-Z]{1,2}/i);
    const licensePlate = lpMatch ? lpMatch[0] : null;

    // ── (E) VIN ───────────────────────────────────────────────────────────────
    const eRaw = this.extractByCode(lines, 'E');
    const vinMatch = eRaw.value
      ?.replace(/\s+/g, '')
      .match(/[A-HJ-NPR-Z0-9]{17}/i);
    const vinValue = vinMatch ? vinMatch[0] : null;

    // ── Certificate number (No …) ─────────────────────────────────────────────
    const certMatch = text.match(/No\s+(\d{6,12})/i);
    const certNumber = certMatch ? certMatch[1] : null;

    // ── (D.1) Make / model — Latin next line preferred ────────────────────────
    const d1Raw = this.extractByCode(lines, 'D.1');
    const d1Candidate = d1Raw.nextLine ?? d1Raw.value ?? '';
    const makeModelMatch = d1Candidate.match(
      /([A-Z][A-Z-]{1,20})\s+([A-Z0-9][A-Z0-9\s-]{1,20})/,
    );
    const makeValue = makeModelMatch ? makeModelMatch[1].trim() : null;
    const modelValue = makeModelMatch ? makeModelMatch[2].trim() : null;

    // ── (R) Color — first word ────────────────────────────────────────────────
    const rRaw = this.extractByCode(lines, 'R');
    const colorValue = rRaw.value?.split(/\s+/)[0] ?? null;

    // ── (B) First registration date ───────────────────────────────────────────
    // Field may be embedded in a compound line: "(J) M1   (B) 28.07.2006 …"
    const bRaw = this.extractByCode(lines, 'B');
    const bDateMatch = bRaw.value?.match(/\d{2}[.\-/]\d{2}[.\-/]\d{4}/);
    const firstRegDate = bDateMatch ? bDateMatch[0] : null;

    // ── Year ──────────────────────────────────────────────────────────────────
    const yearFromDate = firstRegDate?.match(/\b((?:19|20)\d{2})\b/)?.[1];
    const yearFallback = text.match(/\b((?:19|20)\d{2})\b/)?.[1];
    const yearValue = yearFromDate ?? yearFallback ?? null;

    // ── (P.1) Engine volume ───────────────────────────────────────────────────
    const p1Raw = this.extractByCode(lines, 'P.1');
    const engineVol = p1Raw.value?.match(/\d+/)?.[0] ?? null;

    // ── (P.2) Power (kW) — often no space: `(P.2)200` ────────────────────────
    const p2Raw = this.extractByCode(lines, 'P.2');
    const powerKw = p2Raw.value?.match(/\d+/)?.[0] ?? null;

    // ── (P.3) Fuel type ───────────────────────────────────────────────────────
    const p3Raw = this.extractByCode(lines, 'P.3');
    const fuelValue = this.normalizeFuel(p3Raw.value);

    // ── Owner name — Latin transliteration preferred (C.2.1 / C.2.2) ─────────
    const c21 = this.extractByCode(lines, 'C.2.1');
    const c22 = this.extractByCode(lines, 'C.2.2');
    const surname =
      c21.nextLine ?? c21.value?.match(/[A-Z][A-Za-z]+/)?.[0] ?? null;
    const given =
      c22.nextLine?.trim() ??
      c22.value?.match(/[A-Z][A-Za-z\s]+/)?.[0]?.trim() ??
      null;
    const ownerName =
      surname && given
        ? `${surname} ${given}`.trim()
        : (surname ?? given ?? null);

    // ── EGN — label-prefix first, then MRZ line ───────────────────────────────
    const egnDirect = text.match(/ЕГН\/?(?:ID)?\s*(\d{10})/i)?.[1] ?? null;
    let mrzEgn: string | null = null;
    if (!egnDirect) {
      for (const line of lines.filter((l) => l.includes('<'))) {
        const norm = line.replace(/\s+/g, '');
        const m = norm.match(/[A-HJ-NPR-Z0-9]{17}(\d{10})/i);
        if (m) {
          mrzEgn = m[1];
          break;
        }
      }
    }
    const egnValue = egnDirect ?? mrzEgn;

    // ── (C.2.3) Address ───────────────────────────────────────────────────────
    const c23 = this.extractByCode(lines, 'C.2.3');
    const ownerAddress = c23.value ?? null;

    return {
      license_plate: this.buildField(licensePlate),
      vin: this.buildField(vinValue),
      cert_number: this.buildField(certNumber),
      make: this.buildField(makeValue),
      model: this.buildField(modelValue),
      year: this.buildField(yearValue),
      color: this.buildField(colorValue),
      engine_volume: this.buildField(engineVol),
      power_kw: this.buildField(powerKw),
      fuel_type: this.buildField(fuelValue),
      first_registration_date: this.buildField(firstRegDate),
      owner_name: this.buildField(ownerName),
      owner_egn: this.buildField(egnValue),
      owner_address: this.buildField(ownerAddress),
    };
  }
}
