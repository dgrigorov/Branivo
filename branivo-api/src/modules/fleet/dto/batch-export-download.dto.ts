import { ApiProperty } from '@nestjs/swagger';

export class BatchExportDownloadDto {
  @ApiProperty({ description: '15-minute presigned S3 URL for ZIP download' })
  downloadUrl!: string;

  @ApiProperty({ description: 'URL TTL in seconds (900 = 15 minutes)' })
  expiresInSeconds!: number;
}
