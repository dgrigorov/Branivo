import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { TenantCookiePolicy } from './entities/tenant-cookie-policy.entity';
import { CreateCookiePolicyDto } from './dto/create-cookie-policy.dto';
import {
  CookiePolicyListItemDto,
  CookiePolicyResponseDto,
} from './dto/cookie-policy-response.dto';

@Injectable()
export class CookiePolicyService {
  private readonly logger = new Logger(CookiePolicyService.name);

  constructor(
    @InjectRepository(TenantCookiePolicy)
    private readonly repo: Repository<TenantCookiePolicy>,
    private readonly tenantContext: TenantContext,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateCookiePolicyDto,
    userId: string,
  ): Promise<CookiePolicyResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const lastVersion = await this.repo
      .createQueryBuilder('cp')
      .where(
        'cp.tenantId = :tenantId AND cp.language = :lang AND cp.deletedAt IS NULL',
        { tenantId, lang: dto.language },
      )
      .select('MAX(cp.version)', 'maxVersion')
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
          'A cookie policy version is already being created. Please retry.',
        );
      }
      throw err;
    }
  }

  async publish(id: string, userId: string): Promise<CookiePolicyResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const policy = await this.repo.findOne({ where: { id, tenantId } });

    if (!policy) {
      throw new NotFoundException('COOKIE_POLICY_NOT_FOUND');
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
          'cookie_policy.published',
          'tenant_cookie_policy',
          policy.id,
          JSON.stringify({
            version: policy.version,
            language: policy.language,
          }),
        ],
      );
    } catch (auditErr) {
      this.logger.error(
        `audit_log write failed for cookie_policy id=${policy.id}`,
        auditErr instanceof Error ? auditErr.stack : String(auditErr),
      );
    }

    return this.toResponseDto(updated);
  }

  async getPublished(language: string): Promise<CookiePolicyResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const policy = await this.repo.findOne({
      where: { tenantId, language, isPublished: true },
      order: { version: 'DESC' },
    });

    if (!policy) {
      throw new NotFoundException('COOKIE_POLICY_NOT_FOUND');
    }

    return this.toResponseDto(policy);
  }

  async findAll(): Promise<CookiePolicyListItemDto[]> {
    const tenantId = this.tenantContext.getTenantId();

    const policies = await this.repo.find({
      where: { tenantId },
      order: { version: 'DESC' },
    });

    return policies.map((p) => this.toListItemDto(p));
  }

  private toResponseDto(policy: TenantCookiePolicy): CookiePolicyResponseDto {
    const dto = new CookiePolicyResponseDto();
    dto.id = policy.id;
    dto.version = policy.version;
    dto.content = policy.content;
    dto.language = policy.language;
    dto.isPublished = policy.isPublished;
    dto.publishedAt = policy.publishedAt;
    dto.createdAt = policy.createdAt;
    return dto;
  }

  private toListItemDto(policy: TenantCookiePolicy): CookiePolicyListItemDto {
    const dto = new CookiePolicyListItemDto();
    dto.id = policy.id;
    dto.version = policy.version;
    dto.language = policy.language;
    dto.isPublished = policy.isPublished;
    dto.publishedAt = policy.publishedAt;
    dto.createdAt = policy.createdAt;
    return dto;
  }
}
