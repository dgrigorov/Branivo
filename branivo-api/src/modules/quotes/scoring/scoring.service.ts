import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service';
import type { QuoteResult } from '../adapters/insurer-adapter.interface';
import type { Insurer } from '../entities/insurer.entity';
import type { ScoringWeights } from './nlp-scoring.service';

// IMMUTABLE — NEVER change weights without product decision (NFR44, КФН compliance)
const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  price: 0.4,
  rating: 0.3,
  claimSpeed: 0.2,
  extras: 0.1,
} as const;

export interface ScoredOffer extends QuoteResult {
  score: number;
  isRecommended: boolean;
  insurer: Insurer;
}

@Injectable()
export class ScoringService {
  constructor(private readonly auditService: AuditService) {}

  scoreOffers(
    offers: QuoteResult[],
    insurers: Insurer[],
    weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  ): ScoredOffer[] {
    if (offers.length === 0) return [];

    const insurerMap = new Map(insurers.map((ins) => [ins.code, ins]));
    const prices = offers.map((o) => o.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const scored = offers.map((offer) => {
      const insurer = insurerMap.get(offer.insurerCode)!;
      const priceScore =
        maxPrice === minPrice
          ? 1.0
          : 1 - (offer.price - minPrice) / (maxPrice - minPrice);

      const extrasEntries = Object.entries(offer.extras);
      const availableExtrasCount = extrasEntries.length;
      const activeExtrasCount = extrasEntries.filter(
        ([, v]) => v === true,
      ).length;
      const extrasScore =
        availableExtrasCount > 0 ? activeExtrasCount / availableExtrasCount : 0;

      const score =
        weights.price * priceScore +
        weights.rating * (Number(insurer.rating) / 5) +
        weights.claimSpeed * (Number(insurer.claimSpeed) / 10) +
        weights.extras * extrasScore;

      return { ...offer, score, isRecommended: false, insurer };
    });

    // Mark only 1 recommended — tie-break by higher rating
    let bestIdx = 0;
    for (let i = 1; i < scored.length; i++) {
      const isBetter =
        scored[i].score > scored[bestIdx].score ||
        (scored[i].score === scored[bestIdx].score &&
          Number(scored[i].insurer.rating) >
            Number(scored[bestIdx].insurer.rating));
      if (isBetter) bestIdx = i;
    }
    scored[bestIdx].isRecommended = true;

    return scored;
  }

  async logScoringAudit(
    tenantId: string,
    sessionToken: string,
    vehicleVin: string,
    scoredOffers: ScoredOffer[],
  ): Promise<void> {
    const payload = {
      inputs: {
        sessionToken,
        vehicleVin,
        insurerCount: scoredOffers.length,
      },
      weights: DEFAULT_SCORING_WEIGHTS,
      results: scoredOffers.map((o) => ({
        insurerCode: o.insurerCode,
        price: o.price,
        score: o.score,
        isRecommended: o.isRecommended,
      })),
    };

    await this.auditService.log({
      tenantId,
      action: 'quote.scored',
      entityType: 'quote_session',
      entityId: sessionToken,
      metadata: payload,
    });
  }
}
