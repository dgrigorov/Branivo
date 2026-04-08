# Story 11.16: Data Breach Response Workflow

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin (и Compliance Officer),
I want да мога да регистрирам, управлявам и проследявам нарушения на сигурността на лични данни (data breaches) с автоматично изчисляване на 72-часовия КЗЛД deadline и alerts при приближаване на срока,
so that Branivo спазва задълженията по GDPR чл. 33 (нотификация до КЗЛД в рамките на 72 часа) и чл. 34 (нотификация до засегнатите лица при висок риск), и поддържа задължителен breach register по чл. 30, ал. 5.

## Acceptance Criteria

### AC1 — `data_breaches` таблицата съществува с правилна схема

**Given** миграцията `1710000065000-CreateDataBreachRegister.ts` е изпълнена,
**When** `data_breaches` таблицата се провери,
**Then** съдържа следните колони:
- `id` UUID PK DEFAULT gen_random_uuid()
- `tenant_id` UUID NULL FK → tenants.id (NULL = platform-wide breach)
- `title` VARCHAR(255) NOT NULL
- `description` TEXT NOT NULL
- `breach_type` VARCHAR(50) NOT NULL — стойности: `unauthorized_access`, `data_loss`, `data_exposure`, `ransomware`, `accidental_disclosure`, `insider_threat`, `other`
- `severity` VARCHAR(20) NOT NULL — стойности: `low`, `medium`, `high`, `critical`
- `detected_at` TIMESTAMPTZ NOT NULL — моментът на установяване на нарушението (начало на 72ч. срока)
- `reported_by` UUID NULL FK → users.id
- `affected_data_categories` JSONB NOT NULL DEFAULT '[]' — масив от string категории: `['name', 'email', 'phone', 'egn', 'address', 'payment_data', 'vehicle_data', 'policy_data', 'health_data', 'other']`
- `affected_subjects_count` INTEGER NULL — приблизителен брой засегнати лица (NULL = неизвестно)
- `affected_subjects_description` TEXT NULL — описание на категориите засегнати лица
- `kzld_notification_required` BOOLEAN NOT NULL DEFAULT true
- `kzld_notified_at` TIMESTAMPTZ NULL — попълва се при изпращане на нотификацията
- `kzld_notification_reference` VARCHAR(255) NULL — референтен номер от КЗЛД
- `kzld_notification_deadline` TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (`detected_at` + INTERVAL '72 hours') STORED
- `client_notification_required` BOOLEAN NOT NULL DEFAULT false
- `client_notification_sent_at` TIMESTAMPTZ NULL
- `status` VARCHAR(30) NOT NULL DEFAULT 'detected' — стойности: `detected`, `investigating`, `contained`, `notified_kzld`, `notified_clients`, `closed`
- `containment_actions` TEXT NULL
- `remediation_actions` TEXT NULL
- `lessons_learned` TEXT NULL
- `closed_at` TIMESTAMPTZ NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

**И** следните constraints/indexes:
- UNIQUE index `idx_data_breaches_tenant_id` на `(tenant_id)`? НЕ — може да има много нарушения. Index `idx_data_breaches_tenant_status` на `(tenant_id, status)`.
- Index `idx_data_breaches_detected_at` на `(detected_at DESC)` — за deadline queries.
- Index `idx_data_breaches_kzld_deadline` на `(kzld_notification_deadline, kzld_notified_at)` — за BullMQ job.
- **ЗАБЕЛЕЖКА:** Таблицата **няма** `deleted_at` колона — breach records са immutable compliance records. Update е позволен само за полета `status`, `kzld_notified_at`, `kzld_notification_reference`, `client_notification_sent_at`, `containment_actions`, `remediation_actions`, `lessons_learned`, `closed_at`, `client_notification_required`. `detected_at`, `title`, `description`, `breach_type`, `severity`, `affected_data_categories` са immutable след създаване.

### AC2 — Super Admin може да регистрира ново нарушение (breach report)

**Given** автентициран Super Admin (`super_admin` роля) прави `POST /api/v1/admin/data-breaches`,
**When** тялото съдържа:
```json
{
  "tenantId": "uuid-or-null",
  "title": "Unauthorized access to client PII",
  "description": "...",
  "breachType": "unauthorized_access",
  "severity": "high",
  "detectedAt": "2026-04-06T10:00:00Z",
  "affectedDataCategories": ["name", "email", "egn"],
  "affectedSubjectsCount": 150,
  "affectedSubjectsDescription": "End clients with active policies",
  "clientNotificationRequired": true
}
```
**Then**:
1. Нов запис се създава в `data_breaches` с `status = 'detected'`
2. `kzld_notification_required = true` по подразбиране (може да се override при create с `kzldNotificationRequired: false` само ако `severity = 'low'`)
3. `kzld_notification_deadline` се изчислява автоматично като `detectedAt + 72 hours`
4. Запис в `audit_log`: `{ action: 'data_breach.reported', entityType: 'data_breach', entityId, tenantId: breach.tenantId ?? 'platform', userId }`
5. Ако `kzld_notification_required = true` — изпраща се имейл alert до Super Admin с темплейт `data-breach-reported` (виж AC6)
6. Отговор: `{ id, title, status, detectedAt, kzldNotificationDeadline, kzldNotificationRequired, createdAt }`; статус 201.

### AC3 — Super Admin може да обновява статуса на нарушение

**Given** автентициран Super Admin прави `PATCH /api/v1/admin/data-breaches/:id`,
**When** тялото съдържа едно или повече от позволените полета:
```json
{
  "status": "notified_kzld",
  "kzldNotifiedAt": "2026-04-07T14:00:00Z",
  "kzldNotificationReference": "КЗЛД-2026-0042",
  "containmentActions": "...",
  "remediationActions": "...",
  "clientNotificationRequired": true,
  "clientNotificationSentAt": "2026-04-07T16:00:00Z",
  "lessonsLearned": "...",
  "closedAt": "2026-04-08T09:00:00Z"
}
```
**Then**:
1. Само позволените mutable полета се обновяват — immutable полета (`title`, `description`, `breachType`, `severity`, `detectedAt`, `affectedDataCategories`) са игнорирани дори ако са подадени
2. При `status = 'closed'` → `closedAt` се записва ако не е подаден
3. Запис в `audit_log`: `{ action: 'data_breach.updated', entityType: 'data_breach', entityId, tenantId, userId, metadata: { changedFields: [...] } }`
4. Отговор: пълен DTO на обновения запис; статус 200.

### AC4 — Super Admin може да листи всички нарушения с филтри

**Given** автентициран Super Admin прави `GET /api/v1/admin/data-breaches`,
**When** заявката е с query params `?status=detected&tenantId=uuid&severity=high&page=1&limit=20`,
**Then**:
1. Листва всички нарушения matching на зададените филтри (всички са опционални)
2. Сортирани `detected_at DESC`
3. Пагинация: `{ items: [...], total, page, limit }`
4. Всеки item включва: `{ id, tenantId, title, breachType, severity, status, detectedAt, kzldNotificationDeadline, kzldNotifiedAt, kzldNotificationRequired, hoursUntilDeadline, isOverdue }`
5. `hoursUntilDeadline` = изчислено поле: `Math.max(0, differenceInHours(kzldNotificationDeadline, now))` ако `kzldNotifiedAt IS NULL`; `null` ако вече нотифициран
6. `isOverdue` = `kzldNotifiedAt IS NULL AND kzldNotificationRequired AND kzldNotificationDeadline < NOW()`

### AC5 — BullMQ job изпраща alerts при приближаване на 72ч. deadline

**Given** `DataBreachAlertJob` се изпълнява на всеки 4 часа (cron: `0 */4 * * *`),
**When** job-ът се изпълни,
**Then**:
1. Зарежда всички нарушения с `kzld_notification_required = true AND kzld_notified_at IS NULL AND status NOT IN ('closed')`
2. За всяко нарушение:
   - Ако `deadline` е в рамките на следващите **24 часа** → изпраща имейл alert `data-breach-24h-warning` до Super Admin
   - Ако `deadline` е в рамките на следващите **8 часа** → изпраща имейл alert `data-breach-8h-urgent` до Super Admin (по-голяма urgency)
   - Ако `deadline` е **изтекъл** → изпраща имейл alert `data-breach-overdue` до Super Admin; status update на `metadata.overdueAlertSentAt` (за да не се изпраща многократно)
3. Alerts НЕ се изпращат ако вече е изпратен такъв от същия тип в последните 4 часа (deduplication чрез Redis key с TTL 4h: `breach-alert:{breachId}:{alertType}`)

### AC6 — Имейл шаблони за breach alerts съществуват

**Given** настъпи събитие изискващо имейл нотификация (нов breach, 24h warning, 8h urgent, overdue),
**When** `NotificationsService.sendBreachAlert(alertType, breach)` се извика,
**Then**:
1. Тип `data-breach-reported` → имейл с subject: `[BRANIVO] Нов GDPR инцидент регистриран: {title}` и тяло съдържащо: title, severity, detectedAt, kzldNotificationDeadline, link към admin UI
2. Тип `data-breach-24h-warning` → subject: `[BRANIVO] ⚠️ GDPR Breach: 24 часа до КЗЛД deadline — {title}`
3. Тип `data-breach-8h-urgent` → subject: `[BRANIVO] 🚨 URGENT: 8 часа до КЗЛД deadline — {title}`
4. Тип `data-breach-overdue` → subject: `[BRANIVO] ❌ ПРОСРОЧЕН КЗЛД срок за: {title}`
5. Всички имейли се изпращат до Super Admin имейла (от tenant конфигурацията или platform config)
6. Имейлите използват `NotificationsService` (съществуващ сервис — не се създава нов) с `sendEmail()` метода

### AC7 — Валидация на breach data

**Given** Super Admin прави `POST /api/v1/admin/data-breaches` с невалидни данни,
**When** валидацията се изпълни,
**Then**:
1. `detectedAt` в бъдещето → `400 Bad Request` с `{ error: 'INVALID_DETECTED_AT', message: 'detectedAt cannot be in the future' }`
2. `severity = 'low'` и `kzldNotificationRequired = true` (опит за нотификация при нисък риск) → позволено, само warning в response metadata
3. `affectedDataCategories` = `['egn', 'health_data']` → `severity` автоматично се повишава до минимум `'high'` (special category data — GDPR чл. 9) — warning в response: `{ warning: 'SEVERITY_AUTO_ELEVATED', message: 'Special category data detected; severity elevated to high' }`
4. `tenantId` = невалиден UUID → `400 Bad Request`
5. `tenantId` = UUID на несъществуващ tenant → `404 Not Found`

### AC8 — Breach statistics endpoint за Super Admin dashboard

**Given** автентициран Super Admin прави `GET /api/v1/admin/data-breaches/stats`,
**When** заявката е обработена,
**Then** се връща:
```json
{
  "total": 5,
  "byStatus": {
    "detected": 1,
    "investigating": 2,
    "contained": 1,
    "notified_kzld": 0,
    "notified_clients": 1,
    "closed": 0
  },
  "bySeverity": { "low": 1, "medium": 2, "high": 1, "critical": 1 },
  "overdueCount": 0,
  "approachingDeadlineCount": 1,
  "last30Days": 3,
  "complianceRate": 0.8
}
```
- `complianceRate` = `(breaches where kzld_notified_at <= kzld_notification_deadline OR kzld_notification_required = false) / total breaches` (само за closed breaches)

### AC9 — Broker Admin вижда само своите тенант нарушения (read-only)

**Given** автентициран `broker_admin` прави `GET /api/v1/tenants/data-breaches`,
**When** заявката е обработена,
**Then**:
1. Вижда само нарушения с `tenant_id = TenantContext.getTenantId()`
2. Отговорът НЕ съдържа `platform-wide` нарушения (`tenant_id IS NULL`)
3. `broker_admin` **не може** да създава или редактира нарушения — само Super Admin (403 при опит)
4. Показаните полета: `id, title, severity, status, detectedAt, kzldNotificationRequired, kzldNotifiedAt` — `description` и детайлни полета са включени (broker трябва да знае какво е станало с техния тенант)

### AC10 — Unit тестове покриват DataBreachService логиката

**Given** `DataBreachService` е имплементиран,
**When** `npm run test:cov` се изпълни,
**Then** следните случаи са покрити:
- `reportBreach()` → creates record, fires audit log, sends email alert
- `reportBreach()` с `affectedDataCategories` включващи `egn` или `health_data` → severity auto-elevation
- `reportBreach()` с `detectedAt` в бъдещето → throws `BadRequestException`
- `updateBreach()` → обновява само mutable полета; immutable полета се игнорират
- `updateBreach()` с `status = 'closed'` → auto-sets `closedAt`
- `getBreaches()` → правилна пагинация и филтриране
- `getBreaches()` → `isOverdue` и `hoursUntilDeadline` изчислявани коректно
- `DataBreachAlertJob` → изпраща 24h alert само при < 24h до deadline
- `DataBreachAlertJob` → deduplication: не изпраща два пъти за един и същ breach

### AC11 — Seed данни за dev среда

**Given** `npm run dev` се стартира,
**When** `SeedService.seedDataBreaches()` се изпълни,
**Then** в demo tenant се създават 2 примерни нарушения с `ON CONFLICT DO NOTHING`:
1. Closed breach: `title = 'Test: Email exposure incident'`, `severity = 'medium'`, `status = 'closed'`, `kzld_notified_at` попълнено
2. Active breach: `title = 'Test: Potential unauthorized access'`, `severity = 'high'`, `status = 'investigating'`, `kzld_notified_at = NULL`, `detected_at = NOW() - INTERVAL '48 hours'` (в рамките на 72ч. deadline)

### AC12 — Lint, build и тестове минават без грешки

**Given** имплементацията е завършена,
**When** се изпълни `npm run lint && npm run test:cov && npm run build`,
**Then** 0 lint errors, 0 warnings; всички тестове минават; build успешен.

---

## Tasks / Subtasks

- [x] **Task 1: DB Migration** (AC1)
  - [x] 1.1 Създай `branivo-api/src/infrastructure/database/migrations/1710000065000-CreateDataBreachRegister.ts`
  - [x] 1.2 CREATE TABLE `data_breaches` с всички колони от AC1 — UUID PK, tenant_id NULL FK, immutable fields, status/severity VARCHAR
  - [x] 1.3 `kzld_notification_deadline` — изчислява се в Service при INSERT (detectedAt + 72 hours) и се записва като обикновена колона
  - [x] 1.4 Indexes: `idx_data_breaches_tenant_status`, `idx_data_breaches_detected_at`, `idx_data_breaches_kzld_deadline`
  - [x] 1.5 `down()` метод: `DROP TABLE IF EXISTS data_breaches`
  - [x] 1.6 **ЗАБЕЛЕЖКА**: Без `deleted_at` — breach records не се изтриват; без RLS по tenant (Super Admin вижда всички)

- [x] **Task 2: TypeORM Entity** (AC1)
  - [x] 2.1 Създай `branivo-api/src/modules/compliance/entities/data-breach.entity.ts`
  - [x] 2.2 Колони с explicit `{ name: 'snake_case' }` — задължително per architecture convention
  - [x] 2.3 `kzldNotificationDeadline` — изчислява се в service и се записва в таблицата

- [x] **Task 3: DTOs** (AC2, AC3, AC4, AC8)
  - [x] 3.1 Създай `branivo-api/src/modules/compliance/dto/report-data-breach.dto.ts` — с class-validator декоратори; `@IsISO8601()` за `detectedAt`; `@IsIn([...])` за `breachType` и `severity`; `@IsUUID()` за `tenantId`; `@IsArray() @IsString({ each: true })` за `affectedDataCategories`
  - [x] 3.2 Създай `branivo-api/src/modules/compliance/dto/update-data-breach.dto.ts` — само mutable полета, всички optional
  - [x] 3.3 Създай `branivo-api/src/modules/compliance/dto/data-breach-response.dto.ts` — включва изчислените `hoursUntilDeadline: number | null` и `isOverdue: boolean`
  - [x] 3.4 Създай `branivo-api/src/modules/compliance/dto/data-breach-stats-response.dto.ts`
  - [x] 3.5 Създай `branivo-api/src/modules/compliance/dto/list-data-breaches.dto.ts` — query params: `status?`, `tenantId?`, `severity?`, `page?`, `limit?`

- [x] **Task 4: DataBreachService** (AC2, AC3, AC4, AC7, AC8, AC9)
  - [x] 4.1 Създай `branivo-api/src/modules/compliance/data-breach.service.ts`
  - [x] 4.2 `async reportBreach(dto: ReportDataBreachDto, userId: string): Promise<DataBreachResponseDto>`
  - [x] 4.3 `async updateBreach(id: string, dto: UpdateDataBreachDto, userId: string): Promise<DataBreachResponseDto>`
  - [x] 4.4 `async getBreaches(query: ListDataBreachesDto)`
  - [x] 4.5 `async getBreachById(id: string): Promise<DataBreachResponseDto>`
  - [x] 4.6 `async getStats(): Promise<DataBreachStatsResponseDto>`
  - [x] 4.7 `async getBrokerBreaches(tenantId: string): Promise<DataBreachResponseDto[]>`

- [x] **Task 5: DataBreachAdminController** (AC2, AC3, AC4, AC8)
  - [x] 5.1 Създай `branivo-api/src/modules/compliance/data-breach-admin.controller.ts`
  - [x] 5.2 `@Controller('admin/data-breaches')`, `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles('super_admin')`
  - [x] 5.3 `POST /` → `reportBreach()`
  - [x] 5.4 `PATCH /:id` → `updateBreach()`
  - [x] 5.5 `GET /` → `getBreaches()` с query params
  - [x] 5.6 `GET /stats` → `getStats()` (**преди** `/:id` route за да няма конфликт)
  - [x] 5.7 `GET /:id` → `getBreachById()`

- [x] **Task 6: DataBreachBrokerController** (AC9)
  - [x] 6.1 Създай `branivo-api/src/modules/compliance/data-breach-broker.controller.ts`
  - [x] 6.2 `@Controller('tenants/data-breaches')`, `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles('broker_admin', 'broker_agent')`
  - [x] 6.3 `GET /` → `getBrokerBreaches(TenantContext.getTenantId())`

- [x] **Task 7: DataBreachAlertJob** (AC5, AC6)
  - [x] 7.1 Създай `branivo-api/src/modules/compliance/data-breach-alert.job.ts`
  - [x] 7.2 `@Injectable()` class `DataBreachAlertJob` с `@Cron('0 */4 * * *')` декоратор (от `@nestjs/schedule`)
  - [x] 7.3 Логика — 24h/8h/overdue alerts с Redis dedup key `breach-alert:{id}:{type}` TTL 4h
  - [x] 7.4 Inject: `DataBreachService`, `REDIS_CLIENT` (ioredis)
  - [x] 7.5 `ScheduleModule.forRoot()` вече е в AppModule

- [x] **Task 8: ComplianceModule — регистрация** (AC2–AC9)
  - [x] 8.1 В `compliance.module.ts` добавени: `DataBreach` entity, `DataBreachService`, `DataBreachAdminController`, `DataBreachBrokerController`, `DataBreachAlertJob`
  - [x] 8.2 `ScheduleModule.forRoot()` вече присъства в AppModule

- [x] **Task 9: SeedService — seedDataBreaches()** (AC11)
  - [x] 9.1 В `branivo-api/src/infrastructure/database/seed.service.ts` добавен метод `seedDataBreaches()`
  - [x] 9.2 INSERT 2 записа с `ON CONFLICT DO NOTHING` (по фиксиран UUID за идемпотентност)
  - [x] 9.3 Извикан `seedDataBreaches()` от `seedDemoTenantIfNeeded()`

- [x] **Task 10: Unit тестове** (AC10)
  - [x] 10.1 Създаден `branivo-api/src/modules/compliance/data-breach.service.spec.ts`
  - [x] 10.2 Тест: `reportBreach` → creates record + audit log + email alert
  - [x] 10.3 Тест: `reportBreach` с EGN data → severity auto-elevated
  - [x] 10.4 Тест: `reportBreach` с `detectedAt` в бъдещето → throws `BadRequestException`
  - [x] 10.5 Тест: `updateBreach` → само mutable полета се обновяват
  - [x] 10.6 Тест: `updateBreach` с `status = 'closed'` → `closedAt` auto-set
  - [x] 10.7 Тест: `DataBreachAlertJob` → изпраща 24h alert; deduplication работи

- [x] **Task 11: Final check** (AC12)
  - [x] 11.1 `npm run lint` — 0 errors, 0 warnings ✅
  - [x] 11.2 `npm run test:cov` — 1017 теста, всички минават ✅
  - [x] 11.3 `npm run build` — успешен build ✅

---

## Dev Notes

### Регулаторна рамка — GDPR задължения

**GDPR чл. 33 — Нотификация до надзорния орган (КЗЛД):**
- Срок: **72 часа** от установяването на нарушението (`detected_at`)
- Задължителна ако нарушението е вероятно да породи риск за правата и свободите на физически лица
- Изключение: ако е малко вероятно нарушението да породи риск → не се изисква нотификация (`kzld_notification_required = false`)
- При невъзможност в 72ч. → незабавно изпращане с обосновка за закъснение
- КЗЛД е Комисия за защита на личните данни (cpdp.bg), Bulgarian DPA

**GDPR чл. 34 — Нотификация до засегнатите лица:**
- Изисква се само при **висок риск** за физически лица
- Severity `high` или `critical` → `client_notification_required` трябва да е оценено
- Special category data (`egn`, `health_data`) → автоматично high risk

**GDPR чл. 30, ал. 5 — Breach Register:**
- Всички нарушения трябва да се документират (дори ако не се нотифицира КЗЛД)
- `data_breaches` таблицата е именно тоя задължителен register
- Records са IMMUTABLE — не се изтриват

### Архитектурни паттерни (следвай ТОЧНО)

**Модул:** `branivo-api/src/modules/compliance/` — вече съществуващ модул; добавяй в него
- Entity: `entities/data-breach.entity.ts`
- DTOs: `dto/report-data-breach.dto.ts`, `dto/update-data-breach.dto.ts` и др.
- Service: `data-breach.service.ts`
- Controllers: `data-breach-admin.controller.ts`, `data-breach-broker.controller.ts`
- Job: `data-breach-alert.job.ts`
- Tests: `data-breach.service.spec.ts`

**TenantContext:**
- Broker endpoints: `TenantContext.getTenantId()` — НИКОГА като param
- Super Admin endpoints: `tenantId` идва от request body/query param (super admin може да оперира cross-tenant)

**AuditService:**
- Story 11-4 (`ready-for-dev`) въвежда `AuditService` с hash chain — ако е вече имплементирана, inject-вай `AuditService` и извиквай `this.auditService.log()`
- Ако 11-4 **не е** имплементирана още, използвай директен INSERT в `audit_log` (по модела от `privacy-policy.service.ts` — виж AC6 на story 11-4 за точния SQL)

**NotificationsService:**
- Проверете текущия `notifications.service.ts` за метода за изпращане на имейл — вероятно е `sendEmail(to, subject, body)` или подобен
- Ако методът за breach alerts не съществува, добавете `sendBreachAlert(type, breach)` private метод в `DataBreachService` директно (не в NotificationsService, за да не разширяваме друг модул)

**BullMQ/Cron:**
- Провери дали `@nestjs/schedule` и `ScheduleModule.forRoot()` са вече в AppModule
- `@Cron('0 */4 * * *')` — всеки 4 часа
- Redis deduplication: inject `@InjectRedis()` от `@liaoliaots/nestjs-redis` (вероятно вече използван)

**Migration naming:**
- Следващата migration: `1710000065000-CreateDataBreachRegister.ts`
- Последната е `1710000063000-CreateCookiePoliciesAndConsents.ts`
- Story 11-4 ще използва `1710000064000-AddHashChainToAuditLog.ts` — **не използвай тази стойност**

### Project Structure Notes

**Compliance модулна структура (от git):**
```
branivo-api/src/modules/compliance/
├── entities/
│   ├── tenant-privacy-policy.entity.ts      ✅ existing
│   ├── tenant-tos-version.entity.ts         ✅ existing
│   ├── end-client-tos-acceptance.entity.ts  ✅ existing
│   ├── tenant-cookie-policy.entity.ts       ✅ existing
│   ├── cookie-consent-record.entity.ts      ✅ existing
│   └── data-breach.entity.ts               🆕 create
├── dto/
│   └── ... (existing + new breach DTOs)    🆕 6 new DTOs
├── compliance.module.ts                    ✏️ update
├── pii-registry.service.ts               ✅ existing
├── privacy-policy.service.ts             ✅ existing
├── tos.service.ts                         ✅ existing
├── cookie-policy.service.ts              ✅ existing (story 11-13)
├── cookie-consent.service.ts             ✅ existing (story 11-13)
├── data-breach.service.ts                🆕 create
├── data-breach.service.spec.ts           🆕 create
├── data-breach-admin.controller.ts       🆕 create
├── data-breach-broker.controller.ts      🆕 create
└── data-breach-alert.job.ts              🆕 create
```

**Routing pattern:**
- Super Admin: `POST /api/v1/admin/data-breaches` — следва admin routing pattern от `admin.controller.ts`
- Broker: `GET /api/v1/tenants/data-breaches` — следва tenant-scoped routing

### References

- GDPR Article 33 нотификация: срок 72 часа от `detected_at` — [Source: sprint-status.yaml, story comment 11-16]
- Compliance module existing structure: [Source: branivo-api/src/modules/compliance/compliance.module.ts]
- AuditService hash chain pattern: [Source: _bmad-output/implementation-artifacts/11-4-tamper-evident-audit-log.md#AC2]
- Migration naming convention: [Source: branivo-api/src/infrastructure/database/migrations/ — последна: 1710000063000]
- Privacy Policy pattern (версиониране, public endpoint): [Source: branivo-api/src/modules/compliance/privacy-policy.service.ts]
- Cookie Policy pattern (gated consent): [Source: _bmad-output/implementation-artifacts/11-13-cookie-policy-banner.md]
- TenantContext usage: [Source: CLAUDE.md — НИКОГА не предавай tenant_id като функционален параметър]
- Cron pattern: [Source: _bmad-output/planning-artifacts/architecture.md — BullMQ workers, NFR27]
- Special category data (EGN): [Source: _bmad-output/implementation-artifacts/11-1-data-classification-pii-taxonomy.md — PII_SPECIAL_CATEGORY]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
