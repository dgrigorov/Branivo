import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PiiRegistryService } from './pii-registry.service';
import { TenantPrivacyPolicy } from './entities/tenant-privacy-policy.entity';
import { TenantTosVersion } from './entities/tenant-tos-version.entity';
import { EndClientTosAcceptance } from './entities/end-client-tos-acceptance.entity';
import { PrivacyPolicyService } from './privacy-policy.service';
import { PrivacyPolicyController } from './privacy-policy.controller';
import { PrivacyPolicyPublicController } from './privacy-policy-public.controller';
import { TosService } from './tos.service';
import { TosController } from './tos.controller';
import { TosPublicController } from './tos-public.controller';
import { TosClientController } from './tos-client.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantPrivacyPolicy,
      TenantTosVersion,
      EndClientTosAcceptance,
    ]),
  ],
  controllers: [
    PrivacyPolicyController,
    PrivacyPolicyPublicController,
    TosController,
    TosPublicController,
    TosClientController,
  ],
  providers: [PiiRegistryService, PrivacyPolicyService, TosService],
  exports: [PiiRegistryService, PrivacyPolicyService, TosService],
})
export class ComplianceModule {}
