import { FscSyncResponseDto } from './dto/fsc-insurer.dto';

export type ParsedRow = {
  name: string;
  eik: string | null;
  officeAddress: string | null;
  website: string | null;
  contactDetails: string | null;
  contactPhone: string | null;
  contactEmails: string[];
};

export type WebsiteEnrichment = {
  longDescription: string | null;
  logoUrl: string | null;
  socialLinks: string[];
  trustpilotUrl: string | null;
  websiteEnrichedAt: Date | null;
  contactPhone: string | null;
  contactEmails: string[];
};

export type SyncLogLevel = 'info' | 'warn' | 'error';

export type FscSyncStatus = {
  runId: string | null;
  status: 'idle' | 'running' | 'success' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  total: number | null;
  byCategory: FscSyncResponseDto['byCategory'];
  errorMessage: string | null;
  logs: Array<{ at: string; level: SyncLogLevel; message: string }>;
};
