import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryFailedError, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { TenantTosVersion } from './entities/tenant-tos-version.entity';
import { EndClientTosAcceptance } from './entities/end-client-tos-acceptance.entity';
import { CreateTosDto } from './dto/create-tos.dto';
import { AcceptTosDto } from './dto/accept-tos.dto';
import {
  TosAcceptanceResponseDto,
  TosListItemDto,
  TosResponseDto,
  TosStatusResponseDto,
} from './dto/tos-response.dto';

@Injectable()
export class TosService {
  private readonly logger = new Logger(TosService.name);

  constructor(
    @InjectRepository(TenantTosVersion)
    private readonly tosRepo: Repository<TenantTosVersion>,
    @InjectRepository(EndClientTosAcceptance)
    private readonly acceptanceRepo: Repository<EndClientTosAcceptance>,
    private readonly tenantContext: TenantContext,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTosDto, userId: string): Promise<TosResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const lastVersion = await this.tosRepo
      .createQueryBuilder('tv')
      .where(
        'tv.tenantId = :tenantId AND tv.language = :lang AND tv.deletedAt IS NULL',
        { tenantId, lang: dto.language },
      )
      .select('MAX(tv.version)', 'maxVersion')
      .getRawOne<{ maxVersion: number | null }>();

    const version = (lastVersion?.maxVersion ?? 0) + 1;

    try {
      const tos = await this.tosRepo.save({
        tenantId,
        version,
        content: dto.content,
        language: dto.language,
        createdBy: userId,
      });

      return this.toResponseDto(tos);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'A ToS version is already being created. Please retry.',
        );
      }
      throw err;
    }
  }

  async publish(id: string, userId: string): Promise<TosResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const tos = await this.tosRepo.findOne({
      where: { id, tenantId },
    });

    if (!tos) {
      throw new NotFoundException('TOS_NOT_FOUND');
    }

    tos.isPublished = true;
    tos.publishedAt = new Date();
    const updated = await this.tosRepo.save(tos);

    try {
      await this.dataSource.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          userId,
          'tos.published',
          'tenant_tos_version',
          tos.id,
          JSON.stringify({ version: tos.version, language: tos.language }),
        ],
      );
    } catch (auditErr) {
      this.logger.error(
        `audit_log write failed for tos_version id=${tos.id}`,
        auditErr instanceof Error ? auditErr.stack : String(auditErr),
      );
    }

    return this.toResponseDto(updated);
  }

  async getPublished(language: string): Promise<TosResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const tos = await this.tosRepo.findOne({
      where: { tenantId, language, isPublished: true },
      order: { version: 'DESC' },
    });

    if (!tos) {
      throw new NotFoundException('TOS_NOT_FOUND');
    }

    return this.toResponseDto(tos);
  }

  async findAll(): Promise<TosListItemDto[]> {
    const tenantId = this.tenantContext.getTenantId();

    const versions = await this.tosRepo.find({
      where: { tenantId, deletedAt: IsNull() },
      order: { version: 'DESC' },
    });

    return versions.map((v) => this.toListItemDto(v));
  }

  async accept(
    clientId: string,
    dto: AcceptTosDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<TosAcceptanceResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const tosVersion = await this.tosRepo.findOne({
      where: { id: dto.tosVersionId, tenantId, deletedAt: IsNull() },
    });

    if (!tosVersion) {
      throw new NotFoundException('TOS_VERSION_NOT_FOUND');
    }

    await this.acceptanceRepo
      .createQueryBuilder()
      .insert()
      .into(EndClientTosAcceptance)
      .values({
        clientId,
        tenantId,
        tosVersionId: dto.tosVersionId,
        ipAddress,
        userAgent,
      })
      .orUpdate(
        ['accepted_at', 'ip_address', 'user_agent'],
        ['client_id', 'tos_version_id'],
      )
      .execute();

    const acceptance = await this.acceptanceRepo.findOneOrFail({
      where: { clientId, tosVersionId: dto.tosVersionId },
    });

    const result = new TosAcceptanceResponseDto();
    result.accepted = true;
    result.version = tosVersion.version;
    result.acceptedAt = acceptance.acceptedAt;
    return result;
  }

  async getStatus(clientId: string): Promise<TosStatusResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const latestTos = await this.tosRepo.findOne({
      where: { tenantId, isPublished: true, deletedAt: IsNull() },
      order: { version: 'DESC' },
    });

    if (!latestTos) {
      const result = new TosStatusResponseDto();
      result.requiresAcceptance = false;
      result.currentVersion = null;
      result.acceptedVersion = null;
      return result;
    }

    const maxAccepted = await this.acceptanceRepo
      .createQueryBuilder('a')
      .innerJoin('a.tosVersion', 'tv')
      .where('a.clientId = :clientId AND a.tenantId = :tenantId', {
        clientId,
        tenantId,
      })
      .select('MAX(tv.version)', 'maxVersion')
      .getRawOne<{ maxVersion: number | null }>();

    const acceptedVersion = maxAccepted?.maxVersion ?? null;

    const result = new TosStatusResponseDto();
    result.requiresAcceptance =
      acceptedVersion === null || acceptedVersion < latestTos.version;
    result.currentVersion = this.toResponseDto(latestTos);
    result.acceptedVersion = acceptedVersion;
    return result;
  }

  private toResponseDto(tos: TenantTosVersion): TosResponseDto {
    const dto = new TosResponseDto();
    dto.id = tos.id;
    dto.version = tos.version;
    dto.content = tos.content;
    dto.language = tos.language;
    dto.isPublished = tos.isPublished;
    dto.publishedAt = tos.publishedAt;
    dto.createdAt = tos.createdAt;
    return dto;
  }

  private toListItemDto(tos: TenantTosVersion): TosListItemDto {
    const dto = new TosListItemDto();
    dto.id = tos.id;
    dto.version = tos.version;
    dto.language = tos.language;
    dto.isPublished = tos.isPublished;
    dto.publishedAt = tos.publishedAt;
    dto.createdAt = tos.createdAt;
    return dto;
  }
}
