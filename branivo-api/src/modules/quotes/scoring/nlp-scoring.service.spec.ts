import { NlpScoringService } from './nlp-scoring.service';

describe('NlpScoringService', () => {
  let service: NlpScoringService;

  beforeEach(() => {
    service = new NlpScoringService();
  });

  describe('detectIntent', () => {
    it('returns balanced intent for empty/unrecognized input', () => {
      const result = service.detectIntent('просто ми дай оферта');
      expect(result.detectedIntent).toBe('balanced');
      expect(result.appliedWeights.price).toBe(0.4);
      expect(result.appliedWeights.rating).toBe(0.3);
    });

    it('detects price_focused intent', () => {
      const result = service.detectIntent('искам най-евтина застраховка');
      expect(result.detectedIntent).toBe('price_focused');
      expect(result.appliedWeights.price).toBeGreaterThan(0.5);
    });

    it('detects price_focused with english keyword', () => {
      const result = service.detectIntent('I want the cheapest option');
      expect(result.detectedIntent).toBe('price_focused');
    });

    it('detects reliability_focused intent', () => {
      const result = service.detectIntent(
        'искам надеждна компания с висок рейтинг',
      );
      expect(result.detectedIntent).toBe('reliability_focused');
      expect(result.appliedWeights.rating).toBeGreaterThan(0.4);
    });

    it('detects claim_speed_focused intent', () => {
      const result = service.detectIntent('искам бърза щета и добър сервиз');
      expect(result.detectedIntent).toBe('claim_speed_focused');
      expect(result.appliedWeights.claimSpeed).toBeGreaterThan(0.3);
    });

    it('detects coverage_focused intent', () => {
      const result = service.detectIntent('искам пълно покритие с асистанс');
      expect(result.detectedIntent).toBe('coverage_focused');
      expect(result.appliedWeights.extras).toBeGreaterThan(0.3);
    });

    it('blends weights when multiple intents detected', () => {
      const result = service.detectIntent('евтина застраховка с бърза щета');
      // Both price_focused and claim_speed_focused → blended
      const { appliedWeights } = result;
      const sum =
        appliedWeights.price +
        appliedWeights.rating +
        appliedWeights.claimSpeed +
        appliedWeights.extras;
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
    });

    it('weights always sum to approximately 1.0', () => {
      const inputs = [
        'най-евтино',
        'надеждна компания',
        'бърза щета',
        'пълно покритие',
        'random text',
        'евтина и бърза',
      ];
      for (const input of inputs) {
        const { appliedWeights } = service.detectIntent(input);
        const sum =
          appliedWeights.price +
          appliedWeights.rating +
          appliedWeights.claimSpeed +
          appliedWeights.extras;
        expect(Math.abs(sum - 1.0)).toBeLessThan(0.02);
      }
    });

    it('returns explanation text for every intent', () => {
      const inputs = ['евтина', 'надеждна', 'щета', 'покритие', 'random'];
      for (const input of inputs) {
        const result = service.detectIntent(input);
        expect(result.explanation).toBeTruthy();
        expect(typeof result.explanation).toBe('string');
      }
    });
  });
});
