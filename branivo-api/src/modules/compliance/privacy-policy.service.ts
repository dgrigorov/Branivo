import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryFailedError, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { TenantPrivacyPolicy } from './entities/tenant-privacy-policy.entity';
import { CreatePrivacyPolicyDto } from './dto/create-privacy-policy.dto';
import {
  PrivacyPolicyListItemDto,
  PrivacyPolicyResponseDto,
} from './dto/privacy-policy-response.dto';

@Injectable()
export class PrivacyPolicyService {
  private readonly logger = new Logger(PrivacyPolicyService.name);

  constructor(
    @InjectRepository(TenantPrivacyPolicy)
    private readonly repo: Repository<TenantPrivacyPolicy>,
    private readonly tenantContext: TenantContext,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreatePrivacyPolicyDto,
    userId: string,
  ): Promise<PrivacyPolicyResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const lastVersion = await this.repo
      .createQueryBuilder('pp')
      .where(
        'pp.tenantId = :tenantId AND pp.language = :lang AND pp.deletedAt IS NULL',
        { tenantId, lang: dto.language },
      )
      .select('MAX(pp.version)', 'maxVersion')
      .getRawOne<{ maxVersion: number | null }>();

    const version = (lastVersion?.maxVersion ?? 0) + 1;

    try {
      const policy = await this.repo.save({
        tenantId,
        version,
        content: dto.content,
        language: dto.language,
        createdBy: userId,
      });

      return this.toResponseDto(policy);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'A privacy policy version is already being created. Please retry.',
        );
      }
      throw err;
    }
  }

  async publish(id: string, userId: string): Promise<PrivacyPolicyResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const policy = await this.repo.findOne({
      where: { id, tenantId },
    });

    if (!policy) {
      throw new NotFoundException('PRIVACY_POLICY_NOT_FOUND');
    }

    policy.isPublished = true;
    policy.publishedAt = new Date();
    const updated = await this.repo.save(policy);

    try {
      await this.dataSource.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          userId,
          'privacy_policy.published',
          'tenant_privacy_policy',
          policy.id,
          JSON.stringify({
            version: policy.version,
            language: policy.language,
          }),
        ],
      );
    } catch (auditErr) {
      this.logger.error(
        `audit_log write failed for privacy_policy id=${policy.id}`,
        auditErr instanceof Error ? auditErr.stack : String(auditErr),
      );
    }

    return this.toResponseDto(updated);
  }

  async getPublished(language: string): Promise<PrivacyPolicyResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const policy = await this.repo.findOne({
      where: { tenantId, language, isPublished: true },
      order: { version: 'DESC' },
    });

    if (!policy) {
      throw new NotFoundException('PRIVACY_POLICY_NOT_FOUND');
    }

    return this.toResponseDto(policy);
  }

  async findAll(): Promise<PrivacyPolicyListItemDto[]> {
    const tenantId = this.tenantContext.getTenantId();

    const policies = await this.repo.find({
      where: { tenantId },
      order: { version: 'DESC' },
    });

    return policies.map((p) => this.toListItemDto(p));
  }

  async findOne(id: string): Promise<PrivacyPolicyResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const policy = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });

    if (!policy) {
      throw new NotFoundException('PRIVACY_POLICY_NOT_FOUND');
    }

    return this.toResponseDto(policy);
  }

  private toResponseDto(policy: TenantPrivacyPolicy): PrivacyPolicyResponseDto {
    const dto = new PrivacyPolicyResponseDto();
    dto.id = policy.id;
    dto.version = policy.version;
    dto.content = policy.content;
    dto.language = policy.language;
    dto.isPublished = policy.isPublished;
    dto.publishedAt = policy.publishedAt;
    dto.createdAt = policy.createdAt;
    return dto;
  }

  private toListItemDto(policy: TenantPrivacyPolicy): PrivacyPolicyListItemDto {
    const dto = new PrivacyPolicyListItemDto();
    dto.id = policy.id;
    dto.version = policy.version;
    dto.language = policy.language;
    dto.isPublished = policy.isPublished;
    dto.publishedAt = policy.publishedAt;
    dto.createdAt = policy.createdAt;
    return dto;
  }
}
