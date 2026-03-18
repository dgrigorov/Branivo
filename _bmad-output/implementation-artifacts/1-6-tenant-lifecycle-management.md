# Story 1.6: Tenant Lifecycle Management

Status: review

## Story

As a Super Admin,
I want to deactivate a tenant upon КФН license revocation,
so that new sales are immediately blocked while existing policies remain accessible.

## Acceptance Criteria

1. **AC1 — Деактивиране от Super Admin:**
   **Given** активен тенант,
   **When** Super Admin изпраща `PATCH /api/v1/admin/tenants/:id/status` с `{ "status": "suspended" }`,
   **Then** статусът се сменя на `suspended`, Redis кешът за тенантa се инвалидира, пише се audit log `tenant.deactivated`

2. **AC2 — Блокиране на нови quote заявки:**
   **Given** деактивиран тенант (`status = 'suspended'`),
   **When** клиент прави нова quote заявка (`POST /api/v1/quotes`),
   **Then** се връща `403 Forbidden` с тяло `{ "message": "Tenant is suspended — new sales are blocked" }`

3. **AC3 — Блокиране на нова покупка на полица:**
   **Given** деактивиран тенант,
   **When** клиент прави `POST /api/v1/policies`,
   **Then** се блокира с `403 Forbidden` (TenantActiveGuard)

4. **AC4 — Read-only достъп до издадени полици:**
   **Given** деактивиран тенант,
   **When** клиент прави `GET /api/v1/policies`,
   **Then** отговорът е `200 OK` с пълен списък на издадените полици (TenantActiveGuard пропуска GET заявки)

5. **AC5 — Broker dashboard в read-only режим:**
   **Given** деактивиран тенант,
   **When** брокер се логва в dashboard,
   **Then** вижда червен информационен банер "Акаунтът е временно деактивиран. Само преглед на данни е разрешен." над съдържанието

6. **AC6 — Реактивиране:**
   **Given** деактивиран тенант,
   **When** Super Admin изпраща `PATCH /api/v1/admin/tenants/:id/status` с `{ "status": "active" }`,
   **Then** статусът се сменя на `active`, кешът се инвалидира, пише се audit log `tenant.reactivated`; новите продажби се възобновяват веднага

7. **AC7 — Валидация на status transitions:**
   **Given** тенант в произволен статус,
   **When** Super Admin изпраща невалидна смяна (например от `invited` към `suspended`),
   **Then** се връща `400 Bad Request` с ясно описание на позволените преходи (само `active` → `suspended` и `suspended` → `active`)

8. **AC8 — Admin UI — бутон "Деактивирай":**
   **Given** активен тенант в Admin Tenants таблицата,
   **When** Super Admin кликне "Деактивирай" и потвърди в confirmation modal,
   **Then** `PATCH /api/v1/admin/tenants/:id/status` се изпраща, таблицата се обновява и статусът се сменя на "Спрян"

## Tasks / Subtasks

### Backend — TenantActiveGuard

- [x] **Task 1: TenantActiveGuard** (AC: #2, #3, #4)
  - [x] Създай `branivo-api/src/common/guards/tenant-active.guard.ts`
  - [x] Логика:
    ```typescript
    @Injectable()
    export class TenantActiveGuard implements CanActivate {
      constructor(
        private readonly tenantsRepository: TenantsRepository,
        private readonly tenantContext: TenantContext,
      ) {}

      async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const request = ctx.switchToHttp().getRequest<{ method: string }>();
        // Allow all read-only operations
        if (request.method === 'GET' || request.method === 'HEAD') {
          return true;
        }
        const tenantId = this.tenantContext.getTenantId();
        const tenant = await this.tenantsRepository.findById(tenantId);
        if (tenant?.status === 'suspended') {
          throw new ForbiddenException(
            'Tenant is suspended — new sales are blocked',
          );
        }
        return true;
      }
    }
    ```
  - [x] Регистрирай в `TenantsModule` като provider/export (следва модела на `FeatureFlagGuard`)
  - [x] **НЕ прилагай глобално** — само на конкретни модули (quotes, policies) чрез `@UseGuards(TenantActiveGuard)`

- [x] **Task 2: Регистриране на TenantActiveGuard в TenantsModule** (AC: #2, #3)
  - [x] Добави `TenantActiveGuard` в `providers` и `exports` на `TenantsModule`
  - [x] Pattern: следвай как `FeatureFlagGuard` е добавен в `tenants.module.ts` (Story 1.5)

### Backend — Admin Status Endpoint

- [x] **Task 3: UpdateTenantStatusDto** (AC: #7)
  - [x] Създай `branivo-api/src/modules/admin/dto/update-tenant-status.dto.ts`:
    ```typescript
    export class UpdateTenantStatusDto {
      @IsIn(['active', 'suspended'])
      status!: 'active' | 'suspended';
    }
    ```
  - [x] Валидация: само `active` и `suspended` са позволени target стойности

- [x] **Task 4: AdminTenantsService.updateTenantStatus()** (AC: #1, #6, #7)
  - [x] Добави метод в `branivo-api/src/modules/admin/admin-tenants.service.ts`:
    ```typescript
    async updateTenantStatus(
      tenantId: string,
      newStatus: 'active' | 'suspended',
      superAdminId: string,
    ): Promise<void> {
      const tenant = await this.findTenantOrThrow(tenantId);

      // Само active → suspended и suspended → active са позволени
      const allowed: Record<string, string[]> = {
        active: ['suspended'],
        suspended: ['active'],
      };
      if (!allowed[tenant.status]?.includes(newStatus)) {
        throw new BadRequestException(
          `Cannot transition from '${tenant.status}' to '${newStatus}'`,
        );
      }

      await this.tenantsRepository.updateStatus(tenantId, newStatus);

      // Инвалидирай Redis кеша
      const cacheKey = RedisKeyHelper.build(tenantId, 'config', 'tenant');
      await this.redis.del(cacheKey);

      const action = newStatus === 'suspended' ? 'tenant.deactivated' : 'tenant.reactivated';
      await this.writeAuditLog({
        tenantId,
        userId: superAdminId,
        action,
        entityType: 'tenant',
        entityId: tenantId,
      });
    }
    ```
  - [x] **ВАЖНО:** `RedisKeyHelper.build(tenantId, 'config', 'tenant')` е точният формат за tenant config cache key (виж `TenantsService.getConfigFromCache()`)
  - [x] `TenantsRepository.updateStatus()` вече съществува — използвай директно

- [x] **Task 5: AdminTenantsController — PATCH /:id/status** (AC: #1, #6, #7)
  - [x] Добави в `branivo-api/src/modules/admin/admin-tenants.controller.ts`:
    ```typescript
    import { Patch } from '@nestjs/common';
    import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';

    @Patch(':id/status')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('super_admin')
    @HttpCode(HttpStatus.NO_CONTENT)
    async updateTenantStatus(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: UpdateTenantStatusDto,
      @Request() req: AuthenticatedRequest,
    ) {
      return this.adminTenantsService.updateTenantStatus(
        id,
        dto.status,
        req.user.userId,
      );
    }
    ```
  - [x] Добави `ParseUUIDPipe` за `id` параметъра

### Next.js Web — Admin UI

- [x] **Task 6: Deactivate/Reactivate бутон в Admin Tenants таблица** (AC: #8)
  - [x] Промени `branivo-web/src/app/[locale]/(admin)/tenants/page.tsx`
  - [x] Добави колона "Действия" в таблицата
  - [x] За `active` тенант: бутон "Деактивирай" (червен)
  - [x] За `suspended` тенант: бутон "Реактивирай" (зелен)
  - [x] При клик → отваря `ConfirmStatusModal`
  - [x] При потвърждение → `PATCH /api/v1/admin/tenants/:id/status` → invalidate `['admin', 'tenants']` query

- [x] **Task 7: ConfirmStatusModal компонент** (AC: #8)
  - [x] Създай `branivo-web/src/components/admin/confirm-status-modal.tsx`
  - [x] Props: `tenantName: string`, `action: 'deactivate' | 'reactivate'`, `onConfirm: () => void`, `onClose: () => void`, `isLoading: boolean`
  - [x] Деактивиране текст: "Сигурни ли сте, че искате да деактивирате **{name}**? Новите продажби ще бъдат блокирани."
  - [x] Реактивиране текст: "Сигурни ли сте, че искате да реактивирате **{name}**? Продажбите ще се възобновят веднага."
  - [x] Бутон "Потвърди" (деструктивен/primary в зависимост от action) + "Отказ"

- [x] **Task 8: BFF route за PATCH status** (AC: #8)
  - [x] Създай `branivo-web/src/app/api/v1/admin/tenants/[id]/status/route.ts`
  - [x] `PATCH` handler → проксира към `BRANIVO_API_URL/api/v1/admin/tenants/:id/status`
  - [x] Следвай BFF proxy pattern от `src/app/api/v1/users/[id]/role/route.ts`

- [x] **Task 9: Suspended статус банер в broker dashboard** (AC: #5)
  - [x] Промени `branivo-web/src/app/[locale]/(broker)/layout.tsx` (или най-горния broker layout)
  - [x] Зареди tenant config чрез `GET /api/v1/tenants/config` (вече съществуващ endpoint)
  - [x] Ако `status === 'suspended'` → показвай червен банер:
    ```tsx
    <div className="bg-red-50 border-l-4 border-red-400 p-4">
      <p className="text-red-700 font-medium">
        Акаунтът е временно деактивиран. Само преглед на данни е разрешен.
      </p>
    </div>
    ```
  - [x] Банерът трябва да е постоянно видим над навигацията

### Tests

- [x] **Task 10: Unit тестове за TenantActiveGuard** (AC: #2, #3, #4)
  - [x] `branivo-api/src/common/guards/tenant-active.guard.spec.ts`
  - [x] Test: GET заявка → `canActivate` = true (независимо от статуса)
  - [x] Test: POST заявка, `status = 'active'` → `canActivate` = true
  - [x] Test: POST заявка, `status = 'suspended'` → throws `ForbiddenException('Tenant is suspended — new sales are blocked')`
  - [x] Test: POST заявка, tenant не съществува → `canActivate` = true (fail-open за несъществуващ tenant)

- [x] **Task 11: Unit тестове за AdminTenantsService.updateTenantStatus()** (AC: #1, #6, #7)
  - [x] Добави в `branivo-api/src/modules/admin/admin-tenants.service.spec.ts`
  - [x] Test: `active` → `suspended` → `updateStatus()` извикан, Redis `del()` извикан, audit log `tenant.deactivated`
  - [x] Test: `suspended` → `active` → audit log `tenant.reactivated`
  - [x] Test: `invited` → `suspended` → throws `BadRequestException`
  - [x] Test: `active` → `active` → throws `BadRequestException` (невалиден преход)
  - [x] Test: несъществуващ tenant → throws `NotFoundException`

- [x] **Task 12: Integration тестове за PATCH /admin/tenants/:id/status** (AC: #1, #6, #7)
  - [x] Добави в `branivo-api/src/modules/admin/admin-tenants.controller.spec.ts`
  - [x] Test: без auth → 401
  - [x] Test: с `broker_admin` роля → 403
  - [x] Test: с `super_admin` роля, валиден tenant, `active→suspended` → 204
  - [x] Test: невалиден UUID в `:id` → 400 (ParseUUIDPipe)
  - [x] Test: невалиден `status` стойност в body → 400

- [x] **Task 13: Component тестове за Admin UI** (AC: #8)
  - [x] `branivo-web/src/__tests__/admin/tenants.page.test.tsx`
  - [x] Test: таблицата показва "Деактивирай" бутон за active тенанти
  - [x] Test: таблицата показва "Реактивирай" бутон за suspended тенанти
  - [x] Test: клик на "Деактивирай" → отваря `ConfirmStatusModal`
  - [x] Test: потвърждение → PATCH заявка се изпраща

## Dev Notes

### Какво вече съществува (НЕ пресъздавай)

```
branivo-api/src/modules/tenants/tenants.repository.ts     ← updateStatus(id, status) вече съществува (ред 81)
branivo-api/src/modules/admin/admin-tenants.service.ts    ← writeAuditLog() pattern + findTenantOrThrow()
branivo-api/src/modules/admin/admin-tenants.controller.ts ← PATCH endpoint трябва да се добави тук
branivo-api/src/common/guards/feature-flag.guard.ts       ← пример за injectable guard с TenantContext
branivo-web/src/app/[locale]/(admin)/tenants/page.tsx     ← вече включва 'suspended' в STATUS_BADGE (ред 39-42)
```

### Tenant Status Machine

```
invited ──→ stripe_connected ──→ active ←──→ suspended
                                   ↑               ↓
                                реактивиране  деактивиране
```

**Позволени преходи за `PATCH /:id/status`:**
- `active` → `suspended` (деактивиране при КФН отнемане)
- `suspended` → `active` (реактивиране при възстановяване на лиценз)

**НЕ позволени** (трябва `400 Bad Request`): invited→suspended, stripe_connected→suspended, и всеки друг преход

### Redis Cache Invalidation

При смяна на статуса трябва да се изтрие tenant config кешът:

```typescript
// Точен ключ (от TenantsService.getConfigFromCache()):
const cacheKey = RedisKeyHelper.build(tenantId, 'config', 'tenant');
await this.redis.del(cacheKey);
```

**Защо е критично:** `TenantsService.getTenantConfig()` кешира `status` поле в Redis за 5 минути. Ако не инвалидираме, broker dashboard ще продължава да вижда `active` статус до изтичане на TTL-а. TenantActiveGuard обаче чете директно от DB, така че блокирането е незабавно.

### TenantActiveGuard — Fail-Open Strategy

Guard-ът работи само в контекст на broker-facing endpoints (има `TenantContext` наличен). **НЕ** трябва да се прилага за:
- Super Admin endpoints (`/admin/*`)
- Public onboarding endpoints
- Stripe webhooks

**Прилагай само на:**
- `QuotesController` — `POST /api/v1/quotes`
- `PoliciesController` — `POST /api/v1/policies`

Добавянето на `@UseGuards(TenantActiveGuard)` ще стане в Story 3.1 (Quotes) и Story 4.2 (Policies). **В Story 1.6 само създаваме и тестваме guard-а.**

### Audit Log Pattern

```typescript
// Вече имплементиран в admin-tenants.service.ts (ред 321-348)
await this.writeAuditLog({
  tenantId,
  userId: superAdminId,
  action: 'tenant.deactivated', // или 'tenant.reactivated'
  entityType: 'tenant',
  entityId: tenantId,
});
```

Pattern изисква `DataSource` transaction + `SET LOCAL app.current_tenant_id` — вече е правилно имплементиран.

### BFF Proxy Pattern

```typescript
// Следвай pattern от: branivo-web/src/app/api/v1/users/[id]/role/route.ts
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const res = await fetch(`${process.env.BRANIVO_API_URL}/api/v1/admin/tenants/${params.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify(body),
  });
  return new Response(res.body, { status: res.status });
}
```

### Broker Layout Suspended Banner

Tenant config вече се зарежда от `GET /api/v1/tenants/config` (TeamnantsController). Broker layout трябва да използва TanStack Query:
```typescript
const { data: config } = useQuery({
  queryKey: ['tenant', 'config'],
  queryFn: () => fetch('/api/v1/tenants/config').then(r => r.json()),
  staleTime: 60_000, // 1 минута — по-кратко от Redis TTL за по-бързо отразяване
});
```

### Learnings от Story 1.4 и 1.5

1. **FeatureFlagGuard трябва да е в TenantsModule** — TenantActiveGuard следва същия pattern
2. **`DataSource.query()` за Super Admin** — admin-tenants.service.ts вече го ползва правилно; `writeAuditLog()` е там
3. **ParseUUIDPipe** — задължително за всички `:id` params (виж UsersController Task 3 от Story 1.5)
4. **`TenantsModule` exports** — ако добавяш нов guard, добави го в `exports` за да е достъпен в QuotesModule/PoliciesModule (бъдещи stories)

### Project Structure Notes

**Нови файлове:**
```
branivo-api/src/common/guards/
└── tenant-active.guard.ts             ← Task 1
└── tenant-active.guard.spec.ts        ← Task 10

branivo-api/src/modules/admin/dto/
└── update-tenant-status.dto.ts        ← Task 3

branivo-web/src/app/api/v1/admin/tenants/[id]/status/
└── route.ts                           ← Task 8

branivo-web/src/components/admin/
└── confirm-status-modal.tsx           ← Task 7

branivo-web/src/__tests__/admin/
└── tenants.page.test.tsx              ← Task 13
```

**Модифицирани файлове:**
```
branivo-api/src/modules/admin/admin-tenants.service.ts    ← добави updateTenantStatus() (Task 4)
branivo-api/src/modules/admin/admin-tenants.controller.ts ← добави PATCH /:id/status (Task 5)
branivo-api/src/modules/tenants/tenants.module.ts         ← добави TenantActiveGuard (Task 2)
branivo-web/src/app/[locale]/(admin)/tenants/page.tsx     ← добави action бутони (Task 6)
branivo-web/src/app/[locale]/(broker)/layout.tsx          ← добави suspended банер (Task 9)
```

### References

- [Source: epics.md#Story 1.6] — Acceptance Criteria, user story statement
- [Source: prd.md#Tenant lifecycle] — deactivation requirements, offboarding flow
- [Source: architecture.md#tenants/] — TenantsModule structure, controller/service paths
- [Source: branivo-api/src/modules/tenants/tenants.repository.ts#updateStatus] — съществуващ метод
- [Source: branivo-api/src/modules/admin/admin-tenants.service.ts#writeAuditLog] — audit log pattern
- [Source: branivo-api/src/modules/tenants/tenants.service.ts#getConfigFromCache] — Redis key format
- [Source: branivo-api/src/common/guards/feature-flag.guard.ts] — Injectable guard pattern с TenantContext
- [Source: branivo-web/src/app/[locale]/(admin)/tenants/page.tsx#STATUS_BADGE] — 'suspended' вече е дефиниран

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `tenant-active.guard.spec.ts` изискваше `/* eslint-disable @typescript-eslint/unbound-method */` — следвах pattern от `feature-flag.guard.spec.ts`
- `TenantsModule` provider list реформатиран на multi-line от linter (intentional)

### Completion Notes List

- Всички 13 задачи имплементирани и тествани; CI проверки pass (lint ✓, tests API 157/157 ✓, tests Web 28/28 ✓, build ✓, tsc ✓)
- `TenantActiveGuard` регистриран в `TenantsModule` providers/exports — готов за използване в бъдещи QuotesModule и PoliciesModule (Stories 3.1, 4.2)
- `PATCH /api/v1/admin/tenants/:id/status` — само `active → suspended` и `suspended → active` transitions; всички останали връщат 400 BadRequest
- Redis cache инвалидира се незабавно при смяна на статуса; TenantActiveGuard чете директно от DB за instant enforcement
- Broker layout.tsx създаден (нямаше такъв); зарежда tenant config с `staleTime: 60_000` за по-бързо отразяване на suspended статуса
- `ConfirmStatusModal` показва различен текст и цвят за деактивиране (червен) vs реактивиране (зелен)
- AC2, AC3: TenantActiveGuard е готов — ще се прилага при имплементацията на QuotesController (Story 3.1) и PoliciesController (Story 4.2)

### File List

**New Files — branivo-api:**
- `src/common/guards/tenant-active.guard.ts`
- `src/common/guards/tenant-active.guard.spec.ts`
- `src/modules/admin/dto/update-tenant-status.dto.ts`

**New Files — branivo-web:**
- `src/app/[locale]/(broker)/layout.tsx`
- `src/app/api/v1/admin/tenants/[id]/status/route.ts`
- `src/components/admin/confirm-status-modal.tsx`
- `src/__tests__/admin/tenants.page.test.tsx`

**Modified Files — branivo-api:**
- `src/modules/tenants/tenants.module.ts` — добавен `TenantActiveGuard` в providers/exports
- `src/modules/admin/admin-tenants.service.ts` — добавен `updateTenantStatus()` метод
- `src/modules/admin/admin-tenants.service.spec.ts` — добавени тестове за `updateTenantStatus()` + `redisMock.del`
- `src/modules/admin/admin-tenants.controller.ts` — добавен `PATCH /:id/status` endpoint
- `src/modules/admin/admin-tenants.controller.spec.ts` — добавени integration тестове за PATCH status

**Modified Files — branivo-web:**
- `src/app/[locale]/(admin)/tenants/page.tsx` — добавени action бутони, `ConfirmStatusModal`, `useMutation`
