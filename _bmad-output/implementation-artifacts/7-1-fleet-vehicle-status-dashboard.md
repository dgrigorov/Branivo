# Story 7.1: Fleet Vehicle Status Dashboard

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Fleet Admin,
I want to see all fleet vehicles with their insurance status at a glance,
So that I can immediately identify which vehicles need policy renewal.

## Acceptance Criteria

1. **AC1 — Цветови статус индикатор:**
   **Given** `features.fleet` е активиран за тенанта,
   **When** Fleet Admin отваря Fleet Dashboard,
   **Then** вижда всички МПС с colorblind-friendly статус индикатор:
   - 🟢 ✓ Зелено: > 30 дни до изтичане
   - 🟡 ⚠ Жълто: 1–30 дни до изтичане
   - 🔴 ✕ Червено: изтекла полица

2. **AC2 — Данни за всяко МПС:**
   **Given** Fleet Dashboard зарежда данни,
   **When** данните са извлечени,
   **Then** за всяко МПС се показва: регистрационен номер, модел/марка, застраховател, дата на изтичане на полицата, статус

3. **AC3 — Филтриране по статус:**
   **Given** Fleet Admin разглежда dashboard-а,
   **When** филтрира по статус (зелено/жълто/червено),
   **Then** списъкът се обновява и показва само МПС с избрания статус

4. **AC4 — Feature flag guard:**
   **Given** `features.fleet` е деактивиран за тенанта,
   **When** Fleet Admin се опита да достъпи Fleet Dashboard,
   **Then** получава `404 Not Found` — endpoint не е достъпен

5. **AC5 — Tenant isolation:**
   **Given** Fleet Admin е логнат,
   **When** данните се зареждат,
   **Then** вижда САМО МПС, принадлежащи на собствения тенант — без cross-tenant data leakage

6. **AC6 — Pagination:**
   **Given** тенантът има много МПС,
   **When** API се извика с `page` и `limit` параметри,
   **Then** отговорът следва стандартния list response формат с `total`, `page`, `limit` мета данни

## Tasks / Subtasks

### DB Migration

- [x] **Task 1: Миграция `1710000026000-CreateFleetVehicles.ts`** (AC: #5)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000026000-CreateFleetVehicles.ts`
  - [x] Таблица `fleet_vehicles`: UUID PK, `tenant_id UUID NOT NULL`, `vehicle_id UUID NOT NULL` (FK → vehicles.id), `driver_user_id UUID NULL` (FK → users.id), `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ NULL`
  - [x] Index: `(tenant_id, deleted_at)` за бързи fleet queries
  - [x] Down migration: `DROP TABLE IF EXISTS fleet_vehicles`

### Backend — Entity

- [x] **Task 2: Създай `FleetVehicle` entity** (AC: #2, #5)
  - [x] Файл: `branivo-api/src/modules/fleet/entities/fleet-vehicle.entity.ts`
  - [x] TypeORM entity с `tenantId`, `vehicleId`, `driverUserId` (nullable), relations към `Vehicle` и `User`
  - [x] Задължително: `@Column({ name: 'tenant_id' })`, `@Column({ name: 'vehicle_id' })`, `@Column({ name: 'driver_user_id', nullable: true })`

### Backend — DTO

- [x] **Task 3: Създай DTOs** (AC: #1, #2, #3, #6)
  - [x] Файл: `branivo-api/src/modules/fleet/dto/fleet-vehicle-response.dto.ts`
    - Fields: `id`, `vehicleId`, `licensePlate`, `make`, `model`, `insurerName`, `policyExpiresAt: Date | null`, `status: 'green' | 'yellow' | 'red'`
  - [x] Файл: `branivo-api/src/modules/fleet/dto/fleet-vehicle-filter.dto.ts`
    - `status?: 'green' | 'yellow' | 'red'`, `page?: number`, `limit?: number` с `@IsOptional()` и `@IsEnum()` декоратори

### Backend — Repository

- [x] **Task 4: Създай `FleetRepository`** (AC: #2, #3, #5, #6)
  - [x] Файл: `branivo-api/src/modules/fleet/fleet.repository.ts`
  - [x] Extends `BaseRepository<FleetVehicle>`
  - [x] `findFleetVehicles(tenantId: string, filter: FleetVehicleFilterDto): Promise<{ items: FleetVehicleWithPolicy[]; total: number }>`
    - JOIN с `vehicles` таблица за licensePlate, make, model
    - LEFT JOIN с последната активна `policy` за всяко vehicle (WHERE `status = 'active'` ORDER BY `created_at DESC` LIMIT 1)
    - Задължително `WHERE fleet_vehicles.tenant_id = $tenantId AND fleet_vehicles.deleted_at IS NULL`
    - При `filter.status` → филтриране след status изчисление (HAVING или WHERE на computed field)
    - Pagination: `LIMIT $limit OFFSET ($page - 1) * $limit`

### Backend — Service

- [x] **Task 5: Създай `FleetService`** (AC: #1, #2, #3, #4, #5, #6)
  - [x] Файл: `branivo-api/src/modules/fleet/fleet.service.ts`
  - [x] `getFleetVehicles(filter: FleetVehicleFilterDto): Promise<{ data: FleetVehicleResponseDto[]; meta: PaginationMeta }>`
    - `TenantContext.getTenantId()` — НЕ като параметър
    - Извиква `fleetRepository.findFleetVehicles(tenantId, filter)`
    - `calculateStatus(policyExpiresAt: Date | null): 'green' | 'yellow' | 'red'`:
      - `null` → `'red'` (без полица)
      - `daysUntilExpiry > 30` → `'green'`
      - `daysUntilExpiry >= 1 && <= 30` → `'yellow'`
      - `daysUntilExpiry < 1` → `'red'`
    - Маппинг към `FleetVehicleResponseDto[]`

### Backend — Controller

- [x] **Task 6: Създай `FleetController`** (AC: #1, #2, #3, #4, #6)
  - [x] Файл: `branivo-api/src/modules/fleet/fleet.controller.ts`
  - [x] `GET /fleet/vehicles` — само за `fleet_admin` и `broker_admin` роли
  - [x] `@UseGuards(JwtAuthGuard, RolesGuard, FeatureFlagGuard)` + `@Roles('fleet_admin', 'broker_admin')` + `@FeatureFlag('fleet')`
  - [x] `@Query() filter: FleetVehicleFilterDto` → ValidationPipe
  - [x] Response следва стандартния list формат: `{ data: [...], meta: { total, page, limit, timestamp } }`

### Backend — Module

- [x] **Task 7: Създай `FleetModule`** (AC: #1-#6)
  - [x] Файл: `branivo-api/src/modules/fleet/fleet.module.ts`
  - [x] `TypeOrmModule.forFeature([FleetVehicle])` + imports на `TenantContextModule`, `TenantsModule` за `TenantContext` и `FeatureFlagGuard`
  - [x] Регистрирай в `AppModule`

### Backend — Тестове

- [x] **Task 8: Unit тест за `FleetService`** (AC: #1, #2, #3, #5)
  - [x] Файл: `branivo-api/src/modules/fleet/fleet.service.spec.ts`
  - [x] Тест за `calculateStatus()`: null → red, 0 дни → red, 15 дни → yellow, 31 дни → green
  - [x] Тест с mock `FleetRepository` — verify `TenantContext.getTenantId()` се извиква
  - [x] Тест за filter по status работи коректно

- [x] **Task 9: Unit тест за `FleetRepository`** (AC: #5, #6)
  - [x] Файл: `branivo-api/src/modules/fleet/fleet.repository.spec.ts`
  - [x] Verify `tenant_id` scope в всяка заявка
  - [x] Pagination logic тест

- [x] **Task 10: Интеграционен тест за `FleetController`** (AC: #4, #5, #6)
  - [x] Файл: `branivo-api/src/modules/fleet/fleet.controller.spec.ts`
  - [x] `GET /fleet/vehicles` без feature flag → 404
  - [x] `GET /fleet/vehicles` с роля `fleet_admin` + feature enabled → 200
  - [x] `GET /fleet/vehicles` без Auth → 401
  - [x] `GET /fleet/vehicles?status=yellow` → само yellow МПС

### Backend — Seeder

- [x] **Task 11: Добави seed данни** (dev environment)
  - [x] Файл: `branivo-api/src/infrastructure/database/seed.service.ts`
  - [x] `seedFleetVehicles()` — 5 fleet vehicles за demo тенанта с микс от green/yellow/red статус
  - [x] `ON CONFLICT DO NOTHING` — идемпотентен
  - [x] Извикай от `onApplicationBootstrap()`

### Next.js — Broker Portal

- [x] **Task 12: Fleet Dashboard страница** (AC: #1, #2, #3)
  - [x] Файл: `branivo-web/src/app/[locale]/(broker)/fleet/page.tsx`
  - [x] Client Component — fetch от `/api/v1/fleet/vehicles` чрез `useQuery`
  - [x] Показва цветови статус badge компонент за всяко МПС
  - [x] Filter tabs: All / 🟢 Green / 🟡 Yellow / 🔴 Red
  - [x] Следва съществуващия broker portal стил (Tailwind, inline table)

- [x] **Task 13: FleetVehicleStatusBadge компонент** (AC: #1)
  - [x] Файл: `branivo-web/src/components/fleet/FleetVehicleStatusBadge.tsx`
  - [x] Props: `status: 'green' | 'yellow' | 'red'`
  - [x] Colorblind-friendly: цвят + икона (✓ / ⚠ / ✕) + aria-label

- [x] **Task 14: Next.js компонент тест** (AC: #1, #2)
  - [x] Файл: `branivo-web/src/__tests__/broker/fleet/FleetVehicleStatusBadge.test.tsx`
  - [x] Тест за рендиране на всеки статус

### Flutter — End Customer / Fleet Admin App

- [x] **Task 15: Fleet Dashboard Screen** (AC: #1, #2, #3)
  - [x] Файл: `branivo_app/lib/features/fleet/screens/fleet_dashboard_screen.dart`
  - [x] `ListView.builder` с `FleetVehicleCard` widget за всяко МПС
  - [x] Filter buttons: All / Green / Yellow / Red (FilterChip)
  - [x] Следва съществуващи BLoC patterns от `policies/` feature

- [x] **Task 16: FleetVehicleCard widget** (AC: #1, #2)
  - [x] Файл: `branivo_app/lib/features/fleet/widgets/fleet_vehicle_card.dart`
  - [x] Показва: рег. номер, модел, застраховател, дата на изтичане, статус индикатор
  - [x] Status color: зелено/жълто/червено + икона (colorblind-friendly)

- [x] **Task 17: Fleet BLoC (FleetBloc, FleetEvent, FleetState + FleetRepository)** (AC: #3)
  - [x] Файл: `branivo_app/lib/features/fleet/bloc/fleet_bloc.dart`
  - [x] `FleetBloc` с `FleetLoadRequested` и `FleetStatusFilterChanged` events
  - [x] `FleetRepository` с `getFleetVehicles(status)` метод
  - [x] API call към `/fleet/vehicles?status=X`

- [x] **Task 18: Flutter widget тестове** (AC: #1, #2)
  - [x] Файл: `branivo_app/test/features/fleet/widgets/fleet_vehicle_card_test.dart`
  - [x] Widget тест за всеки статус (green/yellow/red)
  - [x] Verify colorblind-friendly icon се показва

## Dev Notes

### Нов модул — Fleet (Phase 2 Start)

Това е **първата история в Epic 7** — fleet модулът се създава от нулата. В архитектурата се споменава като "Phase 2 stub module", но в story 7.1 трябва да се имплементира реалната функционалност.

**Ключово:** `features.fleet` feature flag guard трябва да се проверява на **всеки** fleet endpoint. Ако флагът е изключен → `404 Not Found` (не `403`).

### Feature Flag Guard Pattern

Следва точно pattern-а от `feature-flags.service.ts`. Провери дали вече съществува `FeatureFlagGuard` — ако да, използвай го; ако не, създай го:

```typescript
// branivo-api/src/common/guards/feature-flag.guard.ts (ако не съществува)
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantsService: TenantsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.get<string>('feature', context.getHandler());
    if (!feature) return true;
    const tenantId = TenantContext.getTenantId();
    const tenant = await this.tenantsService.findById(tenantId);
    const features = tenant?.features as Record<string, boolean> | undefined;
    if (!features?.[feature]) throw new NotFoundException();
    return true;
  }
}
```

```typescript
// @RequireFeature decorator
export const RequireFeature = (feature: string) =>
  SetMetadata('feature', feature);
```

### DB Schema — fleet_vehicles

```sql
CREATE TABLE fleet_vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id),
  driver_user_id  UUID NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL
);

CREATE INDEX idx_fleet_vehicles_tenant ON fleet_vehicles (tenant_id, deleted_at);
```

### Status Изчисление

```typescript
calculateStatus(policyExpiresAt: Date | null): 'green' | 'yellow' | 'red' {
  if (!policyExpiresAt) return 'red';
  const now = new Date();
  const daysUntilExpiry = Math.floor(
    (policyExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysUntilExpiry > 30) return 'green';
  if (daysUntilExpiry >= 1) return 'yellow';
  return 'red';
}
```

### Repository Query Pattern — Fleet Vehicles with Policy Status

```typescript
// Пример за raw query в FleetRepository
async findFleetVehicles(
  tenantId: string,
  filter: FleetVehicleFilterDto,
): Promise<{ items: FleetVehicleWithPolicy[]; total: number }> {
  const limit = filter.limit ?? 20;
  const page = filter.page ?? 1;
  const offset = (page - 1) * limit;

  const baseQuery = `
    SELECT
      fv.id,
      fv.vehicle_id,
      v.license_plate,
      v.make,
      v.model,
      i.name AS insurer_name,
      p.expires_at AS policy_expires_at
    FROM fleet_vehicles fv
    JOIN vehicles v ON v.id = fv.vehicle_id AND v.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT pol.expires_at, pol.insurer_id
      FROM policies pol
      WHERE pol.vehicle_id = fv.vehicle_id
        AND pol.tenant_id = $1
        AND pol.status = 'active'
        AND pol.deleted_at IS NULL
      ORDER BY pol.created_at DESC
      LIMIT 1
    ) p ON true
    LEFT JOIN insurers i ON i.id = p.insurer_id
    WHERE fv.tenant_id = $1
      AND fv.deleted_at IS NULL
  `;
  // status filter се прилага в Service layer след calculateStatus()
}
```

### API Endpoint

```
GET /fleet/vehicles?status=green&page=1&limit=20

Response:
{
  "data": [
    {
      "id": "uuid",
      "vehicleId": "uuid",
      "licensePlate": "СА1234АВ",
      "make": "Toyota",
      "model": "Corolla",
      "insurerName": "ДЗИ",
      "policyExpiresAt": "2026-05-01T00:00:00.000Z",
      "status": "green"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "timestamp": "2026-03-22T10:00:00.000Z"
  }
}
```

### Module Structure

```
branivo-api/src/modules/fleet/
├── fleet.module.ts
├── fleet.controller.ts
├── fleet.service.ts
├── fleet.repository.ts
├── fleet.controller.spec.ts
├── fleet.service.spec.ts
├── fleet.repository.spec.ts
├── dto/
│   ├── fleet-vehicle-filter.dto.ts
│   └── fleet-vehicle-response.dto.ts
└── entities/
    └── fleet-vehicle.entity.ts

branivo-web/src/app/(broker)/fleet/
└── page.tsx

branivo-web/src/components/fleet/
├── FleetVehicleStatusBadge.tsx
└── FleetVehicleStatusBadge.test.tsx

branivo_app/lib/features/fleet/
├── screens/
│   └── fleet_dashboard_screen.dart
├── widgets/
│   └── fleet_vehicle_card.dart
└── providers/
    └── fleet_provider.dart

branivo_app/test/features/fleet/widgets/
└── fleet_vehicle_card_test.dart
```

### Migration Timestamp

Последната migration е `1710000025000-CreateTenantRenewalConfig.ts` (Story 6.3).
Следващата migration: **`1710000026000-CreateFleetVehicles.ts`**

### Зависимости от Предишни Stories

- **Story 3.3-3.5** — `vehicles` таблица и Vehicle entity вече съществуват
- **Story 1.5 (RBAC)** — `fleet_admin` роля трябва да съществува; провери дали е дефинирана в `roles` таблицата
- **Story 2.3 (Feature Flags)** — `features.fleet` трябва да е дефиниран в tenant features schema; провери `feature-flags.service.ts`
- **Story 4.2-4.3** — `policies` таблица с `status` и `expires_at` полета съществуват

### Важни Patterns от Предишни Stories

```typescript
// TenantContext — ЗАДЪЛЖИТЕЛНО (не предавай като параметър):
const tenantId = TenantContext.getTenantId();

// Guard decorators pattern (от admin-tenants.controller.ts):
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// BaseRepository extend (ЗАБРАНЕНО без него):
export class FleetRepository extends BaseRepository<FleetVehicle> { ... }

// Response wrapper (ЗАДЪЛЖИТЕЛНО):
{ data: [...], meta: { total, page, limit, timestamp: new Date().toISOString() } }
```

### Project Structure Notes

- Fleet module се добавя в `branivo-api/src/modules/fleet/` — нова директория
- Next.js: нов route `branivo-web/src/app/(broker)/fleet/page.tsx` — в broker layout
- Flutter: нов feature `branivo_app/lib/features/fleet/` — следва Riverpod patterns от `policies/` и `vehicles/` features
- AppModule: регистрирай `FleetModule` в imports масива

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1] — User story, AC, цветови статус изисквания
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7] — Fleet management бизнес контекст
- [Source: _bmad-output/planning-artifacts/architecture.md#Fleet FR43-47] — Module placement таблица
- [Source: _bmad-output/planning-artifacts/architecture.md#NestJS Module Structure] — задължителен module pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#API Response Format] — задължителен response формат
- [Source: _bmad-output/planning-artifacts/architecture.md#Testing Standards] — тест стандарти
- [Source: _bmad-output/implementation-artifacts/6-3-renewal-escalation-configuration.md#Dev Notes] — FeatureFlagGuard и audit log patterns
- [Source: branivo-api/src/modules/tenants/feature-flags.service.ts] — feature flag check pattern
- [Source: branivo-api/src/common/guards/] — съществуващи guards за reference
- [Source: branivo-api/src/infrastructure/database/migrations/1710000025000-CreateTenantRenewalConfig.ts] — последна migration (следваща: 1710000026000)
- [Source: branivo-api/src/infrastructure/database/seed.service.ts] — seeder pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A — clean implementation, no debug issues.

### Completion Notes List

**Implementation complete — Story 7.1: Fleet Vehicle Status Dashboard**

All 18 tasks implemented and all tests passing:
- **Backend:** FleetModule (Controller → Service → Repository), DB migration, DTOs, FleetVehicle entity. 23 NestJS tests pass (fleet service, repository, controller integration).
- **FeatureFlagGuard updated:** Changed `ForbiddenException` → `NotFoundException` (404) per AC4 requirement ("feature appears non-existent when disabled"). Guard spec updated accordingly.
- **Raw SQL query:** Uses `coverage_end_date` (correct column name from `policies` table, not `expires_at`).
- **Status filtering:** Applied in service layer (after `calculateStatus()`) — correct design since status is computed, not stored.
- **Seed:** 5 fleet vehicles seeded with mixed statuses (1 green/60d, 2 yellow/20d+7d, 1 red-expired, 1 red-no-policy). Feature flag `fleet: true` enabled in demo tenant.
- **Next.js:** Client component with `useQuery` + filter tabs + `FleetVehicleStatusBadge` with colorblind-friendly icons + aria-label. 158 web tests pass.
- **Flutter:** BLoC pattern (not Riverpod — codebase uses flutter_bloc). `FleetBloc` + `FleetVehicleCard` + `FleetDashboardScreen`. 72 Flutter tests pass.

**Change Log:**
- 2026-03-22: Initial implementation of Story 7.1 — Fleet Vehicle Status Dashboard (all ACs satisfied)

### File List

**Backend — branivo-api:**
- `src/infrastructure/database/migrations/1710000026000-CreateFleetVehicles.ts` (new)
- `src/infrastructure/database/seed.service.ts` (modified — seedFleetVehicles, seedTenantRenewalConfig, fleet:true)
- `src/modules/fleet/entities/fleet-vehicle.entity.ts` (new)
- `src/modules/fleet/dto/fleet-vehicle-response.dto.ts` (new)
- `src/modules/fleet/dto/fleet-vehicle-filter.dto.ts` (new)
- `src/modules/fleet/fleet.repository.ts` (new)
- `src/modules/fleet/fleet.service.ts` (new)
- `src/modules/fleet/fleet.controller.ts` (new)
- `src/modules/fleet/fleet.module.ts` (new)
- `src/modules/fleet/fleet.service.spec.ts` (new)
- `src/modules/fleet/fleet.repository.spec.ts` (new)
- `src/modules/fleet/fleet.controller.spec.ts` (new)
- `src/app.module.ts` (modified — FleetModule added)
- `src/common/guards/feature-flag.guard.ts` (modified — ForbiddenException → NotFoundException for 404)
- `src/common/guards/feature-flag.guard.spec.ts` (modified — updated assertions)

**Frontend — branivo-web:**
- `src/app/[locale]/(broker)/fleet/page.tsx` (new)
- `src/components/fleet/FleetVehicleStatusBadge.tsx` (new)
- `src/__tests__/broker/fleet/FleetVehicleStatusBadge.test.tsx` (new)

**Flutter — branivo_app:**
- `lib/features/fleet/data/models/fleet_vehicle.dart` (new)
- `lib/features/fleet/data/repositories/fleet_repository.dart` (new)
- `lib/features/fleet/bloc/fleet_event.dart` (new)
- `lib/features/fleet/bloc/fleet_state.dart` (new)
- `lib/features/fleet/bloc/fleet_bloc.dart` (new)
- `lib/features/fleet/widgets/fleet_vehicle_card.dart` (new)
- `lib/features/fleet/screens/fleet_dashboard_screen.dart` (new)
- `test/features/fleet/widgets/fleet_vehicle_card_test.dart` (new)

**Sprint tracking:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — 7-1 → review)
