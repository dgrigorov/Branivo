import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { TenantsModule } from '../tenants/tenants.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuotesRepository } from './quotes.repository';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ScoringService } from './scoring/scoring.service';
import { Quote } from './entities/quote.entity';
import { Insurer } from './entities/insurer.entity';
import { INSURER_ADAPTERS } from './adapters/insurer-adapter.interface';
import { MockInsurerAdapter } from './adapters/mock-insurer.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quote, Insurer]),
    TenantContextModule,
    TenantsModule, // за TenantsRepository в QuotesService (stripe_revoked check)
  ],
  controllers: [QuotesController],
  providers: [
    QuotesService,
    QuotesRepository,
    CircuitBreakerService,
    ScoringService,
    {
      provide: INSURER_ADAPTERS,
      useFactory: () => [
        new MockInsurerAdapter('allianz', 450),
        new MockInsurerAdapter('generali', 420),
        new MockInsurerAdapter('dsk', 380),
        new MockInsurerAdapter('bulstrad', 400),
      ],
    },
  ],
  exports: [QuotesService, QuotesRepository, CircuitBreakerService],
})
export class QuotesModule {}
