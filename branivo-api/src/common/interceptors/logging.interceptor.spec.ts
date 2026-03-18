import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

interface RequestWithTrace {
  traceId?: string;
}

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  function mockContext(
    overrides: Partial<{
      traceId: string;
      tenantId: string;
      userId: string;
    }> = {},
  ): ExecutionContext {
    const req = {
      headers: overrides.traceId ? { 'x-trace-id': overrides.traceId } : {},
      method: 'GET',
      url: '/api/v1/health',
      tenantId: overrides.tenantId ?? null,
      userId: overrides.userId ?? null,
    };
    const res = {
      statusCode: 200,
      setHeader: jest.fn(),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  }

  it('is defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('uses provided X-Trace-Id header', (done) => {
    const ctx = mockContext({ traceId: 'test-trace-id' });
    const req = ctx.switchToHttp().getRequest<RequestWithTrace>();
    const handler = { handle: () => of({}) };

    interceptor.intercept(ctx, handler).subscribe(() => {
      expect(req.traceId).toBe('test-trace-id');
      done();
    });
  });

  it('generates a UUID trace ID when header is missing', (done) => {
    const ctx = mockContext();
    const req = ctx.switchToHttp().getRequest<RequestWithTrace>();
    const handler = { handle: () => of({}) };

    interceptor.intercept(ctx, handler).subscribe(() => {
      expect(req.traceId).toBeDefined();
      expect(typeof req.traceId).toBe('string');
      expect(req.traceId!.length).toBeGreaterThan(0);
      done();
    });
  });
});
