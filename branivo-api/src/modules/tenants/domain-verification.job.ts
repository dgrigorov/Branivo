import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';
import { TenantsRepository } from './tenants.repository';
import { DnsVerificationService } from './dns-verification.service';

/** Timeout after which a domain is marked failed (24 hours in ms) */
const VERIFICATION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DomainVerificationJob {
  private readonly logger = new Logger(DomainVerificationJob.name);

  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly dnsVerification: DnsVerificationService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Cron('*/5 * * * *') // every 5 minutes
  async verifyPendingDomains(): Promise<void> {
    const domains =
      await this.tenantsRepository.findPendingOrVerifyingDomains();

    if (domains.length === 0) return;

    this.logger.log(`Verifying ${domains.length} pending domain(s)...`);

    for (const domain of domains) {
      if (!domain.verificationToken) continue;

      // Transition pending → verifying on first check
      if (domain.status === 'pending') {
        await this.tenantsRepository.updateDomainStatus(domain.id, 'verifying');
      }

      const verified = await this.dnsVerification.verifyTxtRecord(
        domain.domain,
        domain.verificationToken,
      );

      if (verified) {
        await this.tenantsRepository.updateDomainStatus(domain.id, 'active', {
          verifiedAt: new Date(),
        });
        // Invalidate host cache so middleware picks up the now-active domain
        await this.redis.del(RedisKeyHelper.buildSystem('host', domain.domain));
        this.logger.log(`Domain ${domain.domain} verified successfully`);
      } else {
        // Mark failed after 24h without successful verification
        const elapsed = Date.now() - domain.createdAt.getTime();
        if (elapsed > VERIFICATION_TIMEOUT_MS) {
          await this.tenantsRepository.updateDomainStatus(domain.id, 'failed', {
            failureReason:
              `DNS TXT record not found within 24 hours. ` +
              `Ensure _branivo-verify.${domain.domain} TXT record is set to: ` +
              `branivo-verify=${domain.verificationToken}`,
          });
          this.logger.warn(
            `Domain ${domain.domain} verification timed out after 24h`,
          );
        }
      }
    }
  }
}
