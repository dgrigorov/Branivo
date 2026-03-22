import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import {
  FleetPdfExport,
  FleetPdfExportStatus,
  FleetPdfFailedItem,
} from './entities/fleet-pdf-export.entity';

@Injectable()
export class FleetPdfExportRepository extends BaseRepository<FleetPdfExport> {
  constructor(
    @InjectRepository(FleetPdfExport)
    private readonly exportRepo: Repository<FleetPdfExport>,
    tenantContext: TenantContext,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super(exportRepo, tenantContext);
  }

  async findByIdAndTenant(
    id: string,
    tenantId: string,
  ): Promise<FleetPdfExport | null> {
    return this.exportRepo.findOne({
      where: { id, tenantId },
    });
  }

  async findByIdRaw(id: string): Promise<FleetPdfExport | null> {
    return this.exportRepo.findOne({ where: { id } });
  }

  async incrementCompleted(id: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE fleet_pdf_exports
       SET completed_count = completed_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }

  async incrementFailed(
    id: string,
    failedItem: FleetPdfFailedItem,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE fleet_pdf_exports
       SET failed_count = failed_count + 1,
           failed_policy_ids = failed_policy_ids || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify([failedItem])],
    );
  }

  async updateZipReady(
    id: string,
    zipS3Key: string,
    expiresAt: Date,
    status: FleetPdfExportStatus,
  ): Promise<void> {
    await this.exportRepo.update(id, { zipS3Key, expiresAt, status });
  }

  async tryMarkForAssembly(id: string, totalCount: number): Promise<boolean> {
    const result = await this.dataSource.query<unknown[]>(
      `UPDATE fleet_pdf_exports
       SET status = 'assembling', updated_at = NOW()
       WHERE id = $1
         AND status NOT IN ('assembling', 'completed', 'partial', 'failed')
         AND (completed_count + failed_count) = $2
       RETURNING id`,
      [id, totalCount],
    );
    return result.length > 0;
  }

  async updateStatus(id: string, status: FleetPdfExportStatus): Promise<void> {
    await this.exportRepo.update(id, { status });
  }
}
