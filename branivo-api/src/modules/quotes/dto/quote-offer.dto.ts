import type { QuoteStatus } from '../entities/quote.entity';

export class InstallmentDto {
  number!: number;
  amountBgn!: number;
}

export class PaymentOptionDto {
  installmentCount!: number;
  installments!: InstallmentDto[];
  totalBgn!: number;
}

export class QuoteOfferDto {
  id!: string;
  insurerCode!: string;
  insurerName!: string;
  price!: number | null;
  currency!: string;
  score!: number | null;
  isRecommended!: boolean;
  status!: QuoteStatus;
  extras!: Record<string, unknown>;
  errorReason?: 'unavailable' | 'timeout';
  paymentOptions!: PaymentOptionDto[];
}
