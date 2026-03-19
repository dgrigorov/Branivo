# Story 2.3: Feature Flags Management

Status: done

## Story

As a Broker,
I want to enable or disable platform features for my tenant,
So that I can control which functionality my clients see without requiring a code deployment.

## Acceptance Criteria

1. **AC1 — Управление на feature toggles:**
   **Given** логнат broker_admin в Dashboard,
   **When** отвори Feature Management страницата,
   **Then** вижда следните 7 toggles с human-readable labels и кратко описание:
   - **Fleet Management** (`features.fleet`)
   - **Каско Застраховка** (`features.kasko`)
   - **API Достъп** (`features.api_access`)
   - **Стикер Доставка** (`features.sticker_delivery`)
   - **Цифров Констативен Протокол** (`features.dkp`)
   - **SMS Известия за Подновяване** (`features.renewal_sms`)
   - **Push Известия за Подновяване** (`features.renewal_push`)

2. **AC2 — Незабавно влизане в сила:**
   **Given** broker_admin toggles feature flag,
   **When** промяната е запазена,
   **Then** влиза в сила незабавно за всички заявки към техния tenant — Redis кешът за tenant config се инвалидира, без restart/deploy

3. **AC3 — Скриване на disabled features:**
   **Given** feature е disabled,
   **When** краен клиент опита да го достъпи,
   **Then** feature е скрит от UI — FeatureFlagGuard връща 403 към API; UI не показва грешка в конзолата

4. **AC4 — Audit logging:**
   **Given** промяна на feature flag,
   **When** е приложена,
   **Then** се логва в `audit_log`:
   - `tenant_id` — текущия тенант
   - `user_id` — текущия broker_admin
   - `action` = `'feature_flag.updated'`
   - `entity_type` = `'tenant'`
   - `entity_id` = tenant UUID
   - `metadata` = `{ flag: string, old_value: boolean, new_value: boolean }`

5. **AC5 — Plan-tier ограничения (UI):**
   **Given** flag е restricted от tenant plan,
   **When** broker_admin опита да го включи,
   **Then** toggle е disabled с ясно съобщение: "Изисква Professional/Enterprise план"

6. **AC6 — Plan-tier validation (backend):**
   **Given** broker_admin изпраща PATCH с plan-restricted flag = true,
   **When** tenant е на Starter план,
   **Then** API връща 403 Forbidden с `{ message: "Feature 'fleet' requires Professional or Enterprise plan" }`

## Tasks / Subtasks

### Backend — DTO

- [x] **Task 1: UpdateFeatureFlagsDto** (AC: #2, #6)
  - [x] Създай `branivo-api/src/modules/tenants/dto/update-feature-flags.dto.ts`:
    ```typescript
    import { IsBoolean, IsOptional } from 'class-validator';

    export class UpdateFeatureFlagsDto {
      @IsOptional() @IsBoolean() fleet?: boolean;
      @IsOptional() @IsBoolean() kasko?: boolean;
      @IsOptional() @IsBoolean() api_access?: boolean;
      @IsOptional() @IsBoolean() sticker_delivery?: boolean;
      @IsOptional() @IsBoolean() dkp?: boolean;
      @IsOptional() @IsBoolean() renewal_sms?: boolean;
      @IsOptional() @IsBoolean() renewal_push?: boolean;
    }
    ```
  - [x] Само listed полета са позволени — unpermitted ключове се игнорират от class-transformer

- [x] **Task 2: FeatureFlagsResponseDto** (AC: #1, #5)
  - [x] Създай `branivo-api/src/modules/tenants/dto/feature-flags-response.dto.ts`:
    ```typescript
    export interface FeatureFlagDefinition {
      key: string;
      enabled: boolean;
      planRestricted: boolean;         // true = toggle е disabled за текущия план
      requiredPlan: string | null;     // напр. 'professional' — null ако няма ограничение
    }

    export class FeatureFlagsResponseDto {
      flags!: FeatureFlagDefinition[];
    }
    ```

### Backend — Service

- [x] **Task 3: FeatureFlagsService** (AC: #2, #4, #5, #6)
  - [x] Създай `branivo-api/src/modules/tenants/feature-flags.service.ts`
  - [x] **Критично:** JSONB update използва `|| '{"key": value}'::jsonb` патерна — не зарежда целия обект в Node.js и не го презаписва, за да избегне race conditions
  - [x] **Критично:** audit_log е IMMUTABLE — само INSERT, никога UPDATE/DELETE

### Backend — Controller

- [x] **Task 4: FeatureFlagsController** (AC: #1, #2, #6)
  - [x] Създай `branivo-api/src/modules/tenants/feature-flags.controller.ts`
  - [x] **Забележка:** `JwtAuthGuard` е в `modules/auth/guards/` — не в `common/guards/` (learned от Story 2.1)

### Backend — Обнови TenantsModule

- [x] **Task 5: Добави FeatureFlagsController и FeatureFlagsService в TenantsModule** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/tenants/tenants.module.ts`
  - [x] Добави imports за `FeatureFlagsController` и `FeatureFlagsService`
  - [x] Добави в `controllers: [..., FeatureFlagsController]`
  - [x] Добави в `providers: [..., FeatureFlagsService]`

### Next.js Web — BFF Route

- [x] **Task 6: BFF route за feature flags** (AC: #1, #2)
  - [x] Създай `branivo-web/src/app/api/v1/tenants/features/route.ts`

### Next.js Web — Feature Flags страница

- [x] **Task 7: Feature Flags Management страница** (AC: #1, #2, #3, #5)
  - [x] Създай `branivo-web/src/app/[locale]/(broker)/settings/features/page.tsx`
  - [x] Страницата е `'use client'` компонент (TanStack Query)
  - [x] UI: заглавие, 7 toggles с labels/descriptions, plan restriction badges
  - [x] Human-readable labels за всички 7 флага
  - [x] TanStack Query: useQuery за GET, useMutation за PATCH с cache invalidation
  - [x] Optimistic update + rollback при грешка
  - [x] При 403: показва error message от API

### Тестове

- [x] **Task 8: Unit тестове за FeatureFlagsService** (AC: #2, #4, #6)
  - [x] `branivo-api/src/modules/tenants/feature-flags.service.spec.ts` — 11 теста
  - [x] Test: getFeatureFlags — връща всички 7 флага с правилен enabled/planRestricted
  - [x] Test: getFeatureFlags — Starter план → fleet/kasko/api_access са planRestricted = true
  - [x] Test: updateFeatureFlags — Starter опитва fleet = true → ForbiddenException
  - [x] Test: updateFeatureFlags — Professional може да включи fleet = true
  - [x] Test: updateFeatureFlags — успешна промяна → Redis DEL извикан
  - [x] Test: updateFeatureFlags — без промяна (oldValue === newValue) → audit_log НЕ се пише
  - [x] Test: audit log failure → не хвърля, само log-ва грешката

- [x] **Task 9: Integration тестове за FeatureFlagsController** (AC: #1, #2, #6)
  - [x] `branivo-api/src/modules/tenants/feature-flags.controller.spec.ts` — 5 теста
  - [x] Test: GET с broker_admin → 200 с масив от 7 flags
  - [x] Test: PATCH валиден flag, broker_admin → 204
  - [x] Test: PATCH plan-restricted flag на Starter → 403

- [x] **Task 10: Component тест за Feature Flags страница** (AC: #1, #5)
  - [x] `branivo-web/src/__tests__/broker/settings/features.page.test.tsx` — 5 теста
  - [x] Test: показва 7 toggles с правилни labels
  - [x] Test: plan-restricted flags са disabled с badge
  - [x] Test: toggle change извиква PATCH мутацията
  - [x] Test: при 403 грешка показва error state

## Dev Notes

### Критично: features полето вече съществува — без нова миграция

`tenants.features` (JSONB, default `{}`) вече е в `Tenant` entity и `tenants` таблица от Story 1.1. **Не се прави нова миграция.** Само се пишат нов service/controller за управление.

### JSONB Update Pattern

**ВАЖНО:** Не зареждай целия `tenant.features` обект в Node.js и не го презаписвай — използвай JSONB merge оператора директно в SQL:

```typescript
await this.tenantRepo
  .createQueryBuilder()
  .update(Tenant)
  .set({
    features: () => `features || '{"fleet": true}'::jsonb`,
  })
  .where('id = :id', { id: tenantId })
  .execute();
```

Това е atomic операция на PostgreSQL ниво и предотвратява race conditions при concurrent requests.

### Redis Cache Invalidation

Tenant config кешът (включващ features) се инвалидира след всяка промяна:

```typescript
await this.redis.del(RedisKeyHelper.build(tenantId, 'config', 'tenant'));
// → 'tenant:{tenantId}:config:tenant'
```

`TenantsService.getTenantConfig()` ще го рефрешне от DB при следващата заявка.

### Audit Log Pattern

Следвай абсолютно идентичния pattern от `AdminTenantsService.writeAuditLog()`:

```typescript
await this.dataSource.transaction(async (manager) => {
  await manager.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
  await manager.query(
    `INSERT INTO audit_log (...) VALUES (...)`,
    [tenantId, userId, 'feature_flag.updated', 'tenant', entityId, jsonbMetadata],
  );
});
```

`SET LOCAL app.current_tenant_id` е задължително — RLS политиката за `audit_log` го изисква. Без него INSERT ще fail-не.

### Plan Tier Map

```
Starter   (€149/мес) → fleet: ❌, kasko: ❌, api_access: ❌
Professional (€399/мес) → fleet: ✅, kasko: ✅, api_access: ✅
Enterprise    (custom)  → всички: ✅
```

Source: [PRD Subscription Tiers table]

### JwtAuthGuard — правилният path

```typescript
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// НЕ от: '../../common/guards/jwt-auth.guard'
```

Learned от Story 2.1 debug log.

### Съществуваща FeatureFlagGuard инфраструктура

`FeatureFlagGuard` и `FeatureFlag` decorator вече съществуват и се ползват от другите stories за gate-ване на endpoints. Story 2.3 само добавя управлението на флаговете — самата enforcement логика вече работи.

### Migration Numbering (reference)

```
1710000008000-AddDomainVerificationStatus.ts  ← Story 2.2 (последна)
```

**Следваща migration** (ако е нужна в бъдеще): `1710000009000-...`
За Story 2.3 **не е нужна migration**.

### Project Structure Notes

**Нови файлове:**
```
branivo-api/src/modules/tenants/
├── dto/
│   ├── update-feature-flags.dto.ts          ← Task 1
│   └── feature-flags-response.dto.ts        ← Task 2
├── feature-flags.service.ts                 ← Task 3
├── feature-flags.service.spec.ts            ← Task 8
├── feature-flags.controller.ts              ← Task 4
└── feature-flags.controller.spec.ts         ← Task 9

branivo-web/src/app/api/v1/tenants/features/
└── route.ts                                 ← Task 6

branivo-web/src/app/[locale]/(broker)/settings/features/
└── page.tsx                                 ← Task 7

branivo-web/src/__tests__/broker/settings/
└── features.page.test.tsx                   ← Task 10
```

**Модифицирани файлове:**
```
branivo-api/src/modules/tenants/tenants.module.ts  ← Task 5
```

### References

- [Source: epics.md#Story 2.3] — User story, Acceptance Criteria, 7 feature flags
- [Source: prd.md#Subscription Tiers] — Starter/Professional/Enterprise plan feature matrix
- [Source: branivo-api/src/modules/tenants/entities/tenant.entity.ts] — features JSONB колона
- [Source: branivo-api/src/common/guards/feature-flag.guard.ts] — Съществуваща FeatureFlagGuard
- [Source: branivo-api/src/common/decorators/feature-flag.decorator.ts] — FeatureFlag decorator
- [Source: branivo-api/src/modules/admin/admin-tenants.service.ts#writeAuditLog] — Audit log pattern с SET LOCAL
- [Source: branivo-api/src/modules/tenants/tenants.service.ts#updateBranding] — Redis cache invalidation pattern
- [Source: branivo-api/src/infrastructure/database/migrations/1710000005000-CreateAuditLogTable.ts] — audit_log schema
- [Source: Story 2.1 Dev Notes] — JwtAuthGuard path, BFF proxy pattern
- [Source: Story 2.2 Dev Notes] — JSONB patterns, Redis DEL pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

Няма debug issues — имплементацията следваше точно story spec-а.

### Completion Notes List

- Имплементирани всички 10 задачи без отклонения от story spec-а
- Без нова DB миграция — `tenants.features` JSONB колоната вече съществуваше от Story 1.1
- JSONB update е atomic на PostgreSQL ниво чрез `|| '{"key": value}'::jsonb` оператора
- Redis cache инвалидиране след всяка промяна — незабавно влизане в сила (AC2)
- audit_log записи само при реална промяна (oldValue !== newValue) — IMMUTABLE pattern
- Optimistic UI updates с rollback при грешка в страницата
- 223/223 backend тестове минаха; 5/5 Web компонент тестове минаха
- Всички CI checks успешни: lint, tsc, build

### File List

- `branivo-api/src/modules/tenants/dto/update-feature-flags.dto.ts` (ново)
- `branivo-api/src/modules/tenants/dto/feature-flags-response.dto.ts` (ново)
- `branivo-api/src/modules/tenants/feature-flags.service.ts` (ново)
- `branivo-api/src/modules/tenants/feature-flags.service.spec.ts` (ново)
- `branivo-api/src/modules/tenants/feature-flags.controller.ts` (ново)
- `branivo-api/src/modules/tenants/feature-flags.controller.spec.ts` (ново)
- `branivo-api/src/modules/tenants/tenants.module.ts` (модифицирано)
- `branivo-web/src/app/api/v1/tenants/features/route.ts` (ново)
- `branivo-web/src/app/[locale]/(broker)/settings/features/page.tsx` (ново)
- `branivo-web/src/__tests__/broker/settings/features.page.test.tsx` (ново)
- `_bmad-output/implementation-artifacts/2-3-feature-flags-management.md` (модифицирано)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (модифицирано)

## Change Log

- 2026-03-19: Story 2.3 Feature Flags Management имплементирана — FeatureFlagsService, FeatureFlagsController, BFF route, Feature Flags страница с оптимистични обновления, 21 нови теста
- 2026-03-19: Code review fixes — H1: добавени 7 supertest HTTP-level теста (401/403/400); M1: Redis DEL само при реална промяна; M2: explicit flag whitelist check преди SQL; M3: try/catch error handling в BFF route; 2 допълнителни unit теста (228/228 общо)
