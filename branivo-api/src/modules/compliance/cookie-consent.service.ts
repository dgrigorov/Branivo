import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    await this.consentRepo
      .createQueryBuilder()
      .insert()
      .into(CookieConsentRecord)
      .values({
        tenantId,
        clientId,
        necessary: true,
        analytics: dto.analytics,
        marketing: dto.marketing,
        functional: dto.functional,
        policyVersion,
        ipAddress,
        userAgent,
        consentedAt,
      })
      .orUpdate(
        [
          'analytics',
          'marketing',
          'functional',
          'policy_version',
          'ip_address',
          'user_agent',
          'consented_at',
          'updated_at',
        ],
        ['tenant_id', 'client_id'],
        { skipUpdateIfNoValuesChanged: false },
      )
      .execute();

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
