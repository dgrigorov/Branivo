import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { QUEUE_DATA_EXPORT } from '../../infrastructure/queues/queue.module';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { EmailService } from '../../infrastructure/email/email.service';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { EndClientRepository } from '../clients/repositories/end-client.repository';
import { DataExportRepository } from './data-export.repository';
import { DataExportStatus } from './entities/data-export-request.entity';
import {
  DataExportResponseDto,
  DataExportStatusResponseDto,
} from './dto/data-export-response.dto';

export interface DataExportJobData {
  requestId: string;
  customerId: string;
  tenantId: string;
}

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    private readonly dataExportRepo: DataExportRepository,
    @InjectQueue(QUEUE_DATA_EXPORT)
    private readonly dataExportQueue: Queue<DataExportJobData>,
    private readonly emailService: EmailService,
    private readonly s3Service: S3Service,
    private readonly endClientRepo: EndClientRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async requestExport(customerId: string): Promise<DataExportResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const latest = await this.dataExportRepo.findLatestForCustomer(
      customerId,
      tenantId,
    );
    if (
      latest &&
      latest.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ) {
      throw new HttpException(
        'Можете да поискате само 1 data export на 24 часа.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const request = await this.dataExportRepo.create(customerId, tenantId);

    await this.dataExportQueue.add('data-export:process', {
      requestId: request.id,
      customerId,
      tenantId,
    });

    const customer = await this.endClientRepo.findById(customerId);
    if (customer?.email) {
      await this.emailService.sendDataExportRequestedEmail({
        to: customer.email,
        tenantId,
      });
    } else {
      this.logger.warn(
        `DataExport: customer ${customerId} has no email — skip confirmation notification`,
      );
    }

    return {
      message:
        'Вашият data export се подготвя. Ще получите линк в рамките на 24 часа.',
      requestId: request.id,
    };
  }

  async getStatus(customerId: string): Promise<DataExportStatusResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const latest = await this.dataExportRepo.findLatestForCustomer(
      customerId,
      tenantId,
    );

    if (!latest) {
      throw new NotFoundException('Няма намерена заявка за data export.');
    }

    const response: DataExportStatusResponseDto = {
      status: latest.status,
    };

    if (
      latest.status === DataExportStatus.COMPLETED &&
      latest.s3Key &&
      latest.expiresAt &&
      latest.expiresAt > new Date()
    ) {
      response.expiresAt = latest.expiresAt;
      response.downloadUrl = await this.s3Service.generatePresignedUrl(
        latest.s3Key,
        48 * 3600,
      );
    }

    return response;
  }
}
