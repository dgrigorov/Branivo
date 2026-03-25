---
title: 'КФН Manual License Verification'
slug: 'kfn-manual-license-verification'
created: '2026-03-25'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [NestJS, TypeORM, PostgreSQL, Redis]
files_to_modify:
  - branivo-api/src/modules/admin/admin-tenants.controller.ts
  - branivo-api/src/modules/admin/admin-tenants.service.ts
  - branivo-api/src/modules/admin/admin-tenants.service.spec.ts
  - branivo-api/src/modules/admin/dto/update-kfn-license.dto.ts
code_patterns:
  - Controller → Service pattern (no repository layer — service calls tenantsRepository directly)
  - Roles('super_admin') + JwtAuthGuard + RolesGuard guards
  - writeAuditLog({ tenantId, userId, action, entityType, entityId })
  - redis.del(RedisKeyHelper.build(tenantId, config, tenant)) cache invalidation
test_patterns:
  - NestJS unit: jest.fn() mocks, direct new AdminTenantsService(...mocks)
  - Controller spec: @nestjs/testing TestingModule + supertest
---

# Tech-Spec: КФН Manual License Verification

**Created:** 2026-03-25

## Overview

### Problem Statement

Съществуващият `POST /api/v1/admin/tenants/:id/verify-kfn` endpoint задава КФН лиценз само по време на onboarding активация (изисква `status = 'stripe_connected'`). След активация няма начин Super Admin да актуализира `kfn_license` — напр. при подновяване на лиценза, корекция на грешен номер, или при регулаторна промяна. Spec 2 (КФН Regulatory Footer) expose-ва `kfnLicense` публично → грешен лиценз в footer е правен и репутационен риск.

### Solution

Нов `PATCH /api/v1/admin/tenants/:id/kfn-license` endpoint (Super Admin only):
1. Валидира новия лиценз с вече съществуващия `KFN_LICENSE_REGEX`
2. Update-ва `tenants.kfn_license` без status check
3. Инвалидира Redis cache (`TenantConfigResponseDto`) — footer веднага reflect-ва промяната
4. Пише audit log: `tenant.kfn_license_updated`

### Scope

**In Scope:**
- Нов DTO: `UpdateKfnLicenseDto` с `kfn_license` поле
- Нов service метод: `AdminTenantsService.updateKfnLicense()`
- Нов controller endpoint: `PATCH /admin/tenants/:id/kfn-license`
- Redis cache invalidation при update
- Audit log entry
- Unit тест за новия service метод
- Controller интеграционен тест

**Out of Scope:**
- КФН registry API интеграция (автоматична верификация)
- Broker Admin самостоятелен update на лиценз (само Super Admin)
- UI страница в admin panel (endpoint е достатъчен за v1)
- Email нотификация към брокера при промяна

## Context for Development

### Codebase Patterns

**Съществуващ `verify-kfn` за reference:**
```typescript
// admin-tenants.controller.ts — pattern за новия endpoint
@Post(':id/verify-kfn')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
@HttpCode(HttpStatus.NO_CONTENT)
async verifyKfn(
  @Param('id') id: string,
  @Body() dto: VerifyKfnDto,
  @Request() req: AuthenticatedRequest,
) {
  return this.adminTenantsService.verifyKfnAndActivate(id, dto.kfn_license, req.user.userId);
}
```

**Regex вече дефиниран:**
```typescript
// admin-tenants.service.ts — реизползваме
const KFN_LICENSE_REGEX = /^[0-9]{3,10}$/;
```

**Audit log pattern:**
```typescript
await this.writeAuditLog({
  tenantId,
  userId: superAdminId,
  action: 'tenant.kfn_license_updated',
  entityType: 'tenant',
  entityId: tenantId,
});
```

**Redis cache invalidation (Spec 2 — S1 constraint):**
```typescript
const cacheKey = RedisKeyHelper.build(tenantId, 'config', 'tenant');
await this.redis.del(cacheKey);
```
Вж. `updateTenantStatus()` в `admin-tenants.service.ts` за идентичен pattern.

**`tenantsRepository.activateTenant()` за reference:**
```typescript
async activateTenant(id: string, kfnLicense: string): Promise<void> {
  await this.repo.update(id, { kfnLicense, status: 'active' });
}
```
Новият метод ще е само `repo.update(id, { kfnLicense })` — без status промяна.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `branivo-api/src/modules/admin/admin-tenants.controller.ts` | Добавяме новия PATCH endpoint |
| `branivo-api/src/modules/admin/admin-tenants.service.ts` | Добавяме `updateKfnLicense()` метод |
| `branivo-api/src/modules/admin/admin-tenants.service.spec.ts` | Добавяме unit тест |
| `branivo-api/src/modules/admin/dto/verify-kfn.dto.ts` | Reference за новия DTO |
| `branivo-api/src/modules/tenants/tenants.repository.ts` | Добавяме `updateKfnLicense()` repository метод |

### Technical Decisions

1. **PATCH, не POST** — update на съществуващ ресурс; partial update семантика; HTTP идиоматично
2. **Без status check** — за разлика от `verifyKfnAndActivate()`, новият метод работи за всеки non-deleted tenant; Super Admin отговаря за коректността
3. **Нов DTO `UpdateKfnLicenseDto`** — не reuse-ваме `VerifyKfnDto`; разделени concerns (onboarding vs post-activation update)
4. **Redis cache invalidation е задължителна** — Spec 2 expose-ва `kfnLicense` в public config response с TTL 300s; без invalidation footer показва стар лиценз до 5 мин (S1 constraint от Spec 2)
5. **Нов `tenantsRepository.updateKfnLicense()` метод** — не reuse-ваме `activateTenant()` (той сменя и status); clean separation

## Implementation Plan

### Tasks

**Backend — DTO**

- [x] **Task 1: Създай `UpdateKfnLicenseDto`**
  - Файл: `branivo-api/src/modules/admin/dto/update-kfn-license.dto.ts` (нов файл)
  - Съдържание:
    ```typescript
    import { IsString, Matches } from 'class-validator';

    export class UpdateKfnLicenseDto {
      @IsString()
      @Matches(/^[0-9]{3,10}$/, {
        message: 'Invalid КФН license format (3–10 digits required)',
      })
      kfn_license!: string;
    }
    ```
  - Бележка: regex е идентичен с `KFN_LICENSE_REGEX` в service-а — централизира валидацията в DTO слоя

**Backend — Repository**

- [x] **Task 2: Добави `updateKfnLicense()` в `TenantsRepository`**
  - Файл: `branivo-api/src/modules/tenants/tenants.repository.ts`
  - Добави в Super Admin methods секцията:
    ```typescript
    async updateKfnLicense(id: string, kfnLicense: string): Promise<void> {
      await this.repo.update(id, { kfnLicense });
    }
    ```

**Backend — Service**

- [x] **Task 3: Добави `updateKfnLicense()` в `AdminTenantsService`**
  - Файл: `branivo-api/src/modules/admin/admin-tenants.service.ts`
  - Добави нов метод след `verifyKfnAndActivate()`:
    ```typescript
    async updateKfnLicense(
      tenantId: string,
      kfnLicense: string,
      superAdminId: string,
    ): Promise<void> {
      const tenant = await this.findTenantOrThrow(tenantId);

      if (tenant.deletedAt !== null) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

      await this.tenantsRepository.updateKfnLicense(tenantId, kfnLicense);

      // S1: Инвалидирай config cache — Spec 2 footer ще reflect-ва веднага
      const cacheKey = RedisKeyHelper.build(tenantId, 'config', 'tenant');
      await this.redis.del(cacheKey);

      await this.writeAuditLog({
        tenantId,
        userId: superAdminId,
        action: 'tenant.kfn_license_updated',
        entityType: 'tenant',
        entityId: tenantId,
      });
    }
    ```
  - Бележка: `findTenantOrThrow()` вече проверява `deletedAt: IsNull()` → deleted tenants хвърлят 404 автоматично; explicit check е redundant — премахни го и разчитай на `findTenantOrThrow()`

**Backend — Controller**

- [x] **Task 4: Добави `PATCH :id/kfn-license` в `AdminTenantsController`**
  - Файл: `branivo-api/src/modules/admin/admin-tenants.controller.ts`
  - Добави import: `import { UpdateKfnLicenseDto } from './dto/update-kfn-license.dto';`
  - Добави endpoint след `verifyKfn()`:
    ```typescript
    @Patch(':id/kfn-license')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('super_admin')
    @HttpCode(HttpStatus.NO_CONTENT)
    async updateKfnLicense(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: UpdateKfnLicenseDto,
      @Request() req: AuthenticatedRequest,
    ) {
      return this.adminTenantsService.updateKfnLicense(
        id,
        dto.kfn_license,
        req.user.userId,
      );
    }
    ```
  - Добави `Patch` към imports от `@nestjs/common`

**Backend — Тестове**

- [x] **Task 5: Добави unit тест в `admin-tenants.service.spec.ts`**
  - Файл: `branivo-api/src/modules/admin/admin-tenants.service.spec.ts`
  - Добави mock: `mockTenantsRepo.updateKfnLicense = jest.fn().mockResolvedValue(undefined);`
  - Нови тестове в `describe('updateKfnLicense')`:
    ```typescript
    it('should update kfn_license and invalidate cache', async () => {
      mockTenantsRepo.findById.mockResolvedValue(makeTenant({ status: 'active' }));
      mockTenantsRepo.updateKfnLicense.mockResolvedValue(undefined);
      mockRedis.del.mockResolvedValue(1);

      await service.updateKfnLicense(TENANT_ID, '12345', ADMIN_ID);

      expect(mockTenantsRepo.updateKfnLicense).toHaveBeenCalledWith(TENANT_ID, '12345');
      expect(mockRedis.del).toHaveBeenCalledWith(
        RedisKeyHelper.build(TENANT_ID, 'config', 'tenant'),
      );
    });

    it('should throw NotFoundException for unknown tenant', async () => {
      mockTenantsRepo.findById.mockResolvedValue(null);

      await expect(service.updateKfnLicense('unknown-id', '12345', ADMIN_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('should write audit log with correct action', async () => {
      mockTenantsRepo.findById.mockResolvedValue(makeTenant({ status: 'active' }));
      mockTenantsRepo.updateKfnLicense.mockResolvedValue(undefined);
      mockRedis.del.mockResolvedValue(1);
      const writeSpy = jest.spyOn(service as unknown as { writeAuditLog: () => Promise<void> }, 'writeAuditLog');

      await service.updateKfnLicense(TENANT_ID, '12345', ADMIN_ID);

      expect(writeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tenant.kfn_license_updated' }),
      );
    });
    ```

- [x] **Task 6: Добави controller тест в `admin-tenants.controller.spec.ts`**
  - Файл: `branivo-api/src/modules/admin/admin-tenants.controller.spec.ts`
  - Нов тест:
    ```typescript
    it('PATCH /:id/kfn-license returns 204 for super_admin', async () => {
      mockAdminTenantsService.updateKfnLicense = jest.fn().mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .patch(`/admin/tenants/${TENANT_ID}/kfn-license`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ kfn_license: '12345' })
        .expect(204);

      expect(mockAdminTenantsService.updateKfnLicense).toHaveBeenCalledWith(
        TENANT_ID,
        '12345',
        expect.any(String),
      );
    });

    it('PATCH /:id/kfn-license returns 400 for invalid format', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/tenants/${TENANT_ID}/kfn-license`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ kfn_license: 'ABC' })
        .expect(400);
    });
    ```

### Acceptance Criteria

- [x] **AC1 — Happy path update:**
  **Given** активен tenant с `kfn_license = '12345'` и Super Admin auth,
  **When** `PATCH /api/v1/admin/tenants/:id/kfn-license` с `{ kfn_license: '99999' }`,
  **Then** HTTP 204; `tenants.kfn_license = '99999'`; Redis cache инвалидиран; следващ `GET /api/v1/tenants/config` връща `regulatory.kfnLicense = '99999'`

- [x] **AC2 — Работи за suspended tenant:**
  **Given** tenant с `status = 'suspended'`,
  **When** `PATCH /api/v1/admin/tenants/:id/kfn-license` с валиден лиценз,
  **Then** HTTP 204; лицензът се update-ва; status остава `suspended`

- [x] **AC3 — Невалиден формат:**
  **Given** `{ kfn_license: 'ABC123' }` (не само цифри),
  **When** заявката пристигне,
  **Then** HTTP 400 с `{ message: 'Invalid КФН license format (3–10 digits required)' }`

- [x] **AC4 — Неоторизиран достъп:**
  **Given** Broker Admin JWT (role = `broker_admin`),
  **When** `PATCH /api/v1/admin/tenants/:id/kfn-license`,
  **Then** HTTP 403

- [x] **AC5 — Несъществуващ tenant:**
  **Given** несъществуващ UUID,
  **When** `PATCH /api/v1/admin/tenants/:id/kfn-license`,
  **Then** HTTP 404

- [x] **AC6 — Audit log записан:**
  **Given** успешен update,
  **When** `SELECT * FROM audit_log WHERE entity_id = :tenantId ORDER BY created_at DESC LIMIT 1`,
  **Then** `action = 'tenant.kfn_license_updated'`; `user_id = <superAdminId>`

## Additional Context

### Dependencies

- `TenantsRepository` — нов `updateKfnLicense()` метод (Task 2); без migration
- `RedisKeyHelper.build(tenantId, 'config', 'tenant')` — вече използван в `updateTenantStatus()`
- **Spec 2 (КФН Regulatory Footer)** — S1 constraint: cache invalidation тук е prerequisite за коректен footer след license update

### Testing Strategy

**Unit тестове:**
- 3 теста в `admin-tenants.service.spec.ts`: happy path + 404 + audit log action

**Controller тестове:**
- 2 теста в `admin-tenants.controller.spec.ts`: 204 за super_admin + 400 за невалиден формат

**Manual testing:**
1. `PATCH /admin/tenants/:id/kfn-license` с валиден лиценз → 204
2. `GET /api/v1/tenants/config` веднага след → нов `kfnLicense` в response (cache е инвалидиран)
3. `PATCH` с `broker_admin` JWT → 403
4. `PATCH` с `{ kfn_license: '12' }` (2 цифри) → 400

### Notes

- `KFN_LICENSE_REGEX = /^[0-9]{3,10}$/` е дефиниран като module-level константа в `admin-tenants.service.ts`. `UpdateKfnLicenseDto` дублира regex в `@Matches()` декоратора — acceptable за dto/service separation; ако regex се промени → update и двете места.
- `findTenantOrThrow()` private метод вече проверява `deletedAt: IsNull()` → 404 за deleted tenants е автоматично покрит без допълнителен код в `updateKfnLicense()`.
- За разлика от `verifyKfnAndActivate()`, новият метод **не** пише Redis subdomain key и **не** mark-ва invitation като used — тези действия са само при initial activation.
- **Spec 2 coupling:** Redis cache invalidation тук е критична — без нея Spec 2 footer показва стар лиценз до 5 мин. Тестът в Task 5 explicit-но проверява `mockRedis.del` call.
