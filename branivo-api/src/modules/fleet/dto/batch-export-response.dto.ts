import { ApiProperty } from '@nestjs/swagger';
import {
  FleetPdfExportStatus,
  FleetPdfFailedItem,
} from '../entities/fleet-pdf-export.entity';

export class BatchExportResponseDto {
  @ApiProperty({ description: 'Export batch UUID' })
  exportId!: string;

  @ApiProperty({ enum: FleetPdfExportStatus, description: 'Export status' })
  status!: FleetPdfExportStatus;

  @ApiProperty({ description: 'Total number of policies in batch' })
  totalCount!: number;

  @ApiProperty({ description: 'Number of PDFs generated successfully' })
  completedCount!: number;

  @ApiProperty({ description: 'Number of PDFs that failed' })
  failedCount!: number;

  @ApiProperty({
    type: 'array',
    description: 'Failed policy IDs with error messages',
  })
  failedPolicyIds!: FleetPdfFailedItem[];

  @ApiProperty({ nullable: true, description: 'S3 key for ZIP archive' })
  zipS3Key!: string | null;

  @ApiProperty({ nullable: true, description: 'ZIP archive expiry timestamp' })
  expiresAt!: Date | null;
}
