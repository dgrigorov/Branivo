import type { QuoteOfferDto } from './quote-offer.dto';

export class QuoteResponseDto {
  sessionToken!: string;
  offers!: QuoteOfferDto[];
  status!: 'pending' | 'complete';
  requestedAt!: string;
}
