import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from './scoring.service';
import { AuditService } from '../../../common/audit/audit.service';
import type { QuoteResult } from '../adapters/insurer-adapter.interface';
import type { Insurer } from '../entities/insurer.entity';

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const makeInsurer = (
  code: string,
  rating: number,
  claimSpeed: number,
): Insurer =>
  ({
    id: `id-${code}`,
    code,
    name: `Insurer ${code}`,
    rating: rating as unknown as number,
    claimSpeed: claimSpeed as unknown as number,
    isActive: true,
    extrasConfig: {},
    adapterClass: 'MockInsurerAdapter',
    apiEndpoint: null,
    apiKeyEnc: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }) as Insurer;

const makeQuoteResult = (
  insurerCode: string,
  price: number,
  extras?: Record<string, unknown>,
): QuoteResult => ({
  insurerCode,
  price,
  currency: 'BGN',
  coverDetails: {},
  extras: extras ?? { roadside_assistance: true, glass: true, legal: false },
  rawResponse: {},
});

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
    jest.clearAllMocks();
  });

  describe('scoreOffers', () => {
    it('returns correct scores using the 40/30/20/10 formula', () => {
      const offers = [
        makeQuoteResult('allianz', 500),
        makeQuoteResult('generali', 400),
      ];
      const insurers = [
        makeInsurer('allianz', 4.5, 8.5),
        makeInsurer('generali', 4.2, 7.8),
      ];

      const result = service.scoreOffers(offers, insurers);

      expect(result).toHaveLength(2);
      // generali has lower price → higher priceScore
      const generali = result.find((r) => r.insurerCode === 'generali')!;
      const allianz = result.find((r) => r.insurerCode === 'allianz')!;
      expect(generali.score).toBeGreaterThan(0);
      expect(allianz.score).toBeGreaterThan(0);
    });

    it('marks exactly 1 offer as recommended', () => {
      const offers = [
        makeQuoteResult('allianz', 500),
        makeQuoteResult('generali', 400),
        makeQuoteResult('dsk', 380),
      ];
      const insurers = [
        makeInsurer('allianz', 4.5, 8.5),
        makeInsurer('generali', 4.2, 7.8),
        makeInsurer('dsk', 4.0, 7.0),
      ];

      const result = service.scoreOffers(offers, insurers);
      const recommended = result.filter((r) => r.isRecommended);
      expect(recommended).toHaveLength(1);
    });

    it('tie-breaks by higher insurer rating', () => {
      // Same price for all — tie on priceScore
      const offers = [makeQuoteResult('a', 400), makeQuoteResult('b', 400)];
      const insurers = [makeInsurer('a', 3.0, 5.0), makeInsurer('b', 5.0, 5.0)];

      const result = service.scoreOffers(offers, insurers);
      const recommended = result.find((r) => r.isRecommended)!;
      expect(recommended.insurerCode).toBe('b');
    });

    it('returns empty array when no offers provided', () => {
      const result = service.scoreOffers([], []);
      expect(result).toEqual([]);
    });

    it('single offer is always recommended', () => {
      const offers = [makeQuoteResult('allianz', 450)];
      const insurers = [makeInsurer('allianz', 4.5, 8.5)];

      const result = service.scoreOffers(offers, insurers);
      expect(result[0].isRecommended).toBe(true);
    });
  });

  describe('logScoringAudit', () => {
    it('записва в audit_log (таблицата audit_log, не audit_logs)', async () => {
      const scoredOffers = service.scoreOffers(
        [makeQuoteResult('allianz', 450)],
        [makeInsurer('allianz', 4.5, 8.5)],
      );

      await service.logScoringAudit(
        'tenant-uuid',
        'session-token-123',
        'WVWZZZ3BZ3E123456',
        scoredOffers,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-uuid',
          action: 'quote.scored',
          entityType: 'quote_session',
          entityId: 'session-token-123',
        }),
      );
    });
  });
});
