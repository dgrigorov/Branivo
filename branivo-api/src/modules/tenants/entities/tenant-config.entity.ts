import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity({ name: 'tenant_configs' })
@Unique('uq_tenant_configs_tenant_id', ['tenantId'])
export class TenantConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'primary_color', length: 7, default: '#1A56DB' })
  primaryColor!: string;

  @Column({ name: 'logo_url', type: 'varchar', length: 512, nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'support_email', type: 'varchar', length: 255, nullable: true })
  supportEmail!: string | null;

  @Column({ name: 'support_phone', type: 'varchar', length: 32, nullable: true })
  supportPhone!: string | null;

  @Column({ name: 'secondary_color', type: 'varchar', length: 7, nullable: true })
  secondaryColor!: string | null;

  @Column({ name: 'brand_font', type: 'varchar', length: 32, nullable: true })
  brandFont!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
