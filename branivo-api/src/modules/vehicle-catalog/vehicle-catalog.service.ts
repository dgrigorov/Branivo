import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { IsNull, ObjectLiteral, Repository } from 'typeorm';
import {
  CreateVehicleMakeDto,
  CreateVehicleModelDto,
  SyncVpicMakesResponseDto,
  SyncVpicModelsResponseDto,
  UpdateVehicleMakeDto,
  UpdateVehicleModelDto,
  VehicleMakeDto,
  VehicleMakeQueryDto,
  VehicleModelDto,
  VehicleModelQueryDto,
} from './dto/vehicle-catalog.dto';
import { VehicleMakeEntity } from './entities/vehicle-make.entity';
import { VehicleModelEntity } from './entities/vehicle-model.entity';

type VpicResponse<T> = {
  Count: number;
  Message: string;
  SearchCriteria: string | null;
  Results: T[];
};

type VpicMakeResult = {
  Make_ID: number;
  Make_Name: string;
};

type VpicModelResult = {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
};

const VPIC_BASE_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles';

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function assertYearRange(
  yearFrom?: number | null,
  yearTo?: number | null,
): void {
  if (yearFrom && yearTo && yearFrom > yearTo) {
    throw new BadRequestException('yearFrom не може да е по-голяма от yearTo');
  }
}

@Injectable()
export class VehicleCatalogService {
  constructor(
    @InjectRepository(VehicleMakeEntity)
    private readonly makeRepo: Repository<VehicleMakeEntity>,
    @InjectRepository(VehicleModelEntity)
    private readonly modelRepo: Repository<VehicleModelEntity>,
  ) {}

  async listMakes(query: VehicleMakeQueryDto): Promise<VehicleMakeDto[]> {
    const limit = query.limit ?? 200;
    const qb = this.makeRepo
      .createQueryBuilder('make')
      .where('make.deleted_at IS NULL');

    if (!query.includeInactive) {
      qb.andWhere('make.is_active = true');
    }

    if (query.q) {
      qb.andWhere('make.name ILIKE :q', { q: `%${query.q}%` });
    }

    const rows = await qb.orderBy('make.name', 'ASC').take(limit).getMany();
    return rows.map((row) => this.toMakeDto(row));
  }

  async createMake(dto: CreateVehicleMakeDto): Promise<VehicleMakeDto> {
    const normalizedName = normalizeName(dto.name);
    await this.assertUniqueMakeName(normalizedName);

    if (dto.vpicMakeId) {
      await this.assertUniqueVpicMakeId(dto.vpicMakeId);
    }

    const make = this.makeRepo.create({
      name: dto.name.trim(),
      normalizedName,
      vpicMakeId: dto.vpicMakeId ?? null,
      isActive: dto.isActive ?? true,
      source: dto.vpicMakeId ? 'vpic' : 'manual',
    });

    const saved = await this.makeRepo.save(make);
    return this.toMakeDto(saved);
  }

  async updateMake(id: string, dto: UpdateVehicleMakeDto): Promise<VehicleMakeDto> {
    const make = await this.findMakeEntity(id);

    if (dto.name) {
      const normalizedName = normalizeName(dto.name);
      if (normalizedName !== make.normalizedName) {
        await this.assertUniqueMakeName(normalizedName, make.id);
      }
      make.name = dto.name.trim();
      make.normalizedName = normalizedName;
    }

    if (dto.vpicMakeId !== undefined) {
      if (dto.vpicMakeId !== make.vpicMakeId) {
        await this.assertUniqueVpicMakeId(dto.vpicMakeId, make.id);
      }
      make.vpicMakeId = dto.vpicMakeId;
      if (dto.vpicMakeId) {
        make.source = 'vpic';
      }
    }

    if (dto.isActive !== undefined) {
      make.isActive = dto.isActive;
    }

    const saved = await this.makeRepo.save(make);
    return this.toMakeDto(saved);
  }

  async deleteMake(id: string): Promise<void> {
    const make = await this.findMakeEntity(id);
    make.deletedAt = new Date();
    await this.makeRepo.save(make);
  }

  async listModels(query: VehicleModelQueryDto): Promise<VehicleModelDto[]> {
    const limit = query.limit ?? 500;
    const qb = this.modelRepo
      .createQueryBuilder('model')
      .innerJoinAndSelect('model.make', 'make')
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

    return rows.map((row) => this.toModelDto(row));
  }

  async createModel(dto: CreateVehicleModelDto): Promise<VehicleModelDto> {
    assertYearRange(dto.yearFrom, dto.yearTo);

    const make = await this.findMakeEntity(dto.makeId);
    const normalizedName = normalizeName(dto.name);

    await this.assertUniqueModelNameWithinMake(dto.makeId, normalizedName);
    if (dto.vpicModelId) {
      await this.assertUniqueVpicModelId(dto.vpicModelId);
    }

    const model = this.modelRepo.create({
      makeId: make.id,
      name: dto.name.trim(),
      normalizedName,
      vpicModelId: dto.vpicModelId ?? null,
      yearFrom: dto.yearFrom ?? null,
      yearTo: dto.yearTo ?? null,
      isActive: dto.isActive ?? true,
      source: dto.vpicModelId ? 'vpic' : 'manual',
    });

    const saved = await this.modelRepo.save(model);
    const withMake = await this.findModelEntity(saved.id);
    return this.toModelDto(withMake);
  }

  async updateModel(
    id: string,
    dto: UpdateVehicleModelDto,
  ): Promise<VehicleModelDto> {
    const model = await this.findModelEntity(id);

    const nextMakeId = dto.makeId ?? model.makeId;
    const nextName = dto.name ? dto.name.trim() : model.name;
    const nextNormalizedName = normalizeName(nextName);

    assertYearRange(dto.yearFrom ?? model.yearFrom, dto.yearTo ?? model.yearTo);

    if (nextMakeId !== model.makeId || nextNormalizedName !== model.normalizedName) {
      await this.findMakeEntity(nextMakeId);
      await this.assertUniqueModelNameWithinMake(
        nextMakeId,
        nextNormalizedName,
        model.id,
      );
      model.makeId = nextMakeId;
      model.name = nextName;
      model.normalizedName = nextNormalizedName;
    } else if (dto.name) {
      model.name = nextName;
      model.normalizedName = nextNormalizedName;
    }

    if (dto.vpicModelId !== undefined) {
      if (dto.vpicModelId !== model.vpicModelId) {
        await this.assertUniqueVpicModelId(dto.vpicModelId, model.id);
      }
      model.vpicModelId = dto.vpicModelId;
      if (dto.vpicModelId) {
        model.source = 'vpic';
      }
    }

    if (dto.yearFrom !== undefined) {
      model.yearFrom = dto.yearFrom;
    }
    if (dto.yearTo !== undefined) {
      model.yearTo = dto.yearTo;
    }
    if (dto.isActive !== undefined) {
      model.isActive = dto.isActive;
    }

    await this.modelRepo.save(model);
    const withMake = await this.findModelEntity(model.id);
    return this.toModelDto(withMake);
  }

  async deleteModel(id: string): Promise<void> {
    const model = await this.findModelEntity(id);
    model.deletedAt = new Date();
    await this.modelRepo.save(model);
  }

  async syncMakesFromVpic(): Promise<SyncVpicMakesResponseDto> {
    const response = await axios.get<VpicResponse<VpicMakeResult>>(
      `${VPIC_BASE_URL}/GetAllMakes?format=json`,
      { timeout: 60000 },
    );

    const now = new Date();
    let imported = 0;
    let updated = 0;
    const toSave: VehicleMakeEntity[] = [];
    const existingMakes = await this.makeRepo.find({
      where: { deletedAt: IsNull() },
    });
    const byVpicId = new Map<number, VehicleMakeEntity>();
    const byNormalizedName = new Map<string, VehicleMakeEntity>();

    for (const make of existingMakes) {
      if (make.vpicMakeId) {
        byVpicId.set(make.vpicMakeId, make);
      }
      byNormalizedName.set(make.normalizedName, make);
    }

    for (const result of response.data.Results) {
      const name = result.Make_Name.trim();
      const normalizedName = normalizeName(name);
      const existing =
        byVpicId.get(result.Make_ID) ?? byNormalizedName.get(normalizedName);

      if (!existing) {
        const created = this.makeRepo.create({
          name,
          normalizedName,
          vpicMakeId: result.Make_ID,
          isActive: true,
          source: 'vpic',
        });
        toSave.push(created);
        byVpicId.set(result.Make_ID, created);
        byNormalizedName.set(normalizedName, created);
        imported += 1;
        continue;
      }

      if (
        existing.name !== name ||
        existing.vpicMakeId !== result.Make_ID ||
        existing.source !== 'vpic' ||
        !existing.isActive
      ) {
        existing.name = name;
        existing.normalizedName = normalizedName;
        existing.vpicMakeId = result.Make_ID;
        existing.source = 'vpic';
        existing.isActive = true;
        toSave.push(existing);
        byVpicId.set(result.Make_ID, existing);
        byNormalizedName.set(normalizedName, existing);
        updated += 1;
      }
    }

    await this.saveInChunks(this.makeRepo, toSave, 500);

    return {
      imported,
      updated,
      totalProcessed: response.data.Count,
      syncedAt: now.toISOString(),
    };
  }

  async syncModelsFromVpic(makeId: string): Promise<SyncVpicModelsResponseDto> {
    const make = await this.findMakeEntity(makeId);
    if (!make.vpicMakeId) {
      throw new BadRequestException(
        'Марката няма vPIC make id. Добави `vpicMakeId` и опитай пак.',
      );
    }

    const response = await axios.get<VpicResponse<VpicModelResult>>(
      `${VPIC_BASE_URL}/GetModelsForMakeId/${make.vpicMakeId}?format=json`,
      { timeout: 60000 },
    );

    const now = new Date();
    let imported = 0;
    let updated = 0;
    const toSave: VehicleModelEntity[] = [];
    const existingModels = await this.modelRepo.find({
      where: { makeId: make.id, deletedAt: IsNull() },
    });
    const byVpicId = new Map<number, VehicleModelEntity>();
    const byNormalizedName = new Map<string, VehicleModelEntity>();

    for (const model of existingModels) {
      if (model.vpicModelId) {
        byVpicId.set(model.vpicModelId, model);
      }
      byNormalizedName.set(model.normalizedName, model);
    }

    for (const result of response.data.Results) {
      const name = result.Model_Name.trim();
      const normalizedName = normalizeName(name);
      const existing =
        byVpicId.get(result.Model_ID) ?? byNormalizedName.get(normalizedName);

      if (!existing) {
        const created = this.modelRepo.create({
          makeId: make.id,
          name,
          normalizedName,
          vpicModelId: result.Model_ID,
          isActive: true,
          source: 'vpic',
        });
        toSave.push(created);
        byVpicId.set(result.Model_ID, created);
        byNormalizedName.set(normalizedName, created);
        imported += 1;
        continue;
      }

      if (
        existing.makeId !== make.id ||
        existing.name !== name ||
        existing.vpicModelId !== result.Model_ID ||
        existing.source !== 'vpic' ||
        !existing.isActive
      ) {
        existing.makeId = make.id;
        existing.name = name;
        existing.normalizedName = normalizedName;
        existing.vpicModelId = result.Model_ID;
        existing.source = 'vpic';
        existing.isActive = true;
        toSave.push(existing);
        byVpicId.set(result.Model_ID, existing);
        byNormalizedName.set(normalizedName, existing);
        updated += 1;
      }
    }

    await this.saveInChunks(this.modelRepo, toSave, 1000);

    return {
      makeId: make.id,
      makeName: make.name,
      imported,
      updated,
      totalProcessed: response.data.Count,
      syncedAt: now.toISOString(),
    };
  }

  private async findMakeEntity(id: string): Promise<VehicleMakeEntity> {
    const make = await this.makeRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!make) {
      throw new NotFoundException('Марката не е намерена');
    }
    return make;
  }

  private async findModelEntity(id: string): Promise<VehicleModelEntity> {
    const model = await this.modelRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { make: true },
    });
    if (!model) {
      throw new NotFoundException('Моделът не е намерен');
    }
    return model;
  }

  private async assertUniqueMakeName(
    normalizedName: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.makeRepo.findOne({
      where: { normalizedName, deletedAt: IsNull() },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('Марка с това име вече съществува');
    }
  }

  private async assertUniqueVpicMakeId(
    vpicMakeId: number,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.makeRepo.findOne({
      where: { vpicMakeId, deletedAt: IsNull() },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('Марка с този vPIC ID вече съществува');
    }
  }

  private async assertUniqueModelNameWithinMake(
    makeId: string,
    normalizedName: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.modelRepo.findOne({
      where: { makeId, normalizedName, deletedAt: IsNull() },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('Модел с това име вече съществува за тази марка');
    }
  }

  private async assertUniqueVpicModelId(
    vpicModelId: number,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.modelRepo.findOne({
      where: { vpicModelId, deletedAt: IsNull() },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('Модел с този vPIC ID вече съществува');
    }
  }

  private toMakeDto(row: VehicleMakeEntity): VehicleMakeDto {
    return {
      id: row.id,
      name: row.name,
      vpicMakeId: row.vpicMakeId,
      isActive: row.isActive,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toModelDto(row: VehicleModelEntity): VehicleModelDto {
    return {
      id: row.id,
      makeId: row.makeId,
      makeName: row.make?.name ?? '',
      name: row.name,
      vpicModelId: row.vpicModelId,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      isActive: row.isActive,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async saveInChunks<T extends ObjectLiteral>(
    repo: Repository<T>,
    entities: T[],
    chunkSize: number,
  ): Promise<void> {
    if (entities.length === 0) return;

    for (let i = 0; i < entities.length; i += chunkSize) {
      const chunk = entities.slice(i, i + chunkSize);
      await repo.save(chunk);
    }
  }
}
