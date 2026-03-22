# Story 8.2: Insurer API Monitoring & Manual Fallback

Status: done

## Story

As a Super Admin,
I want to monitor insurer API health and manually disable failing insurers,
so that platform reliability is maintained when an insurer integration degrades.

## Acceptance Criteria

1. **AC1 — Insurer API Dashboard:**
   Given Super Admin opens Insurer API Dashboard,
   When dashboard loads,
   Then виждат за всеки застраховател: статус на circuit breaker (open/closed/half-open), error rate % за последните 5 мин, средна latency

2. **AC2 — Automatic Alert:**
   Given error rate > 1% for 5 minutes for any insurer,
   When threshold is crossed,
   Then Super Admin получава автоматичен алерт (NFR48)

3. **AC3 — Manual Fallback Activation:**
   Given an insurer API is degraded,
   When Super Admin activates manual fallback via feature flag,
   Then заявките към застрахователя спират незабавно; останалите застрахователи продължават нормално

4. **AC4 — Audit Log:**
   Given manual fallback is activated,
   When saved,
   Then се логва в `audit_log` с `admin_id`, `insurer_id`, `reason`, `timestamp`

5. **AC5 — Manual Fallback Deactivation:**
   Given insurer API recovers,
   When Super Admin deactivates manual fallback,
   Then circuit breaker се нулира и заявките се възобновяват

## Tasks / Subtasks

### Backend (branivo-api)

- [x] Task 1 — Разшири `CircuitBreakerService` с metrics tracking (AC: 1, 2)
  - [x] 1.1 Добави sliding-window metrics в `branivo-api/src/modules/quotes/circuit-breaker.service.ts`:
    ```typescript
    interface CallRecord { timestamp: number; latencyMs: number; isError: boolean; }
    private readonly callMetrics = new Map<string, CallRecord[]>(); // key = insurerCode
    ```
  - [x] 1.2 Добави метод `recordMetric(insurerCode: string, latencyMs: number, isError: boolean): void` — прибавя запис и прочиства entries > 5 мин
  - [x] 1.3 Обнови `call()` метода да извиква `recordMetric()` при успех и при грешка (включително `CircuitOpenException`)
  - [x] 1.4 Добави метод `getInsurerMetrics(): Map<string, InsurerCallMetrics>` — агрегира последните 5 мин per insurerCode (не per tenant:code)
    ```typescript
    interface InsurerCallMetrics {
      errorRate: number;       // процент (0-100)
      avgLatencyMs: number;    // средна latency
      totalCalls: number;      // брой заявки в прозореца
    }
    ```
  - [x] 1.5 Добави метод `getAggregatedCircuitState(insurerCode: string): 'open' | 'half-open' | 'closed'` — агрегира state на всички `${tenantId}:${insurerCode}` breakers; ако който и да е е `opened` → 'open'; ако `halfOpen` → 'half-open'; иначе 'closed'
  - [x] 1.6 Добави метод `resetBreakersForInsurer(insurerCode: string): void` — нулира всички breakers за дадения insurer code (за AC5)
  - [x] 1.7 Напиши/разшири unit тест `circuit-breaker.service.spec.ts` за новите методи

- [x] Task 2 — Добави `isManuallyDisabled` към `Insurer` entity (AC: 3, 4, 5)
  - [x] .1 Обнови `branivo-api/src/modules/quotes/entities/insurer.entity.ts`:
    ```typescript
    @Column({ name: 'is_manually_disabled', type: 'boolean', default: false })
    isManuallyDisabled!: boolean;

    @Column({ name: 'disabled_reason', type: 'text', nullable: true })
    disabledReason!: string | null;

    @Column({ name: 'disabled_by_admin_id', type: 'uuid', nullable: true })
    disabledByAdminId!: string | null;
    ```
  - [x] .2 Създай TypeORM migration: `branivo-api/src/infrastructure/database/migrations/<timestamp>-AddManualFallbackToInsurers.ts`
    ```typescript
    // ALTER TABLE insurers ADD COLUMN is_manually_disabled BOOLEAN NOT NULL DEFAULT FALSE;
    // ALTER TABLE insurers ADD COLUMN disabled_reason TEXT;
    // ALTER TABLE insurers ADD COLUMN disabled_by_admin_id UUID;
    ```

- [x] Task 3 — Обнови `QuotesRepository.findActiveInsurers()` (AC: 3)
  - [x] .1 Обнови `branivo-api/src/modules/quotes/quotes.repository.ts` — добави filter `AND i.is_manually_disabled = false` към заявката за активни застрахователи
  - [x] .2 Напиши/обнови unit тест за `findActiveInsurers()` с mock инсурер с `isManuallyDisabled = true`

- [x] Task 4 — Добави `QuotesModule` export за `CircuitBreakerService` (AC: 1)
  - [x] .1 Обнови `branivo-api/src/modules/quotes/quotes.module.ts` — добави `CircuitBreakerService` в `exports`

- [x] Task 5 — `AdminInsurerMonitorRepository` (AC: 1, 3, 4, 5)
  - [x] .1 Създай `branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.ts`
  - [x] .2 Метод `findAllInsurers(): Promise<InsurerStatusRow[]>` — SELECT id, name, code, is_active, is_manually_disabled, disabled_reason, disabled_by_admin_id FROM insurers WHERE deleted_at IS NULL ORDER BY name
    ```typescript
    interface InsurerStatusRow {
      id: string;
      name: string;
      code: string;
      isActive: boolean;
      isManuallyDisabled: boolean;
      disabledReason: string | null;
      disabledByAdminId: string | null;
    }
    ```
  - [x] .3 Метод `disableInsurer(insurerId: string, adminId: string, reason: string): Promise<void>` — UPDATE insurers SET is_manually_disabled=true, disabled_reason=$3, disabled_by_admin_id=$2 WHERE id=$1; INSERT INTO audit_log (...)
  - [x] .4 Метод `enableInsurer(insurerId: string, adminId: string): Promise<void>` — UPDATE insurers SET is_manually_disabled=false, disabled_reason=NULL, disabled_by_admin_id=NULL WHERE id=$1; INSERT INTO audit_log (...)
  - [x] .5 Напиши unit тест `admin-insurer-monitor.repository.spec.ts`

- [x] Task 6 — `AdminInsurerMonitorService` (AC: 1, 2, 3, 4, 5)
  - [x] .1 Създай `branivo-api/src/modules/admin/admin-insurer-monitor.service.ts`
  - [x] .2 Constructor инжектира: `AdminInsurerMonitorRepository`, `CircuitBreakerService`, `EmailService`, `ConfigService`
  - [x] .3 Метод `getInsurerApiDashboard(): Promise<InsurerApiStatusResponseDto[]>` — комбинира DB данни (insurers) + circuit metrics от `CircuitBreakerService`:
    - За всеки insurer: `circuitState` от `getAggregatedCircuitState(code)`, `errorRate5min` и `avgLatencyMs` от `getInsurerMetrics()`
  - [x] .4 Метод `activateManualFallback(insurerId: string, adminId: string, reason: string): Promise<void>`:
    - Извиква `adminInsurerMonitorRepository.disableInsurer()` (включва audit log)
    - Извиква `circuitBreakerService.resetBreakersForInsurer(code)` за clean state
    - Log: `this.logger.warn('Manual fallback ACTIVATED for insurer ...')`
  - [x] .5 Метод `deactivateManualFallback(insurerId: string, adminId: string): Promise<void>`:
    - Извиква `adminInsurerMonitorRepository.enableInsurer()` (вinkludes audit log)
    - Извиква `circuitBreakerService.resetBreakersForInsurer(code)` за clean state
    - Log: `this.logger.log('Manual fallback DEACTIVATED for insurer ...')`
  - [x] .6 Метод `runErrorRateCheck(): Promise<void>` — проверява всеки insurer; ако `errorRate > 1.0` → изпраща email алерт (AC2); Log намерените проблемни insurers
  - [x] .7 Напиши unit тест `admin-insurer-monitor.service.spec.ts`

- [x] Task 7 — `AdminInsurerMonitorController` (AC: 1, 3, 5)
  - [x] .1 Създай `branivo-api/src/modules/admin/admin-insurer-monitor.controller.ts`
  - [x] .2 `GET /admin/insurers/monitor` — `@Roles('super_admin')` — връща `InsurerApiStatusResponseDto[]`
  - [x] .3 `POST /admin/insurers/:id/disable` — `@Roles('super_admin')` с `@Param('id', ParseUUIDPipe)` — body: `DisableInsurerDto` — извиква `activateManualFallback()`
  - [x] .4 `POST /admin/insurers/:id/enable` — `@Roles('super_admin')` с `@Param('id', ParseUUIDPipe)` — извиква `deactivateManualFallback()`
  - [x] .5 Напиши интеграционен тест `admin-insurer-monitor.controller.spec.ts`

- [x] Task 8 — `AdminInsurerMonitorJob` за 5-мин error rate алерт (AC: 2)
  - [x] .1 Създай `branivo-api/src/modules/admin/admin-insurer-monitor.job.ts`
  - [x] .2 `@Cron('*/5 * * * *')` — всеки 5 мин извиква `adminInsurerMonitorService.runErrorRateCheck()`
  - [x] .3 Напиши unit тест `admin-insurer-monitor.job.spec.ts`

- [x] Task 9 — DTOs (AC: 1)
  - [x] .1 Създай `branivo-api/src/modules/admin/dto/insurer-api-status-response.dto.ts`:
    ```typescript
    // insurerId, insurerName, insurerCode,
    // circuitState: 'open' | 'half-open' | 'closed',
    // errorRate5min: number,  // процент 0-100
    // avgLatencyMs: number,
    // totalCalls5min: number,
    // isManuallyDisabled: boolean,
    // disabledReason: string | null
    ```
  - [x] .2 Създай `branivo-api/src/modules/admin/dto/disable-insurer.dto.ts`:
    ```typescript
    // reason: string (IsString, IsNotEmpty, MaxLength: 500)
    ```

- [x] Task 10 — Регистрирай в `AdminModule` (AC: 1)
  - [x] 0.1 Обнови `branivo-api/src/modules/admin/admin.module.ts`:
    - Добави `QuotesModule` в `imports`
    - Добави `AdminInsurerMonitorRepository`, `AdminInsurerMonitorService`, `AdminInsurerMonitorJob` в `providers`
    - Добави `AdminInsurerMonitorController` в `controllers`

- [x] Task 11 — Обнови Seeder (AC: 1)
  - [x] 1.1 Обнови `branivo-api/src/infrastructure/database/seed.service.ts` — добави `seedInsurerManualFallbackDefaults()` за да се уверим, че всички insurers имат `is_manually_disabled = false` (ON CONFLICT DO NOTHING)

### Web (branivo-web)

- [x] Task 12 — Нова страница `/admin/insurers/page.tsx` — Insurer API Dashboard (AC: 1, 3)
  - [x] 2.1 Създай `branivo-web/src/app/[locale]/(admin)/insurers/page.tsx`
  - [x] 2.2 Използвай `useQuery` от TanStack Query v5 с `staleTime: 30_000` (30s auto-refresh) — следвай паттерна от `tenants/page.tsx`
  - [x] 2.3 Таблица с колони: Застраховател, Circuit State (badge), Error Rate 5мин (%), Avg Latency (ms), Статус, Действие
  - [x] 2.4 Circuit State badges:
    - `'open'` → червена бадж `bg-red-100 text-red-700`
    - `'half-open'` → жълта бадж `bg-yellow-100 text-yellow-700`
    - `'closed'` → зелена бадж `bg-green-100 text-green-700`
  - [x] 2.5 Ред с `isManuallyDisabled = true` → row `bg-gray-100`, бутон „Активирай" (POST enable)
  - [x] 2.6 Ред с `isManuallyDisabled = false` → бутон „Деактивирай" (POST disable с reason modal)
  - [x] 2.7 Error rate > 1% → оцвети error rate cell в `text-red-600 font-medium`

- [x] Task 13 — Confirm modal за disable (AC: 3)
  - [x] 3.1 Inline modal компонент (НЕ shadcn) с text input за reason (required)
  - [x] 3.2 "Потвърди деактивиране" → POST `/api/v1/admin/insurers/{id}/disable` с `{ reason }`
  - [x] 3.3 "Отказ" → затваря modal без action

- [x] Task 14 — Next.js API proxy routes (AC: 1, 3, 5)
  - [x] 4.1 Създай `branivo-web/src/app/api/v1/admin/insurers/monitor/route.ts` — proxies `GET /admin/insurers/monitor`
  - [x] 4.2 Създай `branivo-web/src/app/api/v1/admin/insurers/[id]/disable/route.ts` — proxies `POST /admin/insurers/:id/disable`
  - [x] 4.3 Създай `branivo-web/src/app/api/v1/admin/insurers/[id]/enable/route.ts` — proxies `POST /admin/insurers/:id/enable`

- [x] Task 15 — Навигация и тестове
  - [x] 5.1 Добави „Застрахователи" линк в Super Admin navigation (ако съществува sidebar компонент)
  - [x] 5.2 Напиши компонент тест `branivo-web/src/__tests__/admin/InsurerMonitorPage.test.tsx`

## Dev Notes

### Критично: Архитектурна промяна в `CircuitBreakerService`

Текущата имплементация пази breakers по ключ `${tenantId}:${code}`. За Super Admin мониторинг трябват **агрегирани** метрики по `insurerCode` (cross-tenant).

**ВАЖНО**: Два нови Map-а в `CircuitBreakerService` — един за breakers (съществуващ), един за metrics (нов):

```typescript
// Съществуващ:
private readonly breakers = new Map<string, CircuitBreaker>(); // key: tenantId:code

// НОВ — per insurerCode, NOT per tenant:
interface CallRecord { timestamp: number; latencyMs: number; isError: boolean; }
private readonly callMetrics = new Map<string, CallRecord[]>(); // key: insurerCode
```

`recordMetric()` имплементация:
```typescript
private recordMetric(insurerCode: string, latencyMs: number, isError: boolean): void {
  const now = Date.now();
  if (!this.callMetrics.has(insurerCode)) {
    this.callMetrics.set(insurerCode, []);
  }
  const records = this.callMetrics.get(insurerCode)!;
  records.push({ timestamp: now, latencyMs, isError });
  // Prune entries older than 5 minutes
  const cutoff = now - 5 * 60 * 1000;
  const pruned = records.filter((r) => r.timestamp >= cutoff);
  this.callMetrics.set(insurerCode, pruned);
}
```

Обновен `call()`:
```typescript
async call<T>(insurerCode: string, fn: () => Promise<T>): Promise<T> {
  const tenantId = this.tenantContext.getTenantId();
  const breaker = this.getBreaker(tenantId, insurerCode);
  if (breaker.opened) {
    this.recordMetric(insurerCode, 0, true);
    throw new CircuitOpenException(insurerCode);
  }
  const start = Date.now();
  try {
    const result = await (breaker.fire(fn) as Promise<T>);
    this.recordMetric(insurerCode, Date.now() - start, false);
    return result;
  } catch (err) {
    this.recordMetric(insurerCode, Date.now() - start, true);
    throw err;
  }
}
```

`getAggregatedCircuitState()`:
```typescript
getAggregatedCircuitState(insurerCode: string): 'open' | 'half-open' | 'closed' {
  let state: 'open' | 'half-open' | 'closed' = 'closed';
  for (const [key, breaker] of this.breakers) {
    const code = key.split(':').slice(1).join(':'); // handle UUIDs with colons? No — tenantId is UUID (no colons), insurerCode is varchar. Key format: `uuid:code`
    if (code !== insurerCode) continue;
    if (breaker.opened) return 'open';
    if (breaker.halfOpen) state = 'half-open';
  }
  return state;
}
```

`resetBreakersForInsurer()`:
```typescript
resetBreakersForInsurer(insurerCode: string): void {
  for (const [key, breaker] of this.breakers) {
    const code = key.split(':').slice(1).join(':');
    if (code === insurerCode) {
      breaker.close(); // force close the circuit
    }
  }
  // Clear metrics for fresh start
  this.callMetrics.delete(insurerCode);
}
```

### Insurer Entity — Нови полета

```typescript
// branivo-api/src/modules/quotes/entities/insurer.entity.ts
@Column({ name: 'is_manually_disabled', type: 'boolean', default: false })
isManuallyDisabled!: boolean;

@Column({ name: 'disabled_reason', type: 'text', nullable: true })
disabledReason!: string | null;

@Column({ name: 'disabled_by_admin_id', type: 'uuid', nullable: true })
disabledByAdminId!: string | null;
```

> ⚠️ **ВАЖНО**: `is_manually_disabled` е различно от `is_active`. `is_active` = оперативен статус на застрахователя. `is_manually_disabled` = временна Super Admin спирачка при деградация.

### QuotesRepository — Filter за manual fallback

```typescript
// В findActiveInsurers() — добави допълнителен WHERE clause:
async findActiveInsurers(): Promise<Insurer[]> {
  return this.insurerRepository.find({
    where: {
      isActive: true,
      isManuallyDisabled: false,  // NEW
      deletedAt: IsNull(),
    },
  });
}
```

### AdminInsurerMonitorRepository — Audit Log Pattern

```typescript
// branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.ts
async disableInsurer(insurerId: string, adminId: string, reason: string): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
    await manager.query(
      `UPDATE insurers
       SET is_manually_disabled = true,
           disabled_reason = $2,
           disabled_by_admin_id = $3,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [insurerId, reason, adminId],
    );
    await manager.query(
      `INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, payload, timestamp)
       VALUES (gen_random_uuid(), NULL, $2, 'insurer.manual_fallback.activated', 'insurer', $1,
               jsonb_build_object('reason', $3, 'admin_id', $2), NOW())`,
      [insurerId, adminId, reason],
    );
  });
}

async enableInsurer(insurerId: string, adminId: string): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
    await manager.query(
      `UPDATE insurers
       SET is_manually_disabled = false,
           disabled_reason = NULL,
           disabled_by_admin_id = NULL,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [insurerId],
    );
    await manager.query(
      `INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, payload, timestamp)
       VALUES (gen_random_uuid(), NULL, $2, 'insurer.manual_fallback.deactivated', 'insurer', $1,
               jsonb_build_object('admin_id', $2), NOW())`,
      [insurerId, adminId],
    );
  });
}
```

> ⚠️ `audit_log` е IMMUTABLE — само INSERT, никога UPDATE или DELETE.
> `tenant_id` е NULL за Super Admin действия (cross-tenant context).

### Admin Module — Как да регистрираш

```typescript
// branivo-api/src/modules/admin/admin.module.ts (modified)
import { QuotesModule } from '../quotes/quotes.module'; // NEW

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantInvitation]),
    JwtModule.registerAsync({ ... }),
    TenantsModule,
    UsersModule,
    QuotesModule,     // NEW — за CircuitBreakerService
  ],
  controllers: [
    AdminTenantsController,
    WebhooksController,
    AdminHealthController,
    AdminInsurerMonitorController,  // NEW
  ],
  providers: [
    AdminTenantsService,
    TenantInvitationsRepository,
    CryptoService,
    EmailService,
    AdminHealthRepository,
    AdminHealthService,
    AdminHealthJob,
    AdminInsurerMonitorRepository,  // NEW
    AdminInsurerMonitorService,     // NEW
    AdminInsurerMonitorJob,         // NEW
  ],
  exports: [AdminTenantsService],
})
export class AdminModule {}
```

> ⚠️ `QuotesModule` трябва да експортира `CircuitBreakerService`. Добави в `quotes.module.ts`:
> ```typescript
> exports: [QuotesService, QuotesRepository, CircuitBreakerService],
> ```

### TypeORM Migration

```typescript
// branivo-api/src/infrastructure/database/migrations/<timestamp>-AddManualFallbackToInsurers.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManualFallbackToInsurers1234567890 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE insurers
        ADD COLUMN IF NOT EXISTS is_manually_disabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS disabled_reason TEXT,
        ADD COLUMN IF NOT EXISTS disabled_by_admin_id UUID
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE insurers
        DROP COLUMN IF EXISTS is_manually_disabled,
        DROP COLUMN IF EXISTS disabled_reason,
        DROP COLUMN IF EXISTS disabled_by_admin_id
    `);
  }
}
```

> **Провери** дали проектът ползва `synchronize: true` (dev mode) или migrations. Ако `synchronize: true` в dev — TypeORM ще добави колоните автоматично при entity change. Migration е нужна само за staging/prod. Провери `branivo-api/src/infrastructure/database/database.module.ts`.

### AdminInsurerMonitorService — getInsurerApiDashboard Pattern

```typescript
async getInsurerApiDashboard(): Promise<InsurerApiStatusResponseDto[]> {
  const insurers = await this.adminInsurerMonitorRepository.findAllInsurers();
  const metricsMap = this.circuitBreakerService.getInsurerMetrics();

  return insurers.map((ins) => {
    const metrics = metricsMap.get(ins.code) ?? {
      errorRate: 0,
      avgLatencyMs: 0,
      totalCalls: 0,
    };
    const circuitState = this.circuitBreakerService.getAggregatedCircuitState(ins.code);

    const dto = new InsurerApiStatusResponseDto();
    dto.insurerId = ins.id;
    dto.insurerName = ins.name;
    dto.insurerCode = ins.code;
    dto.circuitState = circuitState;
    dto.errorRate5min = Math.round(metrics.errorRate * 100) / 100; // 2 decimal places
    dto.avgLatencyMs = Math.round(metrics.avgLatencyMs);
    dto.totalCalls5min = metrics.totalCalls;
    dto.isManuallyDisabled = ins.isManuallyDisabled;
    dto.disabledReason = ins.disabledReason;
    return dto;
  });
}
```

### Email Alert Pattern (от AdminHealthService)

```typescript
// runErrorRateCheck() в AdminInsurerMonitorService
async runErrorRateCheck(): Promise<void> {
  const dashboard = await this.getInsurerApiDashboard();
  const adminEmail = this.config.get<string>('SUPER_ADMIN_EMAIL', 'admin@branivo.bg');

  for (const ins of dashboard) {
    if (ins.isManuallyDisabled) continue; // Skip already disabled
    if (ins.errorRate5min > 1.0) {
      this.logger.warn(
        `High error rate for insurer "${ins.insurerName}": ${ins.errorRate5min.toFixed(2)}%`,
      );
      try {
        await this.emailService.sendInsurerAlertEmail(
          adminEmail,
          ins.insurerName,
          ins.errorRate5min,
          ins.avgLatencyMs,
        );
      } catch (err) {
        this.logger.error(`Failed to send alert for insurer "${ins.insurerName}"`, err);
      }
    }
  }
}
```

> Нужно е да добавиш `sendInsurerAlertEmail()` метод към `EmailService` — следвай паттерна на `sendInactivityAlert()` в `email.service.ts`.

### Frontend Pattern (от tenants/page.tsx и 8.1)

```typescript
// branivo-web/src/app/[locale]/(admin)/insurers/page.tsx
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface InsurerApiStatus {
  insurerId: string;
  insurerName: string;
  insurerCode: string;
  circuitState: 'open' | 'half-open' | 'closed';
  errorRate5min: number;
  avgLatencyMs: number;
  totalCalls5min: number;
  isManuallyDisabled: boolean;
  disabledReason: string | null;
}

const CIRCUIT_STATE_STYLES = {
  open: 'bg-red-100 text-red-700',
  'half-open': 'bg-yellow-100 text-yellow-700',
  closed: 'bg-green-100 text-green-700',
} as const;

const CIRCUIT_STATE_LABELS = {
  open: 'Open',
  'half-open': 'Half-Open',
  closed: 'Closed',
} as const;
```

**Auto-refresh** с TanStack Query v5:
```typescript
const { data: insurers } = useQuery<InsurerApiStatus[]>({
  queryKey: ['admin', 'insurers', 'monitor'],
  queryFn: async () => {
    const res = await fetch('/api/v1/admin/insurers/monitor', {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to fetch insurer status');
    return res.json() as Promise<InsurerApiStatus[]>;
  },
  refetchInterval: 30_000, // 30s auto-refresh
  staleTime: 10_000,
});
```

### Съществуваща инфраструктура — Reuse

| Компонент | Статус | Действие за Story 8.2 |
|---|---|---|
| `CircuitBreakerService` | ✅ Съществува | Разшири с metrics + reset методи |
| `Insurer` entity | ✅ Съществува | Добави `isManuallyDisabled`, `disabledReason`, `disabledByAdminId` |
| `QuotesRepository.findActiveInsurers()` | ✅ Съществува | Добави filter `isManuallyDisabled: false` |
| `AdminHealthRepository` | ✅ Паттерн | Copy структурата за raw SQL в `AdminInsurerMonitorRepository` |
| `AdminHealthJob` | ✅ Паттерн | Copy `@Cron` структурата за `AdminInsurerMonitorJob` |
| `EmailService` | ✅ В AdminModule | Добави нов метод `sendInsurerAlertEmail()` |
| `DataSource` | ✅ Инжектиран | Ползвай за raw SQL + transactions |
| `audit_log` | ✅ Immutable | INSERT only — виж `disableInsurer()` примера |

### Абсолютни Правила

- Super Admin insurer queries → **НЕ ползвай `TenantContext.getTenantId()`** — cross-tenant context; `tenant_id = NULL` в audit_log за Super Admin actions
- **НИКОГА** не връщай `insurer.api_key_enc` в GET отговор — колоната има `select: false` в entity
- `audit_log` е IMMUTABLE — само INSERT, никога UPDATE или DELETE
- **НИКОГА** `any` тип — ползвай `InsurerStatusRow`, `InsurerCallMetrics`, `InsurerApiStatusResponseDto` типове
- `is_manually_disabled` override-ва `is_active` — дори ако `isActive = true`, ако `isManuallyDisabled = true`, инсурерът не участва в quotes
- Controller → Service → Repository — без прескачане на слоеве
- `CircuitBreakerService` е singleton в NestJS — `callMetrics` Map е in-memory; рестарт на сървъра нулира метриките (приемливо за dev; за prod — Redis може да бъде следваща стъпка)

### Project Structure Notes

**Нови backend файлове:**
- `branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.ts`
- `branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.spec.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.service.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.service.spec.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.controller.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.controller.spec.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.job.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.job.spec.ts`
- `branivo-api/src/modules/admin/dto/insurer-api-status-response.dto.ts`
- `branivo-api/src/modules/admin/dto/disable-insurer.dto.ts`
- `branivo-api/src/infrastructure/database/migrations/<timestamp>-AddManualFallbackToInsurers.ts`

**Модифицирани backend файлове:**
- `branivo-api/src/modules/quotes/circuit-breaker.service.ts` (+ metrics tracking)
- `branivo-api/src/modules/quotes/circuit-breaker.service.spec.ts` (+ нови тестове)
- `branivo-api/src/modules/quotes/entities/insurer.entity.ts` (+ 3 нови колони)
- `branivo-api/src/modules/quotes/quotes.repository.ts` (+ isManuallyDisabled filter)
- `branivo-api/src/modules/quotes/quotes.module.ts` (+ export CircuitBreakerService)
- `branivo-api/src/modules/admin/admin.module.ts` (+ QuotesModule import + нови providers)
- `branivo-api/src/common/email/email.service.ts` (+ sendInsurerAlertEmail)
- `branivo-api/src/infrastructure/database/seed.service.ts` (+ seedInsurerManualFallbackDefaults)

**Нови web файлове:**
- `branivo-web/src/app/[locale]/(admin)/insurers/page.tsx`
- `branivo-web/src/app/api/v1/admin/insurers/monitor/route.ts`
- `branivo-web/src/app/api/v1/admin/insurers/[id]/disable/route.ts`
- `branivo-web/src/app/api/v1/admin/insurers/[id]/enable/route.ts`
- `branivo-web/src/__tests__/admin/InsurerMonitorPage.test.tsx`

### References

- [Source: epics.md#Epic-8-Story-8.2] — User story и acceptance criteria
- [Source: quotes/circuit-breaker.service.ts] — Съществуваща `CircuitBreakerService` имплементация (opossum)
- [Source: quotes/entities/insurer.entity.ts] — `Insurer` entity структура
- [Source: quotes/quotes.service.ts] — `createQuoteRequest()` — как insurers се извикват
- [Source: quotes/quotes.module.ts] — `QuotesModule` — exports за добавяне
- [Source: admin/repositories/admin-health.repository.ts] — Паттерн за Super Admin raw SQL + DataSource
- [Source: admin/admin-health.service.ts] — Паттерн за алерт имейли с per-item try/catch
- [Source: admin/admin-health.job.ts] — `@Cron` scheduled job паттерн
- [Source: admin/admin.module.ts] — Съществуваща AdminModule конфигурация
- [Source: (admin)/tenants/page.tsx] — Frontend паттерн (TanStack Query v5 + fetch + Tailwind)
- [Source: architecture.md#Circuit-Breaker] — opossum конфигурация (5s timeout, 50% threshold, 30s reset)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A — имплементацията мина без грешки след lint fixes.

### Completion Notes List

- ✅ `CircuitBreakerService` разширен с in-memory sliding-window metrics (5 мин) агрегирани по `insurerCode` (cross-tenant)
- ✅ Нови методи: `getInsurerMetrics()`, `getAggregatedCircuitState()`, `resetBreakersForInsurer()`
- ✅ `Insurer` entity обновен с `isManuallyDisabled`, `disabledReason`, `disabledByAdminId` + TypeORM migration
- ✅ `QuotesRepository.findActiveInsurers()` вече филтрира и manually disabled insurers
- ✅ `AdminInsurerMonitorRepository` — cross-tenant insurer queries + transactional audit_log writes
- ✅ `AdminInsurerMonitorService` — dashboard, manual fallback activate/deactivate, 5-мин error rate check
- ✅ `AdminInsurerMonitorController` — 3 endpoints: GET monitor, POST disable, POST enable (super_admin only)
- ✅ `AdminInsurerMonitorJob` — @Cron('*/5 * * * *') error rate check
- ✅ `EmailService.sendInsurerAlertEmail()` добавен
- ✅ Seeder обновен с `seedInsurerManualFallbackDefaults()`
- ✅ Frontend page с auto-refresh (30s), circuit state badges, error rate highlighting
- ✅ Confirm modal за disable с reason input
- ✅ 3 Next.js API proxy routes
- ✅ Backend: 644 теста минаха (77 suites), lint ОК, build ОК
- ✅ Frontend: 213 теста минаха (35 suites), lint ОК, tsc ОК, build ОК

### File List

**Нови backend файлове:**
- `branivo-api/src/modules/quotes/circuit-breaker.service.spec.ts`
- `branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.ts`
- `branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.spec.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.service.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.service.spec.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.controller.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.controller.spec.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.job.ts`
- `branivo-api/src/modules/admin/admin-insurer-monitor.job.spec.ts`
- `branivo-api/src/modules/admin/dto/insurer-api-status-response.dto.ts`
- `branivo-api/src/modules/admin/dto/disable-insurer.dto.ts`
- `branivo-api/src/infrastructure/database/migrations/1710000029000-AddManualFallbackToInsurers.ts`

**Модифицирани backend файлове:**
- `branivo-api/src/modules/quotes/circuit-breaker.service.ts`
- `branivo-api/src/modules/quotes/entities/insurer.entity.ts`
- `branivo-api/src/modules/quotes/quotes.repository.ts`
- `branivo-api/src/modules/quotes/quotes.module.ts`
- `branivo-api/src/modules/admin/admin.module.ts`
- `branivo-api/src/common/email/email.service.ts`
- `branivo-api/src/infrastructure/database/seed.service.ts`

**Нови web файлове:**
- `branivo-web/src/app/[locale]/(admin)/insurers/page.tsx`
- `branivo-web/src/app/api/v1/admin/insurers/monitor/route.ts`
- `branivo-web/src/app/api/v1/admin/insurers/[id]/disable/route.ts`
- `branivo-web/src/app/api/v1/admin/insurers/[id]/enable/route.ts`
- `branivo-web/src/__tests__/admin/InsurerMonitorPage.test.tsx`
