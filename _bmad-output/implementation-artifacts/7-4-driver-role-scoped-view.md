# Story 7.4: Driver Role-Scoped View

Status: done

## Story

As a Driver,
I want to see only my own policies and vehicles,
so that fleet policy data from other drivers remains private.

## Acceptance Criteria

1. **AC1 — Role-scoped data visibility:**
   Given user has Driver role,
   When they log in,
   Then виждат само полиците и МПС, назначени на тях — без достъп до fleet-wide данни

2. **AC2 — Row-level isolation:**
   Given Driver attempts to access another driver's policy,
   When request is made,
   Then получава 403 Forbidden — RLS enforces row-level isolation

3. **AC3 — Driver dashboard display:**
   Given Driver views their policies,
   When dashboard loads,
   Then виждат: МПС, застраховател, дата на изтичане, статус на полицата

4. **AC4 — Vehicle assignment enforcement:**
   Given Fleet Admin assigns a vehicle to a driver,
   When assignment is saved,
   Then Driver може да вижда само назначените им МПС

## Tasks / Subtasks

### Backend (branivo-api)

- [x] Task 1 — Добави `driver` (и `fleet_admin`) към `UserRole` type и DB enum (AC: 1, 4)
  - [x] 1.1 Обнови `UserRole` в `user.entity.ts`: добави `'fleet_admin' | 'driver'`
  - [x] 1.2 Създай миграция `1710000028000-AddFleetRoles.ts` — ALTER TABLE users ADD CHECK или UPDATE enum
  - [x] 1.3 Обнови seed в `seed.service.ts` — добави demo driver user за fleet тенанта

- [x] Task 2 — `FleetDriverService` + `FleetDriverRepository` за driver-scoped заявки (AC: 1, 2, 3)
  - [x] 2.1 Създай `fleet-driver.repository.ts` — `findDriverVehiclesWithPolicies(userId, tenantId)` — JOIN fleet_vehicles WHERE driver_user_id = userId AND tenant_id = tenantId
  - [x] 2.2 Създай `fleet-driver.service.ts` — `getDriverView(userId)` — делегира към repository, извлича tenantId от TenantContext
  - [x] 2.3 Напиши unit тест `fleet-driver.service.spec.ts`

- [x] Task 3 — Fleet Controller: нов endpoint `/fleet/driver/vehicles` (AC: 1, 2, 3)
  - [x] 3.1 Добави `GET /fleet/driver/vehicles` в `fleet.controller.ts` с `@Roles('driver')` (само driver, не fleet_admin)
  - [x] 3.2 Добави `FleetDriverService` в constructor на controller-а
  - [x] 3.3 Обнови controller spec

- [x] Task 4 — Vehicle assignment endpoint за Fleet Admin (AC: 4)
  - [x] 4.1 Създай `AssignDriverDto` (vehicleId: UUID, driverUserId: UUID | null)
  - [x] 4.2 Добави `PUT /fleet/vehicles/:vehicleId/driver` в controller (`@Roles('fleet_admin', 'broker_admin')`)
  - [x] 4.3 Добави `assignDriver(vehicleId, driverUserId)` в `FleetDriverService` + `FleetDriverRepository`
  - [x] 4.4 Валидация: driverUserId трябва да е user с role='driver' в същия тенант

- [x] Task 5 — DTO за driver view response (AC: 3)
  - [x] 5.1 Създай `driver-vehicle-response.dto.ts` — vehicleId, licensePlate, make, model, insurerName, policyExpiresAt, policyStatus

### Web (branivo-web)

- [x] Task 6 — Driver dashboard страница (AC: 1, 3)
  - [x] 6.1 Създай `branivo-web/src/app/[locale]/(broker)/fleet/driver/page.tsx` — driver-only view
  - [x] 6.2 Компонент `DriverVehicleCard.tsx` в `src/components/fleet/`
  - [x] 6.3 Тест `src/__tests__/broker/fleet/DriverVehicleCard.test.tsx`

- [x] Task 7 — Fleet Admin: assign driver UI (AC: 4)
  - [x] 7.1 Обнови `FleetVehicleCard` или fleet page — добави assign driver dropdown (само за fleet_admin/broker_admin)
  - [x] 7.2 Тест за assign driver interaction

### Flutter (branivo_app)

- [x] Task 8 — Driver screen и BLoC (AC: 1, 3)
  - [x] 8.1 Създай `lib/features/fleet/screens/driver_dashboard_screen.dart` — показва само назначените МПС
  - [x] 8.2 Добави `DriverVehicleLoaded` state в `fleet_state.dart`
  - [x] 8.3 Добави `DriverVehiclesRequested` event в `fleet_event.dart`
  - [x] 8.4 Обнови `FleetBloc` — handle `DriverVehiclesRequested` чрез `fleetRepository.getDriverVehicles()`
  - [x] 8.5 Обнови `FleetRepository` — добави `getDriverVehicles()` метод (GET /fleet/driver/vehicles)
  - [x] 8.6 Widget тест за `DriverDashboardScreen`

- [x] Task 9 — Routing: показвай правилния dashboard по роля (AC: 1)
  - [x] 9.1 В main navigation / router — ако user.role == 'driver' → navigate to DriverDashboardScreen, иначе FleetDashboardScreen
  - [x] 9.2 Тест за routing logic

## Dev Notes

### Критично: `fleet_admin` роля липсва от UserRole type

Текущият `UserRole` в `branivo-api/src/modules/users/entities/user.entity.ts` е:
```typescript
export type UserRole =
  | 'super_admin'
  | 'broker_admin'
  | 'broker_agent'
  | 'broker_viewer';
```

`fleet_admin` се ползва в `fleet.controller.ts` (`@Roles('fleet_admin', 'broker_admin')`) но **не е в типа**. Story 7.4 трябва да добави `fleet_admin` и `driver`:

```typescript
export type UserRole =
  | 'super_admin'
  | 'broker_admin'
  | 'broker_agent'
  | 'broker_viewer'
  | 'fleet_admin'   // new — manages fleet vehicles, bulk quotes, PDF exports
  | 'driver';       // new — sees only own assigned vehicles/policies
```

> ⚠️ ВАЖНО: Провери дали `users` table ползва PostgreSQL ENUM или VARCHAR CHECK constraint. Ако е ENUM, трябва `ALTER TYPE user_role_enum ADD VALUE 'fleet_admin'; ALTER TYPE user_role_enum ADD VALUE 'driver';`. Ако е CHECK constraint, трябва `ALTER TABLE users DROP CONSTRAINT ...; ALTER TABLE users ADD CONSTRAINT ...`.
> Провери в съществуващата миграция `1710000001000-CreateUsers.ts` или подобна.

### Архитектурен паттерн за Driver-Scoped Заявки

**FleetDriverRepository** трябва да прилага двойна изолация:

```typescript
// branivo-api/src/modules/fleet/fleet-driver.repository.ts
async findDriverVehiclesWithPolicies(
  userId: string,
  tenantId: string,
): Promise<DriverVehicleWithPolicy[]> {
  return this.dataSource.query<DriverVehicleWithPolicy[]>(
    `
    SELECT
      fv.id,
      fv.vehicle_id,
      v.license_plate,
      v.make,
      v.model,
      i.name AS insurer_name,
      p.coverage_end_date AS policy_expires_at,
      p.status AS policy_status
    FROM fleet_vehicles fv
    JOIN vehicles v ON v.id = fv.vehicle_id AND v.deleted_at IS NULL
    LEFT JOIN policies p ON p.vehicle_id = fv.vehicle_id
      AND p.status = 'active'
      AND p.tenant_id = $1
      AND p.deleted_at IS NULL
    LEFT JOIN insurers i ON i.id = p.insurer_id
    WHERE fv.tenant_id = $1           -- tenant isolation (задължително)
      AND fv.driver_user_id = $2      -- row-level scoping (задължително)
      AND fv.deleted_at IS NULL
    ORDER BY v.license_plate
    `,
    [tenantId, userId],
  );
}
```

**Двата WHERE клауза са задължителни:**
- `fv.tenant_id = $1` — Cross-tenant изолация (CRITICAL security)
- `fv.driver_user_id = $2` — Driver row-level scoping (AC2)

### Fleet Controller: Разделяне на Роли

Текущото `@Roles('fleet_admin', 'broker_admin')` на клас ниво е за fleet admin функционалности. Новите driver endpoints трябва **отделни методи** с Override:

```typescript
// На клас ниво: fleet_admin + broker_admin (без driver)
@Roles('fleet_admin', 'broker_admin')
export class FleetController { ... }

// Driver-only метод с override на class-level @Roles:
@Get('driver/vehicles')
@Roles('driver')   // override — само driver вижда това
async getDriverVehicles(@Req() req: RequestWithUser): Promise<DriverVehicleResponseDto[]> {
  return this.fleetDriverService.getDriverView(req.user.userId);
}
```

Провери как `RolesGuard` обработва method-level vs class-level — типично `Reflector.getAllAndOverride()` дава приоритет на method-level decorator.

### Vehicle Assignment — Валидация

При `PUT /fleet/vehicles/:vehicleId/driver` трябва:
1. Verify vehicleId е в fleet на тенанта
2. Verify driverUserId е user с role='driver' в **същия тенант**
3. Допуска `driverUserId: null` — unassign driver

```typescript
// В FleetService.assignDriver()
async assignDriver(vehicleId: string, driverUserId: string | null): Promise<void> {
  const tenantId = this.tenantContext.getTenantId();

  if (driverUserId !== null) {
    const driver = await this.usersRepository.findById(driverUserId, tenantId);
    if (!driver || driver.role !== 'driver') {
      throw new BadRequestException('User is not a driver in this tenant');
    }
  }

  await this.fleetRepository.assignDriver(vehicleId, tenantId, driverUserId);
}
```

### Module Import Chain

`FleetModule` ще трябва `UsersModule` (или `UsersRepository`) за driver validation:

```typescript
@Module({
  imports: [
    ...existing imports...,
    UsersModule,  // нужен за driver role validation
  ],
  providers: [
    ...existing providers...,
    FleetDriverService,
    FleetDriverRepository,
  ],
  controllers: [FleetController],
})
export class FleetModule {}
```

### Flutter: Role-Based Routing

```dart
// В router или main navigation — след successful login
if (user.role == 'driver') {
  // Navigate to DriverDashboardScreen
} else if (user.role == 'fleet_admin' || user.role == 'broker_admin') {
  // Navigate to FleetDashboardScreen (existing)
}
```

`DriverDashboardScreen` трябва да е **идентична UX на FleetDashboardScreen** но:
- Без checkboxes за bulk select (driver не може bulk купуване)
- Без bulk quote/purchase бутони
- Без export бутони
- Показва само assigned vehicles

### Съществуваща Fleet Infrastructure — Reuse

| Компонент | Статус | Действие за Story 7.4 |
|---|---|---|
| `FleetRepository.findFleetVehicles()` | ✅ Съществува | НЕ модифицирай — само за fleet_admin |
| `FleetVehicle` entity | ✅ Съществува с `driver_user_id` | Reuse as-is |
| `FleetVehicleResponseDto` | ✅ Съществува | Създай нов `DriverVehicleResponseDto` |
| `GET /fleet/vehicles` | ✅ Съществува | НЕ модифицирай — fleet_admin endpoint |
| `FleetBloc` | ✅ Съществува | Разшири с driver events/states |
| `FleetDashboardScreen` | ✅ Съществува | НЕ модифицирай — fleet_admin screen |

### DB Schema (fleet_vehicles) — съществуваща

```sql
CREATE TABLE fleet_vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id),
  driver_user_id  UUID NULL REFERENCES users(id),  -- вече съществува!
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL
);
```

`driver_user_id` вече съществува — Story 7.4 само го попълва правилно чрез assignment endpoint.

### Project Structure Notes

- Нови backend файлове: `fleet-driver.repository.ts`, `fleet-driver.service.ts`, `fleet-driver.service.spec.ts`
- Нови backend DTOs: `dto/driver-vehicle-response.dto.ts`, `dto/assign-driver.dto.ts`
- Нова миграция: `1710000028000-AddFleetRoles.ts`
- Нов Next.js: `app/[locale]/(broker)/fleet/driver/page.tsx`
- Нови Flutter: `screens/driver_dashboard_screen.dart`
- Модифицирани файлове: `user.entity.ts`, `fleet.controller.ts`, `fleet.module.ts`, `fleet.service.ts`, `fleet.repository.ts`, `fleet_bloc.dart`, `fleet_state.dart`, `fleet_event.dart`, `fleet_repository.dart`, `seed.service.ts`

### Абсолютни Правила (от project-context.md)

- НИКОГА не query-вай без `tenant_id` scope — дори driver endpoints
- НИКОГА не предавай `tenant_id` като функционален параметър — използвай `TenantContext.getTenantId()`
- ВИНАГИ проверявай `features.fleet` преди fleet endpoints
- Controller → Service → Repository — без прескачане на слоеве
- Max 30 реда на функция; max 300 реда на файл

### References

- [Source: epics.md#Epic-7-Story-7.4] — User story и acceptance criteria
- [Source: architecture.md#API-Boundaries] — Role hierarchy (super_admin, broker_admin, broker_agent, broker_viewer)
- [Source: project-context.md#Tenant-Safety] — Tenant isolation rules
- [Source: user.entity.ts] — Текущ UserRole type (без fleet_admin и driver)
- [Source: fleet.controller.ts:43] — `@Roles('fleet_admin', 'broker_admin')` — fleet_admin вече се ползва
- [Source: fleet-vehicle.entity.ts] — driver_user_id колона съществува
- [Source: 7-3-batch-pdf-export.md#Dev-Notes] — FleetModule import chain, fleet patterns

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Добавени `fleet_admin` и `driver` в `UserRole` type — VARCHAR(50) колона, миграция добавя CHECK constraint
- `FleetDriverRepository.findDriverVehiclesWithPolicies()` прилага двойна изолация: `tenant_id` + `driver_user_id`
- `FleetDriverService.assignDriver()` валидира, че driverUserId е user с role='driver' в същия тенант
- `GET /fleet/driver/vehicles` с `@Roles('driver')` override на class-level roles — RolesGuard ползва `getAllAndOverride`, method-level има приоритет
- `PUT /fleet/vehicles/:vehicleId/driver` разрешено за `fleet_admin` и `broker_admin` (class-level roles)
- Seed добавя demo driver user (`driver@branivo.bg / Driver1234!`) и назначава BMW X5 на него
- Web: `DriverVehicleCard` компонент + `/fleet/driver/page.tsx` driver-only изглед
- Web: `FleetPage` разширена с "Назначи шофьор" UI per vehicle row
- Flutter: `DriverVehicleLoaded` state, `DriverVehiclesRequested` event, `DriverDashboardScreen`
- Flutter: `/fleet` routing — role=driver → DriverDashboardScreen, иначе FleetDashboardScreen
- 564 backend теста, 32 web теста, 90 Flutter теста — всички минават

### File List

**Backend (branivo-api):**
- branivo-api/src/modules/users/entities/user.entity.ts (modified)
- branivo-api/src/infrastructure/database/migrations/1710000028000-AddFleetRoles.ts (new)
- branivo-api/src/infrastructure/database/seed.service.ts (modified)
- branivo-api/src/modules/fleet/dto/driver-vehicle-response.dto.ts (new)
- branivo-api/src/modules/fleet/dto/assign-driver.dto.ts (new)
- branivo-api/src/modules/fleet/fleet-driver.repository.ts (new)
- branivo-api/src/modules/fleet/fleet-driver.service.ts (new)
- branivo-api/src/modules/fleet/fleet-driver.service.spec.ts (new)
- branivo-api/src/modules/fleet/fleet.controller.ts (modified)
- branivo-api/src/modules/fleet/fleet.controller.spec.ts (modified)
- branivo-api/src/modules/fleet/fleet.module.ts (modified)

**Web (branivo-web):**
- branivo-web/src/components/fleet/DriverVehicleCard.tsx (new)
- branivo-web/src/app/[locale]/(broker)/fleet/driver/page.tsx (new)
- branivo-web/src/app/[locale]/(broker)/fleet/page.tsx (modified)
- branivo-web/src/__tests__/broker/fleet/DriverVehicleCard.test.tsx (new)
- branivo-web/src/__tests__/broker/fleet/AssignDriverInteraction.test.tsx (new)

**Flutter (branivo_app):**
- branivo_app/lib/features/fleet/data/models/driver_vehicle.dart (new)
- branivo_app/lib/features/fleet/data/repositories/fleet_repository.dart (modified)
- branivo_app/lib/features/fleet/bloc/fleet_state.dart (modified)
- branivo_app/lib/features/fleet/bloc/fleet_event.dart (modified)
- branivo_app/lib/features/fleet/bloc/fleet_bloc.dart (modified)
- branivo_app/lib/features/fleet/screens/driver_dashboard_screen.dart (new)
- branivo_app/lib/core/routing/app_router.dart (modified)
- branivo_app/test/features/fleet/screens/driver_dashboard_screen_test.dart (new)
- branivo_app/test/core/routing/app_router_test.dart (modified)
