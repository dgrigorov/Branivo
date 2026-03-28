import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PiiField } from '../../../shared/decorators/pii-field.decorator';
import { PiiClassification } from '../../../shared/types/pii.types';

export enum OcrJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum OcrProvider {
  GOOGLE_VISION = 'google_vision',
  AWS_TEXTRACT = 'aws_textract',
  ML_KIT = 'ml_kit',
}

export interface OcrField {
  value: string | null;
  confidence: number;
  auto_filled: boolean;
}

export interface OcrFieldResult {
  license_plate?: OcrField;
  vin?: OcrField;
  cert_number?: OcrField;
  make?: OcrField;
  model?: OcrField;
  year?: OcrField;
  color?: OcrField;
  engine_volume?: OcrField;
  fuel_type?: OcrField;
  first_registration_date?: OcrField;
  owner_name?: OcrField;
  owner_egn?: OcrField;
  owner_address?: OcrField;
}

@Entity('ocr_jobs')
export class OcrJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'session_token' })
  sessionToken!: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId!: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: OcrJobStatus,
    default: OcrJobStatus.PENDING,
  })
  status!: OcrJobStatus;

  @Column({ name: 'provider', type: 'enum', enum: OcrProvider, nullable: true })
  provider!: OcrProvider | null;

  @Column({ name: 'images_count', type: 'smallint', default: 0 })
  imagesCount!: number;

  @PiiField(PiiClassification.PII_SENSITIVE)
  @Column({ name: 'result', type: 'jsonb', nullable: true })
  result!: OcrFieldResult | null;

  @Column({ name: 'confidence_scores', type: 'jsonb', nullable: true })
  confidenceScores!: Record<string, number> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'raw_text', type: 'text', nullable: true })
  rawText!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;
}
