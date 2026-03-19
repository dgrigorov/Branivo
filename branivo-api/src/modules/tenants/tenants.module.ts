import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './tenants.repository';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { DnsVerificationService } from './dns-verification.service';
import { DomainVerificationJob } from './domain-verification.job';
import { Tenant } from './entities/tenant.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantDomain } from './entities/tenant-domain.entity';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { TenantActiveGuard } from '../../common/guards/tenant-active.guard';
import { S3Module } from '../../infrastructure/s3/s3.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, TenantConfig, TenantDomain]),
    S3Module,
  ],
  controllers: [TenantsController, DomainsController],
  providers: [
    TenantsService,
    TenantsRepository,
    DomainsService,
    DnsVerificationService,
    DomainVerificationJob,
    FeatureFlagGuard,
    TenantActiveGuard,
  ],
  exports: [TenantsRepository, FeatureFlagGuard, TenantActiveGuard],
})
export class TenantsModule {}
