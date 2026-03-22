# Story 8.3: Subscription Tier Management

Status: done

## Story

As a Super Admin,
I want to upgrade or downgrade tenant subscription tiers with automatic feature enforcement,
so that tenants always have access to exactly the features included in their plan.

## Acceptance Criteria

1. **AC1 — Downgrade Preview:**
   Given Super Admin initiates a tier downgrade,
   When new tier is selected,
   Then системата изчислява diff между allowed flags на новия и стария план и показва preview на features, които ще бъдат деактивирани

2. **AC2 — Downgrade Notification:**
   Given downgrade is confirmed,
   When processed,
   Then брокерът получава actionable notification: "Вашият план се downgrade-ва на {date+7}. Features за деактивиране: {list}. Upgrade обратно →"

3. **AC3 — Grace Period Enforcement:**
   Given 7-day grace period expires,
   When enforcement runs,
   Then план-gated features се деактивират автоматично без допълнително действие от Super Admin

4. **AC4 — Audit Log:**
   Given tier change is applied,
   When saved,
   Then се логва в `audit_log` с `admin_id`, `tenant_id`, `old_tier`, `new_tier`, `affected_flags`

5. **AC5 — Immediate Upgrade:**
   Given Super Admin upgrades a tenant,
   When upgrade is applied immediately,
   Then новите feature flags са достъпни веднага — без grace period за upgrade

## Tasks / Subtasks

### Backend (branivo-api)

- [x] Task 1 — Добави `pending_downgrade` колона към `tenants` таблицата (AC: 1, 2, 3)
  - [x] 1.1 Обнови `branivo-api/src/modules/tenants/entities/tenant.entity.ts`:
    ```typescript
    @Column({ name: 'pending_downgrade', type: 'jsonb', nullable: true })
    pendingDowngrade!: PendingDowngrade | null;
    ```
    Добави type преди класа:
    ```typescript
    export interface PendingDowngrade {
      newPlan: string;
      enforceAt: string; // ISO date string
    }
    ```
  - [x] 1.2 Създай TypeORM migration:
    `branivo-api/src/infrastructure/database/migrations/<timestamp>-AddPendingDowngradeToTenants.ts`
    ```sql
    ALTER TABLE tenants ADD COLUMN pending_downgrade JSONB;
    ```
  - [x] 1.3 Не добавяй тест за entity — достатъчно е repository тестът да покрива

- [x] Task 2 — `AdminSubscriptionRepository` (AC: 1, 3, 4, 5)
  - [x] 2.1 Създай `branivo-api/src/modules/admin/repositories/admin-subscription.repository.ts`
  - [x] 2.2 Метод `findTenantById(tenantId: string): Promise<TenantRow | null>`
  - [x] 2.3 Метод `applyUpgrade(tenantId: string, newPlan: string, newFeatures: Record<string, boolean>): Promise<void>`
  - [x] 2.4 Метод `schedulePendingDowngrade(tenantId: string, pending: PendingDowngrade): Promise<void>`
  - [x] 2.5 Метод `applyPendingDowngrade(tenantId: string, newPlan: string, newFeatures: Record<string, boolean>): Promise<void>`
  - [x] 2.6 Метод `findTenantsWithDuePendingDowngrade()`
  - [x] 2.7 Метод `insertAuditLog(entry: AuditEntry): Promise<void>`
  - [x] 2.8 Метод `findBrokerAdminEmail(tenantId: string): Promise<string | null>`
  - [x] 2.9 Напиши unit тест `admin-subscription.repository.spec.ts`

- [x] Task 3 — Tier definitions и helper logic (AC: 1, 3, 5)
  - [x] 3.1 Създай `branivo-api/src/modules/admin/subscription-tiers.ts`
  - [x] 3.2 Синхронизирани с `FLAG_DEFINITIONS` в `feature-flags.service.ts`

- [x] Task 4 — DTOs (AC: 1, 2)
  - [x] 4.1 Създай `branivo-api/src/modules/admin/dto/change-tier.dto.ts`
  - [x] 4.2 Създай `branivo-api/src/modules/admin/dto/tier-change-preview-response.dto.ts`

- [x] Task 5 — `AdminSubscriptionService` (AC: 1, 2, 3, 4, 5)
  - [x] 5.1 Създай `branivo-api/src/modules/admin/admin-subscription.service.ts`
  - [x] 5.2 Constructor инжектира: `AdminSubscriptionRepository`, `EmailService`, `ConfigService`, `REDIS_CLIENT`
  - [x] 5.3 Метод `previewTierChange(tenantId, newPlan)`
  - [x] 5.4 Метод `changeTier(tenantId, newPlan, adminId)`
  - [x] 5.5 Метод `enforcePendingDowngrades()`
  - [x] 5.6 Private метод `sendDowngradeNotification(tenantId, affectedFlags, graceEndsAt)`
  - [x] 5.7 Напиши unit тест `admin-subscription.service.spec.ts`

- [x] Task 6 — Добави `sendDowngradeNotification` в `EmailService` (AC: 2)
  - [x] 6.1 Обнови `branivo-api/src/common/email/email.service.ts`

- [x] Task 7 — `AdminSubscriptionController` (AC: 1, 2, 5)
  - [x] 7.1 Създай `branivo-api/src/modules/admin/admin-subscription.controller.ts`
  - [x] 7.2 `GET /admin/tenants/:id/subscription/preview?newPlan=professional`
  - [x] 7.3 `POST /admin/tenants/:id/subscription/tier`
  - [x] 7.4 Напиши интеграционен тест `admin-subscription.controller.spec.ts`

- [x] Task 8 — `AdminSubscriptionJob` за нощна enforcement (AC: 3)
  - [x] 8.1 Създай `branivo-api/src/modules/admin/admin-subscription.job.ts`
  - [x] 8.2 `@Cron('0 1 * * *')` — всяка нощ в 01:00 UTC
  - [x] 8.3 Напиши unit тест `admin-subscription.job.spec.ts`

- [x] Task 9 — Регистрирай в `AdminModule` (AC: 1)
  - [x] 9.1 Обнови `branivo-api/src/modules/admin/admin.module.ts`

### Web (branivo-web)

- [x] Task 10 — Subscription tier секция в Tenant Detail page (AC: 1, 2, 5)
  - [x] 10.1 Обнови `TenantHealthDetailResponseDto` с `currentPlan` и `pendingDowngrade`; разшири health repository SQL
  - [x] 10.2 Добави UI секция "Абонаментен план" с plan badge и pending downgrade banner
  - [x] 10.3 Preview step с modal (upgrade/downgrade описание)
  - [x] 10.4 При потвърждение: `POST /api/v1/admin/tenants/:id/subscription/tier` + `useMutation` + `queryClient.invalidateQueries`
  - [x] 10.5 Напиши компонентен тест за subscription секцията

### Seeder (branivo-api)

- [x] Task 11 — Seed данни за subscription tier (AC: 5)
  - [x] 11.1 Обнови `branivo-api/src/infrastructure/database/seed.service.ts` — demo тенантът е на `starter` с консистентни флагове (sticker_delivery, dkp)

## Dev Notes

### Ключови файлове за четене ПРЕДИ имплементация

- `branivo-api/src/modules/tenants/entities/tenant.entity.ts` — `plan` и `features` колони (план е `string` default `'starter'`)
- `branivo-api/src/modules/tenants/feature-flags.service.ts` — `FLAG_DEFINITIONS` с plan restrictions и `SAFE_FLAG_KEYS` pattern
- `branivo-api/src/modules/admin/admin-tenants.service.ts` — `writeAuditLog()` паттерн с `dataSource.transaction()` + `SET LOCAL app.current_tenant_id`
- `branivo-api/src/modules/admin/admin-insurer-monitor.service.ts` — пример за admin service структура (story 8.2)
- `branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.ts` — пример за admin repository
- `branivo-api/src/common/email/email.service.ts` — `sendWithRetry()` паттерн за добавяне на нов email метод
- `branivo-api/src/common/helpers/redis-key.helper.ts` — `RedisKeyHelper.build(tenantId, 'config', 'tenant')` за cache invalidation
- `branivo-web/src/app/[locale]/(admin)/tenants/[id]/page.tsx` — съществуващата страница, която трябва да бъде разширена

### Plan Tier Definitions (пълна схема)

```typescript
// Тези стойности трябва да са консистентни с FLAG_DEFINITIONS в feature-flags.service.ts
const PLAN_TIERS = {
  starter:      { monthlyFee: 49,  allowedFlags: ['sticker_delivery', 'dkp', 'renewal_sms', 'renewal_push'] },
  professional: { monthlyFee: 149, allowedFlags: ['fleet', 'kasko', 'api_access', 'sticker_delivery', 'dkp', 'renewal_sms', 'renewal_push'] },
  enterprise:   { monthlyFee: 299, allowedFlags: ['fleet', 'kasko', 'api_access', 'sticker_delivery', 'dkp', 'renewal_sms', 'renewal_push'] },
};
```

### Upgrade vs Downgrade логика

- **Upgrade** (monthlyFee на новия > monthlyFee на стария): незабавно → UPDATE plan + features + clear pending_downgrade + Redis cache invalidation
- **Downgrade** (monthlyFee на новия < monthlyFee на стария): grace period 7 дни → UPDATE pending_downgrade (НЕ features) + email notification + audit log
- **Same tier**: `BadRequestException('Tenant is already on this plan')`

### Redis Cache Invalidation Pattern (от FeatureFlagsService)

```typescript
// Инвалидирай само при upgrade (features веднага се менят)
// При downgrade — features остават непроменени до enforceAt
await this.redis.del(RedisKeyHelper.build(tenantId, 'config', 'tenant'));
```

### Audit Log Pattern (от admin-tenants.service.ts)

```typescript
// ЗАДЪЛЖИТЕЛНО: dataSource.transaction() + SET LOCAL за RLS
await this.dataSource.transaction(async (manager) => {
  await manager.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
  await manager.query(
    `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [tenantId, adminId, 'subscription.tier_changed', 'tenant', tenantId,
     JSON.stringify({ old_tier, new_tier, affected_flags, is_upgrade })],
  );
});
```

### Super Admin Context — Tenant Queries

В Super Admin контекст (admin модул) `TenantContext.getTenantId()` НЕ се използва. Tenant ID идва от URL параметър (`@Param('id', ParseUUIDPipe)`). Всички DB заявки в `AdminSubscriptionRepository` са явно по `tenantId` от параметъра — без `TenantContext`.

### TypeScript — Забранен `any` тип

- `pendingDowngrade` в entity е `PendingDowngrade | null` — НЕ `Record<string, unknown>`
- `features` е `Record<string, boolean>` — не `any`
- При `Object.entries(features)`: типизирай като `([flag, enabled]: [string, boolean]) => ...`

### Cron Job Pattern (от story 8.2)

```typescript
// admin-subscription.job.ts
@Injectable()
export class AdminSubscriptionJob {
  constructor(private readonly adminSubscriptionService: AdminSubscriptionService) {}

  @Cron('0 1 * * *') // 01:00 UTC всяка нощ
  async handlePendingDowngrades(): Promise<void> {
    await this.adminSubscriptionService.enforcePendingDowngrades();
  }
}
```

### Project Structure Notes

- Alignment с утвърдения admin module pattern:
  - `admin/admin-subscription.service.ts` ← аналог на `admin-insurer-monitor.service.ts`
  - `admin/admin-subscription.controller.ts` ← аналог на `admin-insurer-monitor.controller.ts`
  - `admin/admin-subscription.job.ts` ← аналог на `admin-insurer-monitor.job.ts`
  - `admin/repositories/admin-subscription.repository.ts` ← аналог на `admin-insurer-monitor.repository.ts`
  - `admin/dto/change-tier.dto.ts`
  - `admin/dto/tier-change-preview-response.dto.ts`
  - `admin/subscription-tiers.ts` ← нов helper файл (чист, без NestJS зависимости)
- Migration файлът следва pattern `<timestamp>-AddPendingDowngradeToTenants.ts`

### References

- Tenant entity: `branivo-api/src/modules/tenants/entities/tenant.entity.ts`
- FeatureFlagsService (FLAG_DEFINITIONS): `branivo-api/src/modules/tenants/feature-flags.service.ts`
- Audit log pattern: `branivo-api/src/modules/admin/admin-tenants.service.ts#writeAuditLog`
- Redis invalidation: `branivo-api/src/modules/tenants/feature-flags.service.ts#updateFeatureFlags`
- Admin module: `branivo-api/src/modules/admin/admin.module.ts`
- Email service: `branivo-api/src/common/email/email.service.ts`
- Story 8.2 (паттерн): `_bmad-output/implementation-artifacts/8-2-insurer-api-monitoring-manual-fallback.md`
- Epics file: `_bmad-output/planning-artifacts/epics.md#Story-8.3`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed: `computeDowngradedFlags` used incorrect variable name (`_key` instead of `flag`) — corrected in `subscription-tiers.ts`
- Fixed: Repository spec test asserted `secondCall[0]` (SQL string) for action value instead of `secondCall[1]` (params array)
- Fixed: Web test ambiguous `getByText(/Starter/)` matched both banner and dropdown option — changed to `getAllByText`
- Fixed: Lint error `Unsafe assignment` for `expect.objectContaining()` in service spec — added `as Record<string, unknown>` cast
- Fixed: Lint errors `Unsafe member access [0]` in repository spec — assigned `.calls[0] as [string, unknown[]]` to typed variable

### Completion Notes List

- **Task 1**: Added `PendingDowngrade` interface and `pendingDowngrade` JSONB column to `tenant.entity.ts`; created migration `1710000030000-AddPendingDowngradeToTenants.ts`
- **Task 2**: Created `AdminSubscriptionRepository` with 7 methods + 12-test spec; all patterns follow existing admin repository conventions
- **Task 3**: Created `subscription-tiers.ts` with `PLAN_TIERS`, `computeDowngradedFlags`, `buildFeaturesForPlan` — consistent with `FLAG_DEFINITIONS` in `feature-flags.service.ts`
- **Task 4**: Created `ChangeTierDto` (with `@IsIn` validation) and `TierChangePreviewResponseDto`
- **Task 5**: Created `AdminSubscriptionService` covering upgrade/downgrade/enforce flows; 13-test spec with full coverage
- **Task 6**: Added `sendDowngradeNotification` to `EmailService` using existing `sendWithRetry` pattern
- **Task 7**: Created `AdminSubscriptionController` with GET preview + POST tier endpoints; 11-test integration spec with auth/403/400/404 cases
- **Task 8**: Created `AdminSubscriptionJob` with `@Cron('0 1 * * *')` pattern; 3-test spec
- **Task 9**: Registered `AdminSubscriptionRepository`, `AdminSubscriptionService`, `AdminSubscriptionJob`, `AdminSubscriptionController` in `AdminModule`; `RedisModule` is `@Global()` — no import needed
- **Task 10**: Extended `TenantHealthDetailResponseDto` and health repository SQL to include `currentPlan` and `pendingDowngrade`; added full subscription UI section with plan badge, pending downgrade banner, plan selector, preview modal, and useMutation for tier changes; 10-test web spec
- **Task 11**: Fixed demo tenant seed — removed `fleet: true` (not allowed on starter plan); now seeded with `sticker_delivery: true, dkp: true`

**Test results**: API 693 tests passed (82 suites); Web 223 tests passed (36 suites). All lint, TypeScript, and build checks pass.

### File List

branivo-api/src/modules/tenants/entities/tenant.entity.ts
branivo-api/src/infrastructure/database/migrations/1710000030000-AddPendingDowngradeToTenants.ts
branivo-api/src/modules/admin/repositories/admin-subscription.repository.ts
branivo-api/src/modules/admin/repositories/admin-subscription.repository.spec.ts
branivo-api/src/modules/admin/subscription-tiers.ts
branivo-api/src/modules/admin/dto/change-tier.dto.ts
branivo-api/src/modules/admin/dto/tier-change-preview-response.dto.ts
branivo-api/src/modules/admin/admin-subscription.service.ts
branivo-api/src/modules/admin/admin-subscription.service.spec.ts
branivo-api/src/modules/admin/admin-subscription.controller.ts
branivo-api/src/modules/admin/admin-subscription.controller.spec.ts
branivo-api/src/modules/admin/admin-subscription.job.ts
branivo-api/src/modules/admin/admin-subscription.job.spec.ts
branivo-api/src/modules/admin/admin.module.ts
branivo-api/src/common/email/email.service.ts
branivo-api/src/modules/admin/repositories/admin-health.repository.ts
branivo-api/src/modules/admin/dto/tenant-health-detail-response.dto.ts
branivo-api/src/infrastructure/database/seed.service.ts
branivo-web/src/app/[locale]/(admin)/tenants/[id]/page.tsx
branivo-web/src/__tests__/admin/TenantSubscriptionSection.test.tsx
_bmad-output/implementation-artifacts/sprint-status.yaml
_bmad-output/implementation-artifacts/8-3-subscription-tier-management.md

## Change Log

- 2026-03-22: Story 8.3 implemented — Subscription Tier Management with upgrade/downgrade flows, grace period enforcement, audit logging, email notifications, and Super Admin web UI
- 2026-03-22: Code review fixes — added `from` field to downgrade email, per-tenant error handling in enforce loop, removed unused ConfigService injection, fixed audit log atomicity (runs before Redis/email), try/catch in cron handler, extracted private helpers to eliminate duplication, fixed admin-health.controller.spec.ts TypeScript error
