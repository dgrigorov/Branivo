import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DataExportRequest,
  DataExportStatus,
} from './entities/data-export-request.entity';

@Injectable()
export class DataExportRepository {
  constructor(
    @InjectRepository(DataExportRequest)
    private readonly repo: Repository<DataExportRequest>,
  ) {}

  async create(
    customerId: string,
    tenantId: string,
  ): Promise<DataExportRequest> {
    const entity = this.repo.create({
      customerId,
      tenantId,
      status: DataExportStatus.PENDING,
    });
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<DataExportRequest | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findLatestForCustomer(
    customerId: string,
    tenantId: string,
  ): Promise<DataExportRequest | null> {
    return this.repo.findOne({
      where: { customerId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(id: string, status: DataExportStatus): Promise<void> {
    await this.repo.update(id, { status });
  }

  async markCompleted(
    id: string,
    s3Key: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.repo.update(id, {
      status: DataExportStatus.COMPLETED,
      s3Key,
      expiresAt,
    });
  }
}
