import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { default as request } from 'supertest';
import { ThrottlerModule } from '@nestjs/throttler';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentIntentResponseDto } from './dto/payment-intent-response.dto';
import { ClientJwtAuthGuard } from '../clients/guards/client-jwt-auth.guard';

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
      providers: [{ provide: PaymentsService, useValue: mockPaymentsService }],
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
      providers: [{ provide: PaymentsService, useValue: mockPaymentsService }],
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
