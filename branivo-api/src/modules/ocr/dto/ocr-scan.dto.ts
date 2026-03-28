import {
  IsString,
  IsNotEmpty,
  IsObject,
  IsInt,
  Min,
  IsOptional,
} from 'class-validator';
import type { OcrFieldResult } from '../entities/ocr-job.entity';
import { OcrJobStatus, OcrProvider } from '../entities/ocr-job.entity';

export class OcrScanDto {
  @IsString()
  @IsNotEmpty()
  session_token!: string;
}

export class ReportMlKitScanDto {
  @IsString()
  @IsNotEmpty()
  session_token!: string;

  @IsObject()
  fields!: OcrFieldResult;

  @IsInt()
  @Min(1)
  images_count!: number;

  @IsOptional()
  @IsString()
  raw_text?: string;
}

export class OcrScanResponseDto {
  jobId!: string;
  status!: OcrJobStatus;
  provider?: OcrProvider;
  fields?: OcrFieldResult;
  avgConfidence?: number;
}
