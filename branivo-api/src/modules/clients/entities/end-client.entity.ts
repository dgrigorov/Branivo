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

@Entity('end_clients')
export class EndClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @PiiField(PiiClassification.PII_BASIC)
  @Column({ name: 'phone_number' })
  phoneNumber!: string;

  @Column({ name: 'phone_verified', default: false })
  phoneVerified!: boolean;

  @PiiField(PiiClassification.PII_BASIC)
  @Column({ name: 'email', nullable: true, type: 'varchar', length: 255 })
  email!: string | null;

  @PiiField(PiiClassification.PII_BASIC)
  @Column({ name: 'push_token', nullable: true, type: 'text' })
  pushToken!: string | null;

  @PiiField(PiiClassification.PII_BASIC)
  @Column({ name: 'first_name', nullable: true, type: 'varchar', length: 100 })
  firstName!: string | null;

  @PiiField(PiiClassification.PII_BASIC)
  @Column({ name: 'last_name', nullable: true, type: 'varchar', length: 100 })
  lastName!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
