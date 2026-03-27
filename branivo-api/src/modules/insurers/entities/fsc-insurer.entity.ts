import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('fsc_insurers')
export class FscInsurerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'category_key', type: 'varchar', length: 64 })
  categoryKey!: string;

  @Column({ name: 'category_label', type: 'varchar', length: 128 })
  categoryLabel!: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'eik', type: 'varchar', length: 20, nullable: true })
  eik!: string | null;

  @Column({ name: 'office_address', type: 'text', nullable: true })
  officeAddress!: string | null;

  @Column({ name: 'website', type: 'varchar', length: 500, nullable: true })
  website!: string | null;

  @Column({ name: 'contact_details', type: 'text', nullable: true })
  contactDetails!: string | null;

  @Column({ name: 'contact_phone', type: 'text', nullable: true })
  contactPhone!: string | null;

  @Column({
    name: 'contact_emails',
    type: 'text',
    array: true,
    nullable: false,
    default: () => "'{}'",
  })
  contactEmails!: string[];

  @Column({ name: 'long_description', type: 'text', nullable: true })
  longDescription!: string | null;

  @Column({ name: 'logo_url', type: 'varchar', length: 1000, nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'social_links', type: 'jsonb', default: () => "'[]'::jsonb" })
  socialLinks!: string[];

  @Column({ name: 'trustpilot_url', type: 'varchar', length: 1000, nullable: true })
  trustpilotUrl!: string | null;

  @Column({ name: 'website_enriched_at', type: 'timestamptz', nullable: true })
  websiteEnrichedAt!: Date | null;

  @Column({ name: 'source_url', type: 'varchar', length: 700 })
  sourceUrl!: string;

  @Column({ name: 'scraped_at', type: 'timestamptz' })
  scrapedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
