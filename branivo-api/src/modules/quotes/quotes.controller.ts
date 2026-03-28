import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QuotesService, type NlpRankResponseDto } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { RankWithPreferenceDto } from './dto/rank-with-preference.dto';
import type { QuoteResponseDto } from './dto/quote-response.dto';

@Controller('api/v1/quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async createQuoteRequest(
    @Body() dto: CreateQuoteDto,
  ): Promise<{ data: QuoteResponseDto; meta: { timestamp: string } }> {
    const data = await this.quotesService.createQuoteRequest(dto);
    return { data, meta: { timestamp: new Date().toISOString() } };
  }

  @Get(':sessionToken')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getQuotesBySession(
    @Param('sessionToken') sessionToken: string,
  ): Promise<{ data: QuoteResponseDto; meta: { timestamp: string } }> {
    const data = await this.quotesService.getQuotesBySession(sessionToken);
    return { data, meta: { timestamp: new Date().toISOString() } };
  }

  @Post(':sessionToken/rank-with-preference')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async rankWithPreference(
    @Param('sessionToken') sessionToken: string,
    @Body() dto: RankWithPreferenceDto,
  ): Promise<{ data: NlpRankResponseDto; meta: { timestamp: string } }> {
    const data = await this.quotesService.rankWithPreference(sessionToken, dto);
    return { data, meta: { timestamp: new Date().toISOString() } };
  }
}
