import {
  OcrFieldResult,
  OcrJobStatus,
  OcrProvider,
} from '../entities/ocr-job.entity';

export class OcrStatusResponseDto {
  jobId!: string;
  status!: OcrJobStatus;
  provider?: OcrProvider;
  fields?: OcrFieldResult;
  avgConfidence?: number;
}
