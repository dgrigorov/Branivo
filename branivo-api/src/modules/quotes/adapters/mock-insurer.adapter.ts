import * as fs from 'fs';
import * as path from 'path';
import type {
  InsurerAdapter,
  QuotePaymentOption,
  QuoteRequest,
  QuoteResult,
} from './insurer-adapter.interface';

const MOCK_DATA_DIR = path.join(__dirname, 'mock-data');

interface BoleronInstallment {
  number: number;
  premium: number;
  tax: number;
  premiumWithTax: number;
  gf?: number;
  premiumSecondaryCurrency?: number;
  taxSecondaryCurrency?: number;
  premiumWithTaxSecondaryCurrency?: number | null;
  gfSecondaryCurrency?: number;
}

interface BoleronOption {
  installmentCount: string;
  installments: BoleronInstallment[];
  premiumWithTaxTotal: number;
  premiumWithTaxTotalSecondaryCurrency: number | null;
}

interface BoleronSummary {
  insurer: string;
  product: string;
  package: string;
  created: string;
  expires: string;
}

interface BoleronResponse {
  '1'?: Record<string, BoleronInstallment>;
  summary: BoleronSummary;
  options: BoleronOption[];
}

function loadMockData(insurerCode: string): BoleronResponse | null {
  const filePath = path.join(MOCK_DATA_DIR, `${insurerCode}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BoleronResponse;
}

function resolveBgnTotal(data: BoleronResponse, option: BoleronOption): number {
  if (option.premiumWithTaxTotalSecondaryCurrency !== null) {
    return option.premiumWithTaxTotalSecondaryCurrency;
  }
  // Fallback: sum installments BGN, or use single installment from top-level "1" block
  const singleBlock = data['1']?.['1'];
  if (singleBlock?.premiumWithTaxSecondaryCurrency) {
    return singleBlock.premiumWithTaxSecondaryCurrency;
  }
  // Last resort: convert EUR with fixed rate
  return Math.round(option.premiumWithTaxTotal * 1.9558 * 100) / 100;
}

function buildPaymentOptions(data: BoleronResponse): QuotePaymentOption[] {
  return data.options.map((opt) => {
    const count = parseInt(opt.installmentCount, 10);
    const totalBgn = resolveBgnTotal(data, opt);
    return {
      installmentCount: count,
      totalBgn,
      installments: opt.installments.map((inst) => ({
        number: inst.number,
        amountBgn:
          inst.premiumWithTaxSecondaryCurrency ??
          Math.round(inst.premiumWithTax * 1.9558 * 100) / 100,
      })),
    };
  });
}

export class MockInsurerAdapter implements InsurerAdapter {
  readonly insurerCode: string;
  private readonly mockData: BoleronResponse | null;

  constructor(insurerCode: string) {
    this.insurerCode = insurerCode;
    this.mockData = loadMockData(insurerCode);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchQuote(_request: QuoteRequest): Promise<QuoteResult> {
    const delay = 200 + Math.random() * 600;
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (!this.mockData) {
      throw new Error(`No mock data for insurer: ${this.insurerCode}`);
    }

    const paymentOptions = buildPaymentOptions(this.mockData);
    const singleOption = paymentOptions.find((o) => o.installmentCount === 1);
    const price = singleOption?.totalBgn ?? paymentOptions[0]?.totalBgn ?? 0;

    return {
      insurerCode: this.insurerCode,
      price,
      currency: 'BGN',
      paymentOptions,
      coverDetails: {
        product: this.mockData.summary.product,
        package: this.mockData.summary.package,
        coverageType: 'third_party_liability',
      },
      extras: {
        roadside_assistance: true,
        glass: false,
        legal: false,
      },
      rawResponse: {
        mock: true,
        insurer: this.insurerCode,
        summary: this.mockData.summary,
        timestamp: new Date().toISOString(),
        delay: Math.round(delay),
      },
    };
  }
}
