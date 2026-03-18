import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface RequestWithContext extends Request {
  tenantId?: string;
  userId?: string;
  traceId?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const res = context.switchToHttp().getResponse<Response>();

    const traceId = (req.headers['x-trace-id'] as string) ?? uuidv4();
    req.traceId = traceId;
    res.setHeader('X-Trace-Id', traceId);

    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        this.logger.log({
          tenant_id: req.tenantId ?? null,
          user_id: req.userId ?? null,
          trace_id: traceId,
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.url,
          status_code: res.statusCode,
          duration_ms: duration,
        });
      }),
    );
  }
}
