import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { RenewalStage } from '../../renewal/renewal.repository';
import type { NotificationChannel } from './notification-log.entity';

export interface StageConfig {
  stage: RenewalStage;
  channels: NotificationChannel[];
  enabled: boolean;
}

@Entity('tenant_renewal_config')
export class TenantRenewalConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'stages_config', type: 'jsonb' })
  stagesConfig!: StageConfig[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt!: Date;
}
