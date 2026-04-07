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
 * Serialises a metadata object with all object keys sorted recursively.
 * This ensures that the same logical data always produces the same JSON string
 * regardless of insertion order — critical for JSONB compatibility, because
 * PostgreSQL JSONB normalises key order alphabetically on storage and returns
 * keys in that order when read back.
 */
function canonicalJsonStringify(
  value: Record<string, unknown> | null | undefined,
): string {
  return JSON.stringify(value ?? {}, (_key: string, val: unknown): unknown => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce((sorted: Record<string, unknown>, k: string) => {
          sorted[k] = obj[k];
          return sorted;
        }, {});
    }
    return val;
  });
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
    canonicalJsonStringify(params.metadata),
    params.createdAt.toISOString(),
    params.prevHash,
  ].join('|');

  return createHash('sha256').update(input, 'utf8').digest('hex');
}
