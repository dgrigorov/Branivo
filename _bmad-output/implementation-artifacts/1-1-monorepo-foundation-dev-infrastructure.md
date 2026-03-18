# Story 1.1: Monorepo Foundation & Dev Infrastructure

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want the project monorepo and dev infrastructure initialized with Terraform,
So that the team builds on a consistent, reproducible foundation from day one.

## Acceptance Criteria

1. **AC1 — Monorepo структура:**
   **Given** the monorepo doesn't exist,
   **When** initialization scripts are run,
   **Then** следната структура е създадена:
   - `branivo-api/` — NestJS 10 backend (Modular Monolith)
   - `branivo-app/` — Flutter 3.19 mobile app (BLoC)
   - `branivo-web/` — Next.js 14 App Router + PWA web portal
   - `branivo-infra/` — Terraform IaC
   - Всеки component е независимо deployable

2. **AC2 — Terraform dev environment:**
   **Given** the Terraform dev config exists,
   **When** `terraform apply` е изпълнен,
   **Then** AWS ресурсите са provisioned:
   - RDS PostgreSQL 16 (Multi-AZ ready)
   - ElastiCache Redis 7
   - ECS Fargate cluster (NestJS API + BullMQ workers)
   - ALB + HTTPS (ACM certificate)
   - ECR repository за Docker images
   - S3 bucket за PDF/documents
   - CloudWatch Log Groups

3. **AC3 — Structured logging:**
   **Given** the app starts,
   **When** any HTTP request is processed,
   **Then** CloudWatch structured JSON logs съдържат задължителни полета:
   `tenant_id`, `user_id`, `trace_id`, `timestamp` (ISO8601 UTC), `method`, `path`, `status_code`, `duration_ms`

4. **AC4 — BullMQ queues:**
   **Given** BullMQ is configured,
   **When** the app starts,
   **Then** следните 3 queue-а са инициализирани (независими workers):
   - `pdf-generation` — PDF полици + Зелени карти
   - `notifications` — push/SMS/email renewal escalation
   - `logistics` — Speedy/Econt стикер заявки

5. **AC5 — DB migration conventions:**
   **Given** a new DB migration is needed,
   **When** a migration file is created,
   **Then** всички таблици имат задължителните колони:
   `id UUID DEFAULT gen_random_uuid()`, `tenant_id UUID NOT NULL`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ NULL`
   И TypeORM column mapping използва `{ name: 'snake_case_column' }` навсякъде

6. **AC6 — Redis key naming:**
   **Given** Redis key naming is needed,
   **When** any key is written to Redis,
   **Then** форматът е `{tenant_id}:{domain}:{key}` без изключения
   Пример: `550e8400-e29b-41d4-a716-446655440000:config:tenant`

## Tasks / Subtasks

### Backend — NestJS 10

- [x] **Task 1: NestJS project init** (AC: #1)
  - [x] `nest new branivo-api --package-manager npm --language typescript`
  - [x] TypeScript strict mode активиран в `tsconfig.json`
  - [x] ESLint + Prettier конфигурация
  - [x] Инсталирай core dependencies: `@nestjs/config`, `@nestjs/typeorm`, `typeorm`, `pg`, `ioredis`, `bullmq`, `@nestjs/bull`, `helmet`, `@nestjs/throttler`, `class-validator`, `class-transformer`, `@nestjs/swagger`
  - [x] Инсталирай dev dependencies: `jest`, `@types/jest`, `supertest`, `@nestjs/testing`

- [x] **Task 2: NestJS module scaffolding** (AC: #1)
  - [x] Генерирай модули: `tenants`, `auth`, `ocr`, `quotes`, `policies`, `payments`, `notifications`, `billing`, `admin`
  - [x] Структура: `src/modules/{domain}/{domain}.module.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `dto/`, `entities/`, `interfaces/`
  - [x] Създай `src/common/base.repository.ts` (виж Dev Notes)
  - [x] Създай `src/common/filters/http-exception.filter.ts` (RFC 7807 format)
  - [x] Създай `src/common/interceptors/logging.interceptor.ts` (structured CloudWatch logs)

- [x] **Task 3: TypeORM + PostgreSQL конфигурация** (AC: #5)
  - [x] `TypeOrmModule.forRootAsync()` с ConfigService
  - [x] `PgBouncer` интеграция — pool_size=20 per instance
  - [x] Инициализирай migration runner
  - [x] Създай първа migration: `tenants` таблица (seed table — няма tenant_id, е изключение!)
  - [x] Всички таблици освен `tenants`, `tenant_configs`, `tenant_domains` ИМАТ `tenant_id`
  - [x] RLS policies ще се добавят в Story 1.2

- [x] **Task 4: Redis + BullMQ setup** (AC: #4, #6)
  - [x] ioredis connection с reconnect strategy
  - [x] BullMQ 3 отделни queues: `pdf-generation`, `notifications`, `logistics`
  - [x] Queue naming convention: job name format `'{queue}:{action}'`
  - [x] Health check endpoint: `GET /health` → Redis + DB connectivity
  - [x] Redis key helper utility: `RedisKeyHelper.build(tenantId, domain, key)`

- [x] **Task 5: Logging + Observability** (AC: #3)
  - [x] Winston logger с JSON formatter за CloudWatch
  - [x] Всяка заявка логва: `tenant_id`, `user_id` (null ако anonymous), `trace_id`, ISO8601 timestamp, method, path, status, duration
  - [x] `X-Trace-Id` header — генериран per request (UUID v4) ако не е предоставен
  - [x] Helmet security headers (HSTS, CSP, X-Frame-Options: DENY, noSniff)
  - [x] `@nestjs/throttler` — 100 req/min/IP (public), 300/min (auth)

- [x] **Task 6: Swagger + API versioning** (AC: #1)
  - [x] URI versioning: `/api/v1/`
  - [x] `@nestjs/swagger` setup — Swagger UI на `/api/docs` (само dev/staging)
  - [x] `DocumentBuilder` с title, version, Bearer auth scheme

### Infrastructure — Terraform

- [x] **Task 7: Terraform структура** (AC: #2)
  - [x] `branivo-infra/environments/{dev,staging,prod}/main.tf`
  - [x] `branivo-infra/modules/{ecs,rds,redis,s3,networking,cloudfront}/`
  - [x] Dev environment е ПРИОРИТЕТ — staging/prod skeleton само
  - [x] `.tfvars` файлове per environment (НЕ commit secrets — AWS Secrets Manager)

- [x] **Task 8: AWS ресурси (dev)** (AC: #2)
  - [x] VPC + subnets (public/private/db) + NAT Gateway
  - [x] RDS PostgreSQL 16 (db.t3.medium за dev; Multi-AZ OFF в dev, ON в prod)
  - [x] ElastiCache Redis 7 (cache.t3.micro за dev)
  - [x] ECS Fargate cluster + task definitions (NestJS API + 3 BullMQ workers)
  - [x] ALB + target groups + HTTPS listener (ACM certificate)
  - [x] ECR repository `branivo-api`
  - [x] S3 bucket `branivo-documents-dev` (versioning ON, encryption AES-256)
  - [x] CloudWatch Log Groups: `/ecs/branivo-api`, `/ecs/branivo-workers`
  - [x] IAM: ECS task role с Secrets Manager + S3 + CloudWatch permissions
  - [x] AWS Secrets Manager: secrets за DB credentials, Redis URL, JWT secrets

### Mobile — Flutter 3.19

- [x] **Task 9: Flutter project init** (AC: #1)
  - [x] `flutter create branivo_app --org bg.branivo --platforms ios,android`
  - [x] Добави packages: `flutter_bloc`, `hive`, `hive_flutter`, `flutter_secure_storage`, `go_router`, `json_annotation`, `dio`
  - [x] Dev packages: `build_runner`, `json_serializable`, `hive_generator`
  - [x] BLoC структура: `lib/features/{feature}/bloc/`, `presentation/`, `data/`
  - [x] Hive box init за offline storage (`policies`, `tenant_theme`)
  - [x] flutter_secure_storage за auth tokens (НИКОГА tokens в Hive)

- [x] **Task 10: Flutter core setup** (AC: #1)
  - [x] `lib/core/api/endpoints.dart` — всички API URL constants (НИКОГА hardcoded URLs)
  - [x] `lib/core/api/dio_client.dart` — Dio instance с JWT interceptor + tenant header
  - [x] `lib/core/routing/app_router.dart` — go_router setup
  - [x] `lib/core/theme/app_theme.dart` — Material 3 theme base
  - [x] `analysis_options.yaml` — flutter_lints активирани

### Web — Next.js 14

- [x] **Task 11: Next.js project init** (AC: #1)
  - [x] `npx create-next-app@14 branivo-web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`
  - [x] Добави: `next-pwa`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`
  - [x] Добави: `@tanstack/react-query` v5, `zustand`, `react-hook-form`, `zod`, `framer-motion`, `next-intl`
  - [x] shadcn/ui init: `npx shadcn@latest init`
  - [x] App Router структура: `src/app/[locale]/(client)/` и `src/app/[locale]/(broker)/`

- [x] **Task 12: Next.js core setup** (AC: #1)
  - [x] `src/middleware.ts` — tenant resolution от `Host` header (placeholder, пълна имплементация в Story 1.2)
  - [x] `src/app/[locale]/layout.tsx` — ISR за tenant theme injection
  - [x] next-intl BG-only locale setup (routing structure за Phase 3)
  - [x] PWA: `next-pwa` Service Worker за offline wallet (50MB limit)
  - [x] `staleTime: 0, gcTime: 0` за всички quote queries (regulatory requirement)

### CI/CD

- [x] **Task 13: GitHub Actions** (AC: #1)
  - [x] `.github/workflows/api.yml` — lint, test, build, Docker push ECR, ECS deploy (staging gate)
  - [x] `.github/workflows/mobile.yml` — flutter analyze, flutter test
  - [x] `.github/workflows/web.yml` — lint, test, build, Vercel/ECS deploy
  - [x] Staging deploy е prerequisite за prod deploy (NFR51)
  - [x] GitHub Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ECR_REGISTRY`

## Dev Notes

### Критични архитектурни правила за тази story

Тази story е foundation — всяко решение тук се наследява от ВСИЧКИ останали stories. Не прескачай нищо.

#### BaseRepository — ЗАДЪЛЖИТЕЛЕН за всеки Repository в проекта

```typescript
// src/common/base.repository.ts
import { IsNull } from 'typeorm';
import { Repository } from 'typeorm';

export abstract class BaseRepository<T extends { deletedAt: Date | null }> {
  constructor(protected readonly repo: Repository<T>) {}

  async findAll(where: Partial<T>): Promise<T[]> {
    return this.repo.find({ where: { ...where, deletedAt: IsNull() } as any });
  }

  async findOne(where: Partial<T>): Promise<T | null> {
    return this.repo.findOne({ where: { ...where, deletedAt: IsNull() } as any });
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.update(id, { deletedAt: new Date() } as any);
  }
}
// ЗАБРАНЕНО: repo.delete() вместо softDelete()
// ЗАБРАНЕНО: findAll() без deletedAt: IsNull()
```

#### TenantContext — placeholder за Story 1.2 (но структурата се дефинира сега)

```typescript
// src/modules/tenants/tenant-context.service.ts (SKELETON за Story 1.1)
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private tenantId: string;

  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  getTenantId(): string {
    if (!this.tenantId) throw new Error('TenantContext not initialized');
    return this.tenantId;
  }
}
// Пълна имплементация (Host header resolution + Redis) = Story 1.2
```

#### HTTP Exception Filter — RFC 7807 format (задължителен)

```typescript
// src/common/filters/http-exception.filter.ts
// Response format:
// { statusCode, message, error, timestamp: "ISO8601", path, tenant_id }
// НИКОГА stack trace в response
// ВИНАГИ log с tenant_id + trace_id
```

#### Logging Interceptor — структура за CloudWatch

```typescript
// src/common/interceptors/logging.interceptor.ts
// Задължителни полета в JSON log:
// { tenant_id, user_id, trace_id, timestamp, method, path, statusCode, duration_ms }
// X-Trace-Id header: генериран UUID v4 ако липсва от клиента
```

#### TypeORM Entity Convention (задължителна за ВСЯКА entity)

```typescript
// Пример за правилна entity:
@Entity({ name: 'policies' })  // PLURAL snake_case
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })  // ЗАДЪЛЖИТЕЛНО { name: 'snake_case' }
  tenantId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
// ЗАБРАНЕНО: tenantId като column name
// ЗАБРАНЕНО: TIMESTAMP без tz
// ЗАБРАНЕНО: @ManyToOne без @JoinColumn({ name: '{entity}_id' })
```

#### Redis Key Convention

```typescript
// src/common/helpers/redis-key.helper.ts
export class RedisKeyHelper {
  static build(tenantId: string, domain: string, key: string): string {
    return `${tenantId}:${domain}:${key}`;
  }
}
// Примери:
// RedisKeyHelper.build(tenantId, 'config', 'tenant')
// RedisKeyHelper.build(tenantId, 'session', sessionToken)
// RedisKeyHelper.build(tenantId, 'quote', quoteId)
```

#### BullMQ Queue Configuration

```typescript
// Задължителни 3 queue-а с независими workers:
// 'pdf-generation'  — I/O intensive, fleet bulk = 12+ concurrent jobs
// 'notifications'   — time-sensitive, НЕ може да бъде блокиран от PDF jobs
// 'logistics'       — feature-gated (features.logistics flag)

// Job naming: '{queue}:{action}'
// pdf_queue.add('pdf:generate', { tenantId, policyId })
// notifications_queue.add('notification:renewal-push', { tenantId, userId, daysUntilExpiry })
// logistics_queue.add('logistics:speedy-create', { tenantId, policyId, address })
// ЗАБРАНЕНО: 'generate-pdf', 'pdf', 'PDF_GENERATE' — несъвместими с worker listeners
```

### Project Structure Notes

#### Monorepo root structure

```
branivo/
├── branivo-api/           # NestJS 10 Modular Monolith
│   └── src/
│       ├── modules/
│       │   ├── tenants/
│       │   ├── auth/
│       │   ├── ocr/
│       │   ├── quotes/
│       │   ├── policies/
│       │   ├── payments/
│       │   ├── notifications/
│       │   ├── billing/
│       │   └── admin/
│       ├── common/
│       │   ├── base.repository.ts
│       │   ├── filters/
│       │   ├── interceptors/
│       │   ├── guards/
│       │   └── helpers/
│       └── main.ts
├── branivo-app/           # Flutter 3.19
│   └── lib/
│       ├── core/
│       │   ├── api/endpoints.dart
│       │   ├── routing/
│       │   └── theme/
│       └── features/
│           └── {feature}/
│               ├── bloc/
│               ├── presentation/
│               └── data/
├── branivo-web/           # Next.js 14 App Router
│   └── src/
│       ├── app/[locale]/
│       │   ├── (client)/
│       │   └── (broker)/
│       ├── components/
│       │   ├── ui/          # shadcn/ui
│       │   └── {domain}/
│       ├── lib/
│       │   ├── api/
│       │   ├── hooks/
│       │   └── utils/
│       └── middleware.ts
└── branivo-infra/         # Terraform
    ├── environments/{dev,staging,prod}/
    └── modules/{ecs,rds,redis,s3,networking,cloudfront}/
```

#### Alignment с project-context.md

- Модулна структура: Controller → Service → Repository (НИКОГА прескачане)
- Max 30 lines per function; max 300 lines per file
- Нито един cross-module import (само NestJS EventEmitter за inter-module communication)
- Shared `InfrastructureModule` за Redis, DB, Config

### Architecture Compliance Checklist

- [ ] TypeORM column mapping ВИНАГИ `{ name: 'snake_case' }` — проверен преди commit
- [ ] НИКОГА `repo.delete()` — само `softDelete()` от BaseRepository
- [ ] НИКОГА `tenant_id` като функционален параметър — само `TenantContext.getTenantId()`
- [ ] НИКОГА `print()` в Flutter — само `dart:developer` log
- [ ] НИКОГА hardcoded URLs в Flutter — само `lib/core/api/endpoints.dart` constants
- [ ] Redis ключове форматирани като `{tenant_id}:{domain}:{key}`
- [ ] BullMQ job names форматирани като `'{queue}:{action}'`
- [ ] API responses в `{ "data": {...}, "meta": {...} }` формат
- [ ] Errors в RFC 7807 формат (без stack trace)
- [ ] Structured logs съдържат: `tenant_id`, `user_id`, `trace_id`, ISO8601 timestamp

### Library Versions (current stable as of 2026-03)

| Library | Version | Notes |
|---------|---------|-------|
| NestJS | 10.x | `@nestjs/cli` latest |
| TypeORM | 0.3.x | TypeScript-first |
| BullMQ | 5.x | Независим от legacy Bull |
| ioredis | 5.x | Cluster support; reconnect |
| class-validator | 0.14.x | NestJS Pipe validation |
| Flutter | 3.19.x | Null-safety, Material 3 |
| flutter_bloc | 8.x | BLoC 8 API |
| go_router | 13.x | Latest stable |
| Hive | 2.x | Offline data |
| Next.js | 14.x | App Router (НЕ Pages Router) |
| TanStack Query | 5.x | `staleTime: 0, gcTime: 0` за quotes |
| Terraform | 1.7.x | HCL2; AWS provider 5.x |

### Dependencies за следващите stories

- **Story 1.2** (TenantContext Middleware) зависи от: Redis connection (Task 4), TenantContext skeleton (Dev Notes), tenants таблица (Task 3)
- **Story 1.3** (Auth) зависи от: NestJS modules (Task 2), TypeORM (Task 3), Redis (Task 4)
- **Story 1.4** (Super Admin) зависи от: всички Task 1-6 от тази story
- **Story 2.x, 3.x, 4.x** зависят от: пълна foundation от тази story

### Testing Requirements

#### NestJS Unit Tests
- Jest + `@nestjs/testing`
- Тествай: LoggingInterceptor, HttpExceptionFilter, RedisKeyHelper
- Мock: Redis, TypeORM Repository
- Coverage target: 80%+ за common utilities

#### NestJS Integration Tests
- `supertest` за `/health` endpoint
- Реален PostgreSQL в test environment (docker-compose.test.yml)
- НИКОГА mock на база данни за integration tests

#### Flutter Tests
- `flutter test` за unit tests
- Тествай: RedisKeyHelper-equivalent (endpoint constants), go_router config
- `flutter analyze` — 0 warnings, 0 errors

#### Next.js Tests
- Jest + React Testing Library
- Тествай: middleware tenant resolution logic (unit), layout rendering

#### Infrastructure Tests
- `terraform validate` — 0 errors
- `terraform plan` — review output преди apply
- `tflint` за linting

### References

- [Source: architecture.md#Initialization Commands] — точни команди за init
- [Source: architecture.md#NestJS Module Structure] — задължителна folder structure
- [Source: architecture.md#BaseRepository] — BaseRepository implementation
- [Source: architecture.md#Infrastructure & Deployment] — Terraform module structure
- [Source: project-context.md#Architecture Rules] — Module structure rules
- [Source: project-context.md#Database] — UUID PKs, soft delete, TypeORM column mapping
- [Source: project-context.md#Security Rules] — Helmet, rate limits, JWT TTL
- [Source: project-context.md#Flutter-Specific Rules] — BLoC, Hive, flutter_secure_storage
- [Source: project-context.md#Next.js-Specific Rules] — ISR, dynamic rendering, PWA
- [Source: epics.md#Story 1.1] — Acceptance Criteria (оригинален BDD формат)
- [Source: architecture.md#BullMQ Queue Architecture] — 3 queues, naming convention
- [Source: architecture.md#Communication Patterns] — EventEmitter naming, BullMQ job format

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- Jest config: добавен `transformIgnorePatterns` за `uuid` ESM пакет (Jest 30 + uuid v13)
- Flutter: проектът е създаден като `branivo_app` (Dart naming rules)

### Completion Notes List

Всички 13 tasks са имплементирани и тествани:
- NestJS 10 monolith с 9 domain модула, BaseRepository, HttpExceptionFilter (RFC 7807), LoggingInterceptor (CloudWatch JSON)
- TypeORM + PostgreSQL с migration runner; първа миграция: tenants, tenant_configs, tenant_domains таблици
- Redis (ioredis) с reconnect strategy + BullMQ 3 queues (pdf-generation, notifications, logistics)
- Health check endpoint (GET /health) — Redis + DB
- RedisKeyHelper.build(tenantId, domain, key) — {tenant_id}:{domain}:{key} формат
- Winston JSON logger + Helmet security headers + Throttler (100/300 req/min)
- Swagger UI на /api/docs (само dev/staging) + URI versioning /api/v1/
- Terraform структура: networking, rds, redis, s3, ecs модули за dev/staging/prod
- Flutter 3 с BLoC, Hive offline storage, flutter_secure_storage, go_router, Dio JWT interceptor
- Next.js 14 App Router с shadcn/ui, next-pwa (50MB offline wallet), TanStack Query (staleTime:0)
- GitHub Actions: api.yml (staging gate → prod), mobile.yml, web.yml
- docker-compose.yml за локална разработка (PostgreSQL, Redis, pgAdmin, Redis Commander, MailHog)
- 11/11 unit tests pass (RedisKeyHelper × 4, LoggingInterceptor × 2, HttpExceptionFilter × 3, AppController × 1, AppService × 1)

### File List

**NestJS API (branivo-api/)**
- `src/main.ts`
- `src/app.module.ts`
- `tsconfig.json`
- `.env` / `.env.example`
- `src/common/base.repository.ts`
- `src/common/filters/http-exception.filter.ts`
- `src/common/filters/http-exception.filter.spec.ts`
- `src/common/interceptors/logging.interceptor.ts`
- `src/common/interceptors/logging.interceptor.spec.ts`
- `src/common/helpers/redis-key.helper.ts`
- `src/common/helpers/redis-key.helper.spec.ts`
- `src/modules/tenants/tenant-context.service.ts`
- `src/modules/{tenants,auth,ocr,quotes,policies,payments,notifications,billing,admin}/*.{module,controller,service,repository}.ts`
- `src/modules/{tenants,auth,ocr,quotes,policies,payments,notifications,billing,admin}/{dto,entities,interfaces}/`
- `src/infrastructure/database/database.module.ts`
- `src/infrastructure/database/migrations/1710000000000-CreateTenantsTable.ts`
- `src/infrastructure/redis/redis.module.ts`
- `src/infrastructure/queues/queue.module.ts`
- `src/infrastructure/logger/logger.module.ts`
- `src/health/health.controller.ts`
- `src/health/health.module.ts`

**Terraform (branivo-infra/)**
- `environments/dev/main.tf`, `variables.tf`, `terraform.tfvars.example`
- `environments/staging/main.tf`, `environments/prod/main.tf`
- `modules/networking/main.tf`, `variables.tf`, `outputs.tf`
- `modules/rds/main.tf`, `variables.tf`, `outputs.tf`
- `modules/redis/main.tf`, `variables.tf`, `outputs.tf`
- `modules/s3/main.tf`, `variables.tf`, `outputs.tf`
- `modules/ecs/main.tf`, `variables.tf`, `outputs.tf`

**Flutter (branivo_app/)**
- `pubspec.yaml`
- `lib/main.dart`
- `lib/core/api/endpoints.dart`
- `lib/core/api/dio_client.dart`
- `lib/core/routing/app_router.dart`
- `lib/core/theme/app_theme.dart`
- `test/widget_test.dart`

**Next.js Web (branivo-web/)**
- `src/middleware.ts`
- `src/lib/query-client.ts`
- `next.config.js`

**Root**
- `docker-compose.yml`
- `docker-compose.test.yml`
- `.github/workflows/api.yml`
- `.github/workflows/mobile.yml`
- `.github/workflows/web.yml`

## Change Log

- 2026-03-18: Story 1.1 имплементирана — пълна monorepo foundation, всички 13 tasks завършени, 11/11 тестове преминати
