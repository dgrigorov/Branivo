import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { TimeoutError } from 'rxjs';
import { KatApiUnavailableError } from '../exceptions/kat-api-unavailable.exception';

export interface KatValidationResult {
  available: boolean;
  status?: 'ok' | 'invalid' | 'stolen';
  rawResponse?: unknown;
}

@Injectable()
export class KatApiAdapter {
  private readonly logger = new Logger(KatApiAdapter.name);
  private readonly katApiBaseUrl: string;
  private readonly katApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.katApiBaseUrl = this.config.get<string>('KAT_API_BASE_URL') ?? '';
    this.katApiKey = this.config.get<string>('KAT_API_KEY') ?? '';
  }

  async validateVin(vin: string): Promise<KatValidationResult> {
    if (!this.katApiBaseUrl) {
      this.logger.warn('KAT_API_BASE_URL not configured — returning mock ok');
      return { available: true, status: 'ok' };
    }

    try {
      const response = await firstValueFrom(
        this.httpService
          .get<{ status: string }>(`${this.katApiBaseUrl}/vehicle`, {
            params: { vin },
            headers: { Authorization: `Bearer ${this.katApiKey}` },
          })
          .pipe(
            timeout(3000),
            catchError((err: unknown) => {
              if (!(err instanceof TimeoutError)) {
                this.logger.error('KAT API HTTP error', err);
              }
              throw new KatApiUnavailableError();
            }),
          ),
      );

      const status = response.data.status as 'ok' | 'invalid' | 'stolen';
      return { available: true, status, rawResponse: response.data };
    } catch (err) {
      if (err instanceof KatApiUnavailableError) throw err;
      this.logger.error('KAT API unexpected error', err);
      throw new KatApiUnavailableError();
    }
  }
}
