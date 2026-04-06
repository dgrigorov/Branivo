import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { CookieConsentRecord } from './entities/cookie-consent-record.entity';
import { TenantCookiePolicy } from './entities/tenant-cookie-policy.entity';
import { SaveCookieConsentDto } from './dto/save-cookie-consent.dto';
import {
  CookieConsentResponseDto,
  SaveCookieConsentResponseDto,
} from './dto/cookie-consent-response.dto';

@Injectable()
export class CookieConsentService {
  constructor(
    @InjectRepository(CookieConsentRecord)
    private readonly consentRepo: Repository<CookieConsentRecord>,
    @InjectRepository(TenantCookiePolicy)
    private readonly policyRepo: Repository<TenantCookiePolicy>,
    private readonly tenantContext: TenantContext,
    private readonly dataSource: DataSource,
  ) {}

  async saveConsent(
    clientId: string,
    dto: SaveCookieConsentDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<SaveCookieConsentResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const currentPolicy = await this.policyRepo.findOne({
      where: { tenantId, isPublished: true },
      order: { version: 'DESC' },
    });
    const policyVersion = currentPolicy?.version ?? null;

    const consentedAt = new Date();

    // Raw SQL required: TypeORM orUpdate() generates ON CONFLICT (col1, col2) which only
    // works with a full unique constraint. Our index is partial (WHERE client_id IS NOT NULL),
    // so PostgreSQL requires the WHERE clause in the conflict target — only achievable via raw SQL.
    await this.dataSource.query(
      `INSERT INTO cookie_consent_records
         (tenant_id, client_id, necessary, analytics, marketing, functional,
          policy_version, ip_address, user_agent, consented_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (tenant_id, client_id) WHERE client_id IS NOT NULL
       DO UPDATE SET
         analytics      = EXCLUDED.analytics,
         marketing      = EXCLUDED.marketing,
         functional     = EXCLUDED.functional,
         policy_version = EXCLUDED.policy_version,
         ip_address     = EXCLUDED.ip_address,
         user_agent     = EXCLUDED.user_agent,
         consented_at   = NOW(),
         updated_at     = NOW()`,
      [
        tenantId,
        clientId,
        true,
        dto.analytics,
        dto.marketing,
        dto.functional,
        policyVersion,
        ipAddress,
        userAgent,
        consentedAt,
      ],
    );

    const result = new SaveCookieConsentResponseDto();
    result.saved = true;
    result.consentedAt = consentedAt.toISOString();
    return result;
  }

  async getConsent(clientId: string): Promise<CookieConsentResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const record = await this.consentRepo.findOne({
      where: { tenantId, clientId },
    });

    const dto = new CookieConsentResponseDto();
    dto.necessary = true;
    dto.analytics = record?.analytics ?? false;
    dto.marketing = record?.marketing ?? false;
    dto.functional = record?.functional ?? false;
    dto.consentedAt = record?.consentedAt?.toISOString() ?? null;
    dto.policyVersion = record?.policyVersion ?? null;
    return dto;
  }
}
