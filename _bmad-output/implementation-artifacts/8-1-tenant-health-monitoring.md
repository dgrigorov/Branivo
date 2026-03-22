# Story 8.1: Tenant Health Monitoring

Status: done

## Story

As a Super Admin,
I want to monitor the health and activity of all tenants on the platform,
so that I can proactively identify inactive or struggling tenants before issues escalate.

## Acceptance Criteria

1. **AC1 — Platform Health Dashboard:**
   Given Super Admin opens Platform Health Dashboard,
   When dashboard loads,
   Then виждат всички тенанти с: статус, брой полици last 30 дни, last activity timestamp, абонаментен тиер

2. **AC2 — Inactivity Alert:**
   Given a tenant has sold 0 policies for 7+ consecutive days,
   When daily health check runs,
   Then Super Admin получава алерт с tenant name и брой дни без активност

3. **AC3 — Tenant Drill-Down:**
   Given Super Admin views a specific tenant,
   When they drill down,
   Then виждат: активни потребители, revenue, брой МПС, последна полица, активни feature flags

4. **AC4 — Isolation Incident Alert:**
   Given a tenant isolation incident occurs,
   When detected,
   Then Super Admin получава алерт в < 15 мин (NFR10 MTTR target)

## Tasks / Subtasks

### Backend (branivo-api)

- [x] Task 1 — `AdminHealthRepository` за tenant health заявки (AC: 1, 2, 3)
  - [x] 1.1 Създай `branivo-api/src/modules/admin/repositories/admin-health.repository.ts`
  - [x] 1.2 Метод `findAllTenantsHealth(): Promise<TenantHealthSummary[]>` — JOIN tenants + policies (last 30 дни COUNT + last activity) + tenant subscription tier; **NO tenant_id WHERE** — super admin вижда всичко
  - [x] 1.3 Метод `findTenantHealthDetail(tenantId: string): Promise<TenantHealthDetail>` — включва: active users count, total revenue, vehicle count, last policy info, active feature flags
  - [x] 1.4 Метод `findTenantsWithInactiveDays(days: number): Promise<InactiveTenantAlert[]>` — тенанти с 0 полици за последните `days` дни
  - [x] 1.5 Напиши unit тест `admin-health.repository.spec.ts`

- [x] Task 2 — `AdminHealthService` с бизнес логика (AC: 1, 2, 3)
  - [x] 2.1 Създай `branivo-api/src/modules/admin/admin-health.service.ts`
  - [x] 2.2 Метод `getPlatformHealthDashboard(): Promise<TenantHealthSummary[]>` — делегира към repository
  - [x] 2.3 Метод `getTenantHealthDetail(tenantId: string): Promise<TenantHealthDetail>` — делегира към repository
  - [x] 2.4 Метод `runInactivityCheck(): Promise<void>` — извиква `findTenantsWithInactiveDays(7)` и изпраща алерт имейл за всеки намерен тенант чрез `EmailService`
  - [x] 2.5 Напиши unit тест `admin-health.service.spec.ts`

- [x] Task 3 — `AdminHealthController` с нови endpoints (AC: 1, 3)
  - [x] 3.1 Създай `branivo-api/src/modules/admin/admin-health.controller.ts`
  - [x] 3.2 `GET /admin/health` — `@Roles('super_admin')` — връща platform health dashboard (масив от `TenantHealthSummaryResponseDto`)
  - [x] 3.3 `GET /admin/health/:tenantId` — `@Roles('super_admin')` с `@Param('tenantId', ParseUUIDPipe)` — връща drill-down детайл (`TenantHealthDetailResponseDto`)
  - [x] 3.4 Напиши интеграционен тест `admin-health.controller.spec.ts`

- [x] Task 4 — DTOs (AC: 1, 3)
  - [x] 4.1 Създай `dto/tenant-health-summary-response.dto.ts`:
    ```typescript
    // tenantId, tenantName, slug, status, subscriptionTier,
    // policiesLast30Days: number, lastActivityAt: string | null,
    // inactiveDays: number | null
    ```
  - [x] 4.2 Създай `dto/tenant-health-detail-response.dto.ts`:
    ```typescript
    // tenantId, tenantName, activeUsersCount, totalRevenueBgn,
    // vehicleCount, lastPolicyCreatedAt: string | null,
    // lastPolicyInsurer: string | null, activeFeatureFlags: string[]
    ```
  - [x] 4.3 Създай `dto/inactive-tenant-alert.dto.ts`:
    ```typescript
    // tenantId, tenantName, inactiveDays: number
    ```

- [x] Task 5 — Daily health check scheduled job (AC: 2)
  - [x] 5.1 Създай `branivo-api/src/modules/admin/admin-health.job.ts`
  - [x] 5.2 Използвай `@Cron('0 8 * * *')` (всеки ден 08:00 EET) с `@nestjs/schedule`
  - [x] 5.3 Инжектирай `AdminHealthService` и извиквай `runInactivityCheck()`
  - [x] 5.4 Log при старт, брой намерени неактивни тенанти, и при всяка изпратена нотификация
  - [x] 5.5 Напиши unit тест `admin-health.job.spec.ts`

- [x] Task 6 — Регистрирай в AdminModule (AC: 1, 2, 3)
  - [x] 6.1 Обнови `branivo-api/src/modules/admin/admin.module.ts` — добави `AdminHealthRepository`, `AdminHealthService`, `AdminHealthController`, `AdminHealthJob` като providers/controllers
  - [x] 6.2 Добави `TypeOrmModule.forFeature([...])` ако са нужни нови entities (вероятно не — само raw queries)

- [x] Task 7 — Seed данни за demo тенанта (AC: 1, 3)
  - [x] 7.1 Обнови `branivo-api/src/infrastructure/database/seed.service.ts` — добави `seedTenantHealthData()`
  - [x] 7.2 Уверя се, че demo тенантът има поне 3 полици last 30 дни и коректна `last_activity_at` timestamp

### Web (branivo-web)

- [x] Task 8 — Разшири `(admin)/tenants/page.tsx` с health данни (AC: 1)
  - [x] 8.1 Добави нови колони в таблицата: „Полици (30 дни)", „Последна активност", „Тиер"
  - [x] 8.2 Смени `fetchTenants` да извика `/api/v1/admin/health` вместо `/api/v1/admin/tenants`
  - [x] 8.3 Добави визуален индикатор за неактивни тенанти (> 7 дни) — оцветяване на реда в `bg-yellow-50`
  - [x] 8.4 Всеки tenant ред да е кликаем → navigate to `/admin/tenants/[id]`

- [x] Task 9 — Нова drill-down страница `(admin)/tenants/[id]/page.tsx` (AC: 3)
  - [x] 9.1 Създай `branivo-web/src/app/[locale]/(admin)/tenants/[id]/page.tsx`
  - [x] 9.2 Fetch от `/api/v1/admin/health/:tenantId` → показва: активни потребители, приход (BGN), брой МПС, последна полица + застраховател, активни feature flags (badge per flag)
  - [x] 9.3 "Назад" бутон → `/admin/tenants`
  - [x] 9.4 Напиши компонент тест `__tests__/admin/TenantHealthDetail.test.tsx`

- [x] Task 10 — Next.js API proxy routes (AC: 1, 3)
  - [x] 10.1 Създай `branivo-web/src/app/api/v1/admin/health/route.ts` — proxies `GET /admin/health`
  - [x] 10.2 Създай `branivo-web/src/app/api/v1/admin/health/[tenantId]/route.ts` — proxies `GET /admin/health/:tenantId`
  - [x] 10.3 Напиши тест `__tests__/admin/TenantHealthPage.test.tsx`

## Dev Notes

### Критично: Super Admin заявките са tenant-agnostic

За разлика от всички останали модули в платформата, **Super Admin health queries НЕ трябва да имат `tenant_id` WHERE clause**. Те агрегират данни от ВСИЧКИ тенанти:

```typescript
// ✅ ПРАВИЛНО — Super Admin вижда всички тенанти
async findAllTenantsHealth(): Promise<TenantHealthSummary[]> {
  return this.dataSource.query<TenantHealthSummary[]>(`
    SELECT
      t.id               AS "tenantId",
      t.name             AS "tenantName",
      t.slug,
      t.status,
      tc.subscription_tier AS "subscriptionTier",
      COUNT(p.id) FILTER (
        WHERE p.created_at >= NOW() - INTERVAL '30 days'
          AND p.deleted_at IS NULL
      )::int             AS "policiesLast30Days",
      MAX(p.created_at)  AS "lastActivityAt"
    FROM tenants t
    LEFT JOIN tenant_configs tc ON tc.tenant_id = t.id AND tc.deleted_at IS NULL
    LEFT JOIN policies p
      ON p.tenant_id = t.id AND p.deleted_at IS NULL
    WHERE t.deleted_at IS NULL
    GROUP BY t.id, t.name, t.slug, t.status, tc.subscription_tier
    ORDER BY t.name
  `);
}
```

> ⚠️ ВАЖНО: `TenantContext.getTenantId()` **НЕ се извиква** в AdminHealthRepository — само в tenant-scoped контекст. Super Admin endpoints нямат tenant middleware.

### Scheduled Job Pattern (от domain-verification.job.ts)

```typescript
// branivo-api/src/modules/admin/admin-health.job.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminHealthService } from './admin-health.service';

@Injectable()
export class AdminHealthJob {
  private readonly logger = new Logger(AdminHealthJob.name);

  constructor(private readonly adminHealthService: AdminHealthService) {}

  @Cron('0 8 * * *') // daily 08:00
  async runDailyHealthCheck(): Promise<void> {
    this.logger.log('Running daily tenant health check...');
    await this.adminHealthService.runInactivityCheck();
    this.logger.log('Daily tenant health check completed');
  }
}
```

> Виж `domain-verification.job.ts` в `tenants` модул за reference паттерн — точно същата структура.

### Inactivity Detection Query

```sql
-- Тенанти с 0 полици за последните N дни
SELECT
  t.id    AS "tenantId",
  t.name  AS "tenantName",
  EXTRACT(DAY FROM NOW() - MAX(p.created_at))::int AS "inactiveDays"
FROM tenants t
LEFT JOIN policies p
  ON p.tenant_id = t.id
  AND p.deleted_at IS NULL
  AND p.created_at >= NOW() - INTERVAL '90 days'  -- оптимизация на scan
WHERE t.deleted_at IS NULL
  AND t.status = 'active'
GROUP BY t.id, t.name
HAVING COUNT(p.id) FILTER (
  WHERE p.created_at >= NOW() - INTERVAL '7 days'
) = 0
  AND (MAX(p.created_at) IS NULL
    OR MAX(p.created_at) < NOW() - INTERVAL '7 days')
ORDER BY "inactiveDays" DESC NULLS LAST;
```

### Tenant Drill-Down Query

```sql
-- Детайли за конкретен тенант (Super Admin drill-down)
SELECT
  t.id                                AS "tenantId",
  t.name                              AS "tenantName",
  COUNT(DISTINCT u.id) FILTER (
    WHERE u.deleted_at IS NULL
      AND u.is_active = true
  )::int                              AS "activeUsersCount",
  COALESCE(SUM(p.premium_amount), 0)  AS "totalRevenueBgn",
  COUNT(DISTINCT v.id) FILTER (
    WHERE v.deleted_at IS NULL
  )::int                              AS "vehicleCount",
  MAX(p.created_at)                   AS "lastPolicyCreatedAt",
  i.name                              AS "lastPolicyInsurer",
  tc.feature_flags                    AS "activeFeatureFlags"
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id
LEFT JOIN policies p ON p.tenant_id = t.id AND p.deleted_at IS NULL
LEFT JOIN vehicles v ON v.tenant_id = t.id
LEFT JOIN tenant_configs tc ON tc.tenant_id = t.id AND tc.deleted_at IS NULL
LEFT JOIN insurers i ON i.id = (
  SELECT insurer_id FROM policies
  WHERE tenant_id = t.id AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 1
)
WHERE t.id = $1
  AND t.deleted_at IS NULL
GROUP BY t.id, t.name, i.name, tc.feature_flags;
```

> `feature_flags` е JSONB в `tenant_configs`. В DTO-то трансформирай в `string[]` от активните флагове: `Object.entries(flags).filter(([, v]) => v === true).map(([k]) => k)`.

### AdminModule — Как да регистрираш

```typescript
// branivo-api/src/modules/admin/admin.module.ts (modified)
@Module({
  imports: [
    TypeOrmModule.forFeature([TenantInvitation]),
    JwtModule.registerAsync({ ... }),
    TenantsModule,
    UsersModule,
    ScheduleModule, // вече импортиран в AppModule — НЕ добавяй тук
  ],
  controllers: [
    AdminTenantsController,
    WebhooksController,
    AdminHealthController,    // NEW
  ],
  providers: [
    AdminTenantsService,
    TenantInvitationsRepository,
    CryptoService,
    EmailService,
    AdminHealthService,       // NEW
    AdminHealthRepository,    // NEW
    AdminHealthJob,           // NEW
  ],
  exports: [AdminTenantsService],
})
export class AdminModule {}
```

> `ScheduleModule.forRoot()` е вече добавен в `app.module.ts` — не го добавяй отново в AdminModule.

### Frontend Pattern (от tenants/page.tsx)

Съществуващата `(admin)/tenants/page.tsx` използва:
- `useQuery` от TanStack Query v5
- `fetch` с `credentials: 'include'`
- Inline Tailwind класове
- Без shadcn/ui компоненти (директен HTML + Tailwind)

Story 8.1 трябва да следва **точно същия паттерн** — НЕ въвеждай нови UI библиотеки.

```typescript
// Пример за нова колона в таблицата (добавя се към съществуващата)
<td className={`px-6 py-4 text-sm ${
  (tenant.inactiveDays ?? 0) > 7
    ? 'font-medium text-amber-600'
    : 'text-gray-500'
}`}>
  {tenant.inactiveDays !== null
    ? `${tenant.inactiveDays} дни`
    : '—'}
</td>
```

### Съществуваща инфраструктура — Reuse

| Компонент | Статус | Действие за Story 8.1 |
|---|---|---|
| `AdminTenantsController` | ✅ Съществува | НЕ модифицирай — onboarding endpoints |
| `AdminTenantsService` | ✅ Съществува | НЕ модифицирай |
| `EmailService` | ✅ В AdminModule | Reuse директно в `AdminHealthService` |
| `domain-verification.job.ts` | ✅ Паттерн | Copy структура за `AdminHealthJob` |
| `(admin)/tenants/page.tsx` | ✅ Съществува | Разшири с health колони |
| `DataSource` | ✅ Инжектиран | Ползвай за raw SQL health queries |

### AC4 — Tenant Isolation Alert (NFR10)

AC4 изисква алерт при `tenant isolation incident` в < 15 мин. Това е свързано с:
- Logging interceptor вече логва `tenant_id` per request
- CloudWatch Metric Filter за cross-tenant queries → SNS → имейл до Super Admin

**За Story 8.1 имплементирай само:** log message при детектирана аномалия (e.g., query без tenant_id в tenant-scoped context). Пълна CloudWatch интеграция е infrastructure task, не код.

В `AdminHealthService`:
```typescript
// Добави към runInactivityCheck() — опционален isolation check
private readonly logger = new Logger(AdminHealthService.name);

// При детектирана cross-tenant аномалия:
this.logger.error(
  JSON.stringify({
    event: 'TENANT_ISOLATION_INCIDENT',
    severity: 'CRITICAL',
    tenantId: '<affected_tenant>',
    timestamp: new Date().toISOString(),
  }),
);
```

### Project Structure Notes

**Нови backend файлове:**
- `branivo-api/src/modules/admin/repositories/admin-health.repository.ts`
- `branivo-api/src/modules/admin/repositories/admin-health.repository.spec.ts`
- `branivo-api/src/modules/admin/admin-health.service.ts`
- `branivo-api/src/modules/admin/admin-health.service.spec.ts`
- `branivo-api/src/modules/admin/admin-health.controller.ts`
- `branivo-api/src/modules/admin/admin-health.controller.spec.ts`
- `branivo-api/src/modules/admin/admin-health.job.ts`
- `branivo-api/src/modules/admin/admin-health.job.spec.ts`
- `branivo-api/src/modules/admin/dto/tenant-health-summary-response.dto.ts`
- `branivo-api/src/modules/admin/dto/tenant-health-detail-response.dto.ts`
- `branivo-api/src/modules/admin/dto/inactive-tenant-alert.dto.ts`

**Модифицирани backend файлове:**
- `branivo-api/src/modules/admin/admin.module.ts`
- `branivo-api/src/infrastructure/database/seed.service.ts`

**Нови web файлове:**
- `branivo-web/src/app/[locale]/(admin)/tenants/[id]/page.tsx`
- `branivo-web/src/app/api/v1/admin/health/route.ts`
- `branivo-web/src/app/api/v1/admin/health/[tenantId]/route.ts`
- `branivo-web/src/app/__tests__/admin/TenantHealthPage.test.tsx`
- `branivo-web/src/app/__tests__/admin/TenantHealthDetail.test.tsx`

**Модифицирани web файлове:**
- `branivo-web/src/app/[locale]/(admin)/tenants/page.tsx`

### Абсолютни Правила

- Super Admin health queries → **НЕ ползвай `TenantContext.getTenantId()`** — това е специален non-tenant context
- `audit_log` е IMMUTABLE — без UPDATE или DELETE
- `EmailService` е вече в AdminModule — не добавяй повторно
- `@Cron` декоратор изисква `@nestjs/schedule` — `ScheduleModule.forRoot()` е в `app.module.ts`
- Controller → Service → Repository — без прескачане на слоеве
- **НИКОГА** `any` тип — ползвай `TenantHealthSummary`, `TenantHealthDetail`, `InactiveTenantAlert` типове
- Raw SQL резултатите се cast-ват: `this.dataSource.query<TenantHealthSummary[]>(...)`

### References

- [Source: epics.md#Epic-8-Story-8.1] — User story и acceptance criteria
- [Source: architecture.md#Admin-Module] — Super Admin API patterns и dashboard routes
- [Source: architecture.md#NestJS-Module-Structure] — BaseRepository pattern
- [Source: domain-verification.job.ts] — `@Cron` scheduled job паттерн
- [Source: admin-tenants.controller.ts] — `@Roles('super_admin')` decorator usage
- [Source: admin.module.ts] — Съществуваща AdminModule конфигурация
- [Source: (admin)/tenants/page.tsx] — Съществуващ frontend паттерн (TanStack Query + fetch + Tailwind)
- [Source: architecture.md#Database-Schemas] — Tenant, Policy, User entity structures

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Имплементирани всички 10 task-a (Backend + Web)
- `AdminHealthRepository` ползва raw SQL без `tenant_id` WHERE — коректно за Super Admin контекст
- `AdminHealthService.runInactivityCheck()` изпраща email алерти чрез `EmailService.sendInactivityAlert()` (добавен нов метод)
- `AdminHealthJob` с `@Cron('0 8 * * *')` — следва паттерна на `DomainVerificationJob`
- Страницата `tenants/page.tsx` сменена да вика `/admin/health` вместо `/admin/tenants` за health данни
- `tenants/[id]/page.tsx` ползва `useParams()` вместо `React.use()` за тест-совместимост
- AC4 (isolation incident): `logIsolationIncident()` е окабелен към `countOrphanedPolicies()` проверка в `runInactivityCheck()`
- **Code Review fixes (2025-03-22):**
  - H1: `findTenantsWithInactiveDays` вече ползва `$1` параметъра вместо hardcoded `INTERVAL '7 days'`
  - H2: AC4 isolation detection окабелена — `logIsolationIncident` се вика при orphaned policies
  - M1: per-tenant try/catch в `runInactivityCheck()` — един fail не спира останалите алерти
  - M2: HTML escaping добавен в `sendInactivityAlert` и `sendOcrAlertEmail`
  - M3: Seed service SQL template literal (`INTERVAL '${i} days'`) заменен с `$4 * INTERVAL '1 day'`
  - L1: Добавен тест за row click navigation в `TenantHealthPage.test.tsx`
  - L2: Граматика: "1 ден" (singular) вместо "1 дни"
  - L3: "0 дни" → "—" за тенанти с 0 inactive days
- 602 API теста + 41 Web теста — всички зелени; lint и build чисти

### File List

branivo-api/src/modules/admin/repositories/admin-health.repository.ts
branivo-api/src/modules/admin/repositories/admin-health.repository.spec.ts
branivo-api/src/modules/admin/admin-health.service.ts
branivo-api/src/modules/admin/admin-health.service.spec.ts
branivo-api/src/modules/admin/admin-health.controller.ts
branivo-api/src/modules/admin/admin-health.controller.spec.ts
branivo-api/src/modules/admin/admin-health.job.ts
branivo-api/src/modules/admin/admin-health.job.spec.ts
branivo-api/src/modules/admin/dto/tenant-health-summary-response.dto.ts
branivo-api/src/modules/admin/dto/tenant-health-detail-response.dto.ts
branivo-api/src/modules/admin/dto/inactive-tenant-alert.dto.ts
branivo-api/src/modules/admin/admin.module.ts (modified)
branivo-api/src/common/email/email.service.ts (modified — added sendInactivityAlert)
branivo-api/src/infrastructure/database/seed.service.ts (modified — added seedTenantHealthData)
branivo-web/src/app/[locale]/(admin)/tenants/page.tsx (modified — health data + new columns)
branivo-web/src/app/[locale]/(admin)/tenants/[id]/page.tsx
branivo-web/src/app/api/v1/admin/health/route.ts
branivo-web/src/app/api/v1/admin/health/[tenantId]/route.ts
branivo-web/src/__tests__/admin/tenants.page.test.tsx (modified)
branivo-web/src/__tests__/admin/TenantHealthPage.test.tsx
branivo-web/src/__tests__/admin/TenantHealthDetail.test.tsx
