import { Injectable } from '@nestjs/common';

export interface ScoringWeights {
  price: number;
  rating: number;
  claimSpeed: number;
  extras: number;
}

export interface NlpScoringResult {
  detectedIntent: NlpIntent;
  appliedWeights: ScoringWeights;
  explanation: string;
}

export type NlpIntent =
  | 'price_focused'
  | 'reliability_focused'
  | 'claim_speed_focused'
  | 'coverage_focused'
  | 'balanced';

interface IntentDefinition {
  intent: NlpIntent;
  weights: ScoringWeights;
  explanation: string;
  keywords: string[];
}

const INTENT_DEFINITIONS: IntentDefinition[] = [
  {
    intent: 'price_focused',
    weights: { price: 0.7, rating: 0.15, claimSpeed: 0.1, extras: 0.05 },
    explanation: 'Класирането е оптимизирано за най-ниска цена.',
    keywords: [
      'евтин',
      'евтина',
      'евтино',
      'евтини',
      'най-евтин',
      'най-евтина',
      'бюджет',
      'бюджетен',
      'бюджетна',
      'спестя',
      'спестявам',
      'спести',
      'икономично',
      'икономичен',
      'cheap',
      'cheapest',
      'budget',
      'price',
      'affordable',
    ],
  },
  {
    intent: 'reliability_focused',
    weights: { price: 0.2, rating: 0.55, claimSpeed: 0.15, extras: 0.1 },
    explanation:
      'Класирането приоритизира надеждни застрахователи с висок рейтинг.',
    keywords: [
      'надежд',
      'надеждна',
      'надеждно',
      'сигур',
      'сигурна',
      'сигурно',
      'доверен',
      'доверена',
      'доверено',
      'репутация',
      'рейтинг',
      'качество',
      'quality',
      'reliable',
      'trustworthy',
      'rated',
    ],
  },
  {
    intent: 'claim_speed_focused',
    weights: { price: 0.2, rating: 0.2, claimSpeed: 0.5, extras: 0.1 },
    explanation: 'Класирането е оптимизирано за бърза обработка на щети.',
    keywords: [
      'щета',
      'щети',
      'бърза щета',
      'обработка',
      'сервиз',
      'ремонт',
      'бърз',
      'бързо',
      'бързина',
      'скорост',
      'claim',
      'fast claim',
      'quick',
      'speed',
      'repair',
    ],
  },
  {
    intent: 'coverage_focused',
    weights: { price: 0.15, rating: 0.25, claimSpeed: 0.2, extras: 0.4 },
    explanation: 'Класирането максимизира допълнителното покритие.',
    keywords: [
      'покритие',
      'покриване',
      'пълно покритие',
      'допълнително',
      'включено',
      'включени',
      'асистанс',
      'пътна помощ',
      'каско',
      'comprehensive',
      'coverage',
      'full',
      'extras',
      'assistance',
    ],
  },
];

const BALANCED_WEIGHTS: ScoringWeights = {
  price: 0.4,
  rating: 0.3,
  claimSpeed: 0.2,
  extras: 0.1,
};

@Injectable()
export class NlpScoringService {
  detectIntent(preference: string): NlpScoringResult {
    const normalized = preference.toLowerCase().trim();

    const scores = INTENT_DEFINITIONS.map((def) => ({
      def,
      hits: def.keywords.filter((kw) => normalized.includes(kw)).length,
    }));

    const best = scores.reduce((prev, curr) =>
      curr.hits > prev.hits ? curr : prev,
    );

    if (best.hits === 0) {
      return {
        detectedIntent: 'balanced',
        appliedWeights: { ...BALANCED_WEIGHTS },
        explanation: 'Балансирано класиране по стандартен алгоритъм.',
      };
    }

    // Check for combined intents (2+ categories with hits) → blend weights
    const withHits = scores.filter((s) => s.hits > 0);
    if (withHits.length >= 2) {
      return this.blendWeights(withHits.map((s) => s.def));
    }

    return {
      detectedIntent: best.def.intent,
      appliedWeights: { ...best.def.weights },
      explanation: best.def.explanation,
    };
  }

  private blendWeights(defs: IntentDefinition[]): NlpScoringResult {
    const count = defs.length;
    const blended: ScoringWeights = {
      price: defs.reduce((s, d) => s + d.weights.price, 0) / count,
      rating: defs.reduce((s, d) => s + d.weights.rating, 0) / count,
      claimSpeed: defs.reduce((s, d) => s + d.weights.claimSpeed, 0) / count,
      extras: defs.reduce((s, d) => s + d.weights.extras, 0) / count,
    };

    const intentNames = defs.map((d) => d.intent).join(', ');
    return {
      detectedIntent: 'balanced',
      appliedWeights: blended,
      explanation: `Комбинирано класиране (${intentNames}).`,
    };
  }
}
