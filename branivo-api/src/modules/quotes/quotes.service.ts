import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { TenantsRepository } from '../tenants/tenants.repository';
import { QuotesRepository } from './quotes.repository';
import { ScoringService } from './scoring/scoring.service';
import {
  CircuitBreakerService,
  CircuitOpenException,
} from './circuit-breaker.service';
import {
  INSURER_ADAPTERS,
  type InsurerAdapter,
  type QuoteRequest,
  type QuoteResult,
} from './adapters/insurer-adapter.interface';
import { Quote, QuoteStatus } from './entities/quote.entity';
import type { Insurer } from './entities/insurer.entity';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type { CreateQuoteDto } from './dto/create-quote.dto';
import type { QuoteResponseDto } from './dto/quote-response.dto';
import type { QuoteOfferDto } from './dto/quote-offer.dto';

const QUOTE_TIMEOUT_MS = 5000;
const QUOTE_TTL_HOURS = 48;

type SuccessfulQuoteResult = {
  insurer: Insurer;
  quoteResult: QuoteResult;
  quoteId: string;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timer),
  ) as Promise<T>;
}

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);
  private readonly adapterMap = new Map<string, InsurerAdapter>();

  constructor(
    private readonly quotesRepository: QuotesRepository,
    private readonly scoringService: ScoringService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly tenantContext: TenantContext,
    private readonly tenantsRepo: TenantsRepository,
    @Inject(INSURER_ADAPTERS) adapters: InsurerAdapter[],
  ) {
    for (const adapter of adapters) {
      this.adapterMap.set(adapter.insurerCode, adapter);
    }
  }

  async createQuoteRequest(dto: CreateQuoteDto): Promise<QuoteResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    // AC1: Block quotes for stripe_revoked tenants
    const tenant = await this.tenantsRepo.findById(tenantId);
    if (tenant?.status === 'stripe_revoked') {
      throw new ForbiddenException(
        'Broker account is suspended. New purchases are not available.',
      );
    }

    const activeInsurers = await this.quotesRepository.findActiveInsurers();

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + QUOTE_TTL_HOURS);

    const pendingQuotes = await this.quotesRepository.bulkCreate(
      activeInsurers.map((ins) => ({
        tenantId,
        sessionToken: dto.sessionToken,
        vehicleId: null,
        insurerId: ins.id,
        status: QuoteStatus.PENDING,
        expiresAt,
      })),
    );

    const quoteMap = new Map(pendingQuotes.map((q) => [q.insurerId, q]));

    const vehicle = dto.vehicleData ?? {
      vin: 'UNKNOWN00000000000',
      licensePlate: 'UNKNOWN',
      make: 'Unknown',
      model: 'Unknown',
      year: new Date().getFullYear(),
    };

    const quoteRequest: QuoteRequest = {
      sessionToken: dto.sessionToken,
      tenantId,
      vehicle,
    };

    const results = await Promise.allSettled(
      activeInsurers.map((insurer) =>
        this.circuitBreakerService.call(insurer.code, () =>
          withTimeout(
            this.getAdapter(insurer.code).fetchQuote(quoteRequest),
            QUOTE_TIMEOUT_MS,
          ),
        ),
      ),
    );

    const successfulResults: SuccessfulQuoteResult[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const insurer = activeInsurers[i];
      const quote = quoteMap.get(insurer.id);
      if (!quote) continue;

      if (result.status === 'fulfilled') {
        const quoteResult = result.value;
        await this.quotesRepository.updateQuoteStatus(quote.id, {
          status: QuoteStatus.SUCCESS,
          price: quoteResult.price,
          currency: quoteResult.currency,
          coverDetails: quoteResult.coverDetails,
          extras: quoteResult.extras,
          rawResponse: quoteResult.rawResponse,
        } as QueryDeepPartialEntity<Quote>);
        successfulResults.push({ insurer, quoteResult, quoteId: quote.id });
      } else {
        const reason = result.reason as Error;
        const isTimeout = reason.message.includes('Timeout');
        const isCircuitOpen = reason instanceof CircuitOpenException;
        const status = isTimeout ? QuoteStatus.TIMEOUT : QuoteStatus.ERROR;
        await this.quotesRepository.updateQuoteStatus(quote.id, {
          status,
          errorMessage: isCircuitOpen
            ? 'Временно недостъпен'
            : reason.message.slice(0, 500),
        });
        this.logger.warn(
          `Quote failed for insurer ${insurer.code}: ${reason.message}`,
        );
      }
    }

    let scoredOffers: ReturnType<ScoringService['scoreOffers']> = [];
    if (successfulResults.length > 0) {
      scoredOffers = this.scoringService.scoreOffers(
        successfulResults.map((r) => r.quoteResult),
        successfulResults.map((r) => r.insurer),
      );

      for (const scored of scoredOffers) {
        const match = successfulResults.find(
          (r) => r.quoteResult.insurerCode === scored.insurerCode,
        );
        if (match) {
          await this.quotesRepository.updateQuoteStatus(match.quoteId, {
            score: scored.score,
            isRecommended: scored.isRecommended,
          });
        }
      }

      const vehicleVin = dto.vehicleData?.vin ?? 'unknown';
      await this.scoringService.logScoringAudit(
        tenantId,
        dto.sessionToken,
        vehicleVin,
        scoredOffers,
      );
    }

    const allQuotes = await this.quotesRepository.findBySessionToken(
      dto.sessionToken,
    );

    return this.buildResponse(dto.sessionToken, allQuotes);
  }

  async getQuotesBySession(sessionToken: string): Promise<QuoteResponseDto> {
    const quotes = await this.quotesRepository.findBySessionToken(sessionToken);
    return this.buildResponse(sessionToken, quotes);
  }

  private buildResponse(
    sessionToken: string,
    quotes: Awaited<ReturnType<QuotesRepository['findBySessionToken']>>,
  ): QuoteResponseDto {
    const offers: QuoteOfferDto[] = quotes.map((q) => {
      const offer: QuoteOfferDto = {
        id: q.id,
        insurerCode: q.insurer?.code ?? '',
        insurerName: q.insurer?.name ?? '',
        price: q.price,
        currency: q.currency,
        score: q.score,
        isRecommended: q.isRecommended,
        status: q.status,
        extras: q.extras,
      };

      if (q.status === QuoteStatus.TIMEOUT) offer.errorReason = 'timeout';
      else if (q.status === QuoteStatus.ERROR)
        offer.errorReason = 'unavailable';

      return offer;
    });

    const hasPending = quotes.some((q) => q.status === QuoteStatus.PENDING);

    return {
      sessionToken,
      offers,
      status: hasPending ? 'pending' : 'complete',
      requestedAt:
        quotes[0]?.createdAt.toISOString() ?? new Date().toISOString(),
    };
  }

  private getAdapter(code: string): InsurerAdapter {
    const adapter = this.adapterMap.get(code);
    if (!adapter) {
      throw new Error(`No adapter registered for insurer: ${code}`);
    }
    return adapter;
  }
}
