import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuotesService } from './quotes.service';
import { QuotesRepository } from './quotes.repository';
import { ScoringService } from './scoring/scoring.service';
import {
  CircuitBreakerService,
  CircuitOpenException,
} from './circuit-breaker.service';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { TenantsRepository } from '../tenants/tenants.repository';
import { NlpScoringService } from './scoring/nlp-scoring.service';
import { INSURER_ADAPTERS } from './adapters/insurer-adapter.interface';
import { QuoteStatus } from './entities/quote.entity';
import type { Insurer } from './entities/insurer.entity';
import type { Quote } from './entities/quote.entity';
import type { CreateQuoteDto } from './dto/create-quote.dto';

const TENANT_ID = 'tenant-uuid-001';
const SESSION_TOKEN = 'test-session-token';

const makeInsurer = (code: string): Insurer =>
  ({
    id: `insurer-id-${code}`,
    code,
    name: `Insurer ${code}`,
    rating: 4.0 as unknown as number,
    claimSpeed: 7.0 as unknown as number,
    isActive: true,
    extrasConfig: {},
    adapterClass: 'MockInsurerAdapter',
    apiEndpoint: null,
    apiKeyEnc: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }) as Insurer;

const makeQuote = (insurerId: string, status: QuoteStatus): Quote =>
  ({
    id: `quote-id-${insurerId}`,
    tenantId: TENANT_ID,
    sessionToken: SESSION_TOKEN,
    vehicleId: null,
    insurerId,
    insurer: makeInsurer(insurerId),
    status,
    price: status === QuoteStatus.SUCCESS ? 400 : null,
    currency: 'BGN',
    coverDetails: {},
    extras: {},
    score: null,
    isRecommended: false,
    rawResponse: null,
    errorMessage: null,
    expiresAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }) as Quote;

const mockQuotesRepository = {
  findActiveInsurers: jest.fn(),
  bulkCreate: jest.fn(),
  updateQuoteStatus: jest.fn().mockResolvedValue(undefined),
  findBySessionToken: jest.fn(),
};

const mockScoringService = {
  scoreOffers: jest.fn().mockReturnValue([
    {
      insurerCode: 'allianz',
      price: 450,
      score: 0.75,
      isRecommended: true,
      insurer: makeInsurer('allianz'),
    },
  ]),
  logScoringAudit: jest.fn().mockResolvedValue(undefined),
};

const mockCircuitBreakerService = {
  call: jest
    .fn()
    .mockImplementation(async (_code: string, fn: () => Promise<unknown>) =>
      fn(),
    ),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

const mockTenantsRepo = {
  findById: jest.fn().mockResolvedValue({ id: TENANT_ID, status: 'active' }),
};

const mockNlpScoringService = {
  detectIntent: jest.fn().mockReturnValue({
    intent: 'price',
    confidence: 0.9,
    appliedWeights: { price: 1.0 },
  }),
};

const allianzAdapter = {
  insurerCode: 'allianz',
  fetchQuote: jest.fn().mockResolvedValue({
    insurerCode: 'allianz',
    price: 450,
    currency: 'BGN',
    coverDetails: {},
    extras: { roadside_assistance: true },
    rawResponse: {},
  }),
};
const generaliAdapter = {
  insurerCode: 'generali',
  fetchQuote: jest.fn().mockResolvedValue({
    insurerCode: 'generali',
    price: 420,
    currency: 'BGN',
    coverDetails: {},
    extras: {},
    rawResponse: {},
  }),
};
const dskAdapter = {
  insurerCode: 'dsk',
  fetchQuote: jest.fn().mockResolvedValue({
    insurerCode: 'dsk',
    price: 380,
    currency: 'BGN',
    coverDetails: {},
    extras: {},
    rawResponse: {},
  }),
};
const bulstradAdapter = {
  insurerCode: 'bulstrad',
  fetchQuote: jest.fn().mockResolvedValue({
    insurerCode: 'bulstrad',
    price: 400,
    currency: 'BGN',
    coverDetails: {},
    extras: {},
    rawResponse: {},
  }),
};

describe('QuotesService', () => {
  let service: QuotesService;

  const activeInsurers = ['allianz', 'generali', 'dsk', 'bulstrad'].map(
    makeInsurer,
  );

  beforeEach(async () => {
    mockQuotesRepository.findActiveInsurers.mockResolvedValue(activeInsurers);
    mockQuotesRepository.bulkCreate.mockResolvedValue(
      activeInsurers.map((ins) => makeQuote(ins.id, QuoteStatus.PENDING)),
    );
    mockQuotesRepository.findBySessionToken.mockResolvedValue(
      activeInsurers.map((ins) => makeQuote(ins.id, QuoteStatus.SUCCESS)),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: QuotesRepository, useValue: mockQuotesRepository },
        { provide: ScoringService, useValue: mockScoringService },
        { provide: CircuitBreakerService, useValue: mockCircuitBreakerService },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: TenantsRepository, useValue: mockTenantsRepo },
        { provide: NlpScoringService, useValue: mockNlpScoringService },
        {
          provide: INSURER_ADAPTERS,
          useValue: [
            allianzAdapter,
            generaliAdapter,
            dskAdapter,
            bulstradAdapter,
          ],
        },
      ],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
    jest.clearAllMocks();
    mockTenantContext.getTenantId.mockReturnValue(TENANT_ID);
    mockQuotesRepository.findActiveInsurers.mockResolvedValue(activeInsurers);
    mockQuotesRepository.bulkCreate.mockResolvedValue(
      activeInsurers.map((ins) => makeQuote(ins.id, QuoteStatus.PENDING)),
    );
    mockQuotesRepository.findBySessionToken.mockResolvedValue(
      activeInsurers.map((ins) => makeQuote(ins.id, QuoteStatus.SUCCESS)),
    );
    mockQuotesRepository.updateQuoteStatus.mockResolvedValue(undefined);
    mockScoringService.scoreOffers.mockReturnValue([]);
    mockScoringService.logScoringAudit.mockResolvedValue(undefined);
    mockTenantsRepo.findById.mockResolvedValue({
      id: TENANT_ID,
      status: 'active',
    });
    mockCircuitBreakerService.call.mockImplementation(
      async (_code: string, fn: () => Promise<unknown>) => fn(),
    );
    allianzAdapter.fetchQuote.mockResolvedValue({
      insurerCode: 'allianz',
      price: 450,
      currency: 'BGN',
      coverDetails: {},
      extras: {},
      rawResponse: {},
    });
    generaliAdapter.fetchQuote.mockResolvedValue({
      insurerCode: 'generali',
      price: 420,
      currency: 'BGN',
      coverDetails: {},
      extras: {},
      rawResponse: {},
    });
    dskAdapter.fetchQuote.mockResolvedValue({
      insurerCode: 'dsk',
      price: 380,
      currency: 'BGN',
      coverDetails: {},
      extras: {},
      rawResponse: {},
    });
    bulstradAdapter.fetchQuote.mockResolvedValue({
      insurerCode: 'bulstrad',
      price: 400,
      currency: 'BGN',
      coverDetails: {},
      extras: {},
      rawResponse: {},
    });
  });

  describe('createQuoteRequest', () => {
    it('calls Promise.allSettled for all 4 adapters and creates quote rows', async () => {
      const dto: CreateQuoteDto = { sessionToken: SESSION_TOKEN };

      await service.createQuoteRequest(dto);

      expect(mockQuotesRepository.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tenantId: TENANT_ID,
            sessionToken: SESSION_TOKEN,
          }),
        ]),
      );
      expect(mockCircuitBreakerService.call).toHaveBeenCalledTimes(4);
    });

    it('handles timeout on 1 adapter — still returns remaining 3 offers', async () => {
      allianzAdapter.fetchQuote.mockRejectedValue(
        new Error('Timeout after 5000ms'),
      );

      const dto: CreateQuoteDto = { sessionToken: SESSION_TOKEN };
      await service.createQuoteRequest(dto);

      expect(mockQuotesRepository.updateQuoteStatus).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: QuoteStatus.TIMEOUT }),
      );
    });

    it('handles circuit breaker open — marks insurer as error', async () => {
      mockCircuitBreakerService.call.mockImplementationOnce((code: string) =>
        Promise.reject(new CircuitOpenException(code)),
      );
      mockCircuitBreakerService.call.mockImplementation(
        async (_code: string, fn: () => Promise<unknown>) => fn(),
      );

      const dto: CreateQuoteDto = { sessionToken: SESSION_TOKEN };
      await service.createQuoteRequest(dto);

      expect(mockQuotesRepository.updateQuoteStatus).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: QuoteStatus.ERROR }),
      );
    });

    it('gets tenantId from TenantContext — not from parameter', async () => {
      const dto: CreateQuoteDto = { sessionToken: SESSION_TOKEN };
      await service.createQuoteRequest(dto);

      expect(mockTenantContext.getTenantId).toHaveBeenCalled();
    });
  });

  describe('getQuotesBySession', () => {
    it('returns session quotes scoped to tenant', async () => {
      const result = await service.getQuotesBySession(SESSION_TOKEN);

      expect(mockQuotesRepository.findBySessionToken).toHaveBeenCalledWith(
        SESSION_TOKEN,
      );
      expect(result.sessionToken).toBe(SESSION_TOKEN);
    });
  });

  describe('createQuoteRequest — stripe_revoked blocking (AC1)', () => {
    it('throws ForbiddenException when tenant status is stripe_revoked', async () => {
      mockTenantsRepo.findById.mockResolvedValue({
        id: TENANT_ID,
        status: 'stripe_revoked',
      });

      const dto: CreateQuoteDto = { sessionToken: SESSION_TOKEN };
      await expect(service.createQuoteRequest(dto)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.createQuoteRequest(dto)).rejects.toThrow(
        'Broker account is suspended. New purchases are not available.',
      );
    });

    it('proceeds normally when tenant status is active', async () => {
      mockTenantsRepo.findById.mockResolvedValue({
        id: TENANT_ID,
        status: 'active',
      });

      const dto: CreateQuoteDto = { sessionToken: SESSION_TOKEN };
      await expect(service.createQuoteRequest(dto)).resolves.not.toThrow();
    });
  });
});
