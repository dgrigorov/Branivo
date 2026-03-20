import { Injectable, Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { TenantContext } from '../../common/tenant-context/tenant.context';

export class CircuitOpenException extends Error {
  constructor(insurerCode: string) {
    super(`Circuit breaker is open for insurer: ${insurerCode}`);
    this.name = 'CircuitOpenException';
  }
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly tenantContext: TenantContext) {}

  private getBreaker(tenantId: string, code: string): CircuitBreaker {
    const key = `${tenantId}:${code}`;
    if (!this.breakers.has(key)) {
      const breaker = new CircuitBreaker(
        async (fn: () => Promise<unknown>) => fn(),
        {
          timeout: 5000,
          errorThresholdPercentage: 50,
          volumeThreshold: 5,
          resetTimeout: 30000,
        },
      );
      breaker.on('open', () =>
        this.logger.warn(
          `Circuit OPEN for insurer: ${code} (tenant: ${tenantId})`,
        ),
      );
      breaker.on('halfOpen', () =>
        this.logger.log(
          `Circuit HALF-OPEN for insurer: ${code} (tenant: ${tenantId})`,
        ),
      );
      breaker.on('close', () =>
        this.logger.log(
          `Circuit CLOSED for insurer: ${code} (tenant: ${tenantId})`,
        ),
      );
      this.breakers.set(key, breaker);
    }
    return this.breakers.get(key)!;
  }

  async call<T>(insurerCode: string, fn: () => Promise<T>): Promise<T> {
    const tenantId = this.tenantContext.getTenantId();
    const breaker = this.getBreaker(tenantId, insurerCode);
    if (breaker.opened) {
      throw new CircuitOpenException(insurerCode);
    }
    return breaker.fire(fn) as Promise<T>;
  }
}
