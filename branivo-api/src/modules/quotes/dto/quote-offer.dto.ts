import type { QuoteStatus } from '../entities/quote.entity';

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
}
