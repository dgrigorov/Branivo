import type {
  InsurerAdapter,
  QuoteRequest,
  QuoteResult,
} from './insurer-adapter.interface';

export class MockInsurerAdapter implements InsurerAdapter {
  readonly insurerCode: string;
  private readonly basePrice: number;

  constructor(insurerCode: string, basePrice: number) {
    this.insurerCode = insurerCode;
    this.basePrice = basePrice;
  }

  async fetchQuote(request: QuoteRequest): Promise<QuoteResult> {
    const delay = 200 + Math.random() * 600;
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (Math.random() < 0.1) {
      throw new Error(`Mock error from ${this.insurerCode}`);
    }

    const price =
      Math.round(this.basePrice * (1 + Math.random() * 0.3) * 100) / 100;

    return {
      insurerCode: this.insurerCode,
      price,
      currency: 'BGN',
      coverDetails: {
        product: 'GO',
        vehicleVin: request.vehicle.vin,
        coverageType: 'third_party_liability',
      },
      extras: {
        roadside_assistance: true,
        glass: true,
        legal: false,
      },
      rawResponse: {
        mock: true,
        timestamp: new Date().toISOString(),
        delay: Math.round(delay),
      },
    };
  }
}
