import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum FleetPdfExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

export interface FleetPdfFailedItem {
  policyId: string;
  error: string;
}

@Entity('fleet_pdf_exports')
export class FleetPdfExport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'requested_by' })
  requestedBy!: string;

  @Column({ name: 'policy_ids', type: 'jsonb' })
  policyIds!: string[];

  @Column({ name: 'status' })
  status!: FleetPdfExportStatus;

  @Column({ name: 'total_count' })
  totalCount!: number;

  @Column({ name: 'completed_count' })
  completedCount!: number;

  @Column({ name: 'failed_count' })
  failedCount!: number;

  @Column({ name: 'failed_policy_ids', type: 'jsonb' })
  failedPolicyIds!: FleetPdfFailedItem[];

  @Column({ name: 'zip_s3_key', type: 'varchar', nullable: true })
  zipS3Key!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
