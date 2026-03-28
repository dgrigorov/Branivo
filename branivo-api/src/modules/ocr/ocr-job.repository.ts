import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import {
  OcrFieldResult,
  OcrJobEntity,
  OcrJobStatus,
  OcrProvider,
} from './entities/ocr-job.entity';

@Injectable()
export class OcrJobRepository extends BaseRepository<OcrJobEntity> {
  constructor(
    @InjectRepository(OcrJobEntity)
    private readonly ocrJobRepo: Repository<OcrJobEntity>,
    tenantContext: TenantContext,
  ) {
    super(ocrJobRepo, tenantContext);
  }

  async createJob(data: {
    tenantId: string;
    sessionToken: string;
    clientId?: string | null;
    imagesCount: number;
  }): Promise<OcrJobEntity> {
    await this.setTenantSession();
    const job = this.ocrJobRepo.create({
      tenantId: data.tenantId,
      sessionToken: data.sessionToken,
      clientId: data.clientId ?? null,
      imagesCount: data.imagesCount,
      status: OcrJobStatus.PROCESSING,
    });
    return this.ocrJobRepo.save(job);
  }

  async findById(id: string): Promise<OcrJobEntity | null> {
    await this.setTenantSession();
    return this.findOne({ id } as FindOptionsWhere<OcrJobEntity>);
  }

  async findBySessionToken(sessionToken: string): Promise<OcrJobEntity[]> {
    return this.findAll({ sessionToken } as FindOptionsWhere<OcrJobEntity>);
  }

  async updateStatus(
    id: string,
    status: OcrJobStatus,
    opts?: {
      result?: OcrFieldResult;
      confidenceScores?: Record<string, number>;
      provider?: OcrProvider;
      errorMessage?: string;
      rawText?: string;
    },
  ): Promise<void> {
    await this.setTenantSession();
    await this.ocrJobRepo.update(id, {
      status,
      ...(opts?.result !== undefined && { result: opts.result }),
      ...(opts?.confidenceScores !== undefined && {
        confidenceScores: opts.confidenceScores,
      }),
      ...(opts?.provider !== undefined && { provider: opts.provider }),
      ...(opts?.errorMessage !== undefined && {
        errorMessage: opts.errorMessage,
      }),
      ...(opts?.rawText !== undefined && { rawText: opts.rawText }),
    });
  }
}
