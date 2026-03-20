import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { default as request } from 'supertest';
import { ThrottlerModule } from '@nestjs/throttler';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import type { QuoteResponseDto } from './dto/quote-response.dto';

const SESSION_TOKEN = 'session-abc-123';

const mockQuoteResponse: QuoteResponseDto = {
  sessionToken: SESSION_TOKEN,
  offers: [
    {
      id: 'quote-id-1',
      insurerCode: 'allianz',
      insurerName: 'Allianz Bulgaria',
      price: 450,
      currency: 'BGN',
      score: 0.75,
      isRecommended: true,
      status: 'success' as const,
      extras: { roadside_assistance: true },
    },
    {
      id: 'quote-id-2',
      insurerCode: 'generali',
      insurerName: 'Generali Bulgaria',
      price: 420,
      currency: 'BGN',
      score: 0.7,
      isRecommended: false,
      status: 'success' as const,
      extras: {},
    },
  ],
  status: 'complete',
  requestedAt: new Date().toISOString(),
};

const mockQuotesService = {
  createQuoteRequest: jest.fn().mockResolvedValue(mockQuoteResponse),
  getQuotesBySession: jest.fn().mockResolvedValue(mockQuoteResponse),
};

describe('QuotesController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [QuotesController],
      providers: [{ provide: QuotesService, useValue: mockQuotesService }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    jest.clearAllMocks();
    mockQuotesService.createQuoteRequest.mockResolvedValue(mockQuoteResponse);
    mockQuotesService.getQuotesBySession.mockResolvedValue(mockQuoteResponse);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/quotes', () => {
    it('returns 201 with quote session data', async () => {
      const body = await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .send({ sessionToken: SESSION_TOKEN })
        .expect(201);

      const res = body.body as { data: QuoteResponseDto };
      expect(res.data.sessionToken).toBe(SESSION_TOKEN);
      expect(res.data.offers).toHaveLength(2);
      expect(res.data.status).toBe('complete');
    });

    it('returns 400 when sessionToken is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/v1/quotes/:sessionToken', () => {
    it('returns 200 with offers array', async () => {
      const body = await request(app.getHttpServer())
        .get(`/api/v1/quotes/${SESSION_TOKEN}`)
        .expect(200);

      const res = body.body as { data: QuoteResponseDto };
      expect(res.data.offers).toHaveLength(2);
      expect(mockQuotesService.getQuotesBySession).toHaveBeenCalledWith(
        SESSION_TOKEN,
      );
    });

    it('response does NOT contain api_key_enc', async () => {
      const body = await request(app.getHttpServer())
        .get(`/api/v1/quotes/${SESSION_TOKEN}`)
        .expect(200);

      const res = body.body as { data: QuoteResponseDto };
      const bodyStr = JSON.stringify(res);
      expect(bodyStr).not.toContain('api_key_enc');
      expect(bodyStr).not.toContain('apiKeyEnc');
      expect(bodyStr).not.toContain('rawResponse');
    });
  });
});
