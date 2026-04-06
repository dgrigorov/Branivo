import { AuditService } from './audit.service';
import { computeEntryHash } from './audit-hash.util';

describe('AuditService', () => {
  let service: AuditService;
  let mockManagerQuery: jest.Mock;
  let mockDataSourceQuery: jest.Mock;

  beforeEach(() => {
    mockManagerQuery = jest.fn().mockResolvedValue([]);
    mockDataSourceQuery = jest.fn().mockResolvedValue([]);

    const dataSource = {
      query: mockDataSourceQuery,
      transaction: jest
        .fn()
        .mockImplementation(
          async (cb: (manager: { query: jest.Mock }) => Promise<void>) => {
            await cb({ query: mockManagerQuery });
          },
        ),
    };

    service = new AuditService(dataSource as never);
  });

  describe('log()', () => {
    it('genesis hash — записва prev_hash = 64 нули при липса на предишен запис', async () => {
      // SELECT returns no previous entry
      mockManagerQuery
        .mockResolvedValueOnce([]) // pg_advisory_xact_lock
        .mockResolvedValueOnce([]) // SELECT entry_hash ... LIMIT 1 → empty
        .mockResolvedValueOnce([]); // INSERT

      await service.log({
        tenantId: 'tenant-uuid',
        action: 'test.action',
      });

      const insertCall = mockManagerQuery.mock.calls[2] as [string, unknown[]];
      expect(insertCall[0]).toContain('INSERT INTO audit_log');
      // prev_hash should be GENESIS_HASH (64 zeros) at index 7 (0-based)
      expect(insertCall[1][7]).toBe(AuditService.GENESIS_HASH);
    });

    it('prev_hash = entry_hash на предишния запис при съществуващ запис', async () => {
      const existingHash = 'a'.repeat(64);
      mockManagerQuery
        .mockResolvedValueOnce([]) // advisory lock
        .mockResolvedValueOnce([{ entry_hash: existingHash }]) // SELECT → has previous
        .mockResolvedValueOnce([]); // INSERT

      await service.log({
        tenantId: 'tenant-uuid',
        action: 'test.action',
      });

      const insertCall = mockManagerQuery.mock.calls[2] as [string, unknown[]];
      expect(insertCall[1][7]).toBe(existingHash); // prev_hash = last entry_hash
    });

    it('advisory lock се взема преди SELECT на предишния запис', async () => {
      mockManagerQuery.mockResolvedValue([]);

      await service.log({ tenantId: 'tenant-uuid', action: 'test.action' });

      const firstCall = mockManagerQuery.mock.calls[0] as [string, unknown[]];
      expect(firstCall[0]).toContain('pg_advisory_xact_lock');

      const secondCall = mockManagerQuery.mock.calls[1] as [string, unknown[]];
      expect(secondCall[0]).toContain('SELECT entry_hash');
    });

    it('НЕ хвърля грешка при DB failure — fire-and-forget', async () => {
      mockManagerQuery
        .mockResolvedValueOnce([]) // advisory lock
        .mockRejectedValueOnce(new Error('DB error')); // SELECT fails

      await expect(
        service.log({ tenantId: 'tenant-uuid', action: 'test.action' }),
      ).resolves.toBeUndefined();
    });

    it('последователни writes за един тенант изграждат верифицируема верига', async () => {
      const writes: Array<{ prevHash: string; entryHash: string }> = [];

      mockManagerQuery.mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve([]);
        if (sql.includes('SELECT entry_hash')) {
          const last = writes[writes.length - 1];
          return Promise.resolve(last ? [{ entry_hash: last.entryHash }] : []);
        }
        if (sql.includes('INSERT INTO audit_log')) {
          const insertParams = params;
          writes.push({
            prevHash: insertParams[7] as string,
            entryHash: insertParams[8] as string,
          });
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      await service.log({ tenantId: 't1', action: 'action.1' });
      await service.log({ tenantId: 't1', action: 'action.2' });
      await service.log({ tenantId: 't1', action: 'action.3' });

      expect(writes).toHaveLength(3);
      // First entry has genesis hash
      expect(writes[0].prevHash).toBe(AuditService.GENESIS_HASH);
      // Each subsequent entry's prevHash equals the previous entry's entryHash
      expect(writes[1].prevHash).toBe(writes[0].entryHash);
      expect(writes[2].prevHash).toBe(writes[1].entryHash);
    });

    it('writes за два тенанти са независими (отделни вериги)', async () => {
      const hashesForA: string[] = [];
      const hashesForB: string[] = [];

      mockManagerQuery.mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve([]);
        if (sql.includes('SELECT entry_hash')) {
          const tenantId = params[0] as string;
          const last =
            tenantId === 'tenant-a'
              ? hashesForA[hashesForA.length - 1]
              : hashesForB[hashesForB.length - 1];
          return Promise.resolve(last ? [{ entry_hash: last }] : []);
        }
        if (sql.includes('INSERT INTO audit_log')) {
          const insertParams = params;
          const tenantId = insertParams[0] as string;
          const entryHash = insertParams[8] as string;
          if (tenantId === 'tenant-a') hashesForA.push(entryHash);
          else hashesForB.push(entryHash);
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      await service.log({ tenantId: 'tenant-a', action: 'a.action' });
      await service.log({ tenantId: 'tenant-b', action: 'b.action' });
      await service.log({ tenantId: 'tenant-a', action: 'a.action.2' });

      expect(hashesForA).toHaveLength(2);
      expect(hashesForB).toHaveLength(1);
      // Chains are independent — tenant B's hash has no relation to tenant A's
      expect(hashesForA[0]).not.toBe(hashesForB[0]);
    });
  });

  describe('verifyChain()', () => {
    it('valid: true при непроменена верига от 3 записа', async () => {
      const tenantId = 'tenant-verify';
      // Build a real 3-entry chain
      const now1 = new Date('2026-04-06T10:00:00.000Z');
      const now2 = new Date('2026-04-06T10:00:01.000Z');
      const now3 = new Date('2026-04-06T10:00:02.000Z');

      const genesis = AuditService.GENESIS_HASH;
      const hash1 = computeEntryHash({
        tenantId,
        action: 'a1',
        createdAt: now1,
        prevHash: genesis,
      });
      const hash2 = computeEntryHash({
        tenantId,
        action: 'a2',
        createdAt: now2,
        prevHash: hash1,
      });
      const hash3 = computeEntryHash({
        tenantId,
        action: 'a3',
        createdAt: now3,
        prevHash: hash2,
      });

      const entries = [
        {
          id: '1',
          tenant_id: tenantId,
          user_id: null,
          action: 'a1',
          entity_type: null,
          entity_id: null,
          metadata: null,
          created_at: now1,
          prev_hash: genesis,
          entry_hash: hash1,
        },
        {
          id: '2',
          tenant_id: tenantId,
          user_id: null,
          action: 'a2',
          entity_type: null,
          entity_id: null,
          metadata: null,
          created_at: now2,
          prev_hash: hash1,
          entry_hash: hash2,
        },
        {
          id: '3',
          tenant_id: tenantId,
          user_id: null,
          action: 'a3',
          entity_type: null,
          entity_id: null,
          metadata: null,
          created_at: now3,
          prev_hash: hash2,
          entry_hash: hash3,
        },
      ];

      mockDataSourceQuery.mockResolvedValue(entries);

      const result = await service.verifyChain(tenantId);

      expect(result.valid).toBe(true);
      expect(result.chainedEntries).toBe(3);
      expect(result.unchainedEntries).toBe(0);
      expect(result.brokenAt).toBeUndefined();
    });

    it('valid: false при модифициран metadata в запис', async () => {
      const tenantId = 'tenant-tampered';
      const now1 = new Date('2026-04-06T10:00:00.000Z');
      const now2 = new Date('2026-04-06T10:00:01.000Z');

      const genesis = AuditService.GENESIS_HASH;
      const hash1 = computeEntryHash({
        tenantId,
        action: 'a1',
        createdAt: now1,
        prevHash: genesis,
      });
      // hash2 computed with original metadata = null
      const hash2 = computeEntryHash({
        tenantId,
        action: 'a2',
        createdAt: now2,
        prevHash: hash1,
      });

      const entries = [
        {
          id: '1',
          tenant_id: tenantId,
          user_id: null,
          action: 'a1',
          entity_type: null,
          entity_id: null,
          metadata: null,
          created_at: now1,
          prev_hash: genesis,
          entry_hash: hash1,
        },
        {
          id: '2',
          tenant_id: tenantId,
          user_id: null,
          action: 'a2',
          entity_type: null,
          entity_id: null,
          // TAMPERED: metadata was modified after insertion
          metadata: { tampered: true },
          created_at: now2,
          prev_hash: hash1,
          entry_hash: hash2, // hash still matches original (no metadata)
        },
      ];

      mockDataSourceQuery.mockResolvedValue(entries);

      const result = await service.verifyChain(tenantId);

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(now2.toISOString());
    });

    it('unchainedEntries счита коректно pre-chain записите', async () => {
      const tenantId = 'tenant-mixed';
      const entries = [
        // pre-chain entry (NULL entry_hash)
        {
          id: '1',
          tenant_id: tenantId,
          user_id: null,
          action: 'old.action',
          entity_type: null,
          entity_id: null,
          metadata: null,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          prev_hash: null,
          entry_hash: null,
        },
      ];

      mockDataSourceQuery.mockResolvedValue(entries);

      const result = await service.verifyChain(tenantId);

      expect(result.valid).toBe(true);
      expect(result.chainedEntries).toBe(0);
      expect(result.unchainedEntries).toBe(1);
    });
  });
});

describe('computeEntryHash()', () => {
  it('детерминистичен — същия вход дава същия хеш', () => {
    const params = {
      tenantId: 'tenant-uuid',
      userId: 'user-uuid',
      action: 'test.action',
      entityType: 'entity',
      entityId: 'entity-id',
      metadata: { key: 'value' },
      createdAt: new Date('2026-04-06T10:00:00.000Z'),
      prevHash: AuditService.GENESIS_HASH,
    };

    const hash1 = computeEntryHash(params);
    const hash2 = computeEntryHash(params);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('различна дата → различен хеш', () => {
    const base = {
      tenantId: 'tenant-uuid',
      action: 'test.action',
      createdAt: new Date('2026-04-06T10:00:00.000Z'),
      prevHash: AuditService.GENESIS_HASH,
    };

    const hash1 = computeEntryHash(base);
    const hash2 = computeEntryHash({
      ...base,
      createdAt: new Date('2026-04-06T10:00:01.000Z'),
    });

    expect(hash1).not.toBe(hash2);
  });

  it('различен prevHash → различен хеш (chain binding)', () => {
    const base = {
      tenantId: 'tenant-uuid',
      action: 'test.action',
      createdAt: new Date('2026-04-06T10:00:00.000Z'),
      prevHash: AuditService.GENESIS_HASH,
    };

    const hash1 = computeEntryHash(base);
    const hash2 = computeEntryHash({ ...base, prevHash: 'b'.repeat(64) });

    expect(hash1).not.toBe(hash2);
  });
});
