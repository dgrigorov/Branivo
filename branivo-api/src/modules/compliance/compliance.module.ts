import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PiiRegistryService } from './pii-registry.service';
import { TenantPrivacyPolicy } from './entities/tenant-privacy-policy.entity';
import { PrivacyPolicyService } from './privacy-policy.service';
import { PrivacyPolicyController } from './privacy-policy.controller';
import { PrivacyPolicyPublicController } from './privacy-policy-public.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TenantPrivacyPolicy])],
  controllers: [PrivacyPolicyController, PrivacyPolicyPublicController],
  providers: [PiiRegistryService, PrivacyPolicyService],
  exports: [PiiRegistryService, PrivacyPolicyService],
})
export class ComplianceModule {}
