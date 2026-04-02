export interface QuoteInstallment {
  number: number;
  amountBgn: number;
}

export interface QuotePaymentOption {
  installmentCount: number;
  installments: QuoteInstallment[];
  totalBgn: number;
}

export interface QuoteRequest {
  sessionToken: string;
  tenantId: string;
  vehicle: {
    vin: string;
    licensePlate: string;
    make: string;
    model: string;
    year: number;
  };
}

export interface QuoteResult {
  insurerCode: string;
  price: number;
  currency: string;
  coverDetails: Record<string, unknown>;
  extras: Record<string, unknown>;
  rawResponse: Record<string, unknown>;
  paymentOptions?: QuotePaymentOption[];
}

export interface InsurerAdapter {
  readonly insurerCode: string;
  fetchQuote(request: QuoteRequest): Promise<QuoteResult>;
}

export const INSURER_ADAPTERS = 'INSURER_ADAPTERS';
