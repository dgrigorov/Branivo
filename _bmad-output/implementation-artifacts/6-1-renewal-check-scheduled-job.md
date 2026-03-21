# Story 6.1: Renewal Check Scheduled Job

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Platform,
I want to daily check for expiring policies and trigger the appropriate notification stage,
So that clients are reminded at the right time through the configured escalation schedule.

## Acceptance Criteria

1. **AC1 — Daily cron at 08:00 EET:**
   **Given** it is 08:00 `Europe/Sofia` time,
   **When** daily scheduled job runs (`{ pattern: '0 8 * * *', tz: 'Europe/Sofia' }`),
   **Then** проверява всички активни полици и идентифицира тези с изтичане на D-30, D-7, D-3, D-1 и D+1

2. **AC2 — Notification job queueing:**
   **Given** an expiring policy is detected at the correct stage,
   **When** job runs,
   **Then** notification job се queue-ва в `notifications` BullMQ queue с `policy_id`, `stage`, `tenant_id`, `coverage_end_date`

3. **AC3 — Escalation stop при renewal:**
   **Given** a policy is renewed after D-30 notification (нова активна полица за същото МПС),
   **When** renewal check job runs for subsequent stages (D-7, D-3, D-1),
   **Then** escalation се спира автоматично — клиентът не получава notifications за вече подновена полица

4. **AC4 — Idempotency:**
   **Given** renewal check job runs for the same policy and stage,
   **When** (policy_id, stage) вече е записан в `renewal_notification_log`,
   **Then** job не се queue-ва отново (идемпотентен insert с ON CONFLICT DO NOTHING)

5. **AC5 — Retry с DLQ:**
   **Given** notification job fails,
   **When** BullMQ retry runs,
   **Then** retry с exponential backoff (attempts: 3, delay: 5000ms); след 3 неуспешни опита → dead letter queue + Super Admin алерт (NFR13)

6. **AC6 — D+1 Broker Dashboard:**
   **Given** D+1 stage is reached,
   **When** policy is still not renewed,
   **Then** broker получава notification в Dashboard за клиент с изтекла полица (job `notification:renewal` с stage `d_plus_1`)

## Tasks / Subtasks

### DB Migration

- [x] **Task 1: Създай миграция `1710000022000-CreateRenewalNotificationLog.ts`** (AC: #2, #4)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000022000-CreateRenewalNotificationLog.ts`
  - [x] Таблица: `renewal_notification_log`
  - [x] Колони:
    ```sql
    CREATE TABLE renewal_notification_log (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL,
      policy_id    UUID NOT NULL,
      stage        VARCHAR(20) NOT NULL,  -- 'd_minus_30', 'd_minus_7', 'd_minus_3', 'd_minus_1', 'd_plus_1'
      queued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (policy_id, stage)
    );
    CREATE INDEX idx_renewal_notification_log_tenant_id ON renewal_notification_log(tenant_id);
    ```
  - [x] Down migration: `DROP TABLE IF EXISTS renewal_notification_log`
  - [x] **КРИТИЧНО:** Без RLS policy — тази таблица се записва от platform-level cron (без TenantContext), не от user request

### Backend — RenewalModule

- [x] **Task 2: Създай `renewal.module.ts`** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/renewal/renewal.module.ts`
  - [x] Pattern: следвай `BillingModule` — implements `OnApplicationBootstrap`
  - [x] В `onApplicationBootstrap()`: регистрирай cron job в `notifications` BullMQ queue:
    ```typescript
    await this.notificationsQueue.add(
      RENEWAL_JOB_RUN_DAILY_CHECK,
      {},
      {
        repeat: { cron: '0 8 * * *', tz: 'Europe/Sofia' },
        jobId: 'daily-renewal-check',
      },
    );
    ```
  - [x] Imports: `TypeOrmModule.forFeature([RenewalNotificationLog])`, `BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })`, `EmailModule`
  - [x] Providers: `RenewalService`, `RenewalRepository`, `RenewalCheckProcessor`
  - [x] **КРИТИЧНО:** `QUEUE_NOTIFICATIONS` е вече дефиниран в `src/infrastructure/queues/queue.module.ts` — НЕ добавяй нов queue; само регистрирай в `BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })`

- [x] **Task 3: Добави `RenewalModule` в `app.module.ts`** (AC: #1)
  - [x] Файл: `branivo-api/src/app.module.ts`
  - [x] Добави `RenewalModule` в imports масива след `BillingModule`
  - [x] Добави импорт: `import { RenewalModule } from './modules/renewal/renewal.module';`

### Backend — RenewalNotificationLog Entity

- [x] **Task 4: Създай entity за `renewal_notification_log`** (AC: #4)
  - [x] Файл: `branivo-api/src/modules/renewal/entities/renewal-notification-log.entity.ts`
  - [x] TypeORM entity с UUID PK, `tenant_id`, `policy_id`, `stage`, `queued_at`, `created_at`
  - [x] Без `@DeleteDateColumn` — това е лог таблица, не се soft-delete-ва
  - [x] Без `@UpdateDateColumn` — логовете са IMMUTABLE

### Backend — RenewalRepository

- [x] **Task 5: Създай `renewal.repository.ts`** (AC: #1, #3, #4)
  - [x] Файл: `branivo-api/src/modules/renewal/renewal.repository.ts`
  - [x] **НЕ** extends `BaseRepository` (тази таблица е platform-scoped, не tenant-scoped)
  - [x] Методи:
    ```typescript
    // Намери активни полици с изтичане на определен ден
    findExpiringPolicies(targetDate: Date): Promise<ExpiringPolicyRow[]>

    // Провери дали (policy_id, stage) вече е записан (idempotency check)
    hasNotificationBeenQueued(policyId: string, stage: RenewalStage): Promise<boolean>

    // Провери дали полицата е подновена (нова активна полица за същото МПС)
    isPolicyRenewed(vehicleId: string, coverageEndDate: Date): Promise<boolean>

    // Запиши queued notification
    recordQueuedNotification(tenantId: string, policyId: string, stage: RenewalStage): Promise<void>
    ```
  - [x] `findExpiringPolicies` raw SQL с `t.status IN ('active', 'stripe_revoked')` (без RLS scope)
  - [x] `isPolicyRenewed` — проверява нова активна полица за същото МПС след датата на изтичане
  - [x] `recordQueuedNotification` с `ON CONFLICT (policy_id, stage) DO NOTHING` — idempotent

### Backend — RenewalService

- [x] **Task 6: Създай `renewal.service.ts`** (AC: #1-#6)
  - [x] Файл: `branivo-api/src/modules/renewal/renewal.service.ts`
  - [x] Инжектирани зависимости: `RenewalRepository`, `@InjectQueue(QUEUE_NOTIFICATIONS) notificationsQueue: Queue`, `ConfigService`, `EmailService`
  - [x] Дефинирай stages и техните date offsets (d_minus_30: 30, d_plus_1: -1)
  - [x] Главен метод `runDailyCheck()` — итерира всички 5 stages
  - [x] Помощен метод `processStage(stage, targetDate, today)` — idempotency + escalation stop + queue
  - [x] Метод `notifySuperAdminOnFailure(error: Error)` — emailService.sendRenewalFailureAlert()

### Backend — RenewalCheckProcessor

- [x] **Task 7: Създай `renewal-check.processor.ts`** (AC: #1, #5)
  - [x] Файл: `branivo-api/src/modules/renewal/processors/renewal-check.processor.ts`
  - [x] MAX 20 реда — само dispatch, без business logic
  - [x] Слуша `QUEUE_NOTIFICATIONS` за job `RENEWAL_JOB_RUN_DAILY_CHECK`
  - [x] `@OnQueueFailed()` — уведомява Super Admin при final attempt failure

### Тестове

- [x] **Task 8: Unit тест за `RenewalService`** (AC: #1-#6)
  - [x] Файл: `branivo-api/src/modules/renewal/renewal.service.spec.ts`
  - [x] Тествай: runDailyCheck() → 5 stages ✓, D-30 queue params ✓, idempotency ✓, escalation stop ✓, D+1 ✓, jobId format ✓
  - [x] **Без `any` тип** — typed mock objects

- [x] **Task 9: Unit тест за `RenewalCheckProcessor`** (AC: #5)
  - [x] Файл: `branivo-api/src/modules/renewal/processors/renewal-check.processor.spec.ts`
  - [x] handleDailyCheck() → runDailyCheck() ✓, onFailed() final attempt → notifySuperAdminOnFailure() ✓, non-final → skip ✓

### Seeder

- [x] **Task 10: Провери дали seed данни са нужни**
  - [x] `renewal_notification_log` е лог таблица — **БЕЗ seed данни нужни**
  - [x] Нов модул без конфигурационни данни → няма нужда от `seedRenewal()` в `seed.service.ts`

## Dev Notes

### Архитектурен Overview — Renewal Check Flow

```
Daily Cron (08:00 Europe/Sofia)
  → BullMQ `notifications` queue (job: 'renewal:daily-check', repeat: { cron: '0 8 * * *' })
  → RenewalCheckProcessor.handleDailyCheck() [MAX 20 lines — dispatch only]
  → RenewalService.runDailyCheck()
    → For each stage (d_minus_30, d_minus_7, d_minus_3, d_minus_1, d_plus_1):
      → RenewalRepository.findExpiringPolicies(targetDate)
      → For each policy:
        → Check idempotency: hasNotificationBeenQueued()
        → Check escalation stop: isPolicyRenewed() [skip for d_minus_30]
        → notifications_queue.add('notification:renewal', { policyId, stage, tenantId })
        → RenewalRepository.recordQueuedNotification()
  ← Job 'notification:renewal' се обработва от Story 6.2 NotificationProcessor
```

### Date Offset Logic — КРИТИЧНО

```typescript
// today = 2026-03-21 (Sofia midnight)
// D-30: полици изтичащи след 30 дни → coverageEndDate = 2026-04-20
//       targetDate = today + 30 days
// D-7:  полици изтичащи след 7 дни  → coverageEndDate = 2026-03-28
//       targetDate = today + 7 days
// D+1:  полици изтекли вчера         → coverageEndDate = 2026-03-20
//       targetDate = today - 1 day

const daysOffsets: Record<RenewalStage, number> = {
  d_minus_30: 30,  // POSITIVE: policy expires 30 days from now
  d_minus_7:  7,
  d_minus_3:  3,
  d_minus_1:  1,
  d_plus_1:  -1,   // NEGATIVE: policy expired yesterday
};
const targetDate = new Date(today);
targetDate.setDate(today.getDate() + daysOffsets[stage]);
```

**Честа грешка:** объркване на посоката — D-30 означава "30 дни ДО изтичане", не "30 дни СЛЕД".

### Cron Registration — Pattern от BillingModule

```typescript
// renewal.module.ts — следвай ТОЧНО billing.module.ts pattern
export class RenewalModule implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.notificationsQueue.add(
      RENEWAL_JOB_RUN_DAILY_CHECK,  // 'renewal:daily-check'
      {},
      {
        repeat: { cron: '0 8 * * *', tz: 'Europe/Sofia' },
        jobId: 'daily-renewal-check',  // Stable jobId → prevents duplicate cron registration
      },
    );
  }
}
```

**КРИТИЧНО:** `QUEUE_NOTIFICATIONS` е дефиниран в `src/infrastructure/queues/queue.module.ts:6`. Не добавяй нов export — просто импортирай. `QueueModule` вече е в `app.module.ts` globals.

### Processor на QUEUE_NOTIFICATIONS — Конфликт с Future Story 6.2!

Story 6.1 регистрира `RenewalCheckProcessor` на `QUEUE_NOTIFICATIONS`. Story 6.2 ще добави `NotificationProcessor` на същия queue. BullMQ поддържа multiple processors на един queue — всеки `@Process('job-name')` слуша само за конкретното job name.

**Важно:** `RenewalCheckProcessor` слуша само за `RENEWAL_JOB_RUN_DAILY_CHECK = 'renewal:daily-check'`. Story 6.2 ще слуша за `'notification:renewal'`. Без конфликт.

### Структура на Новия Модул

```
branivo-api/src/modules/renewal/
├── renewal.module.ts                        # OnApplicationBootstrap → cron registration
├── renewal.service.ts                       # runDailyCheck() business logic
├── renewal.repository.ts                    # raw SQL queries (platform-scoped, without RLS)
├── renewal.service.spec.ts                  # unit tests
├── entities/
│   └── renewal-notification-log.entity.ts   # TypeORM entity
└── processors/
    ├── renewal-check.processor.ts           # MAX 20 lines — dispatch only
    └── renewal-check.processor.spec.ts      # unit tests
```

### RenewalRepository — Raw SQL без RLS

Tози repository работи в **platform context** (без TenantContext) — cron job не е HTTP request. Използвай `DataSource.query()` директно. **НИКОГА** не използвай `TenantContext.getTenantId()` тук.

```typescript
// ПРАВИЛНО:
@Injectable()
export class RenewalRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findExpiringPolicies(targetDate: Date): Promise<ExpiringPolicyRow[]> {
    return this.dataSource.query<ExpiringPolicyRow[]>(`
      SELECT p.id, p.tenant_id, p.vehicle_id, p.coverage_end_date, p.end_client_id
      FROM policies p
      JOIN tenants t ON p.tenant_id = t.id
      WHERE p.status = 'active'
        AND p.deleted_at IS NULL
        AND t.status IN ('active', 'stripe_revoked')  -- polici sa dostapni i pri revoked broker
        AND t.deleted_at IS NULL
        AND DATE(p.coverage_end_date AT TIME ZONE 'Europe/Sofia') = $1::date
    `, [targetDate]);
  }
}
```

**Защо `stripe_revoked` се включва?** Клиентите на revoked брокер имат валидни полици → те трябва да получат renewal notifications.

### Policy Entity — Ключови Полета

```typescript
// branivo-api/src/modules/policies/entities/policy.entity.ts
policy.id              // UUID
policy.tenantId        // за tenant_id в renewal_notification_log
policy.vehicleId       // за isPolicyRenewed() check (nullable!)
policy.coverageEndDate // DATE — датата на изтичане
policy.status          // PolicyStatus.ACTIVE
```

**КРИТИЧНО:** `vehicleId` е nullable (line 65 в policy.entity.ts). При `vehicleId === null` → skip `isPolicyRenewed()` check (не може да знаем дали е подновена без vehicle).

### BullMQ Job Naming Convention

```typescript
// Имената следват '{queue}:{action}' convention от architecture.md
export const RENEWAL_JOB_RUN_DAILY_CHECK = 'renewal:daily-check';   // cron trigger
// Notification jobs (за Story 6.2):
// 'notification:renewal' — изпращане на renewal notification до краен клиент
// job data: { policyId, stage, tenantId, coverageEndDate }
```

**Не използвай:** `'daily-check'`, `'RENEWAL_CHECK'`, `'run-renewal'` — невалидни по конвенция.

### TypeScript Типизация — Без `any`

```typescript
// Дефинирай типове в renewal.repository.ts или renewal.types.ts:
export type RenewalStage = 'd_minus_30' | 'd_minus_7' | 'd_minus_3' | 'd_minus_1' | 'd_plus_1';

export interface ExpiringPolicyRow {
  id: string;
  tenant_id: string;
  vehicle_id: string | null;
  coverage_end_date: Date;
  end_client_id: string | null;
}

// В processor:
interface RenewalJobData {
  policyId: string;
  stage: RenewalStage;
  tenantId: string;
  coverageEndDate: string; // ISO string (Date не се сериализира добре в BullMQ)
}
// Cast: const data = job.data as RenewalJobData;
```

### Tenant Status при Renewal Check

Полиците на `stripe_revoked` брокери са валидни — клиентите трябва да получат renewal reminders. Само `status = 'suspended'` или `deleted_at IS NOT NULL` excluded. Включи `t.status IN ('active', 'stripe_revoked')` в SQL query.

### Existing Pattern — BillingModule за Reference

Billing module (Story 5.3) е директен reference за Renewal:
- `billing.module.ts:28-36` — `onApplicationBootstrap` cron регистрация
- `invoice-generation.processor.ts:31-117` — Processor pattern с `@OnQueueFailed()`
- `billing.service.ts:248-273` — `notifySuperAdminOnFailure()` pattern

### Project Structure Notes

- `QUEUE_NOTIFICATIONS = 'notifications'` — вече в `src/infrastructure/queues/queue.module.ts:6`
- `QueueModule` е global в `app.module.ts` → `BullModule.registerQueue` в `RenewalModule` просто re-регистрира (OK — BullMQ дедуплицира)
- `ScheduleModule.forRoot()` е в `app.module.ts:44` — не е нужен за BullMQ cron; billing module не го използва
- Last migration: `1710000021000-CreateInvoices.ts` → следващата е `1710000022000`

### References

- [Source: branivo-api/src/modules/billing/billing.module.ts:23-38] — OnApplicationBootstrap cron регистрация pattern
- [Source: branivo-api/src/modules/billing/processors/invoice-generation.processor.ts:31-118] — Processor pattern с @Process + @OnQueueFailed
- [Source: branivo-api/src/modules/billing/billing.service.ts:248-273] — notifySuperAdminOnFailure() pattern
- [Source: branivo-api/src/infrastructure/queues/queue.module.ts:6] — QUEUE_NOTIFICATIONS константа
- [Source: branivo-api/src/modules/policies/entities/policy.entity.ts:67-71] — coverageEndDate (nullable DATE)
- [Source: branivo-api/src/app.module.ts:21-61] — Import structure за нов модул (добави след BillingModule)
- [Source: branivo-api/src/infrastructure/database/migrations/1710000021000-CreateInvoices.ts] — Last migration, следващата е 1710000022000
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1] — User story, AC, stages (D-30/D-7/D-3/D-1/D+1)
- [Source: _bmad-output/planning-artifacts/architecture.md#BullMQ Queue Architecture] — 3 queues, notifications = time-sensitive; MAX 20 lines processor rule
- [Source: _bmad-output/planning-artifacts/architecture.md#BullMQ Job Naming] — '{queue}:{action}' конвенция
- [Source: _bmad-output/planning-artifacts/architecture.md#Structure Patterns/NestJS Module] — задължителна структура
- [Source: _bmad-output/planning-artifacts/epics.md#FR37-FR42] — Renewal FR references

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Entity fields needed `!` definite assignment operators (TS2564)
- Processor `handleDailyCheck` parameter dropped entirely (unused var lint error)
- Spec rewritten with plain mock objects (not `jest.Mocked<T>`) to avoid `unbound-method` and `no-unsafe-assignment` lint errors; `mock.calls as NotificationAddArgs[]` typed cast

### Completion Notes List

- ✅ DB migration `1710000022000-CreateRenewalNotificationLog.ts` created without RLS (platform-level table)
- ✅ `RenewalNotificationLog` TypeORM entity — immutable log, no soft-delete, no update columns
- ✅ `RenewalRepository` — raw SQL platform-scoped queries, includes `stripe_revoked` tenants
- ✅ `RenewalService.runDailyCheck()` — 5 stages with correct date offsets (d_minus_30: +30, d_plus_1: -1), idempotency check, escalation stop for non-30 stages, nullable vehicleId guard
- ✅ `RenewalCheckProcessor` — 20 lines max, dispatch-only, `@OnQueueFailed` notifies Super Admin on final attempt
- ✅ `EmailService.sendRenewalFailureAlert()` added to email infrastructure
- ✅ `RenewalModule` added to `app.module.ts` after `BillingModule`
- ✅ 15 unit tests passing (2 spec files), 454 total suite tests passing
- ✅ lint 0 errors, build successful

### File List

- `branivo-api/src/infrastructure/database/migrations/1710000022000-CreateRenewalNotificationLog.ts` (new)
- `branivo-api/src/modules/renewal/renewal.module.ts` (new)
- `branivo-api/src/modules/renewal/renewal.service.ts` (new)
- `branivo-api/src/modules/renewal/renewal.repository.ts` (new)
- `branivo-api/src/modules/renewal/renewal.service.spec.ts` (new)
- `branivo-api/src/modules/renewal/entities/renewal-notification-log.entity.ts` (new)
- `branivo-api/src/modules/renewal/processors/renewal-check.processor.ts` (new)
- `branivo-api/src/modules/renewal/processors/renewal-check.processor.spec.ts` (new)
- `branivo-api/src/app.module.ts` (modified — added RenewalModule)
- `branivo-api/src/infrastructure/email/email.service.ts` (modified — added sendRenewalFailureAlert)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — 6-1 → review)

### Change Log

- 2026-03-21: Implemented Story 6.1 — Renewal Check Scheduled Job. Created RenewalModule with daily cron at 08:00 EET, RenewalService with 5-stage date logic, RenewalRepository with platform-scoped raw SQL (includes stripe_revoked tenants), idempotency via ON CONFLICT DO NOTHING, escalation stop for renewed policies, BullMQ exponential backoff with Super Admin DLQ alert.
