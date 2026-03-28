import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsurersController } from './insurers.controller';
import { FscInsurerEntity } from './entities/fsc-insurer.entity';
import { InsurersService } from './insurers.service';
import { FscScraperService } from './fsc-scraper.service';
import { TrustpilotEnricherService } from './trustpilot-enricher.service';
import { WebsiteEnrichmentService } from './website-enrichment.service';

@Module({
  imports: [TypeOrmModule.forFeature([FscInsurerEntity])],
  controllers: [InsurersController],
  providers: [
    InsurersService,
    FscScraperService,
    TrustpilotEnricherService,
    WebsiteEnrichmentService,
  ],
  exports: [InsurersService],
})
export class InsurersModule {}
