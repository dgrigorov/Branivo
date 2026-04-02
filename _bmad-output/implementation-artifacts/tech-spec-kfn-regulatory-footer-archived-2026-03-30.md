---
title: 'КФН Regulatory Footer'
slug: 'kfn-regulatory-footer'
created: '2026-03-25'
status: 'review'
stepsCompleted: [1, 2, 3]
tech_stack: [NestJS, TypeORM, PostgreSQL, Next.js]
files_to_modify:
  - branivo-api/src/infrastructure/database/migrations/1710000039000-AddEinCodeToTenantConfigs.ts
  - branivo-api/src/modules/tenants/entities/tenant-config.entity.ts
  - branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts
  - branivo-api/src/modules/tenants/dto/update-branding.dto.ts
  - branivo-api/src/modules/tenants/tenants.service.ts
  - branivo-web/src/app/[locale]/(client)/layout.tsx
  - branivo-web/src/app/[locale]/(client)/components/regulatory-footer.tsx
code_patterns:
  - TenantConfig upsert via configRepo.upsert({ tenantId, ...data }, { conflictPaths })
  - Redis cache invalidation via redis.del(RedisKeyHelper.build(tenantId, config, tenant))
  - Server Component fetch от layout — next: { revalidate 300 }
test_patterns:
  - NestJS unit: jest.fn() mocks, direct new ServiceClass(...mocks)
  - Next.js component test с jest + @testing-library/react
---

# Tech-Spec: КФН Regulatory Footer

**Created:** 2026-03-25

## Overview

### Problem Statement

Клиентските страници на платформата нямат КФН регулаторен footer. По Закона за застрахователното посредничество (ЗЗП) и регулаторните изисквания на КФН, всеки застрахователен брокер е задължен да показва лицензионния си номер и юридическото си наименование на всички публично достъпни страници. Сега `kfn_license` съществува в `tenants` таблицата, но не е expose-ван към frontend; `ein_code` (ЕИК/БУЛСТАТ) липсва изцяло в модела.

### Solution

1. Нова migration: добавя `ein_code` VARCHAR(13) в `tenant_configs`
2. Expose `regulatory: { kfnLicense, einCode }` в `TenantConfigResponseDto` (populated от `tenant.kfnLicense` + `tenant.config?.einCode`)
3. Broker Admin може да update-ва `ein_code` чрез вече съществуващия branding update endpoint (extend `UpdateBrandingDto`)
4. Нов Server Component `RegulatoryFooter` в `(client)/layout.tsx` — показва КФН лиценз + ЕИК + юридическо наименование; graceful null за всяко поле

### Scope

**In Scope:**
- DB migration `1710000039000`: `ein_code` VARCHAR(13) в `tenant_configs`
- `TenantConfig` entity update — ново `einCode` поле
- `TenantConfigResponseDto` — ново `regulatory: { kfnLicense, einCode }` поле
- `TenantsService.getTenantConfig()` — populate `regulatory`
- `UpdateBrandingDto` — ново незадължително `einCode` поле с БУЛСТАТ валидация
- `TenantsService.updateBranding()` — include `einCode` в upsert
- `RegulatoryFooter.tsx` — нов Server Component
- `(client)/layout.tsx` — добавя footer; вече fetch-ва `/api/v1/tenants/config`

**Out of Scope:**
- `(broker)` layout промени
- Super Admin задаване на ЕИК (само Broker Admin scope)
- Автоматична проверка с КФН регистър (Spec 3 покрива ръчна верификация само на `kfn_license`)

## Context for Development

### Codebase Patterns

**Backend:**
- `TenantsService.getTenantConfig()` — fetch tenant + config, build DTO, кешира 300s с `RedisKeyHelper.build(tenantId, 'config', 'tenant')`
- `TenantsService.updateBranding()` → `tenantsRepository.upsertBranding(tenantId, data)` → `configRepo.upsert({ tenantId, ...data }, { conflictPaths: ['tenantId'] })`
- При update → `redis.del(RedisKeyHelper.build(tenantId, 'config', 'tenant'))` задължително
- Migration pattern: `ALTER TABLE "tenant_configs" ADD COLUMN IF NOT EXISTS ...` (вж. `1710000006000-AddBrandingToTenantConfigs.ts`)

**Next.js:**
- `(client)/layout.tsx` е async Server Component — fetch-ва `/api/v1/tenants/config` с `next: { revalidate: 300 }`
- Понастоящем извлича само `branding`; след промяната ще извлича и `regulatory`
- `TenantBranding` interface в layout.tsx → ще се разшири с `regulatory` поле

**БУЛСТАТ формат:** `/^\d{9}(\d{4})?$/` — 9 или 13 цифри (юридически лица в България)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `branivo-api/src/modules/tenants/entities/tenant-config.entity.ts` | Добавяме `einCode` колона |
| `branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts` | Добавяме `regulatory` поле |
| `branivo-api/src/modules/tenants/dto/update-branding.dto.ts` | Добавяме `einCode` с валидация |
| `branivo-api/src/modules/tenants/tenants.service.ts` | `getTenantConfig()` + `updateBranding()` update |
| `branivo-api/src/modules/tenants/tenants.repository.ts` | `upsertBranding()` — reference pattern |
| `branivo-api/src/infrastructure/database/migrations/1710000006000-AddBrandingToTenantConfigs.ts` | Migration pattern |
| `branivo-api/src/modules/tenants/entities/tenant.entity.ts` | Source на `kfnLicense` поле |
| `branivo-web/src/app/[locale]/(client)/layout.tsx` | Server Component — добавяме footer |

### Technical Decisions

1. **`kfn_license` от `tenants`, не от `tenant_configs`** — вече е там, Super Admin го задава при активация; не го местим
2. **`ein_code` в `tenant_configs`** — Broker Admin-owned данни (като `legal_name`); consistent с branding pattern
3. **Graceful null навсякъде** — footer се рендира само когато поне `kfnLicense` или `einCode` са non-null; не се показва placeholder ако и двете са null
4. **БУЛСТАТ regex** — `/^\d{9}(\d{4})?$/` (9 или 13 цифри); `@Matches()` декоратор в DTO
5. **Server Component footer** — данните вече се fetch-ват в layout → без допълнителен client fetch
6. **`regulatory` обектът никога не е null в DTO** — винаги `{ kfnLicense: null, einCode: null }` при липса на данни

## Implementation Plan

### Tasks

**Backend — Migration**

- [ ] **Task 1: Migration `1710000039000-AddEinCodeToTenantConfigs.ts`**
  - Файл: `branivo-api/src/infrastructure/database/migrations/1710000039000-AddEinCodeToTenantConfigs.ts`
  - `up()`:
    ```sql
    ALTER TABLE "tenant_configs"
      ADD COLUMN IF NOT EXISTS "ein_code" VARCHAR(13) NULL;
    ```
  - `down()`: `DROP COLUMN IF EXISTS "ein_code"`

**Backend — Entity**

- [ ] **Task 2: Обнови `TenantConfig` entity**
  - Файл: `branivo-api/src/modules/tenants/entities/tenant-config.entity.ts`
  - Добави след `brandFont`:
    ```typescript
    @Column({ name: 'ein_code', type: 'varchar', length: 13, nullable: true })
    einCode!: string | null;
    ```

**Backend — DTO**

- [ ] **Task 3: Обнови `TenantConfigResponseDto`**
  - Файл: `branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts`
  - Добави ново поле:
    ```typescript
    regulatory!: {
      kfnLicense: string | null;
      einCode: string | null;
    };
    ```

- [ ] **Task 4: Обнови `UpdateBrandingDto`**
  - Файл: `branivo-api/src/modules/tenants/dto/update-branding.dto.ts`
  - Добави:
    ```typescript
    import { IsOptional, Matches } from 'class-validator';

    @IsOptional()
    @Matches(/^\d{9}(\d{4})?$/, {
      message: 'einCode трябва да е валиден БУЛСТАТ (9 или 13 цифри)',
    })
    einCode?: string;
    ```

**Backend — Service**

- [ ] **Task 5: Обнови `TenantsService.getTenantConfig()`**
  - Файл: `branivo-api/src/modules/tenants/tenants.service.ts`
  - Добави `regulatory` в DTO mapping:
    ```typescript
    regulatory: {
      kfnLicense: tenant.kfnLicense ?? null,
      einCode: tenant.config?.einCode ?? null,
    },
    ```

- [ ] **Task 6: Провери `TenantsService.updateBranding()`**
  - Файл: `branivo-api/src/modules/tenants/tenants.service.ts`
  - `upsertBranding` вече приема `Partial<TenantConfig>` → `einCode` от DTO-то се подава автоматично ако методът е:
    ```typescript
    await this.tenantsRepository.upsertBranding(tenantId, {
      ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
      ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
      ...(dto.brandFont !== undefined && { brandFont: dto.brandFont }),
      ...(dto.einCode !== undefined && { einCode: dto.einCode }),
      ...(logoUrl !== undefined && { logoUrl }),
    });
    ```
  - Добави `einCode` в spreading обекта

**Next.js Web**

- [ ] **Task 7: Създай `RegulatoryFooter` компонент**
  - Файл: `branivo-web/src/app/[locale]/(client)/components/regulatory-footer.tsx`
  - Нов директен Server Component (не изисква `'use client'`):
    ```tsx
    interface RegulatoryFooterProps {
      kfnLicense: string | null;
      einCode: string | null;
      legalName: string | null;
    }

    export function RegulatoryFooter({
      kfnLicense,
      einCode,
      legalName,
    }: RegulatoryFooterProps) {
      if (!kfnLicense && !einCode) return null;

      return (
        <footer className="mt-auto border-t border-gray-200 bg-gray-50 py-3 px-4">
          <p className="text-center text-xs text-gray-500">
            {legalName && <span className="font-medium">{legalName}</span>}
            {legalName && (kfnLicense || einCode) && ' · '}
            {kfnLicense && <span>Лицензиран застрахователен брокер · КФН Лиценз: {kfnLicense}</span>}
            {kfnLicense && einCode && ' · '}
            {einCode && <span>ЕИК: {einCode}</span>}
          </p>
        </footer>
      );
    }
    ```

- [ ] **Task 8: Обнови `(client)/layout.tsx`**
  - Файл: `branivo-web/src/app/[locale]/(client)/layout.tsx`
  - Разшири `TenantConfig` interface:
    ```typescript
    interface TenantConfig {
      branding?: {
        primary_color?: string;
        secondary_color?: string;
        logo_url?: string;
        brand_name?: string;
      };
      regulatory?: {
        kfn_license?: string | null;
        ein_code?: string | null;
      };
      legal?: {
        legal_name?: string | null;
      };
    }
    ```
  - Обнови fetch функцията да връща `TenantConfig` (не само `branding`):
    ```typescript
    const body = (await res.json()) as { data: TenantConfig };
    return body.data ?? {};
    ```
  - Добави footer в JSX:
    ```tsx
    <div style={cssVars as React.CSSProperties} className="flex min-h-screen flex-col">
      {children}
      <RegulatoryFooter
        kfnLicense={config.regulatory?.kfn_license ?? null}
        einCode={config.regulatory?.ein_code ?? null}
        legalName={config.legal?.legal_name ?? null}
      />
    </div>
    ```

### Acceptance Criteria

- [ ] **AC1 — `GET /api/v1/tenants/config` съдържа `regulatory`:**
  **Given** активен tenant с `kfn_license = '12345'` и `ein_code = '123456789'`,
  **When** `GET /api/v1/tenants/config`,
  **Then** response.data.regulatory = `{ kfnLicense: '12345', einCode: '123456789' }`

- [ ] **AC2 — Graceful null:**
  **Given** tenant без `ein_code` и без `kfn_license`,
  **When** `GET /api/v1/tenants/config`,
  **Then** response.data.regulatory = `{ kfnLicense: null, einCode: null }`; footer НЕ се рендира

- [ ] **AC3 — Footer се рендира при поне 1 non-null поле:**
  **Given** tenant с `kfnLicense = '12345'` и `einCode = null`,
  **When** клиентска страница се зарежда,
  **Then** footer съдържа "КФН Лиценз: 12345"; ЕИК частта не се показва

- [ ] **AC4 — Footer показва пълна информация:**
  **Given** tenant с `kfnLicense = '12345'`, `einCode = '123456789'`, `legalName = 'Иванов Брокер ЕООД'`,
  **When** клиентска страница се зарежда,
  **Then** footer съдържа "Иванов Брокер ЕООД · Лицензиран застрахователен брокер · КФН Лиценз: 12345 · ЕИК: 123456789"

- [ ] **AC5 — Broker Admin може да update-ва `einCode`:**
  **Given** `PATCH /api/v1/tenants/branding` с `{ "einCode": "123456789" }`,
  **When** заявката пристигне (Broker Admin auth),
  **Then** `tenant_configs.ein_code` се обновява; Redis кешът се инвалидира; следващ `GET /api/v1/tenants/config` връща новия ЕИК

- [ ] **AC6 — Невалиден ЕИК се reject-ва:**
  **Given** `PATCH /api/v1/tenants/branding` с `{ "einCode": "12345" }` (5 цифри),
  **When** заявката пристигне,
  **Then** 400 с `{ message: 'einCode трябва да е валиден БУЛСТАТ (9 или 13 цифри)' }`

## Additional Context

### Dependencies

- Story 1.4 (Super Admin Tenant Onboarding) — `kfn_license` се задава при активация; Spec 2 само го expose-ва
- GDPR Consent spec — добавя `tenant_configs.legal_name`; footer я consume-ва от `dto.legal?.legal_name`
- Spec 3 (КФН Manual License Verification) — позволява update на `kfn_license` след активация; footer ще reflect-ва промените автоматично (Redis TTL 300s)

### Testing Strategy

**Unit тестове (Backend):**
- `tenants.service.spec.ts` — нов тест: `getTenantConfig()` populate-ва `regulatory.kfnLicense` от `tenant.kfnLicense`; `regulatory.einCode` от `tenant.config?.einCode`
- `tenants.service.spec.ts` — нов тест: `updateBranding({ einCode: '123456789' })` → `upsertBranding` called with `{ einCode: '123456789' }`

**Component тест (Next.js):**
- `regulatory-footer.test.tsx` — 3 теста:
  1. `null` + `null` → returns null (footer не се рендира)
  2. `kfnLicense = '12345'`, `einCode = null` → рендира само КФН частта
  3. Всички полета non-null → рендира пълния footer текст

### Notes

- `regulatory` обектът в DTO **винаги присъства** — `{ kfnLicense: null, einCode: null }` при липса. Никога не е самото поле null — предотвратява optional chaining грешки в frontend.
- Footer НЕ се рендира при `kfnLicense === null && einCode === null` — по дизайн. `legalName` сам по себе си не е достатъчен за footer (вече присъства в privacy policy checkbox).
- ЕИК може да е 9 цифри (юридически лица) или 13 цифри (клонове). Regex: `/^\d{9}(\d{4})?$/`
- `kfnLicense` в DTO-то идва от `tenants` таблицата (не от `tenant_configs`) — `tenant.kfnLicense` директно.
