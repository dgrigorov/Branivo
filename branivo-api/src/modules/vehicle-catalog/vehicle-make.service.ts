import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  CreateVehicleMakeDto,
  UpdateVehicleMakeDto,
  VehicleMakeDto,
  VehicleMakeQueryDto,
} from './dto/vehicle-catalog.dto';
import { VehicleMakeEntity } from './entities/vehicle-make.entity';

// Brands popular in the Bulgarian market — auto-flag is_popular on create
export const POPULAR_MAKES = new Set([
  'ALFA ROMEO',
  'AUDI',
  'BMW',
  'CHEVROLET',
  'CITROËN',
  'CITROEN',
  'DACIA',
  'FIAT',
  'FORD',
  'HONDA',
  'HYUNDAI',
  'JEEP',
  'KIA',
  'LAND ROVER',
  'LEXUS',
  'MAZDA',
  'MERCEDES-BENZ',
  'MITSUBISHI',
  'NISSAN',
  'OPEL',
  'PEUGEOT',
  'RENAULT',
  'SEAT',
  'SKODA',
  'SUBARU',
  'SUZUKI',
  'TOYOTA',
  'VOLKSWAGEN',
  'VOLVO',
]);

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

@Injectable()
export class VehicleMakeService {
  constructor(
    @InjectRepository(VehicleMakeEntity)
    private readonly repo: Repository<VehicleMakeEntity>,
  ) {}

  async list(query: VehicleMakeQueryDto): Promise<VehicleMakeDto[]> {
    const limit = query.limit ?? 200;
    const qb = this.repo
      .createQueryBuilder('make')
      .where('make.deleted_at IS NULL');

    if (!query.includeInactive) {
      qb.andWhere('make.is_active = true');
    }
    if (query.q) {
      qb.andWhere('make.name ILIKE :q', { q: `%${query.q}%` });
    }

    const rows = await qb.orderBy('make.name', 'ASC').take(limit).getMany();
    return rows.map((row) => this.toDto(row));
  }

  async create(dto: CreateVehicleMakeDto): Promise<VehicleMakeDto> {
    const normalizedName = normalizeName(dto.name);
    await this.assertUniqueName(normalizedName);

    const make = this.repo.create({
      name: dto.name.trim(),
      normalizedName,
      vpicMakeId: dto.vpicMakeId ?? null,
      logoUrl: dto.logoUrl ?? null,
      autodata24Slug: dto.autodata24Slug ?? null,
      isActive: dto.isActive ?? true,
      isPopular: dto.isPopular ?? POPULAR_MAKES.has(normalizedName),
      source: dto.autodata24Slug
        ? 'autodata24'
        : dto.vpicMakeId
          ? 'vpic'
          : 'manual',
    });

    return this.toDto(await this.repo.save(make));
  }

  async update(id: string, dto: UpdateVehicleMakeDto): Promise<VehicleMakeDto> {
    const make = await this.getOrThrow(id);

    if (dto.name) {
      const normalizedName = normalizeName(dto.name);
      if (normalizedName !== make.normalizedName) {
        await this.assertUniqueName(normalizedName, make.id);
      }
      make.name = dto.name.trim();
      make.normalizedName = normalizedName;
    }
    if (dto.logoUrl !== undefined) make.logoUrl = dto.logoUrl ?? null;
    if (dto.autodata24Slug !== undefined)
      make.autodata24Slug = dto.autodata24Slug ?? null;
    if (dto.isActive !== undefined) make.isActive = dto.isActive;
    if (dto.isPopular !== undefined) make.isPopular = dto.isPopular;

    return this.toDto(await this.repo.save(make));
  }

  async delete(id: string): Promise<void> {
    const make = await this.getOrThrow(id);
    make.deletedAt = new Date();
    await this.repo.save(make);
  }

  async getOrThrow(id: string): Promise<VehicleMakeEntity> {
    const make = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!make) throw new NotFoundException('Марката не е намерена');
    return make;
  }

  toDto(row: VehicleMakeEntity): VehicleMakeDto {
    return {
      id: row.id,
      name: row.name,
      vpicMakeId: row.vpicMakeId,
      logoUrl: row.logoUrl,
      autodata24Slug: row.autodata24Slug,
      isActive: row.isActive,
      isPopular: row.isPopular,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async assertUniqueName(
    normalizedName: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.repo.findOne({
      where: { normalizedName, deletedAt: IsNull() },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(
        'Марка с това наименование вече съществува',
      );
    }
  }
}
