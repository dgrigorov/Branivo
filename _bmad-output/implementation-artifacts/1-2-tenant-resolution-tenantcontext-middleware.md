# Story 1.2: Tenant Resolution & TenantContext Middleware

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Platform,
I want every HTTP request resolved to the correct tenant via the Host header,
So that all business logic operates in the correct tenant context automatically without manual tenant_id passing.

## Acceptance Criteria

1. **AC1 — Host header resolution:**
   **Given** a request with `Host: broker1.branivo.bg`,
   **When** the middleware processes it,
   **Then** `TenantContext.getTenantId()` връща правилния `tenant_id` в < 50ms (Redis cache hit)

2. **AC2 — Redis cache miss fallback:**
   **Given** the tenant config is absent from Redis,
   **When** the middleware processes a request,
   **Then** то прави DB lookup и кешира резултата с ключ `{tenant_id}:config:tenant`

3. **AC3 — Unknown host:**
   **Given** an unknown Host header,
   **When** the middleware processes the request,
   **Then** се връща 404 Not Found

4. **AC4 — Redis unavailable graceful degradation:**
   **Given** Redis is unavailable,
   **When** the middleware processes a request,
   **Then** то прави DB fallback и продължава (graceful degradation без crash)

5. **AC5 — TenantContext never passed as parameter:**
   **Given** any protected endpoint is called,
   **When** `TenantContext.getTenantId()` is called inside service,
   **Then** връща правилния `tenant_id` — `tenant_id` НИКОГА не се предава като функционален параметър

## Tasks / Subtasks

### Backend — NestJS (branivo-api/)

- [x] **Task 1: Преместване на TenantContext в правилната директория** (AC: #5)
  - [x] Премести `src/modules/tenants/tenant-context.service.ts` → `src/common/tenant-context/tenant.context.ts`
  - [x] Създай `src/common/tenant-context/tenant.middleware.ts`
  - [x] Създай `src/common/tenant-context/tenant-context.module.ts` — `@Global()` модул
  - [x] Регистрирай `TenantContextModule` в `AppModule`

- [x] **Task 2: Имплементирай TenantMiddleware** (AC: #1, #2, #3, #4)
  - [x] `NestMiddleware` имплементация, прилагана към всички routes
  - [x] Извлечи hostname от `req.hostname` или `Host` header (strip порт ако присъства)
  - [x] Redis lookup: `RedisKeyHelper.build(tenantId, 'config', 'tenant')` → проверка за кеш хит
  - [x] При cache miss: DB lookup в `tenant_domains` JOIN `tenants` WHERE `domain = hostname AND deleted_at IS NULL`
  - [x] При DB hit: кешира резултата в Redis с TTL 3600s
  - [x] При unknown hostname: хвърли `NotFoundException('Tenant not found')`
  - [x] При Redis unavailable: graceful degradation — log warning, продължава само с DB
  - [x] Извиква `tenantContext.setTenantId(tenant.id)` преди `next()`
  - [x] Изключения (без middleware): `/health`, `/api/docs`, `/api/v1/auth/login`

- [x] **Task 3: DB миграция за RLS** (AC: #1, #5)
  - [x] Създай нова TypeORM migration: `1710000001000-AddRlsPolicies.ts`
  - [x] RLS policies за всички таблици с `tenant_id`: quotes, policies, policy_events, payments, vehicles, customers, audit_log, notifications
  - [x] Таблици БЕЗ RLS (нямат tenant_id): tenants, tenant_configs, tenant_domains, insurers

- [x] **Task 4: TypeORM SET session variable за RLS** (AC: #5)
  - [x] Разшири `BaseRepository` с метод `setTenantSession(tenantId: string)`
  - [x] Извиквай преди всяка repo заявка в `findAll`, `findOne`, `softDelete`

- [x] **Task 5: TenantDomain и Tenant entities** (AC: #1, #2)
  - [x] Създай `src/modules/tenants/entities/tenant.entity.ts`
  - [x] Създай `src/modules/tenants/entities/tenant-domain.entity.ts`
  - [x] Създай `src/modules/tenants/entities/tenant-config.entity.ts`
  - [x] Индекс: `idx_tenant_domains_domain` (вече в migration 1710000000000)

- [x] **Task 6: Next.js middleware за tenant resolution** (AC: #1)
  - [x] Разшири `branivo-web/src/middleware.ts` (placeholder от Story 1.1) с реална логика
  - [x] `GET /api/v1/tenants/config` с `Host` header → получи tenant theme config
  - [x] Кешира tenant theme в Next.js ISR (`revalidate: 3600`)
  - [x] При unknown host: redirect към fallback страница
  - [x] Inject `x-tenant-id` header за downstream NestJS calls

### Tests

- [x] **Task 7: Unit тестове за TenantMiddleware** (AC: #1, #2, #3, #4)
  - [x] `src/common/tenant-context/tenant.middleware.spec.ts`
  - [x] Test: valid host → Redis hit → setTenantId called correctly
  - [x] Test: valid host → Redis miss → DB lookup → cache written → setTenantId called
  - [x] Test: unknown host → NotFoundException thrown
  - [x] Test: Redis unavailable → DB fallback → no crash
  - [x] Test: Redis.set fails after DB lookup → no crash

- [x] **Task 8: Unit тестове за TenantContext** (AC: #5)
  - [x] `src/common/tenant-context/tenant.context.spec.ts`
  - [x] Test: `getTenantId()` преди `setTenantId()` хвърля Error
  - [x] Test: `getTenantId()` след `setTenantId()` връща правилния ID
  - [x] Test: REQUEST scope — всяка заявка получава нов instance

- [x] **Task 9: Unit тестове за BaseRepository RLS** (AC: #5)
  - [x] `src/common/base.repository.spec.ts` (обновен)
  - [x] Test: `setTenantSession` извиква `set_config` с правилния tenant_id
  - [x] Test: `findAll` извиква `setTenantSession` преди query
  - [x] Test: `findOne` извиква `setTenantSession` преди query
  - [x] Test: `softDelete` извиква `setTenantSession` преди update
  - [x] Test: `softDelete` задава `deletedAt` вместо hard-delete

- [x] **Task 10: Integration тест** (AC: #1, #3)
  - [x] `src/modules/tenants/tenants.controller.spec.ts`
  - [x] Test: `getConfig()` с познат tenant → 200 + tenant data
  - [x] Test: `getConfig()` → propagates NotFoundException
  - [x] Test: response не съдържа `api_key_enc` или `stripe_credentials`

## Dev Notes

### Критично: Правилната директория за TenantContext

Story 1.1 създаде `TenantContext` skeleton в `src/modules/tenants/tenant-context.service.ts`. **В тази story го преместихме:**

```
src/common/tenant-context/
├── tenant.context.ts        # TenantContext service (REQUEST scope)
├── tenant.middleware.ts      # TenantMiddleware (NestMiddleware)
└── tenant-context.module.ts  # @Global() module
```

Архитектурата го поставя в `src/common/` защото е cross-cutting concern — използва се от ВСЕКИ модул.

### TenantContext — пълна имплементация

```typescript
// src/common/tenant-context/tenant.context.ts
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private tenantId: string | undefined;

  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  getTenantId(): string {
    if (!this.tenantId) throw new Error('TenantContext not initialized — TenantMiddleware not applied to this route?');
    return this.tenantId;
  }
}
```

**КРИТИЧНО:** `scope: Scope.REQUEST` е ЗАДЪЛЖИТЕЛЕН. Без него `tenantId` ще "протича" между заявки в production.

### TenantMiddleware — пълна имплементация

```typescript
// src/common/tenant-context/tenant.middleware.ts
import {
  Inject,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';
import { IsNull, Repository } from 'typeorm';
import { TenantDomain } from '../../modules/tenants/entities/tenant-domain.entity';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { TenantContext } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(TenantDomain)
    private readonly tenantDomainRepo: Repository<TenantDomain>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tenantContext: TenantContext,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const host = req.hostname;

    const tenantId = await this.resolveTenantId(host);
    if (!tenantId) {
      throw new NotFoundException('Tenant not found');
    }

    this.tenantContext.setTenantId(tenantId);
    next();
  }

  // private helper methods: getFromCache, getFromDatabase, setCache
}
```

**Важно:** Redis ключ `host:{hostname}` → `tenant_id` (TTL 3600s). Graceful degradation при Redis unavailable.

### AppModule — регистриране на middleware

```typescript
// src/app.module.ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'api/docs(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/auth/login', method: RequestMethod.POST },
        { path: 'api/v1/auth/refresh', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
```

### BaseRepository — RLS session variable

```typescript
// src/common/base.repository.ts — разширение
protected async setTenantSession(): Promise<void> {
  const tenantId = this.tenantContext.getTenantId();
  await this.repo.query(
    `SELECT set_config('app.current_tenant_id', $1, true)`,
    [tenantId],
  );
}
```

**ПРЕДУПРЕЖДЕНИЕ:** BaseRepository constructor signature се промени — инжектира TenantContext. Всички субкласове трябва да го прехвърлят.

### RLS Migration — правилна последователност

Таблиците за RLS: `quotes`, `policies`, `policy_events`, `payments`, `vehicles`, `customers`, `audit_log`, `notifications`

### GET /api/v1/tenants/config endpoint

```typescript
// GET /api/v1/tenants/config — без auth (middleware вече резолвира tenant)
// Response: { data: { id, slug, name, status, plan, features, branding } }
// НИКОГА: api_key_enc, stripe_credentials, db_credentials
```

### Project Structure Notes

**Нови файлове:**
```
branivo-api/src/common/tenant-context/
├── tenant.context.ts
├── tenant.context.spec.ts
├── tenant.middleware.ts
└── tenant.middleware.spec.ts
└── tenant-context.module.ts

branivo-api/src/modules/tenants/entities/
├── tenant.entity.ts
├── tenant-domain.entity.ts
└── tenant-config.entity.ts

branivo-api/src/modules/tenants/dto/
└── tenant-config-response.dto.ts

branivo-api/src/infrastructure/database/migrations/
└── 1710000001000-AddRlsPolicies.ts
```

**Файлове за модификация:**
```
branivo-api/src/app.module.ts              # MiddlewareConsumer configure
branivo-api/src/common/base.repository.ts  # add setTenantSession + TenantContext inject
branivo-api/src/common/base.repository.spec.ts  # updated for new constructor
branivo-api/src/modules/tenants/tenants.module.ts   # TypeOrmModule.forFeature entities
branivo-api/src/modules/tenants/tenants.service.ts  # getTenantConfig()
branivo-api/src/modules/tenants/tenants.controller.ts # GET /api/v1/tenants/config
branivo-api/src/modules/tenants/tenants.repository.ts # findTenantWithConfig()
branivo-web/src/middleware.ts              # placeholder → реална имплементация
```

**Изтрити файлове:**
```
branivo-api/src/modules/tenants/tenant-context.service.ts  # moved to common/tenant-context/
```

### Architecture Compliance Checklist

- [x] `TenantContext` е в `src/common/tenant-context/` (НЕ в `src/modules/tenants/`)
- [x] `@Injectable({ scope: Scope.REQUEST })` е налично на TenantContext
- [x] TenantMiddleware е регистриран за ALL routes с exclusions
- [x] Redis lookup преди DB lookup (< 50ms SLA)
- [x] DB fallback при Redis недостъпен (graceful degradation)
- [x] RLS migration прилагана за всички таблици с `tenant_id`
- [x] `set_config('app.current_tenant_id', ...)` в BaseRepository преди всяка заявка
- [x] `getTenantId()` никога като функционален параметър
- [x] Redis cache key: `host:{hostname}` → `tenant_id` (за hostname lookup)
- [x] `/health`, `/api/docs`, `/api/v1/auth/*` изключени от middleware

### References

- [Source: epics.md#Story 1.2] — Acceptance Criteria (оригинален BDD формат)
- [Source: architecture.md#Tenant Isolation] — Process pattern за TenantContext usage
- [Source: architecture.md#NestJS Structure] — `src/common/tenant-context/` directory
- [Source: architecture.md#Decision Impact Analysis] — TenantContext е стъпка 2 в critical path
- [Source: story-1-1.md#Dev Notes#TenantContext] — Skeleton от Story 1.1 за преместване
- [Source: story-1-1.md#File List] — `src/modules/tenants/tenant-context.service.ts` (стар path)
- [Source: architecture.md#Naming Patterns] — TypeORM column naming rules
- [Source: project-context.md#Architecture Rules] — Module structure, TenantContext rules

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- TypeScript strict mode изисква `!` definite assignment assertions за всички TypeORM entity properties (`id!: string`, `slug!: string`, etc.)
- `mockRepo.update.mock.calls[0][1]` — ESLint unsafe-member-access грешка; решено с `(calls[0] as unknown[])[1]`
- Test файлове с `as any` добавят `/* eslint-disable @typescript-eslint/no-unsafe-argument */` header

### Completion Notes List

Всички 10 tasks са имплементирани и тествани:

**NestJS Backend:**
- `TenantContext` преместен от `src/modules/tenants/tenant-context.service.ts` → `src/common/tenant-context/tenant.context.ts`
- `TenantMiddleware` имплементиран: Redis cache → DB fallback → graceful degradation при Redis unavailable
- `TenantContextModule` (@Global) регистриран в `AppModule`; middleware приложен за всички routes с exclusions за `/health`, `/api/docs`, `/api/v1/auth/*`
- `BaseRepository` разширен с `setTenantSession()` — извиква `set_config('app.current_tenant_id', ...)` преди всяка DB заявка
- RLS migration добавена за 8 таблици с `tenant_id`
- TypeORM entities: `Tenant`, `TenantDomain`, `TenantConfig`
- `GET /api/v1/tenants/config` endpoint в `TenantsController`

**Next.js Web:**
- `middleware.ts` обновен от placeholder към реална логика: fetch `/api/v1/tenants/config` → ISR revalidate 3600s → inject `x-tenant-id` и `x-tenant-slug` headers

**Tests:**
- 27/27 тестa минават (16 нови + 11 стари регресионни)
- Нови test suites: `tenant.context.spec.ts`, `tenant.middleware.spec.ts`, `tenants.controller.spec.ts`
- `base.repository.spec.ts` обновен за новия constructor signature

### File List

**Нови файлове:**
- `branivo-api/src/common/tenant-context/tenant.context.ts`
- `branivo-api/src/common/tenant-context/tenant.context.spec.ts`
- `branivo-api/src/common/tenant-context/tenant.middleware.ts`
- `branivo-api/src/common/tenant-context/tenant.middleware.spec.ts`
- `branivo-api/src/common/tenant-context/tenant-context.module.ts`
- `branivo-api/src/modules/tenants/entities/tenant.entity.ts`
- `branivo-api/src/modules/tenants/entities/tenant-domain.entity.ts`
- `branivo-api/src/modules/tenants/entities/tenant-config.entity.ts`
- `branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts`
- `branivo-api/src/modules/tenants/tenants.controller.spec.ts`
- `branivo-api/src/infrastructure/database/migrations/1710000001000-AddRlsPolicies.ts`

**Модифицирани файлове:**
- `branivo-api/src/app.module.ts`
- `branivo-api/src/common/base.repository.ts`
- `branivo-api/src/common/base.repository.spec.ts`
- `branivo-api/src/modules/tenants/tenants.module.ts`
- `branivo-api/src/modules/tenants/tenants.service.ts`
- `branivo-api/src/modules/tenants/tenants.controller.ts`
- `branivo-api/src/modules/tenants/tenants.repository.ts`
- `branivo-web/src/middleware.ts`

**Изтрити файлове:**
- `branivo-api/src/modules/tenants/tenant-context.service.ts`

## Senior Developer Review (AI)

**Reviewer:** Claude Sonnet 4.6 | **Date:** 2026-03-18 | **Outcome:** Changes Requested → Fixed

### Action Items (all resolved)

- [x] **[High]** H1 — `/api/v1/tenants/config` нямаше Redis кеширане в NestJS — `TenantsService` добавено с TTL 300s и ключ `{tenant_id}:config:tenant`
- [x] **[High]** H2 — `TenantsRepository.findTenantWithConfig` не филтрираше soft-deleted tenant — добавено `deletedAt: IsNull()`
- [x] **[High]** H3 — RLS Migration създаваше table stubs, конфликтиращи с бъдещи domain migrations — заменено с условни `DO $$ IF EXISTS $$` блокове
- [x] **[High]** H4 — Redis ключ `host:{hostname}` не следваше проектната конвенция — заменено с `RedisKeyHelper.buildSystem('host', hostname)` = `_system:host:{hostname}`
- [x] **[Medium]** M1 — Silent `catch {}` без logging — добавен NestJS `Logger` с `warn()` при Redis failures
- [x] **[Medium]** M2 — Next.js middleware беше fail-open при API outage — сменено на fail-closed (`rewrite` към NOT_FOUND)
- [x] **[Medium]** M3 — Излишен `@Version('1')` декоратор (дублиращ `defaultVersion: '1'` в main.ts) — премахнат
- [x] **[Medium]** M4 — Липсващ `save()` метод в BaseRepository — добавен с `setTenantSession()` преди запис

## Change Log

- 2026-03-18: Story 1.2 имплементирана — TenantMiddleware с Redis + DB fallback + RLS migration, всички 27 теста минават
- 2026-03-18: Code review fixes — 4 High + 4 Medium проблема оправени; 35/35 тестове минават след fixes
