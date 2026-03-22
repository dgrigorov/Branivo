# Story 6.3: Renewal Escalation Configuration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin,
I want to configure renewal notification timing and channels per tenant,
So that each broker can customize the escalation schedule to their clients' needs.

## Acceptance Criteria

1. **AC1 — Конфигуриране на escalation per tenant:**
   **Given** Super Admin отваря Renewal Configuration за тенант,
   **When** конфигурира escalation,
   **Then** може да задава за всеки stage: активни канали (push/SMS/имейл/dashboard) и ред на изпълнение

2. **AC2 — Tenant-специфична конфигурация при notification job:**
   **Given** escalation конфигурация е записана за тенант,
   **When** renewal check job queue-ва notification,
   **Then** `NotificationsService.deliverRenewalNotification()` използва tenant-специфичната конфигурация от `tenant_renewal_config` — не `DEFAULT_CHANNEL_MAP`

3. **AC3 — Platform default при липса на конфигурация:**
   **Given** няма custom конфигурация за тенант в `tenant_renewal_config`,
   **When** renewal notification job runs,
   **Then** използва platform default: `d_minus_30` → push, `d_minus_7` → push, `d_minus_3` → SMS, `d_minus_1` → email, `d_plus_1` → dashboard

4. **AC4 — Audit log при промяна:**
   **Given** escalation конфигурацията е обновена,
   **When** промяната е записана,
   **Then** INSERT в `audit_log` с: `tenant_id`, `user_id` (Super Admin), `action = 'renewal_config.updated'`, `entity_type = 'tenant'`, `entity_id = tenantId`, `metadata = { old_config, new_config }`

5. **AC5 — Disabled канал се пропуска:**
   **Given** Super Admin е деактивирал канал (напр. SMS) за тенант,
   **When** notification job runs за stage, където SMS е бил default,
   **Then** SMS се пропуска без грешка; следващият enabled канал в реда за stage-а се изпълнява

6. **AC6 — GET endpoint за текуща конфигурация:**
   **Given** Super Admin иска да види конфигурацията на тенант,
   **When** GET `/notifications/config/:tenantId`,
   **Then** връща текущата конфигурация (или platform default структурата ако няма custom)

7. **AC7 — PUT endpoint за обновяване на конфигурация:**
   **Given** Super Admin изпраща нова конфигурация,
   **When** PUT `/notifications/config/:tenantId`,
   **Then** UPSERT в `tenant_renewal_config` + audit log запис

## Tasks / Subtasks

### DB Migration

- [x] **Task 1: Миграция `1710000025000-CreateTenantRenewalConfig.ts`** (AC: #1, #2, #3)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000025000-CreateTenantRenewalConfig.ts`
  - [x] Таблица: `tenant_renewal_config` с UUID PK, `tenant_id UNIQUE`, `stages_config JSONB`, `created_at`, `updated_at`
  - [x] Down migration: `DROP TABLE IF EXISTS tenant_renewal_config`
  - [x] Без `deleted_at` — UPSERT pattern
  - [x] Без RLS — Super Admin context

### Backend — Entity & Types

- [x] **Task 2: Създай `TenantRenewalConfig` entity** (AC: #1, #2)
  - [x] Файл: `branivo-api/src/modules/notifications/entities/tenant-renewal-config.entity.ts`
  - [x] `StageConfig` interface и TypeORM entity с `stagesConfig: StageConfig[]` JSONB колона

### Backend — DTO

- [x] **Task 3: Създай DTOs** (AC: #6, #7)
  - [x] Файл: `branivo-api/src/modules/notifications/dto/upsert-renewal-config.dto.ts`
  - [x] Файл: `branivo-api/src/modules/notifications/dto/renewal-config-response.dto.ts`

### Backend — NotificationsRepository (разширен)

- [x] **Task 4: Разшири `NotificationsRepository`** (AC: #2, #3, #7)
  - [x] Файл: `branivo-api/src/modules/notifications/notifications.repository.ts`
  - [x] `findTenantRenewalConfig(tenantId)` → `StageConfig[] | null`
  - [x] `upsertTenantRenewalConfig(tenantId, stages)` → `StageConfig[] | null` (стара конфигурация)

### Backend — NotificationsService (разширен)

- [x] **Task 5: Разшири `NotificationsService`** (AC: #2, #3, #4, #5)
  - [x] Файл: `branivo-api/src/modules/notifications/notifications.service.ts`
  - [x] Премахнат `DEFAULT_CHANNEL_MAP` — заменен с `PLATFORM_DEFAULT_STAGES` static array
  - [x] `deliverRenewalNotification()` използва tenant config (AC2, AC3, AC5)
  - [x] `getTenantRenewalConfig()` — GET endpoint handler
  - [x] `upsertTenantRenewalConfig()` — PUT endpoint handler
  - [x] `writeRenewalConfigAuditLog()` — audit log с transaction (AC4)
  - [x] `dispatchChannel()` рефакторинг от `dispatchByChannel()`
  - [x] `DataSource` инжектиран в constructor

### Backend — NotificationsController (разширен)

- [x] **Task 6: Разшири `NotificationsController`** (AC: #6, #7)
  - [x] Файл: `branivo-api/src/modules/notifications/notifications.controller.ts`
  - [x] `GET /notifications/config/:tenantId` — Super Admin only
  - [x] `PUT /notifications/config/:tenantId` — Super Admin only с audit log

### Backend — NotificationsModule (разширен)

- [x] **Task 7: Разшири `NotificationsModule`** (AC: #1-#7)
  - [x] Файл: `branivo-api/src/modules/notifications/notifications.module.ts`
  - [x] `TenantRenewalConfig` добавен към `TypeOrmModule.forFeature()`

### Тестове

- [x] **Task 8: Обнови unit тест за `NotificationsService`** (AC: #2, #3, #4, #5)
  - [x] Файл: `branivo-api/src/modules/notifications/notifications.service.spec.ts`
  - [x] Всички нови тест случаи добавени и минаващи

- [x] **Task 9: Обнови unit тест за `NotificationsRepository`** (AC: #2, #7)
  - [x] Файл: `branivo-api/src/modules/notifications/notifications.repository.spec.ts`
  - [x] `findTenantRenewalConfig()` и `upsertTenantRenewalConfig()` тествани

- [x] **Task 10: Интеграционен тест за `NotificationsController`** (AC: #6, #7)
  - [x] Файл: `branivo-api/src/modules/notifications/notifications.controller.spec.ts`
  - [x] GET 200, PUT 200, PUT без роля → 403

### Seeder

- [x] **Task 11: Добави seed данни** (dev environment)
  - [x] Файл: `branivo-api/src/infrastructure/database/seed.service.ts`
  - [x] `seedTenantRenewalConfig()` метод с `ON CONFLICT DO NOTHING`
  - [x] Извикан от `onApplicationBootstrap()`

## Dev Notes

### Централна промяна — Замяна на DEFAULT_CHANNEL_MAP

Story 6.2 hard-code-a `DEFAULT_CHANNEL_MAP` в `notifications.service.ts:27-33` с TODO коментар:
```typescript
// TODO (Story 6.3): Replace DEFAULT_CHANNEL_MAP with tenant-specific config from DB
const DEFAULT_CHANNEL_MAP: Record<RenewalStage, NotificationChannel> = { ... };
```

**Story 6.3 замества тази константа** с DB-backed lookup:
1. `notificationsRepository.findTenantRenewalConfig(tenantId)` → `StageConfig[] | null`
2. Ако `null` → използва `PLATFORM_DEFAULT_STAGES` static array
3. `stageConfig.channels` е **наредена** колекция → изпълнява ги in order
4. Ако `stageConfig.enabled === false` → пропуска stage без грешка

### Разширен Channel Dispatch Flow (Story 6.3)

```
NotificationsService.deliverRenewalNotification(data)
  → notificationsRepository.findTenantRenewalConfig(tenantId) → StageConfig[] | null
  → if null: use PLATFORM_DEFAULT_STAGES
  → find stageConfig where stageConfig.stage === data.stage
  → if !stageConfig.enabled: log + return (AC5)
  → for each channel in stageConfig.channels (in order):
      → dispatchChannel(channel, ...)  [AC5 — disabled channels not in the array]
```

### DB Schema — tenant_renewal_config

```sql
-- Без RLS — Super Admin context (platform-level operation)
CREATE TABLE tenant_renewal_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL UNIQUE,   -- 1 config per tenant
  stages_config JSONB NOT NULL,         -- StageConfig[]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Example stages_config JSONB:
[
  { "stage": "d_minus_30", "channels": ["push"],       "enabled": true },
  { "stage": "d_minus_7",  "channels": ["push"],       "enabled": true },
  { "stage": "d_minus_3",  "channels": ["sms"],        "enabled": true },
  { "stage": "d_minus_1",  "channels": ["email"],      "enabled": false },
  { "stage": "d_plus_1",   "channels": ["dashboard"],  "enabled": true }
]
```

### Audit Log Pattern

Следва **точно** `feature-flags.service.ts:159-195`:
- Използва `dataSource.transaction()` с `SET LOCAL app.current_tenant_id`
- `action = 'renewal_config.updated'`
- `entity_type = 'tenant'`
- `metadata` = `JSON.stringify({ old_config: StageConfig[] | null, new_config: StageConfig[] })`
- Грешка при audit log не прекъсва основния flow — `try/catch` + `logger.error`

```typescript
// admin-tenants.service.ts:364-377 — exact pattern to follow
await this.dataSource.transaction(async (manager) => {
  await manager.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
  await manager.query(
    `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [tenantId, userId, 'renewal_config.updated', 'tenant', tenantId,
     JSON.stringify({ old_config, new_config })],
  );
});
```

### Controller Pattern — Super Admin Endpoints

Следва **точно** `admin-tenants.controller.ts:33-48`:
```typescript
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
```

- `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('super_admin')` — **двата декоратора задължително**
- `@Request() req: AuthenticatedRequest` → `req.user.userId` за Super Admin ID в audit log

### UPSERT Pattern — без soft delete

`tenant_renewal_config` е конфигурационна таблица — използва UPSERT:
```sql
INSERT INTO tenant_renewal_config (tenant_id, stages_config, updated_at)
VALUES ($1, $2, NOW())
ON CONFLICT (tenant_id) DO UPDATE
  SET stages_config = EXCLUDED.stages_config,
      updated_at = NOW()
```

Без `deleted_at`, без `TenantContext` (Super Admin context).

### Структура на Новите Файлове

```
branivo-api/src/modules/notifications/
├── notifications.module.ts              # разширен — TenantRenewalConfig entity
├── notifications.service.ts             # разширен — tenant config lookup, upsert, audit log
├── notifications.repository.ts          # разширен — findTenantRenewalConfig, upsertTenantRenewalConfig
├── notifications.controller.ts          # разширен — GET/PUT /config/:tenantId
├── notifications.service.spec.ts        # обновен — нови тест случаи
├── entities/
│   ├── notification-log.entity.ts       # непроменен
│   └── tenant-renewal-config.entity.ts  # НОВ
└── dto/
    ├── upsert-renewal-config.dto.ts     # НОВ
    └── renewal-config-response.dto.ts   # НОВ

branivo-api/src/infrastructure/database/migrations/
└── 1710000025000-CreateTenantRenewalConfig.ts  # НОВ
```

### TypeScript — Типове без `any`

```typescript
// В notifications.service.ts:
// StageConfig идва от tenant-renewal-config.entity.ts
// RenewalStage идва от renewal/renewal.repository.ts (re-export вече в notifications.service.ts)
// NotificationChannel идва от notification-log.entity.ts

// За JSONB колоната — TypeORM я return-ва като unknown при raw query:
const raw = await this.dataSource.query<Array<{ stages_config: StageConfig[] }>>(...)
// ИЛИ ползвай TypeORM repo.findOne() за typed result

// За DataSource.transaction callback:
await this.dataSource.transaction(async (manager: EntityManager) => { ... })
```

### Зависимост от Story 6.2

Story 6.3 **разширява** `NotificationsService` от Story 6.2. Ключови файлове от Story 6.2:
- `notifications.service.ts` — `deliverRenewalNotification()` трябва да се рефакторира (TODO коментар)
- `notifications.repository.ts` — разширяваме с нови методи
- `notifications.module.ts` — добавяме нов entity

### Съществуващи Pattern References

- `branivo-api/src/modules/tenants/feature-flags.service.ts:159-195` — audit log pattern с transaction + metadata
- `branivo-api/src/modules/admin/admin-tenants.controller.ts:33-48` — Super Admin guard pattern
- `branivo-api/src/modules/notifications/notifications.service.ts:26-33` — DEFAULT_CHANNEL_MAP (за замяна)
- `branivo-api/src/modules/notifications/notifications.repository.ts:45-75` — raw SQL DataSource.query() pattern
- `branivo-api/src/infrastructure/database/seed.service.ts` — seeder pattern с ON CONFLICT DO NOTHING

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3] — User story, AC, escalation config requirements
- [Source: _bmad-output/planning-artifacts/epics.md#FR41] — Super Admin конфигурира renewal escalation per tenant
- [Source: _bmad-output/implementation-artifacts/6-2-multi-channel-notification-delivery.md#Dev Notes] — TODO Story 6.3 коментар, DEFAULT_CHANNEL_MAP, PLATFORM_DEFAULT
- [Source: branivo-api/src/modules/notifications/notifications.service.ts:26-33] — DEFAULT_CHANNEL_MAP за замяна
- [Source: branivo-api/src/modules/tenants/feature-flags.service.ts:159-195] — audit log transaction pattern
- [Source: branivo-api/src/modules/admin/admin-tenants.controller.ts:33-48] — Super Admin guard decorators pattern
- [Source: branivo-api/src/modules/notifications/notifications.repository.ts] — raw SQL platform context pattern
- [Source: branivo-api/src/infrastructure/database/migrations/1710000024000-CreateNotificationLog.ts] — последна migration за timestamp reference (следваща: 1710000025000)
- [Source: branivo-api/src/infrastructure/database/seed.service.ts] — seeder pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Имплементирани всички 11 таска от story 6.3
- `DEFAULT_CHANNEL_MAP` заменен с `PLATFORM_DEFAULT_STAGES` static array в `NotificationsService`
- `deliverRenewalNotification()` вече зарежда tenant config от DB (AC2) или fallback към platform default (AC3)
- Disabled stage (AC5) се пропуска без грешка чрез `stageConfig?.enabled` check
- Audit log при промяна на конфигурация (AC4) следва точно pattern от `feature-flags.service.ts`
- 490/490 тестове минават, lint чист, build успешен
- 3 нови spec файла: repository.spec.ts, controller.spec.ts (нови), service.spec.ts (обновен)

### File List

- branivo-api/src/infrastructure/database/migrations/1710000025000-CreateTenantRenewalConfig.ts (НОВ)
- branivo-api/src/modules/notifications/entities/tenant-renewal-config.entity.ts (НОВ)
- branivo-api/src/modules/notifications/dto/upsert-renewal-config.dto.ts (НОВ)
- branivo-api/src/modules/notifications/dto/renewal-config-response.dto.ts (НОВ)
- branivo-api/src/modules/notifications/notifications.repository.ts (ОБНОВЕН)
- branivo-api/src/modules/notifications/notifications.service.ts (ОБНОВЕН)
- branivo-api/src/modules/notifications/notifications.controller.ts (ОБНОВЕН)
- branivo-api/src/modules/notifications/notifications.module.ts (ОБНОВЕН)
- branivo-api/src/modules/notifications/notifications.service.spec.ts (ОБНОВЕН)
- branivo-api/src/modules/notifications/notifications.repository.spec.ts (ОБНОВЕН)
- branivo-api/src/modules/notifications/notifications.controller.spec.ts (ОБНОВЕН)
- branivo-api/src/infrastructure/database/seed.service.ts (ОБНОВЕН)

## Change Log

- 2026-03-22: Имплементирана Story 6.3 — Renewal Escalation Configuration. Добавена DB таблица `tenant_renewal_config`, TypeORM entity, DTOs, разширени Repository/Service/Controller/Module. Заменен `DEFAULT_CHANNEL_MAP` с DB-backed tenant config и PLATFORM_DEFAULT_STAGES fallback. Добавен audit log при промяна. 490/490 тестове минават.
- 2026-03-22: Code review fixes — H1: fallback domain `branivo.com` → `{slug}.branivo.bg` (PRD compliance); M1: `@ArrayMinSize(1)` на `channels` в StageConfigDto; M2: `@ArrayMinSize(1)` на `stages` в UpsertRenewalConfigDto; M3: redundant INDEX в migration премахнат; M4: добавен 401 тест в controller spec; L1: разграничен "not configured" от "disabled" log; L2: redundant `@IsString()` премахнат. 495/495 тестове минават.
