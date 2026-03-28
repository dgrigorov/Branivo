import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  CreateVehicleModelDto,
  UpdateVehicleModelDto,
  VehicleModelDto,
  VehicleModelQueryDto,
} from './dto/vehicle-catalog.dto';
import { VehicleModelEntity } from './entities/vehicle-model.entity';
import { VehicleMakeService, normalizeName } from './vehicle-make.service';

function assertYearRange(
  yearFrom?: number | null,
  yearTo?: number | null,
): void {
  if (yearFrom && yearTo && yearFrom > yearTo) {
    throw new BadRequestException('yearFrom не може да е по-голяма от yearTo');
  }
}

@Injectable()
export class VehicleModelService {
  constructor(
    @InjectRepository(VehicleModelEntity)
    private readonly repo: Repository<VehicleModelEntity>,
    private readonly makeService: VehicleMakeService,
  ) {}

  async list(query: VehicleModelQueryDto): Promise<VehicleModelDto[]> {
    const limit = query.limit ?? 500;
    const qb = this.repo
      .createQueryBuilder('model')
      .innerJoinAndSelect('model.make', 'make')
      .loadRelationCountAndMap(
        'model.modificationsCount',
        'model.modifications',
        'mod',
        (qb2) => qb2.where('mod.deleted_at IS NULL AND mod.is_active = true'),
      )
      .where('model.deleted_at IS NULL')
      .andWhere('make.deleted_at IS NULL');

    if (!query.includeInactive) {
      qb.andWhere('model.is_active = true').andWhere('make.is_active = true');
    }
    if (query.makeId) {
      qb.andWhere('model.make_id = :makeId', { makeId: query.makeId });
    }
    if (query.q) {
      qb.andWhere('(model.name ILIKE :q OR make.name ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }

    const rows = await qb
      .orderBy('make.name', 'ASC')
      .addOrderBy('model.name', 'ASC')
      .take(limit)
      .getMany();

    return rows.map((row) => this.toDto(row));
  }

  async create(dto: CreateVehicleModelDto): Promise<VehicleModelDto> {
    assertYearRange(dto.yearFrom, dto.yearTo);
    const make = await this.makeService.getOrThrow(dto.makeId);
    const normalizedName = normalizeName(dto.name);
    await this.assertUniqueName(dto.makeId, normalizedName);

    const model = this.repo.create({
      makeId: make.id,
      name: dto.name.trim(),
      normalizedName,
      vpicModelId: dto.vpicModelId ?? null,
      autodata24Slug: dto.autodata24Slug ?? null,
      yearFrom: dto.yearFrom ?? null,
      yearTo: dto.yearTo ?? null,
      bodyType: dto.bodyType ?? null,
      imageUrl: dto.imageUrl ?? null,
      isActive: dto.isActive ?? true,
      source: dto.autodata24Slug
        ? 'autodata24'
        : dto.vpicModelId
          ? 'vpic'
          : 'manual',
    });

    const saved = await this.repo.save(model);
    return this.toDto(await this.getOrThrow(saved.id));
  }

  async update(
    id: string,
    dto: UpdateVehicleModelDto,
  ): Promise<VehicleModelDto> {
    const model = await this.getOrThrow(id);
    const nextMakeId = dto.makeId ?? model.makeId;
    const nextName = dto.name ? dto.name.trim() : model.name;
    const nextNorm = normalizeName(nextName);

    assertYearRange(dto.yearFrom ?? model.yearFrom, dto.yearTo ?? model.yearTo);

    if (nextMakeId !== model.makeId || nextNorm !== model.normalizedName) {
      await this.makeService.getOrThrow(nextMakeId);
      await this.assertUniqueName(nextMakeId, nextNorm, model.id);
      model.makeId = nextMakeId;
      model.name = nextName;
      model.normalizedName = nextNorm;
    } else if (dto.name) {
      model.name = nextName;
      model.normalizedName = nextNorm;
    }

    if (dto.yearFrom !== undefined) model.yearFrom = dto.yearFrom;
    if (dto.yearTo !== undefined) model.yearTo = dto.yearTo;
    if (dto.bodyType !== undefined) model.bodyType = dto.bodyType ?? null;
    if (dto.imageUrl !== undefined) model.imageUrl = dto.imageUrl ?? null;
    if (dto.isActive !== undefined) model.isActive = dto.isActive;

    await this.repo.save(model);
    return this.toDto(await this.getOrThrow(model.id));
  }

  async delete(id: string): Promise<void> {
    const model = await this.getOrThrow(id);
    model.deletedAt = new Date();
    await this.repo.save(model);
  }

  async getOrThrow(id: string): Promise<VehicleModelEntity> {
    const model = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { make: true },
    });
    if (!model) throw new NotFoundException('Моделът не е намерен');
    return model;
  }

  toDto(
    row: VehicleModelEntity & { modificationsCount?: number },
  ): VehicleModelDto {
    return {
      id: row.id,
      makeId: row.makeId,
      makeName: row.make?.name ?? '',
      name: row.name,
      vpicModelId: row.vpicModelId,
      autodata24Slug: row.autodata24Slug,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      bodyType: row.bodyType,
      imageUrl: row.imageUrl,
      modificationsCount:
        (row as { modificationsCount?: number }).modificationsCount ?? 0,
      isActive: row.isActive,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async assertUniqueName(
    makeId: string,
    normalizedName: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.repo.findOne({
      where: { makeId, normalizedName, deletedAt: IsNull() },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(
        'Модел с това наименование вече съществува за тази марка',
      );
    }
  }
}
