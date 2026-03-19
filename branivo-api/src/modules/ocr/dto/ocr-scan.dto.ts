import { IsString, IsNotEmpty } from 'class-validator';
import {
  OcrFieldResult,
  OcrJobStatus,
  OcrProvider,
} from '../entities/ocr-job.entity';

export class OcrScanDto {
  @IsString()
  @IsNotEmpty()
  session_token!: string;
}

export class OcrScanResponseDto {
  jobId!: string;
  status!: OcrJobStatus;
  provider?: OcrProvider;
  fields?: OcrFieldResult;
  avgConfidence?: number;
}
