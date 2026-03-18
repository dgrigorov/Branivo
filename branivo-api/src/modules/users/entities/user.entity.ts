import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type UserRole =
  | 'super_admin'
  | 'broker_admin'
  | 'broker_agent'
  | 'broker_viewer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'email' })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ name: 'role', default: 'broker_agent' })
  role!: UserRole;

  @Column({ name: 'two_fa_enabled', default: false })
  twoFaEnabled!: boolean;

  @Column({ name: 'two_fa_secret_enc', nullable: true, type: 'text' })
  twoFaSecretEnc!: string | null;

  @Column({ name: 'failed_login_count', default: 0 })
  failedLoginCount!: number;

  @Column({ name: 'locked_until', nullable: true, type: 'timestamptz' })
  lockedUntil!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', nullable: true, type: 'timestamptz' })
  deletedAt!: Date | null;
}
