# Story 11.4: Tamper-Evident Audit Log

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Platform (и Compliance Officer),
I want audit_log записите да са tamper-evident чрез SHA-256 hash chain (всеки запис съдържа хеша на предишния),
so that Branivo може да докаже пред КФН одиторите, че audit trail-ът е непроменен след записването му — никой (включително DB администратор) не може да редактира или изтрие запис без нарушаване на веригата.

## Acceptance Criteria

### AC1 — `audit_log` таблицата има нови hash-chain колони

**Given** миграцията `1710000064000-AddHashChainToAuditLog.ts` е изпълнена,
**When** `audit_log` таблицата се провери,
**Then** съдържа две нови колони: `prev_hash VARCHAR(64) NULL` (SHA-256 хеш на предишния запис за тенанта) и `entry_hash VARCHAR(64) NULL` (SHA-256 хеш на текущия запис включително `prev_hash`); съществуващите редове имат `NULL` в двете колони (pre-chain записи); нов index `idx_audit_log_chain_lookup` на `(tenant_id, created_at DESC, id DESC)` за ефективно намиране на последния запис по верига.

### AC2 — `AuditService.log()` записва с hash chain

**Given** `AuditService.log({ tenantId, action, userId?, entityType?, entityId?, metadata? })` се извика,
**When** методът се изпълни,
**Then** в рамките на ЕДНА PostgreSQL транзакция:
  1. Взема advisory lock `pg_advisory_xact_lock(hashtext(tenantId))` за сериализиране на writes за тенанта
  2. Зарежда `entry_hash` на последния запис за тенанта (`WHERE tenant_id = $1 AND entry_hash IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1`)
  3. `prevHash` = намереният `entry_hash` ИЛИ `'0'.repeat(64)` (genesis hash ако няма предишен hash-chain запис)
  4. `now` = `new Date()` (записва се с микросекунди)
  5. `entryHash` = `SHA-256(tenantId + "|" + (userId ?? "") + "|" + action + "|" + (entityType ?? "") + "|" + (entityId ?? "") + "|" + JSON.stringify(metadata ?? {}) + "|" + now.toISOString() + "|" + prevHash)` с Node.js `crypto.createHash('sha256')`
  6. INSERT в `audit_log` с `prev_hash = prevHash` и `entry_hash = entryHash`; транзакцията се commit-ва атомарно.

### AC3 — hash chain е верифицируема

**Given** Super Admin прави `GET /api/v1/admin/audit-log/verify-chain?tenantId=xxx`,
**When** заявката се обработи,
**Then** се зареждат всички записи за тенанта с `entry_hash IS NOT NULL`, наредени `created_at ASC, id ASC`; за всеки запис се преизчислява `expectedHash` от съдържанието му и `prev_hash`; ако `expectedHash === record.entry_hash` — верига е валидна; отговорът: `{ valid: boolean, chainedEntries: number, unchainedEntries: number, brokenAt?: string (ISO timestamp на първия невалиден запис), checkedAt: string (ISO) }`.

### AC4 — genesis hash е коректен

**Given** първият hash-chain запис за тенанта (т.е. предишен hash-chain запис не съществува),
**When** `AuditService.log()` се извика,
**Then** `prev_hash` се записва като точно 64 нули: `'0000000000000000000000000000000000000000000000000000000000000000'`; верификацията разпознава това като валидно начало на веригата.

### AC5 — AuditService е injectable навсякъде

**Given** `AuditModule` е `@Global()` и регистриран в `AppModule`,
**When** всеки друг NestJS service inject-ва `AuditService`,
**Then** работи без допълнителни module imports; `AppModule` импортира `AuditModule` ≤ 1 път.

### AC6 — Всички съществуващи audit_log writes са мигрирани към AuditService

**Given** следните 10 файла правят директен `INSERT INTO audit_log`:
  - `modules/commissions/commissions.service.ts`
  - `modules/clients/clients.service.ts`
  - `modules/payments/stripe-webhook.service.ts`
  - `modules/quotes/scoring/scoring.service.ts`
  - `modules/admin/repositories/admin-subscription.repository.ts`
  - `modules/admin/repositories/admin-insurer-monitor.repository.ts`
  - `modules/admin/admin-tenants.service.ts`
  - `modules/tenants/feature-flags.service.ts`
  - `modules/compliance/privacy-policy.service.ts`
  - `modules/notifications/notifications.service.ts`

**When** горните файлове се провери след тази story,
**Then** **нито един от тях** не съдържа директен SQL `INSERT INTO audit_log`; всички са заменени с `this.auditService.log({ tenantId, action, ... })`; hash chain-ът е непрекъснат от датата на migration.

### AC7 — Конкурентни writes за различни тенанти не се блокират взаимно

**Given** два едновременни `AuditService.log()` извиквания — едно за тенант A, едно за тенант B,
**When** и двете се изпълняват паралелно,
**Then** нито едното не блокира другото; advisory lock е per-tenant (`hashtext(tenantId)`) — само writes за ЕДИН и СЪЩ тенант се сериализират.

### AC8 — Конкурентни writes за ЕДИН тенант се сериализират коректно

**Given** 5 едновременни `AuditService.log()` извиквания за един и същ тенант (race condition тест),
**When** всички приключат,
**Then** всичките 5 записа са в `audit_log`; `verifyChain` върща `{ valid: true, chainedEntries: 5 }`; hash веригата е непрекъсната.

### AC9 — scoring.service.ts записва в `audit_log` (не `audit_logs`)

**Given** `scoring.service.ts` в момента пише в `audit_logs` (с грешно "s") — вижте реда с `INSERT INTO audit_logs`,
**When** миграцията към AuditService е завършена,
**Then** записите отиват в правилната таблица `audit_log` (единствено число); стар грешен INSERT е премахнат; ако таблица `audit_logs` съществува — НЕ се трие (безопасно да остане).

### AC10 — Unit тестове покриват AuditService логиката

**Given** `AuditService` е имплементиран,
**When** `npm run test:cov` се изпълни,
**Then** следните случаи са покрити: `log()` → genesis hash при липса на предишен запис; `log()` → `prev_hash` = `entry_hash` на предишния запис; `log()` → последователни writes за един тенант → верифицируема верига; `log()` → writes за два тенанта → независими вериги; `verifyChain()` → valid при непроменена верига; `verifyChain()` → invalid при ръчно променен `metadata` в запис.

### AC11 — Lint, build и тестове минават без грешки

**Given** имплементацията е завършена,
**When** се изпълни `npm run lint && npm run test:cov && npm run build`,
**Then** 0 lint errors, 0 warnings; всички тестове минават; build успешен.

---

## Tasks / Subtasks

- [x] **Task 1: DB Migration — добави hash-chain колони към `audit_log`** (AC1)
  - [x] 1.1 Създай `branivo-api/src/infrastructure/database/migrations/1710000064000-AddHashChainToAuditLog.ts`
  - [x] 1.2 `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "prev_hash" VARCHAR(64) NULL`
  - [x] 1.3 `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "entry_hash" VARCHAR(64) NULL`
  - [x] 1.4 `CREATE INDEX IF NOT EXISTS "idx_audit_log_chain_lookup" ON "audit_log"("tenant_id", "created_at" DESC, "id" DESC)`
  - [x] 1.5 `down()` метод: `ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "prev_hash"` + `DROP COLUMN IF EXISTS "entry_hash"` + `DROP INDEX IF EXISTS idx_audit_log_chain_lookup`

- [x] **Task 2: AuditService** (AC2, AC4, AC7, AC8)
  - [x] 2.1 Създай `branivo-api/src/common/audit/audit.service.ts`
  - [x] 2.2 Constructor: `constructor(private readonly dataSource: DataSource) {}`
  - [x] 2.3 Метод `async log(params: AuditLogParams): Promise<void>` — изпълни в `dataSource.transaction(async (manager) => { ... })`:
    - [x] 2.3a `await manager.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [tenantId])` — per-tenant serial lock
    - [x] 2.3b `const lastEntry = await manager.query<{ entry_hash: string }[]>('SELECT entry_hash FROM audit_log WHERE tenant_id = $1 AND entry_hash IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1', [tenantId])`
    - [x] 2.3c `const prevHash = lastEntry[0]?.entry_hash ?? '0'.repeat(64)`
    - [x] 2.3d `const now = new Date()`
    - [x] 2.3e `const entryHash = computeEntryHash({ ...params, createdAt: now, prevHash })` — util функция (виж Task 3)
    - [x] 2.3f INSERT в audit_log с всички полета включително `prev_hash` и `entry_hash`
  - [x] 2.4 Метод `async verifyChain(tenantId: string): Promise<AuditChainVerificationResult>` — зарежда всички chained entries; traverse; recompute; compare

- [x] **Task 3: Hash computation utility** (AC2, AC4)
  - [x] 3.1 Създай `branivo-api/src/common/audit/audit-hash.util.ts`
  - [x] 3.2 `import { createHash } from 'crypto'` — Node.js built-in, без нов npm пакет
  - [x] 3.3 `export function computeEntryHash(params: { tenantId, userId?, action, entityType?, entityId?, metadata?, createdAt: Date, prevHash: string }): string`:
    ```
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
    ```
  - [x] 3.4 Изнеси `AuditLogParams` interface: `{ tenantId: string; userId?: string | null; action: string; entityType?: string | null; entityId?: string | null; metadata?: Record<string, unknown> | null }`
  - [x] 3.5 Изнеси `AuditChainVerificationResult` interface: `{ valid: boolean; chainedEntries: number; unchainedEntries: number; brokenAt?: string; checkedAt: string }`

- [x] **Task 4: AuditModule (global)** (AC5)
  - [x] 4.1 Създай `branivo-api/src/common/audit/audit.module.ts`
  - [x] 4.2 `@Global() @Module({ providers: [AuditService], exports: [AuditService] })`
  - [x] 4.3 В `AppModule` imports масива — добави `AuditModule` (след `TenantContextModule`)

- [x] **Task 5: Super Admin verification endpoint** (AC3)
  - [x] 5.1 Добави ендпоинт в съществуващия admin controller (провери `branivo-api/src/modules/admin/` за подходящия файл — вероятно `admin-tenants.service.ts` / `admin.controller.ts`)
  - [x] 5.2 `GET /api/v1/admin/audit-log/verify-chain` — query param `tenantId: string` (IsUUID)
  - [x] 5.3 `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('super_admin')` — само Super Admin
  - [x] 5.4 Извиква `auditService.verifyChain(tenantId)`; връща `AuditChainVerificationResult`

- [x] **Task 6: Мигрирай всички съществуващи audit_log writes** (AC6, AC9)

  **ВНИМАНИЕ:** Тези са текущите места с директен INSERT — заменяй един по един и стартирай тестовете след всяка промяна:

  - [x] 6.1 `modules/compliance/privacy-policy.service.ts` → inject `AuditService`; замени `dataSource.query('INSERT INTO audit_log...')` с `await this.auditService.log({ tenantId, userId, action: 'privacy_policy.published', entityType: 'tenant_privacy_policy', entityId: policy.id, metadata: { version: policy.version, language: policy.language } })`
  - [x] 6.2 `modules/commissions/commissions.service.ts` → inject `AuditService`; замени директния INSERT
  - [x] 6.3 `modules/clients/clients.service.ts` → inject `AuditService`; замени директния INSERT
  - [x] 6.4 `modules/payments/stripe-webhook.service.ts` → inject `AuditService`; замени директния INSERT
  - [x] 6.5 `modules/quotes/scoring/scoring.service.ts` → inject `AuditService`; замени INSERT (`audit_logs` с грешно "s" → правилния `audit_log` чрез AuditService)
  - [x] 6.6 `modules/admin/repositories/admin-subscription.repository.ts` → inject `AuditService`; замени директния INSERT
  - [x] 6.7 `modules/admin/repositories/admin-insurer-monitor.repository.ts` → inject `AuditService`; замени **двата** INSERT-а в този файл
  - [x] 6.8 `modules/admin/admin-tenants.service.ts` → inject `AuditService`; замени директния INSERT
  - [x] 6.9 `modules/tenants/feature-flags.service.ts` → inject `AuditService`; замени директния INSERT
  - [x] 6.10 `modules/notifications/notifications.service.ts` → inject `AuditService`; замени директния INSERT
  - [x] 6.11 След всяка замяна — стартирай тестовете за конкретния модул: `npm run test -- --testPathPattern=<module>`

- [x] **Task 7: Unit тестове за AuditService** (AC10)
  - [x] 7.1 Създай `branivo-api/src/common/audit/audit.service.spec.ts`
  - [x] 7.2 Mock `DataSource` с `createMock<DataSource>()` (от `@golevelup/ts-jest` ако е достъпно, или ръчен mock)
  - [x] 7.3 Тест: `log()` → genesis hash при `entry_hash IS NULL` result
  - [x] 7.4 Тест: `log()` → `prev_hash` = последния `entry_hash` при съществуващ запис
  - [x] 7.5 Тест: `log()` → advisory lock се взема преди SELECT
  - [x] 7.6 Тест: `verifyChain()` → `{ valid: true }` при правилна верига (3 записа)
  - [x] 7.7 Тест: `verifyChain()` → `{ valid: false, brokenAt: <iso> }` при модифициран metadata
  - [x] 7.8 Unit тест за `computeEntryHash()` — детерминизъм (същия вход → същия хеш); различна дата → различен хеш

- [x] **Task 8: Обнови spec файловете за мигрираните services** (AC6)
  - [x] 8.1 Всеки mocked `dataSource.query` за audit_log INSERT → замени с mock на `AuditService.log`
  - [x] 8.2 Провери че `AuditService` е добавен в `providers` масива на тест модулите
  - [x] 8.3 `npm run test:cov` трябва да мине без грешки

---

## Dev Notes

### Архитектурни изисквания (ЗАДЪЛЖИТЕЛНО)

- `audit_log` е IMMUTABLE — само INSERT, **НИКОГА** UPDATE или DELETE — enforcement остава в Repository layer и в архитектурната документация
- **НИКОГА** не правиш DB заявка без `tenant_id` scope в AuditService — всеки `log()` call задължително приема `tenantId`
- Advisory lock е per-tenant: `pg_advisory_xact_lock(hashtext(tenantId::text))` — сериализира само едновременни writes за **един** тенант, не за всички
- `computeEntryHash` е **чиста функция** — детерминирана, без external зависимости — тества се лесно в изолация
- SHA-256 чрез `import { createHash } from 'crypto'` — Node.js built-in, **без нов npm пакет**
- `AuditModule` е `@Global()` — не добавяй `AuditModule` в imports на отделни модули (само в `AppModule`)

### Структура на новите файлове

```
branivo-api/src/
├── common/
│   └── audit/
│       ├── audit.module.ts          ← нов (@Global)
│       ├── audit.service.ts         ← нов (log + verifyChain)
│       ├── audit.service.spec.ts    ← нов
│       ├── audit-hash.util.ts       ← нов (computeEntryHash, interfaces)
│       └── index.ts                 ← нов (re-exports)
└── infrastructure/database/migrations/
    └── 1710000064000-AddHashChainToAuditLog.ts  ← нов
```

### Injection pattern в съществуващи services

```typescript
// ПРЕДИ (директен SQL):
constructor(
  private readonly dataSource: DataSource,
) {}

await this.dataSource.query(
  `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [tenantId, userId, 'action.name', 'EntityType', entityId, JSON.stringify(metadata)],
);

// СЛЕД (чрез AuditService):
constructor(
  private readonly dataSource: DataSource,  // ← остава ако се използва и за друго
  private readonly auditService: AuditService,  // ← добавено
) {}

await this.auditService.log({
  tenantId,
  userId,
  action: 'action.name',
  entityType: 'EntityType',
  entityId,
  metadata: { /* typed object */ },
});
```

### AuditService transaction pattern

```typescript
// branivo-api/src/common/audit/audit.service.ts
import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLogParams, AuditChainVerificationResult } from './audit-hash.util';
import { computeEntryHash } from './audit-hash.util';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private static readonly GENESIS_HASH = '0'.repeat(64);

  constructor(private readonly dataSource: DataSource) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        // 1. Per-tenant advisory lock for serial writes
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtext($1::text))`,
          [params.tenantId],
        );

        // 2. Get previous entry_hash for this tenant
        const lastEntries = await manager.query<Array<{ entry_hash: string }>>(
          `SELECT entry_hash FROM audit_log
           WHERE tenant_id = $1 AND entry_hash IS NOT NULL
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [params.tenantId],
        );
        const prevHash = lastEntries[0]?.entry_hash ?? AuditService.GENESIS_HASH;

        // 3. Compute hash
        const now = new Date();
        const entryHash = computeEntryHash({ ...params, createdAt: now, prevHash });

        // 4. Insert with hash chain
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
      // NEVER let audit_log failure propagate to caller (fire-and-forget for caller)
      this.logger.error(
        `audit_log write failed: action=${params.action} tenant=${params.tenantId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
```

**КРИТИЧНО:** `try/catch` около транзакцията означава, че ако audit_log запис fail-не, основното действие (policy publish, payment, etc.) НЕ се rollback-ва — audit е separate concern. Следвай съществуващия pattern от `privacy-policy.service.ts` (там също има try/catch).

### scoring.service.ts — специален случай (AC9)

```typescript
// ПРЕДИ (грешно — пише в audit_logs, не audit_log):
await this.dataSource.query(
  `INSERT INTO audit_logs (id, tenant_id, ...)`,  // ← грешна таблица!
  ...
);

// СЛЕД (правилно — чрез AuditService):
await this.auditService.log({
  tenantId: params.tenantId,
  action: 'quote.scored',
  entityType: 'quote',
  entityId: params.quoteId,
  metadata: {
    inputs: params.inputs,
    weights: { price: 0.40, rating: 0.30, claimSpeed: 0.20, extras: 0.10 },
    score: params.score,
    isRecommended: params.isRecommended,
  },
});
```

### admin-insurer-monitor.repository.ts — 2 INSERT-а (AC6.7)

Внимавай — в `admin-insurer-monitor.repository.ts` има **ДВА** директни INSERT. Замени и двата.

### verifyChain() — реализация

```typescript
async verifyChain(tenantId: string): Promise<AuditChainVerificationResult> {
  const entries = await this.dataSource.query<Array<{
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
  }>>(
    `SELECT id, tenant_id, user_id, action, entity_type, entity_id, metadata, created_at, prev_hash, entry_hash
     FROM audit_log
     WHERE tenant_id = $1
     ORDER BY created_at ASC, id ASC`,
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

    if (entry.prev_hash !== expectedPrevHash || entry.entry_hash !== expectedHash) {
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
```

### TypeScript — Забранен `any` тип

```typescript
// ГРЕШНО:
const lastEntries: any = await manager.query(...);

// ПРАВИЛНО:
const lastEntries = await manager.query<Array<{ entry_hash: string }>>(
  `SELECT entry_hash FROM audit_log WHERE ...`,
  [tenantId],
);
const prevHash = lastEntries[0]?.entry_hash ?? AuditService.GENESIS_HASH;
```

За query резултати в `verifyChain` — дефинирай inline interface или отделен type.

### Test mock pattern за AuditService

```typescript
// В spec файловете на мигрираните services:
const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
  verifyChain: jest.fn(),
} as unknown as AuditService;

// В TestingModule:
{ provide: AuditService, useValue: mockAuditService }
```

### Предишни story learnings (Epic 11)

От Story 11-11 (Privacy Policy — review):
- Audit log write pattern: `try { await this.dataSource.query('INSERT INTO audit_log...') } catch (err) { this.logger.error(...) }` — fail тихо, не спира основния flow
- `TenantContext.getTenantId()` — НИКОГА tenantId като параметър

Важна корекция за **тази story**: AuditService вече **не използва** `TenantContext` вътрешно — tenantId се подава като параметър (`params.tenantId`). Причина: `AuditService` се инжектира в services, WHERE `TenantContext` понякога не е наличен (admin repositories, cron jobs). Подаването като параметър е правилно за AuditService.

### Project Structure Notes

- `common/audit/` е правилното място — audit_log е cross-cutting concern, не compliance-specific
- Следва established pattern на `common/crypto/crypto.service.ts` за common services
- `AuditModule` ← единствен export е `AuditService`; `@Global()` означава once-registered-available-everywhere

### References

- Съществуваща audit_log migration: `branivo-api/src/infrastructure/database/migrations/1710000005000-CreateAuditLogTable.ts` [Source: codebase]
- Съществуващ crypto service (pattern): `branivo-api/src/common/crypto/crypto.service.ts` [Source: codebase]
- Tenant Context Module (@Global pattern): `branivo-api/src/common/tenant-context/tenant-context.module.ts` [Source: codebase]
- Съществуващи audit_log writes (10 файла за миграция): `grep -rn "INSERT INTO audit_log"` [Source: codebase audit]
- scoring.service.ts грешна таблица: `modules/quotes/scoring/scoring.service.ts` — `INSERT INTO audit_logs` [Source: codebase — Bug!]
- Architecture: `audit_log и policy_events: NO UPDATE, NO DELETE — ever`: `_bmad-output/planning-artifacts/architecture.md#L695` [Source: architecture]
- Architecture: `ВСЯКА write операция → audit_log entry (100% coverage — NFR24)`: `architecture.md#L697` [Source: architecture]
- КФН Scoring audit trail requirement: `architecture.md#L146` — NFR44 [Source: architecture]
- Sprint-status: story 11-4 description: "Hash-chain audit log (SHA-256 prev_hash); КФН одит изисква tamper-evidence" [Source: sprint-status.yaml]
- Node.js crypto: `createHash('sha256')` — built-in, no npm needed [Source: Node.js docs]
- PostgreSQL advisory locks: `pg_advisory_xact_lock(key bigint)` — transaction-scoped [Source: PostgreSQL docs]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List

- branivo-api/src/common/audit/audit-hash.util.ts
- branivo-api/src/common/audit/audit.module.ts
- branivo-api/src/common/audit/audit.service.ts
- branivo-api/src/common/audit/audit.service.spec.ts
- branivo-api/src/common/audit/index.ts
- branivo-api/src/infrastructure/database/migrations/1710000064000-AddHashChainToAuditLog.ts
- branivo-api/src/modules/admin/admin-audit-log.controller.ts
- branivo-api/src/modules/admin/admin-audit-log.controller.spec.ts
- branivo-api/src/modules/admin/admin-insurer-monitor.controller.spec.ts
- branivo-api/src/modules/admin/admin-tenants.service.spec.ts
- branivo-api/src/modules/admin/admin-tenants.service.ts
- branivo-api/src/modules/admin/admin.module.ts
- branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.spec.ts
- branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.ts
- branivo-api/src/modules/admin/repositories/admin-subscription.repository.spec.ts
- branivo-api/src/modules/admin/repositories/admin-subscription.repository.ts
- branivo-api/src/modules/clients/clients.service.spec.ts
- branivo-api/src/modules/clients/clients.service.ts
- branivo-api/src/modules/commissions/commissions.service.spec.ts
- branivo-api/src/modules/commissions/commissions.service.ts
- branivo-api/src/modules/compliance/cookie-policy.service.spec.ts
- branivo-api/src/modules/compliance/cookie-policy.service.ts
- branivo-api/src/modules/compliance/privacy-policy.service.spec.ts
- branivo-api/src/modules/compliance/privacy-policy.service.ts
- branivo-api/src/modules/compliance/tos.service.spec.ts
- branivo-api/src/modules/compliance/tos.service.ts
- branivo-api/src/modules/notifications/notifications.service.spec.ts
- branivo-api/src/modules/notifications/notifications.service.ts
- branivo-api/src/modules/payments/stripe-webhook.service.spec.ts
- branivo-api/src/modules/payments/stripe-webhook.service.ts
- branivo-api/src/modules/quotes/scoring/scoring.service.spec.ts
- branivo-api/src/modules/quotes/scoring/scoring.service.ts
- branivo-api/src/modules/tenants/feature-flags.service.spec.ts
- branivo-api/src/modules/tenants/feature-flags.service.ts
- branivo-api/src/app.module.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
