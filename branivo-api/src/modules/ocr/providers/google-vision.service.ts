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

  private buildField(value: string | null, confidence: number): OcrField {
    return {
      value,
      confidence,
      auto_filled: confidence >= CONFIDENCE_THRESHOLD,
    };
  }

  parseVehicleRegistration(text: string): OcrFieldResult {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const extract = (
      pattern: RegExp,
    ): { value: string | null; confidence: number } => {
      for (const line of lines) {
        const m = line.match(pattern);
        if (m) return { value: m[1]?.trim() ?? null, confidence: 0.9 };
      }
      return { value: null, confidence: 0.0 };
    };

    // Bulgarian vehicle registration — field codes
    const licensePlate = extract(/^A[:\s]+([А-ЯA-Z0-9\s]{5,10})$/i);
    const vin = extract(/^E[:\s]+([A-HJ-NPR-Z0-9]{17})/i);
    const make = extract(/^C\.1\.1[:\s]+(.+)$/i);
    const model = extract(/^C\.3[:\s]+(.+)$/i);
    const year = extract(/(\b(19|20)\d{2}\b)/);
    const color = extract(/^R[:\s]+(.+)$/i);
    const engineVolume = extract(/^P\.1[:\s]+(\d+)/i);
    const fuelRaw = extract(/^P\.5[:\s]+(\d)/i);
    const firstRegDate = extract(/^B[:\s]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})/i);

    const fuelMap: Record<string, string> = {
      '1': 'бензин',
      '2': 'дизел',
      '3': 'LPG',
      '4': 'електрически',
      '5': 'хибрид',
    };
    const fuelValue = fuelRaw.value
      ? (fuelMap[fuelRaw.value] ?? fuelRaw.value)
      : null;

    return {
      license_plate: this.buildField(
        licensePlate.value,
        licensePlate.confidence,
      ),
      vin: this.buildField(vin.value, vin.confidence),
      make: this.buildField(make.value, make.confidence),
      model: this.buildField(model.value, model.confidence),
      year: this.buildField(year.value, year.confidence),
      color: this.buildField(color.value, color.confidence),
      engine_volume: this.buildField(
        engineVolume.value,
        engineVolume.confidence,
      ),
      fuel_type: this.buildField(fuelValue, fuelRaw.confidence),
      first_registration_date: this.buildField(
        firstRegDate.value,
        firstRegDate.confidence,
      ),
    };
  }
}
