import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AuditLogParams,
  AuditChainVerificationResult,
  computeEntryHash,
} from './audit-hash.util';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private static readonly GENESIS_HASH = '0'.repeat(64);

  constructor(private readonly dataSource: DataSource) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        // 1. Per-tenant advisory lock — serialises writes for a single tenant
        //    without blocking writes for other tenants (lock key = hash of tenantId)
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtext($1::text))`,
          [params.tenantId],
        );

        // 2. Last entry_hash for this tenant (for chaining)
        const lastEntries = await manager.query<Array<{ entry_hash: string }>>(
          `SELECT entry_hash FROM audit_log
           WHERE tenant_id = $1 AND entry_hash IS NOT NULL
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [params.tenantId],
        );
        const prevHash =
          lastEntries[0]?.entry_hash ?? AuditService.GENESIS_HASH;

        // 3. Compute hash
        const now = new Date();
        const entryHash = computeEntryHash({
          ...params,
          createdAt: now,
          prevHash,
        });

        // 4. Insert with hash chain fields
        await manager.query(
          `INSERT INTO audit_log
             (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at, prev_hash, entry_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            params.tenantId,
            params.userId ?? null,
            params.action,
            params.entityType ?? null,
            params.entityId ?? null,
            params.metadata ? JSON.stringify(params.metadata) : null,
            now,
            prevHash,
            entryHash,
          ],
        );
      });
    } catch (err) {
      // Audit log failure NEVER propagates to the caller — fire-and-forget semantic.
      // The primary business action (policy activation, payment, etc.) must not be
      // rolled back because of an audit write failure.
      this.logger.error(
        `audit_log write failed: action=${params.action} tenant=${params.tenantId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async verifyChain(tenantId: string): Promise<AuditChainVerificationResult> {
    const entries = await this.dataSource.query<
      Array<{
        id: string;
        tenant_id: string;
        user_id: string | null;
        action: string;
        entity_type: string | null;
        entity_id: string | null;
        metadata: Record<string, unknown> | null;
        created_at: Date;
        prev_hash: string | null;
        entry_hash: string | null;
      }>
    >(
      `SELECT id, tenant_id, user_id, action, entity_type, entity_id,
              metadata, created_at, prev_hash, entry_hash
       FROM audit_log
       WHERE tenant_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT 50000`,
      [tenantId],
    );

    const chainedEntries = entries.filter((e) => e.entry_hash !== null);
    const unchainedEntries = entries.filter((e) => e.entry_hash === null);

    let valid = true;
    let brokenAt: string | undefined;
    let expectedPrevHash = AuditService.GENESIS_HASH;

    for (const entry of chainedEntries) {
      const expectedHash = computeEntryHash({
        tenantId: entry.tenant_id,
        userId: entry.user_id,
        action: entry.action,
        entityType: entry.entity_type,
        entityId: entry.entity_id,
        metadata: entry.metadata,
        createdAt: new Date(entry.created_at),
        prevHash: entry.prev_hash ?? AuditService.GENESIS_HASH,
      });

      if (
        entry.prev_hash !== expectedPrevHash ||
        entry.entry_hash !== expectedHash
      ) {
        valid = false;
        brokenAt = new Date(entry.created_at).toISOString();
        break;
      }
      expectedPrevHash = entry.entry_hash!;
    }

    return {
      valid,
      chainedEntries: chainedEntries.length,
      unchainedEntries: unchainedEntries.length,
      brokenAt,
      checkedAt: new Date().toISOString(),
    };
  }
}
