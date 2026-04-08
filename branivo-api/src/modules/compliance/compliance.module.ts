import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PiiRegistryService } from './pii-registry.service';
import { TenantPrivacyPolicy } from './entities/tenant-privacy-policy.entity';
import { TenantTosVersion } from './entities/tenant-tos-version.entity';
import { EndClientTosAcceptance } from './entities/end-client-tos-acceptance.entity';
import { TenantCookiePolicy } from './entities/tenant-cookie-policy.entity';
import { CookieConsentRecord } from './entities/cookie-consent-record.entity';
import { DataBreach } from './entities/data-breach.entity';
import { PrivacyPolicyService } from './privacy-policy.service';
import { PrivacyPolicyController } from './privacy-policy.controller';
import { PrivacyPolicyPublicController } from './privacy-policy-public.controller';
import { TosService } from './tos.service';
import { TosController } from './tos.controller';
import { TosPublicController } from './tos-public.controller';
import { TosClientController } from './tos-client.controller';
import { CookiePolicyService } from './cookie-policy.service';
import { CookiePolicyController } from './cookie-policy.controller';
import { CookiePolicyPublicController } from './cookie-policy-public.controller';
import { CookieConsentService } from './cookie-consent.service';
import { CookieConsentClientController } from './cookie-consent-client.controller';
import { DataBreachService } from './data-breach.service';
import { DataBreachAdminController } from './data-breach-admin.controller';
import { DataBreachBrokerController } from './data-breach-broker.controller';
import { DataBreachAlertJob } from './data-breach-alert.job';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantPrivacyPolicy,
      TenantTosVersion,
      EndClientTosAcceptance,
      TenantCookiePolicy,
      CookieConsentRecord,
      DataBreach,
    ]),
  ],
  controllers: [
    PrivacyPolicyController,
    PrivacyPolicyPublicController,
    TosController,
    TosPublicController,
    TosClientController,
    CookiePolicyController,
    CookiePolicyPublicController,
    CookieConsentClientController,
    DataBreachAdminController,
    DataBreachBrokerController,
  ],
  providers: [
    PiiRegistryService,
    PrivacyPolicyService,
    TosService,
    CookiePolicyService,
    CookieConsentService,
    DataBreachService,
    DataBreachAlertJob,
  ],
  exports: [
    PiiRegistryService,
    PrivacyPolicyService,
    TosService,
    CookiePolicyService,
    CookieConsentService,
    DataBreachService,
  ],
})
export class ComplianceModule {}
