import { createHash } from 'crypto';

export interface AuditLogParams {
  tenantId: string;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditChainVerificationResult {
  valid: boolean;
  chainedEntries: number;
  unchainedEntries: number;
  brokenAt?: string;
  checkedAt: string;
}

/**
 * Pure deterministic function — same input always produces the same SHA-256 hash.
 * Used both when writing (audit.service.ts) and when verifying (verifyChain).
 */
export function computeEntryHash(params: {
  tenantId: string;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  prevHash: string;
}): string {
  const input = [
    params.tenantId,
    params.userId ?? '',
    params.action,
    params.entityType ?? '',
    params.entityId ?? '',
    JSON.stringify(params.metadata ?? {}),
    params.createdAt.toISOString(),
    params.prevHash,
  ].join('|');

  return createHash('sha256').update(input, 'utf8').digest('hex');
}
