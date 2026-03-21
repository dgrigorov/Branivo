import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { default as request } from 'supertest';
import { ThrottlerModule } from '@nestjs/throttler';
import Stripe from 'stripe';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { PaymentIntentResponseDto } from './dto/payment-intent-response.dto';
import { ClientJwtAuthGuard } from '../clients/guards/client-jwt-auth.guard';
import { QUEUE_WEBHOOK_PROCESSING } from '../../infrastructure/queues/queue.module';

const QUOTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CLIENT_ID = 'client-uuid-123';

const mockPaymentIntentResponse: PaymentIntentResponseDto = {
  clientSecret: 'pi_test_secret_123',
  paymentId: 'pi_test_123',
  amount: 450,
  currency: 'BGN',
};

const mockPaymentsService = {
  createIntent: jest.fn(),
};

const mockStripeWebhookService = {
  constructEvent: jest.fn(),
  handleEvent: jest.fn(),
};

const mockWebhookQueue = {
  add: jest.fn(),
};

class MockClientJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: unknown }>();
    req.user = {
      userId: CLIENT_ID,
      tenantId: 'tenant-uuid',
      role: 'end_client',
      jti: 'jti',
      exp: 9999999999,
    };
    return true;
  }
}

class RejectingGuard implements CanActivate {
  canActivate(): boolean {
    throw new UnauthorizedException(); // H2 fix: throw 401, not return false (403)
  }
}

describe('PaymentsController — createIntent (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ limit: 100, ttl: 60000 }])],
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: StripeWebhookService, useValue: mockStripeWebhookService },
        {
          provide: getQueueToken(QUEUE_WEBHOOK_PROCESSING),
          useValue: mockWebhookQueue,
        },
      ],
    })
      .overrideGuard(ClientJwtAuthGuard)
      .useClass(MockClientJwtAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /payments/intent — 201 Created with clientSecret and paymentId', async () => {
    mockPaymentsService.createIntent.mockResolvedValue(
      mockPaymentIntentResponse,
    );

    const body = await request(app.getHttpServer() as import('http').Server)
      .post('/payments/intent')
      .send({ quoteId: QUOTE_ID })
      .expect(201);

    const result = body.body as PaymentIntentResponseDto;
    expect(result.clientSecret).toBe('pi_test_secret_123');
    expect(result.paymentId).toBe('pi_test_123');
    expect(result.amount).toBe(450);
    expect(result.currency).toBe('BGN');
    expect(mockPaymentsService.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: QUOTE_ID, endClientId: CLIENT_ID }),
    );
  });

  it('POST /payments/intent (duplicate) — 201 Created idempotent, NO 409', async () => {
    mockPaymentsService.createIntent.mockResolvedValue(
      mockPaymentIntentResponse,
    );

    await request(app.getHttpServer() as import('http').Server)
      .post('/payments/intent')
      .send({ quoteId: QUOTE_ID })
      .expect(201);

    await request(app.getHttpServer() as import('http').Server)
      .post('/payments/intent')
      .send({ quoteId: QUOTE_ID })
      .expect(201);

    expect(mockPaymentsService.createIntent).toHaveBeenCalledTimes(2);
  });

  it('POST /payments/intent without JWT — 401 Unauthorized', async () => {
    const moduleNoAuth: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ limit: 100, ttl: 60000 }])],
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: StripeWebhookService, useValue: mockStripeWebhookService },
        {
          provide: getQueueToken(QUEUE_WEBHOOK_PROCESSING),
          useValue: mockWebhookQueue,
        },
      ],
    })
      .overrideGuard(ClientJwtAuthGuard)
      .useClass(RejectingGuard)
      .compile();

    const appNoAuth = moduleNoAuth.createNestApplication();
    appNoAuth.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await appNoAuth.init();

    await request(appNoAuth.getHttpServer() as import('http').Server)
      .post('/payments/intent')
      .send({ quoteId: QUOTE_ID })
      .expect(401);

    await appNoAuth.close();
  });

  it('POST /payments/intent with invalid quoteId — 400 Bad Request', async () => {
    await request(app.getHttpServer() as import('http').Server)
      .post('/payments/intent')
      .send({ quoteId: 'not-a-uuid' })
      .expect(400);

    expect(mockPaymentsService.createIntent).not.toHaveBeenCalled();
  });
});

describe('PaymentsController — handleWebhook (integration)', () => {
  let app: INestApplication;
  const STRIPE_SIG = 't=1700000000,v1=abc123';
  const mockEvent = {
    id: 'evt_test_001',
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_test_001' } },
  } as unknown as Stripe.Event;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ limit: 100, ttl: 60000 }])],
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: StripeWebhookService, useValue: mockStripeWebhookService },
        {
          provide: getQueueToken(QUEUE_WEBHOOK_PROCESSING),
          useValue: mockWebhookQueue,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('Тест 1: POST /payments/webhook без stripe-signature → 400', async () => {
    await request(app.getHttpServer() as import('http').Server)
      .post('/payments/webhook')
      .send(Buffer.from('{}'))
      .expect(400);

    expect(mockStripeWebhookService.constructEvent).not.toHaveBeenCalled();
  });

  it('Тест 2: POST /payments/webhook с невалидна Stripe signature → 400', async () => {
    mockStripeWebhookService.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    await request(app.getHttpServer() as import('http').Server)
      .post('/payments/webhook')
      .set('stripe-signature', 'invalid_sig')
      .send(Buffer.from('{}'))
      .expect(400);
  });

  it('Тест 3: POST /payments/webhook payment_intent.succeeded → 200 { received: true }', async () => {
    mockStripeWebhookService.constructEvent.mockReturnValue(mockEvent);
    mockWebhookQueue.add.mockResolvedValue({ id: 'job-1' });

    const body = await request(app.getHttpServer() as import('http').Server)
      .post('/payments/webhook')
      .set('stripe-signature', STRIPE_SIG)
      .send(Buffer.from('{}'))
      .expect(200);

    const result = body.body as { received: boolean };
    expect(result.received).toBe(true);
    expect(mockWebhookQueue.add).toHaveBeenCalledWith(
      'process-stripe-event',
      mockEvent,
      expect.objectContaining({ jobId: mockEvent.id }),
    );
  });

  it('Тест 4: POST /payments/webhook payment_intent.payment_failed → 200 { received: true }', async () => {
    const failedEvent = {
      ...mockEvent,
      id: 'evt_test_002',
      type: 'payment_intent.payment_failed',
    } as unknown as Stripe.Event;
    mockStripeWebhookService.constructEvent.mockReturnValue(failedEvent);
    mockWebhookQueue.add.mockResolvedValue({ id: 'job-2' });

    const body = await request(app.getHttpServer() as import('http').Server)
      .post('/payments/webhook')
      .set('stripe-signature', STRIPE_SIG)
      .send(Buffer.from('{}'))
      .expect(200);

    const result = body.body as { received: boolean };
    expect(result.received).toBe(true);
  });

  it('Тест 5: POST /payments/webhook unknown event type → 200 { received: true }', async () => {
    const unknownEvent = {
      ...mockEvent,
      id: 'evt_test_003',
      type: 'customer.created',
    } as unknown as Stripe.Event;
    mockStripeWebhookService.constructEvent.mockReturnValue(unknownEvent);
    mockWebhookQueue.add.mockResolvedValue({ id: 'job-3' });

    const body = await request(app.getHttpServer() as import('http').Server)
      .post('/payments/webhook')
      .set('stripe-signature', STRIPE_SIG)
      .send(Buffer.from('{}'))
      .expect(200);

    const result = body.body as { received: boolean };
    expect(result.received).toBe(true);
  });
});
