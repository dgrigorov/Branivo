import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './tenants.repository';
import { Tenant } from './entities/tenant.entity';
import { TenantConfig } from './entities/tenant-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantConfig])],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsRepository],
  exports: [TenantsRepository],
})
export class TenantsModule {}
