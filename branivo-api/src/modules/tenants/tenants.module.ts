import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './tenants.repository';
import { Tenant } from './entities/tenant.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantDomain } from './entities/tenant-domain.entity';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { TenantActiveGuard } from '../../common/guards/tenant-active.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantConfig, TenantDomain])],
  controllers: [TenantsController],
  providers: [
    TenantsService,
    TenantsRepository,
    FeatureFlagGuard,
    TenantActiveGuard,
  ],
  exports: [TenantsRepository, FeatureFlagGuard, TenantActiveGuard],
})
export class TenantsModule {}
