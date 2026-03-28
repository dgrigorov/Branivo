import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class FscInsurerQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([
    'non_life_insurers',
    'life_insurers',
    'reinsurers',
    'insurance_brokers',
  ])
  categoryKey?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class FscInsurerDto {
  id!: string;
  categoryKey!: string;
  categoryLabel!: string;
  name!: string;
  eik!: string | null;
  officeAddress!: string | null;
  website!: string | null;
  contactDetails!: string | null;
  contactPhone!: string | null;
  contactEmails!: string[];
  longDescription!: string | null;
  logoUrl!: string | null;
  socialLinks!: string[];
  trustpilotUrl!: string | null;
  trustpilotScore!: number | null;
  trustpilotReviewsCount!: number | null;
  trustpilotEnrichedAt!: string | null;
  websiteEnrichedAt!: string | null;
  sourceUrl!: string;
  scrapedAt!: string;
  updatedAt!: string;
}

export class FscSyncResponseDto {
  total!: number;
  byCategory!: Array<{
    categoryKey: string;
    categoryLabel: string;
    url: string;
    imported: number;
  }>;
  syncedAt!: string;
}

export class FscSyncStatusDto {
  runId!: string | null;
  status!: 'idle' | 'running' | 'success' | 'error';
  startedAt!: string | null;
  finishedAt!: string | null;
  total!: number | null;
  byCategory!: Array<{
    categoryKey: string;
    categoryLabel: string;
    url: string;
    imported: number;
  }>;
  errorMessage!: string | null;
  logs!: Array<{
    at: string;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>;
}
