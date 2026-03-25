import { DataExportStatus } from '../entities/data-export-request.entity';

export class DataExportResponseDto {
  message!: string;
  requestId!: string;
}

export class DataExportStatusResponseDto {
  status!: DataExportStatus;
  expiresAt?: Date;
  downloadUrl?: string;
}
