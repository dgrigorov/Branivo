import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SyncRunStatus =
  | 'pending'
  | 'scraping'
  | 'importing'
  | 'done'
  | 'failed';

@Entity('vehicle_catalog_sync_runs')
export class VehicleCatalogSyncRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: SyncRunStatus;

  @Column({ name: 'total_scraped', type: 'int', nullable: true })
  totalScraped!: number | null;

  @Column({ name: 'total_imported', type: 'int', nullable: true })
  totalImported!: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'log_lines', type: 'text', array: true, default: [] })
  logLines!: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
