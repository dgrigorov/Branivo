import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { TenantsRepository } from './tenants.repository';
import { RegisterDomainDto } from './dto/register-domain.dto';
import { DomainResponseDto } from './dto/domain-response.dto';
import { TenantDomain } from './entities/tenant-domain.entity';

@Injectable()
export class DomainsService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly tenantContext: TenantContext,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async registerDomain(dto: RegisterDomainDto): Promise<DomainResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    // AC8: only one custom domain per tenant
    const existing =
      await this.tenantsRepository.findCustomDomainByTenantId(tenantId);
    if (existing) {
      throw new ConflictException(
        'Tenant already has a custom domain. Delete it before adding a new one.',
      );
    }

    const token = randomBytes(32).toString('hex'); // 64-char hex token
    const domain = await this.tenantsRepository.createCustomDomain(
      tenantId,
      dto.domain,
      token,
    );
    return this.toDto(domain);
  }

  async listDomains(): Promise<DomainResponseDto[]> {
    const tenantId = this.tenantContext.getTenantId();
    const domains =
      await this.tenantsRepository.findDomainsByTenantId(tenantId);
    return domains.map((d) => this.toDto(d));
  }

  async deleteDomain(id: string): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();
    const domain = await this.tenantsRepository.findDomainById(id, tenantId);

    if (!domain) {
      throw new NotFoundException('Domain not found');
    }
    if (domain.isPrimary) {
      throw new ForbiddenException('Cannot delete the primary subdomain');
    }

    await this.tenantsRepository.deleteDomain(id, tenantId);

    // Invalidate Redis host cache for the deleted domain
    await this.redis.del(RedisKeyHelper.buildSystem('host', domain.domain));
  }

  private toDto(domain: TenantDomain): DomainResponseDto {
    const verificationRecord =
      (domain.status === 'pending' || domain.status === 'verifying') &&
      domain.verificationToken
        ? {
            name: `_branivo-verify.${domain.domain}`,
            type: 'TXT' as const,
            value: `branivo-verify=${domain.verificationToken}`,
          }
        : null;

    return {
      id: domain.id,
      domain: domain.domain,
      isPrimary: domain.isPrimary,
      status: domain.status,
      verificationRecord,
      verifiedAt: domain.verifiedAt,
      failureReason: domain.failureReason,
      createdAt: domain.createdAt,
    };
  }
}
