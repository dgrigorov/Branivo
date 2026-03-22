import { Injectable, Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { TenantContext } from '../../common/tenant-context/tenant.context';

export class CircuitOpenException extends Error {
  constructor(insurerCode: string) {
    super(`Circuit breaker is open for insurer: ${insurerCode}`);
    this.name = 'CircuitOpenException';
  }
}

export interface InsurerCallMetrics {
  errorRate: number; // процент (0-100)
  avgLatencyMs: number; // средна latency в ms
  totalCalls: number; // брой заявки в прозореца от 5 мин
}

interface CallRecord {
  timestamp: number;
  latencyMs: number | null; // null = circuit was open, no actual API call made
  isError: boolean;
}

const METRICS_WINDOW_MS = 5 * 60 * 1000; // 5 минути

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, CircuitBreaker>();
  // key = insurerCode (агрегирано cross-tenant за Super Admin мониторинг)
  private readonly callMetrics = new Map<string, CallRecord[]>();

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

  private recordMetric(
    insurerCode: string,
    latencyMs: number | null,
    isError: boolean,
  ): void {
    const now = Date.now();
    if (!this.callMetrics.has(insurerCode)) {
      this.callMetrics.set(insurerCode, []);
    }
    const records = this.callMetrics.get(insurerCode)!;
    records.push({ timestamp: now, latencyMs, isError });

    // Prune entries older than 5 minutes; remove key if no entries remain
    const cutoff = now - METRICS_WINDOW_MS;
    const pruned = records.filter((r) => r.timestamp >= cutoff);
    if (pruned.length === 0) {
      this.callMetrics.delete(insurerCode);
    } else {
      this.callMetrics.set(insurerCode, pruned);
    }
  }

  async call<T>(insurerCode: string, fn: () => Promise<T>): Promise<T> {
    const tenantId = this.tenantContext.getTenantId();
    const breaker = this.getBreaker(tenantId, insurerCode);
    if (breaker.opened) {
      // Record as error but skip latency (0ms) — open circuit never reaches the API,
      // so including it would artificially deflate avgLatencyMs.
      this.recordMetric(insurerCode, null, true);
      throw new CircuitOpenException(insurerCode);
    }
    const start = Date.now();
    try {
      const result = await (breaker.fire(fn) as Promise<T>);
      this.recordMetric(insurerCode, Date.now() - start, false);
      return result;
    } catch (err) {
      this.recordMetric(insurerCode, Date.now() - start, true);
      throw err;
    }
  }

  getInsurerMetrics(): Map<string, InsurerCallMetrics> {
    const result = new Map<string, InsurerCallMetrics>();
    const now = Date.now();
    const cutoff = now - METRICS_WINDOW_MS;

    for (const [code, records] of this.callMetrics) {
      const recent = records.filter((r) => r.timestamp >= cutoff);
      if (recent.length === 0) {
        result.set(code, { errorRate: 0, avgLatencyMs: 0, totalCalls: 0 });
        continue;
      }
      const errors = recent.filter((r) => r.isError).length;
      const latencyRecords = recent.filter(
        (r): r is CallRecord & { latencyMs: number } => r.latencyMs !== null,
      );
      const totalLatency = latencyRecords.reduce(
        (sum, r) => sum + r.latencyMs,
        0,
      );
      result.set(code, {
        errorRate: (errors / recent.length) * 100,
        avgLatencyMs:
          latencyRecords.length > 0 ? totalLatency / latencyRecords.length : 0,
        totalCalls: recent.length,
      });
    }
    return result;
  }

  getAggregatedCircuitState(
    insurerCode: string,
  ): 'open' | 'half-open' | 'closed' {
    let state: 'open' | 'half-open' | 'closed' = 'closed';
    for (const [key, breaker] of this.breakers) {
      // key format: `${tenantId}:${insurerCode}` where tenantId is UUID (no colons)
      const colonIdx = key.indexOf(':');
      const code = key.slice(colonIdx + 1);
      if (code !== insurerCode) continue;
      if (breaker.opened) return 'open';
      if (breaker.halfOpen) state = 'half-open';
    }
    return state;
  }

  resetBreakersForInsurer(insurerCode: string): void {
    for (const [key, breaker] of this.breakers) {
      const colonIdx = key.indexOf(':');
      const code = key.slice(colonIdx + 1);
      if (code === insurerCode) {
        breaker.close();
      }
    }
    this.callMetrics.delete(insurerCode);
    this.logger.log(
      `Reset all circuit breakers and metrics for insurer: ${insurerCode}`,
    );
  }
}
