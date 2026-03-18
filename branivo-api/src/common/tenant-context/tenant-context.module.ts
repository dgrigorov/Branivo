import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantDomain } from '../../modules/tenants/entities/tenant-domain.entity';
import { TenantMiddleware } from './tenant.middleware';
import { TenantContext } from './tenant.context';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TenantDomain])],
  providers: [TenantContext, TenantMiddleware],
  exports: [TenantContext],
})
export class TenantContextModule {}
