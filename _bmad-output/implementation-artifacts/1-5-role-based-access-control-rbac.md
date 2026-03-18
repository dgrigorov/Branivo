# Story 1.5: Role-Based Access Control (RBAC)

Status: done

## Story

As a Super Admin,
I want to create and manage roles with granular permissions assigned to users per tenant,
So that access is strictly scoped and users see only what their role permits.

## Acceptance Criteria

1. **AC1 — RLS тenantizация на DB ниво:**
   **Given** потребител в Tenant A с роля Broker,
   **When** извършва DB заявка чрез TenantContext,
   **Then** автоматично вижда само данни с `tenant_id` = собствения (RLS policy чрез `app.current_tenant_id`)

2. **AC2 — Блокиране на cross-tenant достъп:**
   **Given** потребител в Tenant A,
   **When** опитва да достъпи данни на Tenant B (дори чрез директна API заявка),
   **Then** получава 403 Forbidden — RLS на PostgreSQL ниво блокира преди да върне ред

3. **AC3 — Role change при следващ refresh:**
   **Given** на потребител е сменена ролята,
   **When** текущите JWT tokens се използват до изтичане,
   **Then** следващият `POST /api/v1/auth/refresh` връща нов access token с актуалната роля

4. **AC4 — 401 за незаверени заявки:**
   **Given** всеки защитен endpoint,
   **When** е достъпен без валиден JWT,
   **Then** се връща 401 Unauthorized

5. **AC5 — Автоматично RLS филтриране:**
   **Given** RLS policy на всяка таблица с `tenant_id`,
   **When** произволна DB заявка се изпълнява чрез BaseRepository,
   **Then** `app.current_tenant_id` е SET и RLS автоматично филтрира без ръчен WHERE clause

6. **AC6 — User management от broker_admin:**
   **Given** broker_admin е логнат в своя тенант,
   **When** прави `GET /api/v1/users`,
   **Then** вижда само потребителите в собствения си тенант (RLS enforcement)

7. **AC7 — Role assignment:**
   **Given** broker_admin е логнат,
   **When** прави `PUT /api/v1/users/:id/role` с валидна роля,
   **Then** ролята на потребителя се обновява; следващият refresh за смените потребител ще отрази новата роля

8. **AC8 — FeatureFlagGuard:**
   **Given** endpoint е защитен с `@FeatureFlag('fleet')`,
   **When** тенантът няма `features.fleet = true`,
   **Then** се връща 403 с ясно съобщение "Feature not enabled"

## Tasks / Subtasks

### Backend — User Management Endpoints

- [x] **Task 1: Expand UsersRepository** (AC: #6, #7)
  - [x] Добави в `branivo-api/src/modules/users/users.repository.ts`:
    - `findAllByTenant(): Promise<User[]>` — използва `BaseRepository.findAll({})` (RLS автоматично scope-ва)
    - `updateRole(userId: string, role: UserRole): Promise<void>` — UPDATE users SET role WHERE id (tenant-scoped чрез RLS)
    - `createUser(data: Partial<User>): Promise<User>` — използва `BaseRepository.save(data)`
  - [x] **КРИТИЧНО:** Всички методи наследяват `setTenantSession()` от BaseRepository — не добавяй ръчен `tenant_id` WHERE (RLS го прави)

- [x] **Task 2: Expand UsersService** (AC: #6, #7)
  - [x] Добави в `branivo-api/src/modules/users/users.service.ts`:
    - `findAll(): Promise<User[]>` — извиква `usersRepository.findAllByTenant()`
    - `updateRole(userId: string, role: UserRole): Promise<void>`:
      1. Validate `role` е валидна `UserRole` стойност (не `super_admin`) — service-level safety net
      2. Извика `usersRepository.updateRole(userId, role)`
    - `createBrokerUser(dto: CreateBrokerUserDto): Promise<User>` — хешира парола, catch PG 23505 → ConflictException
    - `softDeleteUser(userId: string): Promise<void>` — извиква `UsersRepository.softDelete(userId)`
  - [x] **ПРАВИЛО:** `broker_admin` не може да присвоява `super_admin` роля — валидация в service; самопромяна на роля е блокирана в Controller

- [x] **Task 3: UsersController** (AC: #4, #6, #7)
  - [x] Създай `branivo-api/src/modules/users/users.controller.ts`
  - [x] **Всички endpoints са `@UseGuards(JwtAuthGuard, RolesGuard)`**
  - [x] `GET /api/v1/users` → `@Roles('broker_admin')` → `UsersService.findAll()`
    - Response: масив от `UserResponseDto` (**НИКОГА не включвай `passwordHash`, `twoFaSecretEnc`**)
  - [x] `POST /api/v1/users` → `@Roles('broker_admin')` → `UsersService.createBrokerUser(dto)`
    - DTO: `CreateBrokerUserDto { email: string (IsEmail); role: 'broker_agent' | 'broker_viewer' (IsIn); password: string (MinLength(8)) }`
  - [x] `PUT /api/v1/users/:id/role` → `@Roles('broker_admin')` → `UsersService.updateRole(id, dto.role)` + `ParseUUIDPipe` + самопромяна блокирана
    - DTO: `UpdateUserRoleDto { role: UserRole (IsIn(['broker_agent', 'broker_viewer', 'broker_admin'])) }`
  - [x] `DELETE /api/v1/users/:id` → `@Roles('broker_admin')` → `UsersService.softDeleteUser(id)` + `ParseUUIDPipe` + самоизтриване блокирано
  - [x] `GET /api/v1/users/me` → всяка роля → връща данни за текущия потребител

- [x] **Task 4: UserResponseDto** (AC: #4, AC: #6)
  - [x] Създай `branivo-api/src/modules/users/dto/user-response.dto.ts`
  - [x] Полета: `id, tenantId, email, role, twoFaEnabled, createdAt`
  - [x] **КРИТИЧНО: НЕ включвай `passwordHash`, `twoFaSecretEnc`, `failedLoginCount`, `lockedUntil`**
  - [x] Използвай за всички User response endpoints

- [x] **Task 5: Регистрирай UsersController в UsersModule** (AC: #6)
  - [x] В `branivo-api/src/modules/users/users.module.ts` добави `controllers: [UsersController]`
  - [x] Провери дали `UsersModule` е регистриран в `AppModule` — ако не → добави

### Backend — FeatureFlagGuard

- [x] **Task 6: FeatureFlagGuard** (AC: #8)
  - [x] Създай `branivo-api/src/common/guards/feature-flag.guard.ts`
  - [x] Логика:
    ```typescript
    @Injectable()
    export class FeatureFlagGuard implements CanActivate {
      constructor(
        private reflector: Reflector,
        private tenantsRepository: TenantsRepository,
        private tenantContext: TenantContext,
      ) {}

      async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const flag = this.reflector.getAllAndOverride<string>('feature_flag', [
          ctx.getHandler(), ctx.getClass()
        ]);
        if (!flag) return true;
        const tenantId = this.tenantContext.getTenantId();
        const tenant = await this.tenantsRepository.findById(tenantId);
        const features = tenant?.features as Record<string, boolean> ?? {};
        if (!features[flag]) {
          throw new ForbiddenException(`Feature not enabled: ${flag}`);
        }
        return true;
      }
    }
    ```
  - [x] Забележка: `features` колоната в `tenants` таблица трябва да съществува (виж Task 7)

- [x] **Task 7: @FeatureFlag decorator** (AC: #8)
  - [x] Създай `branivo-api/src/common/decorators/feature-flag.decorator.ts`
  - [x] `export const FeatureFlag = (flag: string) => SetMetadata('feature_flag', flag)`

- [x] **Task 8: `features` колона в tenants таблица** (AC: #8)
  - [x] Създай migration `branivo-api/src/infrastructure/database/migrations/1710000006000-AddTenantFeaturesColumn.ts`
  - [x] Добави колона:
    ```sql
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}';
    ```
  - [x] Включи `down()` метод: `ALTER TABLE tenants DROP COLUMN IF EXISTS features`
  - [x] Добави поле в `Tenant` entity: `@Column({ name: 'features', type: 'jsonb', default: {} }) features!: Record<string, boolean>`

### Backend — RLS Validation & Hardening

- [x] **Task 9: RLS за `users` таблица — вече съществува (проверка)** (AC: #1, #2)
  - [x] Провери `1710000002000-CreateUsersTable.ts` — RLS policy `tenant_isolation_users` вече е там
  - [x] Провери дали `tenant_invitations` таблица има RLS — **НЕ трябва** (Super Admin context)
  - [x] Провери дали `audit_log` таблица има RLS — **трябва** (намери в `1710000001000-AddRlsPolicies.ts`)
  - [x] Ако `audit_log` RLS липсва → добави в нова migration `1710000007000-AddAuditLogRls.ts`

- [x] **Task 10: Enhance RolesGuard — throw ForbiddenException** (AC: #4)
  - [x] Провери дали текущият RolesGuard хвърля правилния error
  - [x] Актуализирай `roles.guard.ts` да хвърля `ForbiddenException` вместо да връща `false`:
    ```typescript
    if (!roles.includes(role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
    ```
  - [x] **Причина:** Explicit exception дава по-ясен error message в production logs

### Next.js Web — User Management UI

- [x] **Task 11: Users Management Page** (AC: #6, #7)
  - [x] Създай `branivo-web/src/app/[locale]/(broker)/users/page.tsx`
  - [x] TanStack Query: `['users', 'list']` — `GET /api/v1/users`
  - [x] Показвай: email, role badge (color-coded), 2FA status, created_at, action buttons
  - [x] Role badges: `broker_admin` → лилаво; `broker_agent` → синьо; `broker_viewer` → сиво
  - [x] Action buttons: "Change Role", "Deactivate" (soft-delete)

- [x] **Task 12: Create User Modal** (AC: #6)
  - [x] Създай `branivo-web/src/components/users/create-user-modal.tsx`
  - [x] React Hook Form + Zod validation
  - [x] Fields: `email`, `role` (select: broker_agent/broker_viewer), `password`
  - [x] Submit → `POST /api/v1/users` → toast success/error

- [x] **Task 13: Change Role Modal** (AC: #7)
  - [x] Създай `branivo-web/src/components/users/change-role-modal.tsx`
  - [x] Selector за нова роля (не включва super_admin)
  - [x] Submit → `PUT /api/v1/users/:id/role` → invalidate `['users', 'list']` query

### Tests

- [x] **Task 14: Unit тестове за UsersService** (AC: #6, #7)
  - [x] `branivo-api/src/modules/users/users.service.spec.ts`
  - [x] Test: `findAll()` → извиква `usersRepository.findAllByTenant()`
  - [x] Test: `updateRole()` с валидна роля → `usersRepository.updateRole()` извикан
  - [x] Test: `updateRole()` с `super_admin` роля → 400 BadRequest
  - [x] Test: `createBrokerUser()` → password хеширан, user записан
  - [x] Test: `softDeleteUser()` → `BaseRepository.softDelete()` извикан

- [x] **Task 15: Unit тестове за FeatureFlagGuard** (AC: #8)
  - [x] `branivo-api/src/common/guards/feature-flag.guard.spec.ts`
  - [x] Test: без `@FeatureFlag` → `canActivate` = true
  - [x] Test: с `@FeatureFlag('fleet')`, `features.fleet = true` → `canActivate` = true
  - [x] Test: с `@FeatureFlag('fleet')`, `features.fleet = false` → throws `ForbiddenException`
  - [x] Test: с `@FeatureFlag('fleet')`, `features` = `{}` → throws `ForbiddenException`

- [x] **Task 16: Integration тестове за UsersController** (AC: #1–#8)
  - [x] `branivo-api/src/modules/users/users.controller.spec.ts`
  - [x] Test: `GET /users` без auth → 401
  - [x] Test: `GET /users` с `broker_agent` роля → 403 (само broker_admin/super_admin)
  - [x] Test: `GET /users` с `broker_admin` роля → 200 + list (само собствен тенант — RLS)
  - [x] Test: `PUT /users/:id/role` с `super_admin` роля в body → 400
  - [x] Test: `PUT /users/:id/role` с `broker_admin` token → 200
  - [x] Test: `DELETE /users/:id` с broker_admin → 200
  - [x] Test: response НИКОГА не съдържа `password_hash` или `two_fa_secret_enc`

- [x] **Task 17: RLS integration тест** (AC: #1, #2)
  - [x] `branivo-api/src/modules/users/users.repository.spec.ts` — разшири
  - [x] Test: `findAllByTenant()` при TenantContext → `setTenantSession()` извикан преди заявката
  - [x] Test: `setTenantSession()` → `SELECT set_config('app.current_tenant_id', tenantId, true)` executed

- [x] **Task 18: Component тестове за Users UI** (AC: #6)
  - [x] `branivo-web/src/__tests__/users/page.test.tsx`
  - [x] Test: renders user list при успешна заявка
  - [x] Test: показва role badges с правилни цветове
  - [x] Test: "Change Role" button отваря modal

## Dev Notes

### Какво вече съществува (НЕ пресъздавай)

```
branivo-api/src/common/guards/roles.guard.ts         ← вече имплементиран (Story 1.4)
branivo-api/src/common/decorators/roles.decorator.ts  ← вече имплементиран (Story 1.4)
branivo-api/src/modules/users/entities/user.entity.ts ← UserRole type + User entity вече са там
branivo-api/src/modules/users/users.repository.ts     ← BaseRepository pattern вече установен
branivo-api/src/modules/users/users.service.ts        ← минимален, само findByEmailAndTenant
```

**RLS вече е имплементиран:**
- Migration `1710000001000-AddRlsPolicies.ts` — RLS за `quotes`, `policies`, `policy_events`, `payments`, `vehicles`, `customers`, `audit_log`, `notifications`
- Migration `1710000002000-CreateUsersTable.ts` — RLS за `users` с `tenant_isolation_users` policy
- `BaseRepository.setTenantSession()` — `SELECT set_config('app.current_tenant_id', $1, true)` преди всяка заявка

### UserRole Enum

```typescript
// Вече дефинирано в user.entity.ts:
export type UserRole = 'super_admin' | 'broker_admin' | 'broker_agent' | 'broker_viewer';
```

**Role hierarchy:**
- `super_admin` — пълен достъп, извън tenant scope; НИКОГА не се присвоява от broker_admin
- `broker_admin` — пълен достъп в рамките на тенанта; може да управлява broker_agent/broker_viewer
- `broker_agent` — може да продава и вижда own клиенти
- `broker_viewer` — read-only достъп до tenant данни

### JWT Payload — Role е включена

```typescript
// JWT payload (вече имплементиран в auth.service.ts):
interface AccessTokenPayload {
  sub: string;    // userId
  tid: string;    // tenantId
  role: string;   // UserRole
  jti: string;    // UUID — за token blacklist
}
```

**AC3 — Role change при следващ refresh:** AuthService при `/auth/refresh` зарежда user от DB и генерира нов access token с актуалната `user.role`. Следователно role change е автоматично отразен при следващия refresh **без допълнителна имплементация** — само трябва да се тества.

### RLS Policy Pattern

```sql
-- Вече активно на всички таблици с tenant_id:
CREATE POLICY "tenant_isolation_policy" ON "quotes"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- BaseRepository го SET преди всяка заявка:
SELECT set_config('app.current_tenant_id', $1, true)
-- $1 = TenantContext.getTenantId()
```

**ВАЖНО за `true` parameter:** `set_config(..., true)` → LOCAL сесия (само за текущата транзакция). TypeORM connection pooling може да recycleва connections — `true` е по-безопасно от `false` (global session), но при pool recycling все още е нужен `setTenantSession()` преди всяка заявка. Именно затова BaseRepository го вика при всеки метод.

### FeatureFlagGuard — Tenant features Column

```typescript
// Tenant entity трябва да има:
@Column({ name: 'features', type: 'jsonb', default: {} })
features!: Record<string, boolean>;

// Използване:
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@FeatureFlag('fleet')
@Get('fleet/vehicles')
async getFleetVehicles() { ... }
```

**Feature flags (Phase 2):** `features.fleet`, `features.api_access`, `features.dkp`, `features.renewal`

### UserResponseDto — Чувствителни полета

```typescript
// НИКОГА не включвай в response:
// passwordHash, twoFaSecretEnc, failedLoginCount, lockedUntil

export class UserResponseDto {
  id!: string;
  tenantId!: string;
  email!: string;
  role!: UserRole;
  twoFaEnabled!: boolean;
  createdAt!: Date;
}
```

### Cross-Tenant Access Prevention

AC2 се постига на две нива:
1. **Application level:** `TenantContext.getTenantId()` + RLS session var SET
2. **DB level:** PostgreSQL RLS policy блокира на row level дори при директни DB connections

Тестването се прави с mock TenantContext — verify `set_config` е извикан с правилния tenant_id.

### ВАЖНИ Learnings от Story 1.4

1. **RolesGuard трябва да хвърля `ForbiddenException`** — не само да връща `false`. NestJS конвертира `false` → 403, но explicit exception дава по-ясни logs.
2. **`DataSource.query()` за Super Admin** — UsersRepository uses TenantContext, което е unavailable в Super Admin flow. Story 1.4 решава с `DataSource.query()` директно. За Story 1.5 UserController endpoints **имат** TenantContext (broker endpoints), така че UsersRepository е ок.
3. **otplib v13** използва named exports (`generateSecret()`, `generateURI()`), не `authenticator` object.

### Project Structure Notes

**Нови файлове:**
```
branivo-api/src/modules/users/
├── users.controller.ts               ← Task 3
├── users.controller.spec.ts          ← Task 16
└── dto/
    ├── user-response.dto.ts          ← Task 4
    ├── create-broker-user.dto.ts     ← Task 2
    └── update-user-role.dto.ts       ← Task 3

branivo-api/src/common/guards/
└── feature-flag.guard.ts             ← Task 6
└── feature-flag.guard.spec.ts        ← Task 15

branivo-api/src/common/decorators/
└── feature-flag.decorator.ts         ← Task 7

branivo-api/src/infrastructure/database/migrations/
├── 1710000006000-AddTenantFeaturesColumn.ts   ← Task 8
└── 1710000007000-AddAuditLogRls.ts            ← Task 9 (само ако липсва)

branivo-web/src/app/[locale]/(broker)/users/
└── page.tsx                          ← Task 11

branivo-web/src/components/users/
├── create-user-modal.tsx             ← Task 12
└── change-role-modal.tsx             ← Task 13
```

**Модифицирани файлове:**
```
branivo-api/src/modules/users/users.repository.ts    ← добави нови методи (Task 1)
branivo-api/src/modules/users/users.service.ts       ← expand (Task 2)
branivo-api/src/modules/users/users.module.ts        ← добави UsersController (Task 5)
branivo-api/src/modules/users/entities/user.entity.ts ← без промяна (вече добре)
branivo-api/src/modules/tenants/entities/tenant.entity.ts ← добави features field (Task 8)
branivo-api/src/common/guards/roles.guard.ts          ← throw ForbiddenException (Task 10)
```

### References

- [Source: epics.md#Story 1.5] — Acceptance Criteria, user story statement
- [Source: architecture.md#Authentication & Security] — JWT payload, RLS pattern, UserRole
- [Source: architecture.md#Project Structure] — module paths, naming conventions
- [Source: architecture.md#NFR16] — RLS на всяка таблица с tenant_id
- [Source: project-context.md#1. Tenant Safety] — `TenantContext.getTenantId()`, RLS secondary safeguard
- [Source: story-1.4.md#Dev Notes#Completion Notes] — RolesGuard throws ForbiddenException, DataSource.query() for Super Admin
- [Source: branivo-api/src/common/base.repository.ts] — `setTenantSession()` pattern
- [Source: branivo-api/src/modules/users/entities/user.entity.ts] — UserRole type definition
- [Source: branivo-api/src/infrastructure/database/migrations/1710000001000-AddRlsPolicies.ts] — RLS migration pattern
- [Source: branivo-api/src/infrastructure/database/migrations/1710000002000-CreateUsersTable.ts] — RLS users policy already exists

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `BaseRepository.setTenantSession()` ползва `this.repo.query()` (не `this.repo.manager.query()`) — тестовете трябваше да добавят `query: jest.fn()` директно в TypeORM mock-а
- Zod v4 ползва `error` (не `errorMap`) в `.enum()` параметъра — поправено в web компонентите
- `RolesGuard` с `return false` не дава достатъчно ясен error log — сменено с `throw new ForbiddenException()`
- `features` JSONB колона вече съществуваше от `CreateTenantsTable` migration — Task 8 беше skip (migration не е нужна)
- `audit_log` RLS вече беше настроена в `CreateAuditLogTable` migration — Task 9 беше skip

### Completion Notes List

- Всички 18 задачи имплементирани и тествани; CI проверки pass (lint ✓, test:cov 127/127 ✓, build ✓, tsc ✓)
- `features` JSONB и audit_log RLS вече съществуваха от предишни stories — не са дублирани
- `RolesGuard` обновен да хвърля `ForbiddenException` вместо `return false` за по-ясни logs
- `FeatureFlagGuard` е injectable — изисква `TenantsModule` да е импортиран в модула, където се ползва
- `UsersController` регистриран в `UsersModule` и `UsersModule` добавен в `AppModule`
- `UserResponseDto` никога не включва `passwordHash`, `twoFaSecretEnc`, `failedLoginCount`, `lockedUntil`
- AC3 (role change при следващ refresh) работи нативно — `AuthService.refresh()` зарежда user от DB и генерира нов JWT с актуалната роля

### File List

**New Files — branivo-api:**
- `src/modules/users/users.controller.ts`
- `src/modules/users/users.controller.spec.ts`
- `src/modules/users/users.service.spec.ts`
- `src/modules/users/dto/user-response.dto.ts`
- `src/modules/users/dto/create-broker-user.dto.ts`
- `src/modules/users/dto/update-user-role.dto.ts`
- `src/common/guards/feature-flag.guard.ts`
- `src/common/guards/feature-flag.guard.spec.ts`
- `src/common/decorators/feature-flag.decorator.ts`

**New Files — branivo-web:**
- `src/app/[locale]/(broker)/users/page.tsx`
- `src/components/users/create-user-modal.tsx`
- `src/components/users/change-role-modal.tsx`
- `src/__tests__/users/page.test.tsx`
- `src/app/api/v1/users/route.ts` — BFF proxy: GET list, POST create
- `src/app/api/v1/users/[id]/route.ts` — BFF proxy: DELETE soft-delete
- `src/app/api/v1/users/[id]/role/route.ts` — BFF proxy: PUT role update
- `src/__tests__/api/v1/users.bff.test.ts` — BFF route handler tests

**Modified Files — branivo-api:**
- `src/modules/users/users.repository.ts` — added `findAllByTenant`, `updateRole`, `createUser`, `softDelete` override (explicit tenantId WHERE)
- `src/modules/users/users.service.ts` — expanded with `findAll`, `updateRole`, `createBrokerUser` (PG 23505 → ConflictException), `softDeleteUser`
- `src/modules/users/users.module.ts` — added `UsersController`
- `src/modules/users/users.repository.spec.ts` — added RLS enforcement tests + softDelete override test
- `src/modules/auth/auth.service.spec.ts` — added AC3 role-from-DB refresh test
- `src/modules/tenants/tenants.module.ts` — added `FeatureFlagGuard` providers/exports (correct abstraction home)
- `src/common/guards/roles.guard.ts` — throw ForbiddenException instead of return false
- `src/app.module.ts` — added `UsersModule`
