import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  CreateVehicleModificationDto,
  UpdateVehicleModificationDto,
  VehicleModificationDto,
  VehicleModificationQueryDto,
} from './dto/vehicle-catalog.dto';
import { VehicleModificationEntity } from './entities/vehicle-modification.entity';
import { VehicleModelService } from './vehicle-model.service';

function assertYearRange(
  yearFrom?: number | null,
  yearTo?: number | null,
): void {
  if (yearFrom && yearTo && yearFrom > yearTo) {
    throw new BadRequestException('yearFrom не може да е по-голяма от yearTo');
  }
}

@Injectable()
export class VehicleModificationService {
  constructor(
    @InjectRepository(VehicleModificationEntity)
    private readonly repo: Repository<VehicleModificationEntity>,
    private readonly modelService: VehicleModelService,
  ) {}

  async list(
    query: VehicleModificationQueryDto,
  ): Promise<VehicleModificationDto[]> {
    const limit = query.limit ?? 200;
    const qb = this.repo
      .createQueryBuilder('mod')
      .where('mod.deleted_at IS NULL')
      .andWhere('mod.model_id = :modelId', { modelId: query.modelId });

    if (!query.includeInactive) {
      qb.andWhere('mod.is_active = true');
    }

    const rows = await qb
      .orderBy('mod.year_from', 'ASC', 'NULLS LAST')
      .addOrderBy('mod.name', 'ASC')
      .take(limit)
      .getMany();

    return rows.map((row) => this.toDto(row));
  }

  async create(
    dto: CreateVehicleModificationDto,
  ): Promise<VehicleModificationDto> {
    assertYearRange(dto.yearFrom, dto.yearTo);
    await this.modelService.getOrThrow(dto.modelId);
    await this.assertUniqueName(dto.modelId, dto.name);

    const mod = this.repo.create({
      modelId: dto.modelId,
      name: dto.name.trim(),
      yearFrom: dto.yearFrom ?? null,
      yearTo: dto.yearTo ?? null,
      engineType: dto.engineType ?? null,
      engineSizeCc: dto.engineSizeCc ?? null,
      powerKw: dto.powerKw ?? null,
      powerHp: dto.powerHp ?? null,
      bodyType: dto.bodyType ?? null,
      doors: dto.doors ?? null,
      seats: dto.seats ?? null,
      transmission: dto.transmission ?? null,
      drive: dto.drive ?? null,
      maxSpeedKmh: dto.maxSpeedKmh ?? null,
      acceleration0100: dto.acceleration0100 ?? null,
      fuelConsumptionCity: dto.fuelConsumptionCity ?? null,
      fuelConsumptionHighway: dto.fuelConsumptionHighway ?? null,
      fuelConsumptionCombined: dto.fuelConsumptionCombined ?? null,
      weightKg: dto.weightKg ?? null,
      engineCode: dto.engineCode ?? null,
      rawData: dto.rawData ?? null,
      isActive: dto.isActive ?? true,
      source: dto.source ?? 'manual',
    });

    return this.toDto(await this.repo.save(mod));
  }

  async update(
    id: string,
    dto: UpdateVehicleModificationDto,
  ): Promise<VehicleModificationDto> {
    const mod = await this.getOrThrow(id);
    assertYearRange(dto.yearFrom ?? mod.yearFrom, dto.yearTo ?? mod.yearTo);

    if (dto.name && dto.name.trim() !== mod.name) {
      await this.assertUniqueName(mod.modelId, dto.name, mod.id);
      mod.name = dto.name.trim();
    }

    if (dto.yearFrom !== undefined) mod.yearFrom = dto.yearFrom ?? null;
    if (dto.yearTo !== undefined) mod.yearTo = dto.yearTo ?? null;
    if (dto.engineType !== undefined) mod.engineType = dto.engineType ?? null;
    if (dto.engineSizeCc !== undefined)
      mod.engineSizeCc = dto.engineSizeCc ?? null;
    if (dto.powerKw !== undefined) mod.powerKw = dto.powerKw ?? null;
    if (dto.powerHp !== undefined) mod.powerHp = dto.powerHp ?? null;
    if (dto.bodyType !== undefined) mod.bodyType = dto.bodyType ?? null;
    if (dto.doors !== undefined) mod.doors = dto.doors ?? null;
    if (dto.seats !== undefined) mod.seats = dto.seats ?? null;
    if (dto.transmission !== undefined)
      mod.transmission = dto.transmission ?? null;
    if (dto.drive !== undefined) mod.drive = dto.drive ?? null;
    if (dto.isActive !== undefined) mod.isActive = dto.isActive;

    return this.toDto(await this.repo.save(mod));
  }

  async delete(id: string): Promise<void> {
    const mod = await this.getOrThrow(id);
    mod.deletedAt = new Date();
    await this.repo.save(mod);
  }

  private async getOrThrow(id: string): Promise<VehicleModificationEntity> {
    const mod = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!mod) throw new NotFoundException('Модификацията не е намерена');
    return mod;
  }

  private toDto(row: VehicleModificationEntity): VehicleModificationDto {
    return {
      id: row.id,
      modelId: row.modelId,
      name: row.name,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      engineType: row.engineType,
      engineSizeCc: row.engineSizeCc,
      powerKw: row.powerKw,
      powerHp: row.powerHp,
      bodyType: row.bodyType,
      doors: row.doors,
      seats: row.seats,
      transmission: row.transmission,
      drive: row.drive,
      maxSpeedKmh: row.maxSpeedKmh,
      acceleration0100: row.acceleration0100
        ? Number(row.acceleration0100)
        : null,
      fuelConsumptionCity: row.fuelConsumptionCity
        ? Number(row.fuelConsumptionCity)
        : null,
      fuelConsumptionHighway: row.fuelConsumptionHighway
        ? Number(row.fuelConsumptionHighway)
        : null,
      fuelConsumptionCombined: row.fuelConsumptionCombined
        ? Number(row.fuelConsumptionCombined)
        : null,
      weightKg: row.weightKg,
      engineCode: row.engineCode,
      imageUrl: row.imageUrl,
      rawData: row.rawData,
      source: row.source,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async assertUniqueName(
    modelId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.repo.findOne({
      where: { modelId, name: name.trim(), deletedAt: IsNull() },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(
        'Модификация с това наименование вече съществува за този модел',
      );
    }
  }
}
