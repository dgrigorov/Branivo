# Story 3.5: Vehicle Data Persistence & Auto-Load

Status: review

## Story

As a registered end-client,
I want my vehicle data saved after first registration,
So that I never have to scan or enter the same information again.

## Acceptance Criteria

1. **AC1 — Запазване в DB след потвърждение:**
   **Given** vehicle data is confirmed (OCR + validation — `validation_status: "validated"`),
   **When** saved to account (`POST /vehicles`),
   **Then** всички полета се съхраняват в `vehicles` таблица с `tenant_id`, UUID PK и `owner_id` (= `end_client.id` от JWT)

2. **AC2 — Auto-load при завръщащ се клиент:**
   **Given** client returns for policy renewal,
   **When** те отварят vehicle list (`GET /vehicles`),
   **Then** всички данни се зареждат автоматично без ново сканиране

3. **AC3 — Единично МПС избиране:**
   **Given** client has registered vehicles,
   **When** they initiate a new quote,
   **Then** МПС списъкът се показва с един клик избор (`GET /vehicles` → vehicle picker UI)

4. **AC4 — Empty state:**
   **Given** client has no registered vehicles,
   **When** they view the vehicle list,
   **Then** виждат empty state с CTA "Добави МПС" — без празен списък без контекст

5. **AC5 — Профил с множество МПС:**
   **Given** client has multiple vehicles,
   **When** they view their profile,
   **Then** виждат всички регистрирани МПС с модел, рег. номер и статус на последната полица (полето `last_policy_status` — `null` ако няма полица)

6. **AC6 — Tenant isolation:**
   **Given** vehicle belongs to a client,
   **When** any DB query is made,
   **Then** `WHERE tenant_id = $tenantId` е задължителен; RLS policy е активна

## Tasks / Subtasks

### Backend — TypeORM Entity & Migration

- [x] **Task 1: `vehicle.entity.ts`** (AC: #1, #6)
  - [x] Файл: `branivo-api/src/modules/vehicles/entities/vehicle.entity.ts`
  - [x] Полета: `id`, `tenantId`, `ownerId`, `vin`, `licensePlate`, `make`, `model`, `year`, `color`, `engineVolume`, `fuelType`, `firstRegistrationDate`, `createdAt`, `updatedAt`, `deletedAt`
  - [x] Всички `@Column({ name: 'snake_case' })` — задължително
  - [x] `@DeleteDateColumn` за soft delete
  - [x] **НЕ** extends BaseEntity — следвай EndClient pattern (чист class + декоратори)

- [x] **Task 2: Migration `1710000011000-CreateVehiclesTable`** (AC: #1, #6)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000011000-CreateVehiclesTable.ts`
  - [x] `UUID PK`, `tenant_id UUID NOT NULL`, `owner_id UUID NOT NULL`, всички vehicle полета
  - [x] FK: `owner_id → end_clients(id) ON DELETE CASCADE`
  - [x] FK: `tenant_id → tenants(id) ON DELETE CASCADE`
  - [x] Indexes: `idx_vehicles_tenant_id`, `idx_vehicles_owner_id`, `idx_vehicles_tenant_owner` (composite)
  - [x] `ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY`
  - [x] RLS policy: `USING (tenant_id::text = current_setting('app.current_tenant_id', true))`
  - [x] Пълен `down()` метод

### Backend — Repository, Service, Controller

- [x] **Task 3: `VehiclesRepository` — пълна имплементация** (AC: #1-#6)
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.repository.ts` (вече съществува като stub — попълни)
  - [x] `extends BaseRepository<Vehicle>`
  - [x] `findByOwner(ownerId: string): Promise<Vehicle[]>` — uses `findAll({ ownerId })`
  - [x] `findByOwnerAndId(ownerId: string, vehicleId: string): Promise<Vehicle | null>` — uses `findOne({ id: vehicleId, ownerId })`
  - [x] Конструктор: `@InjectRepository(Vehicle)` + `TenantContext`

- [x] **Task 4: DTOs** (AC: #1-#5)
  - [x] Файл: `branivo-api/src/modules/vehicles/dto/create-vehicle.dto.ts` (вече съществува като stub — попълни)
  - [x] `CreateVehicleDto`: `vin`, `licensePlate`, `make`, `model`, `year`, `color?`, `engineVolume?`, `fuelType?`, `firstRegistrationDate?` — всички с `class-validator`
  - [x] Нов файл: `branivo-api/src/modules/vehicles/dto/vehicle-response.dto.ts`
  - [x] `VehicleResponseDto`: всички полета + `lastPolicyStatus?: string | null`

- [x] **Task 5: `VehiclesService` — добавяне на persistence методи** (AC: #1-#5)
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.service.ts` (вече съществува — добавяй, не пренаписвай)
  - [x] Инжектирай `VehiclesRepository` в конструктора
  - [x] `saveVehicle(dto: CreateVehicleDto, ownerId: string): Promise<VehicleResponseDto>`
  - [x] `listVehicles(ownerId: string): Promise<VehicleResponseDto[]>`
  - [x] `getVehicle(ownerId: string, vehicleId: string): Promise<VehicleResponseDto>`

- [x] **Task 6: `VehiclesController` — добавяне на CRUD endpoints** (AC: #1-#5)
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.controller.ts` (вече съществува — добавяй)
  - [x] `POST /vehicles` — `@UseGuards(ClientJwtAuthGuard)` + `@CurrentUser()` → `saveVehicle()`
  - [x] `GET /vehicles` — `@UseGuards(ClientJwtAuthGuard)` + `@CurrentUser()` → `listVehicles()`
  - [x] `GET /vehicles/:id` — `@UseGuards(ClientJwtAuthGuard)` + `@CurrentUser()` → `getVehicle()`
  - [x] `POST /validate` остава **непроменен** (session-token based, без JWT guard)

- [x] **Task 7: `VehiclesModule` — регистрация на Vehicle entity** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.module.ts` (добавяй)
  - [x] `TypeOrmModule.forFeature([Vehicle])` в imports
  - [x] Добави `VehiclesRepository` в providers ако не е
  - [x] Провери `TenantContextModule` в imports

### Backend — Тестове

- [x] **Task 8: Unit тестове за VehiclesService (persistence)** (AC: #1-#5)
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.service.spec.ts` (добавяй нови describe блокове)
  - [x] Mock `VehiclesRepository` с Jest
  - [x] Тестове: `saveVehicle()`, `listVehicles()` empty, `listVehicles()` с данни, `getVehicle()` found, `getVehicle()` not found (404)

- [x] **Task 9: Integration тестове за VehiclesController (CRUD)** (AC: #1-#3, #6)
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.controller.spec.ts` (добавяй)
  - [x] Тестове: POST 201, GET list 200, GET empty 200, GET one 200, GET unauthorized 403

### Next.js Web

- [x] **Task 10: BFF routes за vehicle CRUD** (AC: #1-#3)
  - [x] `branivo-web/src/app/api/v1/vehicles/route.ts` — GET (list) + POST (save)
  - [x] `branivo-web/src/app/api/v1/vehicles/[id]/route.ts` — GET (single)
  - [x] Forward `Authorization: Bearer` header от client session към branivo-api

- [x] **Task 11: `useVehicles` hook** (AC: #2-#4)
  - [x] Файл: `branivo-web/src/lib/hooks/use-vehicles.ts`
  - [x] `listVehicles()`, `saveVehicle(dto)`, `getVehicle(id)`
  - [x] Loading/error states

- [x] **Task 12: `VehicleListPage`** (AC: #2-#4)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/vehicles/page.tsx`
  - [x] Показва list от VehicleCard компоненти
  - [x] Empty state с CTA "Добави МПС" при 0 МПС

- [x] **Task 13: `VehiclePicker` компонент** (AC: #3)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/vehicles/components/vehicle-picker.tsx`
  - [x] Reusable компонент за quote flow — един клик избор на МПС

- [x] **Task 14: Next.js тестове** (AC: #2-#4)
  - [x] `branivo-web/src/__tests__/hooks/use-vehicles.test.ts` — 6 hook теста
  - [x] `branivo-web/src/__tests__/client/vehicle-list-page.test.tsx` — empty state + populated state

### Flutter

- [x] **Task 15: `VehicleModel`** (AC: #2-#5)
  - [x] Файл: `branivo_app/lib/features/vehicles/data/models/vehicle_model.dart`
  - [x] `fromJson`/`toJson` с underscore field names (snake_case)

- [x] **Task 16: `VehiclesRepository` (Flutter)** (AC: #2-#5)
  - [x] Файл: `branivo_app/lib/features/vehicles/data/repositories/vehicles_repository.dart`
  - [x] `listVehicles()`, `saveVehicle(VehicleModel)`, `getVehicle(String id)`
  - [x] Използва `Dio` за HTTP; `auth_token` от `flutter_secure_storage`

- [x] **Task 17: `VehiclesBloc`** (AC: #2-#5)
  - [x] `branivo_app/lib/features/vehicles/bloc/vehicles_bloc.dart`
  - [x] `branivo_app/lib/features/vehicles/bloc/vehicles_event.dart`
  - [x] `branivo_app/lib/features/vehicles/bloc/vehicles_state.dart`
  - [x] Events: `LoadVehicles`, `SaveVehicle`, `SelectVehicle`
  - [x] States: `VehiclesLoading`, `VehiclesLoaded`, `VehiclesEmpty`, `VehiclesSaveSuccess`, `VehiclesError`

- [x] **Task 18: `VehicleListScreen`** (AC: #2-#5)
  - [x] Файл: `branivo_app/lib/features/vehicles/screens/vehicle_list_screen.dart`
  - [x] ListView с VehicleCard widgets
  - [x] Empty state с ElevatedButton "Добави МПС"
  - [x] `Semantics` labels за accessibility

- [x] **Task 19: Flutter тестове** (AC: #2-#5)
  - [x] Файл: `branivo_app/test/features/vehicles/vehicles_bloc_test.dart`
  - [x] 5 bloc теста: LoadVehicles → empty, LoadVehicles → populated, SaveVehicle → success, SaveVehicle → error, SelectVehicle

## Dev Notes

### КРИТИЧНО: Съществуващи Stubs (Попълни, не създавай наново)

```
branivo-api/src/modules/vehicles/vehicles.repository.ts  ← STUB (6 реда) — попълни го
branivo-api/src/modules/vehicles/dto/create-vehicle.dto.ts ← STUB (2 реда) — попълни го
```

**НЕ** пренаписвай `vehicles.service.ts` и `vehicles.controller.ts` — добавяй само нови методи/endpoints.

### Vehicle Entity — TypeORM Pattern

Следвай **точно** EndClient entity pattern:

```typescript
// branivo-api/src/modules/vehicles/entities/vehicle.entity.ts
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'owner_id' })
  ownerId!: string;

  @Column({ name: 'vin' })
  vin!: string;

  @Column({ name: 'license_plate' })
  licensePlate!: string;

  @Column({ name: 'make' })
  make!: string;

  @Column({ name: 'model' })
  model!: string;

  @Column({ name: 'year', type: 'int' })
  year!: number;

  @Column({ name: 'color', nullable: true, type: 'varchar', length: 50 })
  color!: string | null;

  @Column({ name: 'engine_volume', nullable: true, type: 'varchar', length: 20 })
  engineVolume!: string | null;

  @Column({ name: 'fuel_type', nullable: true, type: 'varchar', length: 30 })
  fuelType!: string | null;

  @Column({ name: 'first_registration_date', nullable: true, type: 'date' })
  firstRegistrationDate!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

**ЗАБРАНЕНО:** `tenantId` като column name без `{ name: 'tenant_id' }`. `@ManyToOne` без `@JoinColumn`.

### Migration Pattern

```typescript
// 1710000011000-CreateVehiclesTable.ts
// Следвай ТОЧНО CreateEndClientsTable1710000009000 pattern

export class CreateVehiclesTable1710000011000 implements MigrationInterface {
  name = 'CreateVehiclesTable1710000011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "vehicles" (
        "id"                       UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"                UUID          NOT NULL,
        "owner_id"                 UUID          NOT NULL,
        "vin"                      VARCHAR(17)   NOT NULL,
        "license_plate"            VARCHAR(20)   NOT NULL,
        "make"                     VARCHAR(100)  NOT NULL,
        "model"                    VARCHAR(100)  NOT NULL,
        "year"                     INT           NOT NULL,
        "color"                    VARCHAR(50)   NULL,
        "engine_volume"            VARCHAR(20)   NULL,
        "fuel_type"                VARCHAR(30)   NULL,
        "first_registration_date"  DATE          NULL,
        "created_at"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "deleted_at"               TIMESTAMPTZ   NULL,
        CONSTRAINT "pk_vehicles" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vehicles_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vehicles_owner" FOREIGN KEY ("owner_id")
          REFERENCES "end_clients"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_vehicles_tenant_id" ON "vehicles" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_vehicles_owner_id" ON "vehicles" ("owner_id")`);
    await queryRunner.query(`CREATE INDEX "idx_vehicles_tenant_owner" ON "vehicles" ("tenant_id", "owner_id")`);
    await queryRunner.query(`ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "vehicles_tenant_isolation"
        ON "vehicles"
        USING (tenant_id::text = current_setting('app.current_tenant_id', true))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS "vehicles_tenant_isolation" ON "vehicles"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vehicles_tenant_owner"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vehicles_owner_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vehicles_tenant_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicles"`);
  }
}
```

### VehiclesRepository — BaseRepository Pattern

```typescript
// branivo-api/src/modules/vehicles/vehicles.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Vehicle } from './entities/vehicle.entity';

@Injectable()
export class VehiclesRepository extends BaseRepository<Vehicle> {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    tenantContext: TenantContext,
  ) {
    super(vehicleRepo, tenantContext);
  }

  async findByOwner(ownerId: string): Promise<Vehicle[]> {
    return this.findAll({ ownerId } as any);
  }

  async findByOwnerAndId(ownerId: string, vehicleId: string): Promise<Vehicle | null> {
    return this.findOne({ id: vehicleId, ownerId } as any);
  }
}
```

**ВАЖНО:** `BaseRepository.softDelete(id)` има `eslint-disable` за `any` — не го пренаписвай.

### VehiclesModule Update

```typescript
// vehicles.module.ts — добави TypeOrmModule.forFeature
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './entities/vehicle.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle]),
    HttpModule.register({ timeout: 5000, maxRedirects: 2 }),
    TenantContextModule,
  ],
  providers: [VehiclesService, VehiclesRepository, KatApiAdapter, GarantsionenFondAdapter],
  controllers: [VehiclesController],
})
export class VehiclesModule {}
```

### JwtAuthGuard за CRUD Endpoints

CRUD endpoints (`POST /vehicles`, `GET /vehicles`, `GET /vehicles/:id`) изискват JWT authentication (End-Client JWT). Validate endpoint (`POST /validate`) остава session-token based.

Провери как е имплементиран `JwtAuthGuard` в `ClientsModule` — следвай **точно** същия pattern. Вземи `ownerId` от JWT payload чрез `@CurrentUser()` decorator (или еквивалент намиращ се в auth/clients модула).

### Redis Session → DB Migration Flow

При `POST /vehicles`, service-ят може да зарежда данните от Redis сесията ако не са подадени в body:

```typescript
// В saveVehicle() — опционален auto-fill от сесия
// Ако DTO е непълен и client подава sessionToken header,
// зареди данните от anon:{sessionToken}:session → vehicle_data
// Използвай само ако validation_status === 'validated'
```

Но основният флоу е: Web/Flutter подавате пълните данни от session в request body.

### Controller Pattern за authenticated endpoints

```typescript
// Намери @CurrentUser() decorator в ClientsModule
// Той извлича end_client.id от JWT payload
// Използвай: @UseGuards(ClientJwtAuthGuard) @CurrentUser() client: EndClient

@Post()
@UseGuards(ClientJwtAuthGuard)
@HttpCode(HttpStatus.CREATED)
async save(
  @Body() dto: CreateVehicleDto,
  @CurrentUser() client: EndClient,
): Promise<VehicleResponseDto> {
  return this.vehiclesService.saveVehicle(dto, client.id);
}
```

### Зависимости от предишни Stories

**Story 3.1 (done):**
- `anon:{sessionToken}:session` Redis key pattern — session data source

**Story 3.2 (review):**
- `end_clients` таблица съществува; `ClientJwtAuthGuard` е имплементиран в `ClientsModule`
- `owner_id` = `end_client.id` от JWT

**Story 3.3 (done):**
- `vehicle_data` в Redis session вече съдържа: `license_plate`, `vin`, `make`, `model`, `year`, `color`, `engine_volume`, `fuel_type`, `first_registration_date`

**Story 3.4 (review):**
- `VehiclesModule`, `VehiclesController` (POST /validate), `VehiclesService` вече съществуват
- `VehiclesRepository` е **STUB** — Task 3 го попълва
- `CreateVehicleDto` е **STUB** — Task 4 го попълва
- `KatApiAdapter`, `GarantsionenFondAdapter` вече работят — не пипай

### Previous Story Intelligence (3.4)

- `@Inject(REDIS_CLIENT)` pattern за Redis — **НЕ** `@InjectRedis()`
- TypeORM entity injection: `@InjectRepository(EntityClass)` — **НЕ** string token
- Mock за `VehiclesRepository` в тестове: `{ provide: VehiclesRepository, useValue: mockRepo }`
- `res.body` в supertest: cast с `as VehicleResponseDto[]` — без `any`
- `Object.entries/values` — добавяй explicit тип анотации
- Class properties: добавяй `!` postfix assertion

### Git Intelligence

```
Last migration: 1710000010000-CreateOcrJobsTable.ts
Next migration: 1710000011000-CreateVehiclesTable.ts

Story 3.5 branch:  feature/story-3-5-vehicle-data-persistence-auto-load
Commit format:     feat(story-3.5): Vehicle Data Persistence & Auto-Load
PR title:          feat(story-3.5): Vehicle Data Persistence & Auto-Load
PR base:           main  ← ЗАДЪЛЖИТЕЛНО --base main
```

### Файлова Структура

```
branivo-api/src/infrastructure/database/migrations/
└── 1710000011000-CreateVehiclesTable.ts    ← НОВО

branivo-api/src/modules/vehicles/
├── entities/
│   └── vehicle.entity.ts                   ← НОВО
├── dto/
│   ├── create-vehicle.dto.ts               ← ПОПЪЛНЕН (беше stub)
│   └── vehicle-response.dto.ts             ← НОВО
├── vehicles.repository.ts                  ← ПОПЪЛНЕН (беше stub)
├── vehicles.service.ts                     ← ОБНОВЕН (добавени persistence методи)
├── vehicles.controller.ts                  ← ОБНОВЕН (добавени CRUD endpoints)
├── vehicles.module.ts                      ← ОБНОВЕН (добавен TypeOrmModule)
├── vehicles.service.spec.ts               ← ОБНОВЕН (добавени persistence тестове)
└── vehicles.controller.spec.ts            ← ОБНОВЕН (добавени CRUD тестове)

branivo-api/src/modules/clients/
├── guards/
│   └── client-jwt-auth.guard.ts           ← НОВО
└── decorators/
    └── current-user.decorator.ts          ← НОВО

branivo-web/src/app/api/v1/vehicles/
├── route.ts                                ← НОВО (GET list + POST save)
└── [id]/
    └── route.ts                            ← НОВО (GET single)

branivo-web/src/lib/hooks/
└── use-vehicles.ts                         ← НОВО

branivo-web/src/app/[locale]/(client)/vehicles/
├── page.tsx                                ← НОВО (VehicleListPage)
└── components/
    └── vehicle-picker.tsx                  ← НОВО

branivo-web/src/__tests__/hooks/
└── use-vehicles.test.ts                    ← НОВО

branivo-web/src/__tests__/client/
└── vehicle-list-page.test.tsx              ← НОВО

branivo_app/lib/features/vehicles/
├── data/
│   ├── models/
│   │   └── vehicle_model.dart              ← НОВО
│   └── repositories/
│       ├── vehicle_api_repository.dart     ← СЪЩЕСТВУВАЩ (validation only)
│       └── vehicles_repository.dart        ← НОВО (CRUD)
├── bloc/
│   ├── vehicles_bloc.dart                  ← НОВО (list/save bloc)
│   ├── vehicles_event.dart                 ← НОВО
│   └── vehicles_state.dart                 ← НОВО
└── screens/
    └── vehicle_list_screen.dart            ← НОВО

branivo_app/test/features/vehicles/
└── vehicles_bloc_test.dart                 ← НОВО
```

### Project Structure Notes

- `VehiclesModule` е вече в `AppModule` — **НЕ** го добавяй отново
- `VehiclesRepository` е в `providers[]` на `VehiclesModule` — само го попълни
- Migration се добавя в `TypeORM dataSource` config — провери `database.config.ts`
- Flutter: `vehicles_repository.dart` (CRUD) е различен файл от `vehicle_api_repository.dart` (validation)
- BFF routes проксират само — **не** съдържат бизнес логика

### References

- [Source: epics.md#Story 3.5] — User story, AC1-AC5, vehicles table persistence
- [Source: architecture.md#Code Structure #vehicles] — `vehicle.entity.ts`, repository, CRUD endpoints
- [Source: architecture.md#Database Conventions] — TypeORM column mapping, RLS, UUID PK
- [Source: architecture.md#BaseRepository] — `extends BaseRepository`, soft delete scope
- [Source: migration `1710000009000-CreateEndClientsTable.ts`] — RLS policy pattern, FK pattern
- [Source: migration `1710000010000-CreateOcrJobsTable.ts`] — последен migration (next: 11000)
- [Source: `vehicles.repository.ts`] — stub (6 реда) — попълни, не замествай файла
- [Source: `vehicles.service.ts`] — вече имплементиран validateVehicle() — добавяй нови методи
- [Source: `vehicles.controller.ts`] — вече има POST /validate — добавяй нови endpoints
- [Source: Story 3.4 Dev Notes] — `@Inject(REDIS_CLIENT)` pattern, mock patterns за тестове
- [Source: Story 3.2] — `ClientJwtAuthGuard`, `@CurrentUser()` декоратор

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `AuthenticatedUser` трябваше да се импортира с `import type` заради `isolatedModules` + `emitDecoratorMetadata` — fixed
- Flutter: Нужно е `registerFallbackValue(FakeVehicleModel())` за `any()` matcher с mocktail
- Next.js page: Не може да приема props — рефакториран да чете `access_token` от `localStorage`

### Completion Notes List

- ✅ Task 1: `vehicle.entity.ts` — 14 полета, EndClient pattern, `@DeleteDateColumn`
- ✅ Task 2: Migration `1710000011000` — RLS, FKs, 3 indexes, full `down()`
- ✅ Task 3: `VehiclesRepository` — extends `BaseRepository<Vehicle>`, `findByOwner`, `findByOwnerAndId`
- ✅ Task 4: `CreateVehicleDto` с class-validator, `VehicleResponseDto` с `lastPolicyStatus`
- ✅ Task 5: `VehiclesService` — `saveVehicle`, `listVehicles`, `getVehicle` + `NotFoundException`
- ✅ Task 6: `VehiclesController` — POST/GET/GET:id с `ClientJwtAuthGuard` (нов guard)
- ✅ Task 7: `VehiclesModule` — `TypeOrmModule.forFeature([Vehicle])` добавен
- ✅ Task 8: 5 нови service unit теста (saveVehicle, listVehicles, getVehicle found/not-found)
- ✅ Task 9: 5 нови controller integration теста (POST 201, GET 200, empty 200, single 200, 403)
- ✅ Task 10: BFF routes — `/api/v1/vehicles` (GET+POST), `/api/v1/vehicles/[id]` (GET)
- ✅ Task 11: `useVehicles` hook с `listVehicles`, `saveVehicle`, `getVehicle`
- ✅ Task 12: `VehicleListPage` — empty state + VehicleCard list, token от localStorage
- ✅ Task 13: `VehiclePicker` — reusable компонент с click handler
- ✅ Task 14: 6 hook теста + 2 page теста
- ✅ Task 15: `VehicleModel` с manual `fromJson`/`toJson` (snake_case)
- ✅ Task 16: `VehiclesRepository` (Flutter) — Dio, flutter_secure_storage, auth_token
- ✅ Task 17: `VehiclesBloc` + Events + States — LoadVehicles, SaveVehicle, SelectVehicle
- ✅ Task 18: `VehicleListScreen` — ListView, empty state, Semantics accessibility labels
- ✅ Task 19: 5 bloc теста с mocktail + `FakeVehicleModel`

**Test results:**
- API: 297 тест, 36 test suite — всички минават
- Web: 96 теста, 17 test suite — всички минават
- Flutter: 33 теста — всички минават

### File List

branivo-api/src/infrastructure/database/migrations/1710000011000-CreateVehiclesTable.ts
branivo-api/src/modules/clients/decorators/current-user.decorator.ts
branivo-api/src/modules/clients/guards/client-jwt-auth.guard.ts
branivo-api/src/modules/vehicles/dto/create-vehicle.dto.ts
branivo-api/src/modules/vehicles/dto/vehicle-response.dto.ts
branivo-api/src/modules/vehicles/entities/vehicle.entity.ts
branivo-api/src/modules/vehicles/vehicles.controller.spec.ts
branivo-api/src/modules/vehicles/vehicles.controller.ts
branivo-api/src/modules/vehicles/vehicles.module.ts
branivo-api/src/modules/vehicles/vehicles.repository.ts
branivo-api/src/modules/vehicles/vehicles.service.spec.ts
branivo-api/src/modules/vehicles/vehicles.service.ts
branivo-web/src/__tests__/client/vehicle-list-page.test.tsx
branivo-web/src/__tests__/hooks/use-vehicles.test.ts
branivo-web/src/app/[locale]/(client)/vehicles/components/vehicle-picker.tsx
branivo-web/src/app/[locale]/(client)/vehicles/page.tsx
branivo-web/src/app/api/v1/vehicles/[id]/route.ts
branivo-web/src/app/api/v1/vehicles/route.ts
branivo-web/src/lib/hooks/use-vehicles.ts
branivo_app/lib/features/vehicles/bloc/vehicles_bloc.dart
branivo_app/lib/features/vehicles/bloc/vehicles_event.dart
branivo_app/lib/features/vehicles/bloc/vehicles_state.dart
branivo_app/lib/features/vehicles/data/models/vehicle_model.dart
branivo_app/lib/features/vehicles/data/repositories/vehicles_repository.dart
branivo_app/lib/features/vehicles/screens/vehicle_list_screen.dart
branivo_app/test/features/vehicles/vehicles_bloc_test.dart
_bmad-output/implementation-artifacts/sprint-status.yaml
