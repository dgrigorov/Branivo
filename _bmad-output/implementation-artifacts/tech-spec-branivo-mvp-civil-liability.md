---
title: 'Branivo MVP — Гражданска Отговорност'
slug: 'branivo-mvp-civil-liability'
created: '2026-03-30'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [NestJS, TypeORM, PostgreSQL, Redis, BullMQ, Flutter, BLoC, go_router, Dio]
files_to_modify:
  - branivo_app/lib/features/ocr/screens/ocr_wizard_screen.dart
  - branivo_app/lib/features/auth/screens/login_screen.dart
  - branivo_app/lib/features/anonymous_session/data/repositories/anonymous_session_repository.dart
  - branivo-api/src/modules/ocr/ocr.service.ts
  - branivo-api/src/modules/vehicles/vehicles.service.ts
  - branivo-api/src/modules/insurers/insurers.service.ts
  - branivo-api/src/infrastructure/database/seed.service.ts
code_patterns:
  - "NestJS: Controller → Service → Repository (TypeORM)"
  - "Flutter: BLoC + go_router + Dio"
  - "Анонимна сесия: Redis key anon:{sessionToken}:session, TTL 48h"
  - "Rate limiting: Lua скрипт в Redis (атомарен INCR + EXPIRE)"
  - "Таблици: UUID PK, tenant_id, created_at, updated_at, deleted_at"
  - "Seed: onApplicationBootstrap + ON CONFLICT DO NOTHING"
  - "Автокаталог: thumbnail_url + full_image_url за lazy loading"
test_patterns:
  - "NestJS: .spec.ts unit тест за всеки Service + интеграционен за Controller"
  - "Flutter: widget тест за всеки екран/widget"
---

# Tech-Spec: Branivo MVP — Гражданска Отговорност

**Created:** 2026-03-30

## Overview

### Problem Statement

Съществуващият Branivo проект е прекалено сложен за бърз market validation — твърде много модули, страници и зависимости. Нужен е фокусиран MVP, където клиент може да купи гражданска отговорност за под 3 минути чрез OCR сканиране на талона на автомобила, без ръчно въвеждане на данни.

### Solution

Нова поддиректория `branivo-mvp/` в същото monorepo. Reuse на OCR wizard кода 1:1 от `branivo_app/`, опростен NestJS API с PostgreSQL schema `branivo_mvp`. Flow: анонимен гост → OCR сканиране → confirmation screen → оферти → mock payment → автоматично създаден профил с OCR данни → парола по имейл.

### Scope

**In Scope:**
- Flutter app (`branivo-mvp/app/`) — OCR wizard (copy 1:1), login/register с 2 demo акаунта (Клиент + Брокер), OCR confirmation screen с редактируеми полета, каталог на застрахователи, автокаталог топ 50 марки с лога и модели (S3 URLs), quotes list, checkout, success screen
- NestJS API (`branivo-mvp/api/`) — auth (JWT, без 2FA), анонимна сесия (Redis), OCR (Google Vision + ML Kit), автокаталог, insurers, mock quotes за гражданска, mock payment, auto-create потребител от OCR данни, имейл с парола
- PostgreSQL schema `branivo_mvp` — multi-tenant от ден 1
- Споделен PostgreSQL + Redis с основния проект в dev

**Out of Scope:**
- Реален Stripe payment
- Fleet, renewal, DKP, API tier
- Web dashboard
- 2FA
- KAT/GF API интеграции
- Push notifications
- "Всички" коли — само топ 50 марки seed

---

## Context for Development

### Codebase Patterns

- **NestJS модулна структура:** Controller → Service → Repository (TypeORM). Никога не прескачай слоеве.
- **Flutter архитектура:** BLoC за state management, go_router за навигация, Dio за HTTP.
- **Анонимна сесия:** Redis key `anon:{sessionToken}:session`, TTL 48h. Мигрира към реален потребител при покупка чрез `POST /sessions/anonymous/{id}/migrate`.
- **Rate limiting:** Lua скрипт (атомарен INCR + EXPIRE) — copy от `OcrService.enforceRateLimit()`.
- **DB таблици:** UUID PK, `tenant_id`, `created_at`, `updated_at`, `deleted_at`. RLS задължително.
- **Seed данни:** `onApplicationBootstrap` + `ON CONFLICT DO NOTHING` — идемпотентен.
- **Автокаталог:** `thumbnail_url` + `full_image_url` разделени — thumbnail в списък, full image само в детайл.
- **OCR провайдери:** Google Vision (primary) → ML Kit on-device (fallback) → AWS Textract (async fallback).
- **Demo акаунти:** 2 бутона — "Клиент" (→ OCR wizard) + "Брокер" (→ dashboard).

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `branivo_app/lib/features/ocr/screens/ocr_wizard_screen.dart` | OCR wizard UI — copy 1:1, design tokens включени |
| `branivo_app/lib/features/ocr/bloc/ocr_wizard_bloc.dart` | OCR BLoC логика |
| `branivo_app/lib/features/auth/screens/login_screen.dart` | Login screen — copy + добави 2 demo бутона |
| `branivo_app/lib/features/anonymous_session/data/repositories/anonymous_session_repository.dart` | Анонимна сесия Flutter repo — copy 1:1 |
| `branivo-api/src/modules/ocr/ocr.service.ts` | OCR processing + rate limit Lua pattern |
| `branivo-api/src/modules/vehicles/vehicles.service.ts` | Vehicle save/validate pattern |
| `branivo-api/src/modules/insurers/insurers.service.ts` | Insurers list/sync pattern |
| `branivo-api/src/infrastructure/database/seed.service.ts` | Seed pattern — `onApplicationBootstrap` |

### Technical Decisions

- **Анонимна сесия:** Session token в Redis. `POST /api/v1/sessions/anonymous` приема `X-Tenant-Slug` header (default: `'demo'`) → lookup tenant → записва `tenant_id` в session. Rate limiting по session token.
- **Tenant scoping (F6 fix):** Анонимните оферти носят `tenant_id` от Redis session — не от HTTP header. `QuotesService.generateQuotes()` чете `tenant_id` от session данните.
- **Автокаталог:** Топ 50 марки seed-нати с лога от third-party CDN (carlogos.org / WikiMedia Commons). Fallback placeholder при липсващо лого.
- **Изображения (F7 fix):** Без собствен CDN за MVP — ползваме third-party public URLs (carlogos.org за лога, Wikipedia Commons за модели). Само `cached_network_image` в Flutter за lazy loading.
- **Payment:** Mock payment за MVP — фокус върху flow и UX
- **Профил при покупка:** Auto-create с OCR данни. ЕГН се криптира с AES-256-GCM преди запис (`CryptoService`). Временна парола: 12 символа random (upper+lower+digit+special), bcrypt hash, валидна 72h (`temp_password_expires_at`).
- **Quote TTL (F8 fix):** Офертите са валидни 24 часа (`QUOTE_TTL_HOURS = 24`). Checkout валидира `valid_until > now()`.
- **Checkout атомарност (F1 fix):** Цялата покупка (user create + policy create + session migrate) е в TypeORM транзакция. Email се изпраща fire-and-forget след успешен commit.
- **OCR failure path (F11 fix):** При пълен OCR failure → `OcrFailedState` → "Въведи ръчно" бутон → OcrConfirmationScreen с празни редактируеми полета.
- **API prefix (F10 fix):** `app.setGlobalPrefix('api/v1')` в `main.ts`. Всички Flutter repositories вече ползват `/api/v1/` prefix от копираните repo файлове.
- **JWT изолация (F12 fix):** Двата API-та имат различни JWT_SECRET. Токените им не са взаимозаменяеми. Документирано за dev agent.

---

## Implementation Plan

### Tasks

#### Фаза 1: Scaffold и инфраструктура

- [ ] **Задача 1: Създай директорна структура на MVP (copy-first подход)**
  - Действие: **НЕ** използвай `nest new` или `flutter create` — генерират boilerplate, който трябва да се изтрие.
  - Вместо това:
    ```bash
    # API: копирай branivo-api и изтрий ненужните модули
    cp -r branivo-api branivo-mvp/api
    # Изтрий модули извън MVP scope:
    rm -rf branivo-mvp/api/src/modules/policies
    rm -rf branivo-mvp/api/src/modules/commissions
    rm -rf branivo-mvp/api/src/modules/fleet
    rm -rf branivo-mvp/api/src/modules/renewals
    rm -rf branivo-mvp/api/src/modules/stripe
    rm -rf branivo-mvp/api/src/modules/superadmin

    # Flutter app: копирай branivo_app
    cp -r branivo_app branivo-mvp/app
    # Изтрий feature директории извън MVP scope:
    rm -rf branivo-mvp/app/lib/features/policies
    rm -rf branivo-mvp/app/lib/features/fleet
    rm -rf branivo-mvp/app/lib/features/renewals
    rm -rf branivo-mvp/app/lib/features/superadmin
    ```
  - Файл: `branivo-mvp/api/package.json` — смени `name` на `branivo-mvp-api`
  - Файл: `branivo-mvp/app/pubspec.yaml` — смени `name` на `branivo_mvp`
  - Файл: `branivo-mvp/docker-compose.yml` — референция към споделения PostgreSQL и Redis от root `docker-compose.yml`
  - **F4 fix — AppModule cleanup:** След изтриването на модулите, задължително обнови `branivo-mvp/api/src/app.module.ts` — премахни всички imports на изтрити модули (PoliciesModule, CommissionsModule, FleetModule, RenewalsModule, StripeModule, SuperAdminModule). Иначе `npm run build` ще fail-не веднага.
  - **F12 fix — JWT несъвместимост (документирано):** `branivo-api` и `branivo-mvp/api` имат различни `JWT_SECRET` стойности. Токените им НЕ са взаимозаменяеми. Не се опитвай да споделяш токени между двете апи-та.
  - Файл: `branivo-mvp/api/.env.example` — добави:
    ```
    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=branivo
    DB_SCHEMA=branivo_mvp
    DB_USER=branivo
    DB_PASSWORD=branivo
    REDIS_URL=redis://localhost:6379
    JWT_SECRET=mvp-secret-change-me
    GOOGLE_VISION_API_KEY=
    SMTP_HOST=
    SMTP_PORT=587
    SMTP_USER=
    SMTP_PASS=
    FROM_EMAIL=noreply@branivo.bg
    ```

- [ ] **Задача 2: DB миграции — core таблици**
  - Файл: `branivo-mvp/api/src/infrastructure/database/migrations/001-CreateMvpCoreSchema.ts`
  - Действие: **Първа стъпка в миграцията** — създай schema:
    ```sql
    CREATE SCHEMA IF NOT EXISTS branivo_mvp;
    ```
  - След това създай таблици:
    ```sql
    -- tenants (multi-tenant foundation)
    CREATE TABLE branivo_mvp.tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    -- users
    -- F2 fix: egn_encrypted съхранява ЕГН криптирано на application ниво (AES-256-GCM).
    -- Никога не съхранявай plaintext ЕГН. Използвай CryptoService.encrypt(egn) преди запис
    -- и CryptoService.decrypt(egn_encrypted) при четене.
    CREATE TABLE branivo_mvp.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES branivo_mvp.tenants(id),
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      egn_encrypted TEXT,       -- AES-256-GCM encrypted, NEVER plaintext
      phone VARCHAR(20),
      address TEXT,
      role VARCHAR(50) NOT NULL DEFAULT 'client',
      must_change_password BOOLEAN DEFAULT false,
      temp_password_expires_at TIMESTAMPTZ, -- временната парола изтича след 72h
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      deleted_at TIMESTAMPTZ,
      UNIQUE(tenant_id, email)
    );

    -- vehicle_makes
    CREATE TABLE branivo_mvp.vehicle_makes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) UNIQUE NOT NULL,
      logo_url VARCHAR(500),
      created_at TIMESTAMPTZ DEFAULT now()
    );

    -- vehicle_models
    CREATE TABLE branivo_mvp.vehicle_models (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      make_id UUID NOT NULL REFERENCES branivo_mvp.vehicle_makes(id),
      name VARCHAR(100) NOT NULL,
      thumbnail_url VARCHAR(500),
      full_image_url VARCHAR(500),
      year_from INT,
      year_to INT,
      body_type VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT now()
    );

    -- insurers (copy structure от branivo.fsc_insurers)
    CREATE TABLE branivo_mvp.insurers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      eik VARCHAR(20),
      logo_url VARCHAR(500),
      website VARCHAR(255),
      category_key VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    -- quotes
    CREATE TABLE branivo_mvp.quotes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES branivo_mvp.tenants(id),
      session_token VARCHAR(255) NOT NULL,
      insurer_id UUID NOT NULL REFERENCES branivo_mvp.insurers(id),
      vehicle_data JSONB NOT NULL,
      premium_amount NUMERIC(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'BGN',
      valid_until TIMESTAMPTZ NOT NULL,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    -- policies
    CREATE TABLE branivo_mvp.policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES branivo_mvp.tenants(id),
      user_id UUID NOT NULL REFERENCES branivo_mvp.users(id),
      quote_id UUID NOT NULL REFERENCES branivo_mvp.quotes(id),
      insurer_id UUID NOT NULL REFERENCES branivo_mvp.insurers(id),
      policy_number VARCHAR(100) UNIQUE NOT NULL,
      vehicle_data JSONB NOT NULL,
      premium_amount NUMERIC(10,2) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(50) DEFAULT 'active',
      mock_payment_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    ```

- [ ] **Задача 2b: CryptoService за ЕГН криптиране (F2 fix)**
  - Файл: `branivo-mvp/api/src/infrastructure/crypto/crypto.service.ts`
  - Действие: AES-256-GCM симетрично криптиране:
    ```typescript
    import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

    @Injectable()
    export class CryptoService {
      private readonly key: Buffer;
      constructor(config: ConfigService) {
        // EGN_ENCRYPTION_KEY в .env — 32-байтов hex string
        this.key = Buffer.from(config.getOrThrow('EGN_ENCRYPTION_KEY'), 'hex');
      }

      encrypt(plaintext: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, tag, encrypted]).toString('base64');
      }

      decrypt(ciphertext: string): string {
        const buf = Buffer.from(ciphertext, 'base64');
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const encrypted = buf.subarray(28);
        const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
      }
    }
    ```
  - Добави в `.env.example`: `EGN_ENCRYPTION_KEY=` (генерирай с `openssl rand -hex 32`)
  - Inject `CryptoService` в `PoliciesService` — използвай при `createUserFromOcrData()`

- [ ] **Задача 3: NestJS app module + DB connection**
  - Файл: `branivo-mvp/api/src/app.module.ts`
  - Действие: Конфигурирай TypeORM с `schema: 'branivo_mvp'`, JWT модул, Redis модул, ScheduleModule, MailerModule
  - Файл: `branivo-mvp/api/src/infrastructure/redis/redis.module.ts` — copy от `branivo-api/src/infrastructure/redis/redis.module.ts`
  - Файл: `branivo-mvp/api/src/common/tenant-context/tenant.context.ts` — copy от `branivo-api`

#### Фаза 2: Backend модули

- [ ] **Задача 4: Auth модул**
  - Файл: `branivo-mvp/api/src/modules/auth/auth.service.ts`
  - Действие: Copy логиката от `branivo-api/src/modules/auth/auth.service.ts` БЕЗ 2FA (`verifyTwoFactor`, `generateTotpSecret`). Запази: login, register, refresh token, password reset.
  - Файл: `branivo-mvp/api/src/modules/auth/auth.controller.ts` — endpoints: `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`, `POST /auth/request-reset`, `POST /auth/confirm-reset`
  - Файл: `branivo-mvp/api/src/modules/auth/strategies/jwt.strategy.ts` — copy 1:1
  - Файл: `branivo-mvp/api/src/modules/auth/auth.service.spec.ts` — unit тестове за login, register, refresh

- [ ] **Задача 5: Anonymous Session модул**
  - Файл: `branivo-mvp/api/src/modules/sessions/sessions.service.ts`
  - **F10 fix — API prefix:** Всички endpoints в branivo-mvp/api използват `/api/v1/` prefix (идентично с branivo-api). Конфигурирай в `main.ts`: `app.setGlobalPrefix('api/v1')`.
  - Действие: Copy от съществуващата имплементация. Endpoints:
    - `POST /api/v1/sessions/anonymous` — приема опционален `X-Tenant-Slug` header (default: `'demo'`), lookup tenant по slug, записва `tenant_id` в Redis. Връща `{ session_id }`
    - `GET /api/v1/sessions/anonymous/:id` — връща session data
    - `PUT /api/v1/sessions/anonymous/:id/data` — update vehicle_data, selected_quote_id
    - `POST /api/v1/sessions/anonymous/:id/migrate` — прехвърля session данните към реален user след покупка
  - Файл: `branivo-mvp/api/src/modules/sessions/sessions.service.spec.ts` — unit тестове

- [ ] **Задача 6: OCR модул**
  - Файл: `branivo-mvp/api/src/modules/ocr/ocr.service.ts`
  - Действие: Copy от `branivo-api/src/modules/ocr/ocr.service.ts`. Запази: `scan()`, `reportMlKitScan()`, `visionScan()`, `logScan()`, rate limiting Lua скрипт, `updateAnonymousSession()`.
  - Файл: `branivo-mvp/api/src/modules/ocr/providers/google-vision.service.ts` — copy 1:1
  - Файл: `branivo-mvp/api/src/modules/ocr/ocr.controller.ts` — endpoints: `POST /ocr/scan`, `POST /ocr/ml-kit`, `POST /ocr/vision-scan`, `POST /ocr/log`
  - Файл: `branivo-mvp/api/src/modules/ocr/ocr.service.spec.ts` — unit тестове

- [ ] **Задача 7: Vehicle Catalog модул (нов)**
  - Файл: `branivo-mvp/api/src/modules/vehicle-catalog/entities/vehicle-make.entity.ts`
  - Действие:
    ```typescript
    @Entity({ schema: 'branivo_mvp', name: 'vehicle_makes' })
    export class VehicleMakeEntity {
      @PrimaryGeneratedColumn('uuid') id: string;
      @Column() name: string;
      @Column({ nullable: true }) logoUrl: string | null;
      @CreateDateColumn() createdAt: Date;
      @OneToMany(() => VehicleModelEntity, m => m.make) models: VehicleModelEntity[];
    }
    ```
  - Файл: `branivo-mvp/api/src/modules/vehicle-catalog/entities/vehicle-model.entity.ts`
  - Действие: Полета: `id`, `makeId`, `name`, `thumbnailUrl`, `fullImageUrl`, `yearFrom`, `yearTo`, `bodyType`
  - Файл: `branivo-mvp/api/src/modules/vehicle-catalog/vehicle-catalog.service.ts`
  - Действие: Методи: `listMakes()`, `listModelsByMake(makeId)`, `findModelByNameAndMake(make, model)` (използва се от OCR confirmation)
  - Файл: `branivo-mvp/api/src/modules/vehicle-catalog/vehicle-catalog.controller.ts` — `GET /vehicle-catalog/makes`, `GET /vehicle-catalog/makes/:id/models`
  - Файл: `branivo-mvp/api/src/modules/vehicle-catalog/vehicle-catalog.service.spec.ts`

- [ ] **Задача 8: Insurers модул**
  - Файл: `branivo-mvp/api/src/modules/insurers/insurers.service.ts`
  - Действие: Опростена версия — само `list()` и `findById()`. Без FSC scraper за MVP (seed данни от seeder).
  - Файл: `branivo-mvp/api/src/modules/insurers/insurers.controller.ts` — `GET /insurers`, `GET /insurers/:id`
  - Файл: `branivo-mvp/api/src/modules/insurers/insurers.service.spec.ts`

- [ ] **Задача 9: Quotes модул (mock)**
  - Файл: `branivo-mvp/api/src/modules/quotes/quotes.service.ts`
  - Действие: `generateQuotes(sessionToken, vehicleData, options?: { deterministic?: boolean })` — генерира 3-5 mock оферти от seed застрахователите. Логика за ценообразуване:
    ```typescript
    // Mock premium calculation based on vehicle year + engine volume
    const basePremium = 180; // BGN
    const yearFactor = Math.max(0.8, 1 - (currentYear - vehicleYear) * 0.02);
    const volumeFactor = engineVolume > 1600 ? 1.3 : 1.0;
    // deterministic: true в тестове — без Math.random(), фиксиран multiplier per insurer
    const randomMultiplier = options?.deterministic
      ? [0.90, 1.00, 1.10, 1.20, 1.05][insurerIndex] ?? 1.0
      : 0.9 + Math.random() * 0.3;
    const premium = basePremium * yearFactor * volumeFactor * randomMultiplier;
    ```
  - Endpoint: `POST /quotes/generate` (изисква session token в header), `GET /quotes/:id`
  - Файл: `branivo-mvp/api/src/modules/quotes/quotes.service.spec.ts` — използва `deterministic: true` за стабилни тестове

- [ ] **Задача 10: Checkout/Policy модул**
  - Файл: `branivo-mvp/api/src/modules/policies/policies.service.ts`
  - Действие: `purchasePolicy(dto)` — изпълнява целия checkout flow:
    1. Валидира quote (не е изтекъл)
    2. Mock payment: генерира `mock_payment_id = 'MOCK_' + uuid()`
    3. Ако потребителят е анонимен: **Duplicate email check** — ако имейлът вече съществува хвърля `ConflictException({ message: 'Акаунт с този имейл вече съществува', action: 'login', email })`. Flutter показва: "Открихме съществуващ акаунт — влезте, за да завършите покупката."
    4. `createUserFromOcrData(sessionData)` — хешира временна парола, записва в `users` с `must_change_password: true`
    5. Създава policy record с `policy_number = 'BGO-' + year + '-' + randomInt(100000, 999999)`
    6. Мигрира анонимна сесия към реален user
    7. Изпраща имейл с временна парола (Nodemailer)
    8. Връща `{ policyId, policyNumber, userId, isNewUser: true }`
  - **F1 fix — Атомарност:** Целият flow (стъпки 3-6) се изпълнява в TypeORM транзакция:
    ```typescript
    await this.dataSource.transaction(async (manager) => {
      // стъпки 3, 4, 5, 6 вътре в транзакцията
      // стъпка 7 (email) — извън транзакцията, fire-and-forget след commit
    });
    ```
    Ако което и да е от горните гръмне — цялата транзакция се rollback-ва. Email-ът се изпраща само след успешен commit.
  - **F6 fix — Tenant scoping:** `POST /sessions/anonymous` приема опционален `tenant_slug` header (default: `'demo'`). SessionsService lookup-ва tenant по slug и записва `tenant_id` в Redis session. `POST /quotes/generate` чете `tenant_id` от Redis session — не от header.
  - **F8 fix — Quote TTL:** `valid_until = now() + 24 hours`. Записано в QuotesService като константа: `QUOTE_TTL_HOURS = 24`.
  - **F9 fix — Временна парола:** 12 символа, случайни (uppercase + lowercase + цифри + специален символ). Генерирай с `crypto.randomBytes`. `temp_password_expires_at = now() + 72h`. При изтичане потребителят вижда "Паролата ви е изтекла — използвайте 'Забравена парола'".
  - Endpoint: `POST /api/v1/policies/purchase`
  - Файл: `branivo-mvp/api/src/modules/policies/policies.service.spec.ts`

- [ ] **Задача 11: Email сервис**
  - Файл: `branivo-mvp/api/src/infrastructure/mail/mail.service.ts`
  - Действие: Nodemailer с HTML template за:
    - "Добре дошли в Branivo — вашата полица е активна" с временна парола и бутон "Смени паролата"
    - Template да включва: номер на полицата, застраховател, марка/модел на МПС, период на покритие, сума

- [ ] **Задача 12: Seed данни (задължително за всеки модул)**
  - Файл: `branivo-mvp/api/src/infrastructure/database/seed.service.ts`
  - **ПРАВИЛО:** Всеки нов модул добавя свой `seedXxx()` метод тук — в СЪЩИЯ commit като имплементацията. Dev средата трябва да е тествабилна веднага след `npm run start:dev` без ръчно въвеждане на данни.
  - Действие: `onApplicationBootstrap()` извиква (в ред на зависимости):
    - `seedTenants()` — 1 demo tenant `{ slug: 'demo', name: 'Branivo Demo' }`
    - `seedUsers()` — 2 demo потребители: `client@branivo.bg / Client1234!` (role: client) + `broker@branivo.bg / Broker1234!` (role: broker)
    - `seedInsurers()` — 8 реални БГ застрахователя с лога: Лев Инс, ДЗИ, Булстрад, Армеец, Алианц, Generali, Uniqa, OZK. Реални данни: EИК, website, logo_url.
    - `seedVehicleMakes()` — топ 50 марки с `logo_url` към **безплатни third-party CDN-и** (F7 fix — нямаме собствен CDN):
      - Лога на марки: `https://www.carlogos.org/car-logos/{slug}-logo.png` или `https://cdn.jsdelivr.net/gh/nicholasgasior/car-logos/{slug}.png`
      - Fallback: `https://via.placeholder.com/100x60?text={MakeName}` ако логото не е намерено
    - `seedVehicleModels()` — топ 3-5 модела за всяка марка с `thumbnail_url` и `full_image_url` от Wikipedia Commons или unsplash.com (Creative Commons licensed). Пример: `https://upload.wikimedia.org/wikipedia/commons/thumb/.../Toyota_Corolla_2019.jpg/320px-Toyota_Corolla_2019.jpg`
    - `seedDemoQuotes()` — 3 demo оферти за demo tenant (за тестване на broker dashboard без реален OCR)
    - `seedDemoPolicies()` — 2 demo полици за demo client потребителя (за тестване на dashboard)
  - Всички методи: `ON CONFLICT DO NOTHING` — идемпотентни
  - Seed се пуска само при `NODE_ENV !== 'production'`

#### Фаза 3: Flutter App

- [ ] **Задача 13: Flutter project setup + routing**
  - Файл: `branivo-mvp/app/lib/core/routing/app_router.dart`
  - Действие: Дефинирай routes:
    ```
    /                   → SplashScreen (redirect по auth state)
    /login              → LoginScreen
    /register           → RegisterScreen
    /scan               → OcrWizardScreen (анонимен или автентициран)
    /scan/confirm       → OcrConfirmationScreen
    /quotes             → QuotesListScreen
    /checkout           → CheckoutScreen
    /checkout/success   → PolicySuccessScreen
    /catalog/makes      → VehicleMakesScreen
    /catalog/makes/:id  → VehicleModelsScreen
    /insurers           → InsurersScreen
    /dashboard          → DashboardScreen (само broker role)
    ```
  - Файл: `branivo-mvp/app/lib/core/api/api_client.dart` — Dio setup с base URL, auth interceptor (JWT в header), error interceptor

- [ ] **Задача 14: Login screen**
  - Файл: `branivo-mvp/app/lib/features/auth/screens/login_screen.dart`
  - Действие: Copy от `branivo_app/lib/features/auth/screens/login_screen.dart` — запази целия дизайн. Промени `_fillDemoCredentials()`:
    ```dart
    // Замени единичния demo бутон с два:
    Row(children: [
      Expanded(child: _DemoButton(
        label: 'Demo Клиент',
        icon: Icons.person_outline,
        onTap: () { _emailController.text = 'client@branivo.bg'; _passwordController.text = 'Client1234!'; _submit(); },
      )),
      const SizedBox(width: 8),
      Expanded(child: _DemoButton(
        label: 'Demo Брокер',
        icon: Icons.business_center_outlined,
        onTap: () { _emailController.text = 'broker@branivo.bg'; _passwordController.text = 'Broker1234!'; _submit(); },
      )),
    ])
    ```
  - Запази: anonymous scan бутон "Провери цени без акаунт", дизайн токени, gradient button

- [ ] **Задача 15: OCR Wizard screen**
  - Файл: `branivo-mvp/app/lib/features/ocr/screens/ocr_wizard_screen.dart`
  - Действие: Copy 1:1 от `branivo_app/lib/features/ocr/screens/ocr_wizard_screen.dart`
  - Файл: `branivo-mvp/app/lib/features/ocr/bloc/ocr_wizard_bloc.dart`
  - **F5 fix — OCR BLoC активни бъгове:** При copy на `ocr_wizard_bloc.dart` задължително оправи следните Dart грешки (съществуват в оригинала):
    - **Line 212:** `mlKitFields` — undefined name. Замени с правилното поле от `OcrWizardState` (вероятно `state.fields` или `event.fields`). Прочети контекста около Line 212 и избери правилното.
    - **Line 206, 218, 337:** Излишни `!` null-check оператори върху non-nullable типове. Премахни `!` от тези три места.
  - Адаптирай API endpoint URLs към `/api/v1/` prefix
  - **F11 fix — OCR пълен failure UX:** Добави `OcrFailedState` в BLoC. При total OCR failure (всички провайдери fail-нали), wizard-ът показва:
    ```dart
    // OCR failure screen — в рамките на ocr_wizard_screen.dart
    Column(children: [
      Icon(Icons.camera_off_outlined, size: 64, color: Colors.orange),
      Text('Сканирането не успя'),
      Text('Можете да въведете данните ръчно'),
      ElevatedButton(
        onPressed: () => context.go('/scan/confirm', extra: OcrConfirmationArgs(fields: {}, manualEntry: true)),
        child: Text('Въведи ръчно'),
      ),
      TextButton(onPressed: () => context.pop(), child: Text('Опитай пак')),
    ])
    ```
  - Файл: `branivo-mvp/app/lib/features/ocr/services/` — copy всички services (camera_quality_analyzer, ocr_fallback_orchestrator, ocr_scoring_engine)

- [ ] **Задача 14b: Register screen (F3 fix — липсваща задача)**
  - Файл: `branivo-mvp/app/lib/features/auth/screens/register_screen.dart`
  - Действие: Нов екран. Route `/register` вече е дефиниран в Task 13. Полета:
    - Имейл (задължителен, email validation)
    - Парола (задължителна, min 8 символа, показвай/скривай)
    - Потвърди парола (match validation)
    - Първо и последно ime (задължителни)
    - Телефон (незадължителен)
  - При успех: `POST /api/v1/auth/register` → автоматично login → redirect към `/scan`
  - Дизайн: идентичен стил с LoginScreen (same design tokens: `_kBgColor`, `_kDarkCard`, `_kBlueMid`)
  - Файл: `branivo-mvp/app/test/features/auth/register_screen_test.dart` — тест за form validation и submit

- [ ] **Задача 16: OCR Confirmation screen (нов)**
  - Файл: `branivo-mvp/app/lib/features/ocr/screens/ocr_confirmation_screen.dart`
  - Действие: Показва след успешен OCR scan. Структура:
    - Header: "Разпознахме вашия автомобил" + thumbnail на модела (от vehicle catalog API по make+model)
    - **High confidence (всички полета > 0.9):** показва зелена checkmark анимация (`AnimatedContainer` + `Icons.check_circle`) и текст "Отличен скан!" за 1.5 секунди преди да покаже формата
    - **Low confidence (< 0.7):** полетата се маркират с жълт border (`Color(0xFFFBBF24)`) и warning icon `Icons.warning_amber_rounded`
    - Редактируеми полета (TextFormField): Рег. №, VIN, Марка, Модел, Година, Гориво, Обем
    - Бутон "Продължи към оферти" → `POST /quotes/generate`
    - Бутон "Сканирай отново" → обратно към OCR wizard
  - State: `OcrConfirmationBloc` с events: `FieldUpdated`, `ConfirmTapped`, `RescanTapped`, `HighConfidenceAnimationCompleted`

- [ ] **Задача 17: Quotes List screen**
  - Файл: `branivo-mvp/app/lib/features/quotes/screens/quotes_list_screen.dart`
  - Действие: Списък с карти за всяка оферта. Всяка карта показва:
    - Лого на застрахователя
    - Сума (bold, голям шрифт)
    - "Валидна до" дата
    - Бутон "Избери" → CheckoutScreen
  - Сортирани по цена (ascending). Skeleton loader по време на зареждане.

- [ ] **Задача 18: Checkout screen**
  - Файл: `branivo-mvp/app/lib/features/checkout/screens/checkout_screen.dart`
  - Действие: Summary на избраната оферта + форма за данни ако анонимен потребител:
    - Имена (prefilled от OCR), ЕГН (prefilled), имейл (задължителен — нов за анонимни), телефон
    - Mock payment секция: "Плащане с карта" с фиктивни полета (Номер на карта, CVV, Валидност) — само UI, не се изпраща никъде
    - Бутон "Купи сега" → `POST /policies/purchase`

- [ ] **Задача 19: Policy Success screen**
  - Файл: `branivo-mvp/app/lib/features/checkout/screens/policy_success_screen.dart`
  - Действие:
    - Success animation (AnimatedContainer с checkmark)
    - Номер на полицата (bold)
    - Ако нов потребител: "Изпратихме временна парола на {email}. Влезте в акаунта си."
    - Бутон "Виж полицата" (PDF placeholder за MVP)
    - Бутон "Към начало"

- [ ] **Задача 20: Vehicle Catalog screens**
  - Файл: `branivo-mvp/app/lib/features/vehicle_catalog/screens/vehicle_makes_screen.dart`
  - Действие: Grid с логата на марките. Tap → VehicleModelsScreen.
  - Файл: `branivo-mvp/app/lib/features/vehicle_catalog/screens/vehicle_models_screen.dart`
  - Действие: Хоризонтален scroll с карти на моделите (thumbnail + name + body_type + years).

- [ ] **Задача 21: Insurers screen**
  - Файл: `branivo-mvp/app/lib/features/insurers/screens/insurers_screen.dart`
  - Действие: Списък с лого + name + website бутон. Copy стила от съществуващия insurer detail UI.

- [ ] **Задача 22: Broker Dashboard screen (de-prioritized — MVP minimum)**
  - Файл: `branivo-mvp/app/lib/features/dashboard/screens/dashboard_screen.dart`
  - Действие: Минимален placeholder за MVP. Показва:
    - Заглавие "Брокер Dashboard"
    - Summary карти: брой продадени полици (от API), обща сума
    - Списък с последните 10 полици (policy_number, клиент имейл, застраховател, сума, дата)
    - **Ако няма полици:** "Все още няма продадени полици" placeholder
  - **Приоритет: LAST** — имплементирай след всички останали задачи

#### Фаза 4: Тестове и финализиране

- [ ] **Задача 23: Flutter widget тестове**
  - Файл: `branivo-mvp/app/test/features/auth/login_screen_test.dart` — тест за demo бутони
  - Файл: `branivo-mvp/app/test/features/ocr/ocr_confirmation_screen_test.dart` — тест за field editing, low confidence highlight, и high confidence анимация
  - Файл: `branivo-mvp/app/test/features/quotes/quotes_list_screen_test.dart` — тест за render и sort

- [ ] **Задача 25: E2E интеграционен тест — пълен checkout flow**
  - Файл: `branivo-mvp/app/test/integration/anonymous_checkout_flow_test.dart`
  - Действие: Тества целия анонимен flow с mock API (MockServer или Dio MockAdapter):
    1. `POST /sessions/anonymous` → session token
    2. `POST /ocr/ml-kit` → OCR fields
    3. `POST /quotes/generate` → quotes list
    4. `POST /policies/purchase` → policy created + isNewUser: true
    5. Верифицира: policy number показан, email notification shown
  - **Критично:** Ако checkout flow се счупи → клиент е платил без полица. Тестът е safety net.

- [ ] **Задача 24: Makefile targets**
  - Файл: `Makefile` (root)
  - Действие: Добави:
    ```makefile
    mvp-api-dev: ## Start branivo-mvp API in dev mode
    	cd branivo-mvp/api && npm run start:dev

    mvp-api-test: ## Run branivo-mvp API tests
    	cd branivo-mvp/api && npm run test:cov

    mvp-app-run: ## Run branivo-mvp Flutter app
    	cd branivo-mvp/app && flutter run

    mvp-app-test: ## Run branivo-mvp Flutter tests
    	cd branivo-mvp/app && flutter test

    mvp-seed: ## Seed branivo-mvp database
    	cd branivo-mvp/api && npm run seed
    ```

---

### Acceptance Criteria

- [ ] **AC 1:** Given анонимен потребител, when натисне "Провери цени без акаунт", then се създава анонимна сесия в Redis с TTL 48h и се отваря OCR wizard.

- [ ] **AC 2:** Given OCR wizard е отворен, when потребителят снима предна, задна и лична страна на талона, then се извиква Google Vision API и се попълват полетата (рег. №, VIN, марка, модел, ЕГН, имена).

- [ ] **AC 3:** Given OCR сканирането е завършило, when се показва Confirmation screen, then полетата с confidence < 0.7 са маркирани в жълто и потребителят може да ги редактира преди да продължи.

- [ ] **AC 4:** Given потребителят е потвърдил OCR данните, when натисне "Продължи към оферти", then API генерира 3-5 mock оферти с различни суми от реални БГ застрахователи, сортирани по цена.

- [ ] **AC 5:** Given потребителят е избрал оферта, when попълни имейл и натисне "Купи сега", then:
  - Се генерира mock payment ID
  - Се създава нов потребител с OCR данните ако е анонимен
  - Се създава policy record с уникален номер
  - Анонимната сесия се мигрира към реалния потребител
  - Се изпраща имейл с временна парола

- [ ] **AC 6:** Given покупката е успешна, when се показва Success screen, then се вижда номерът на полицата и съобщение за изпратена парола на имейла.

- [ ] **AC 7:** Given потребителят натисне "Demo Клиент" на login screen, then се логва автоматично с `client@branivo.bg` и се пренасочва към OCR wizard.

- [ ] **AC 8:** Given потребителят натисне "Demo Брокер" на login screen, then се логва автоматично с `broker@branivo.bg` и се пренасочва към broker dashboard с продадените полици.

- [ ] **AC 9:** Given Vehicle Catalog screen, when потребителят тапне марка, then се показват thumbnail-ите на моделите с тяхното body_type и years range.

- [ ] **AC 10:** Given rate limiting, when един IP изпрати > 10 OCR заявки за 60 секунди, then API връща HTTP 429 с `retry_after: 60`.

- [ ] **AC 11:** Given анонимен потребител попълва имейл при checkout, when имейлът вече съществува в системата, then API връща HTTP 409 и Flutter показва "Открихме съществуващ акаунт — влезте, за да завършите покупката" с бутон "Вход".

- [ ] **AC 12:** Given OCR scan с всички полета confidence > 0.9, when се показва Confirmation screen, then green checkmark анимация се изпълнява за 1.5 секунди преди формата да стане активна.

- [ ] **AC 13:** Given OCR scan е напълно неуспешен (всички провайдери fail-нали), when се показва failure screen, then потребителят вижда бутони "Въведи ръчно" (→ Confirmation с празни полета) и "Опитай пак" (→ OCR wizard отначало).

- [ ] **AC 14:** Given временната парола на нов потребител е изтекла (> 72h), when потребителят опита да логне с нея, then API връща грешка "Паролата ви е изтекла" с инструкция да използва "Забравена парола".

---

## Additional Context

### Dependencies

**NestJS API (`branivo-mvp/api`):**
- `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt` — auth
- `@nestjs/typeorm`, `typeorm`, `pg` — database
- `ioredis` — Redis анонимни сесии + rate limiting
- `@google-cloud/vision` — OCR primary provider
- `nodemailer` — email с временна парола
- `bcrypt` — password hashing
- `class-validator`, `class-transformer` — DTO validation

**Flutter App (`branivo-mvp/app`):**
- `flutter_bloc` — state management
- `go_router` — navigation
- `dio` — HTTP client
- `image_picker` — camera/gallery
- `google_mlkit_text_recognition` — on-device OCR fallback
- `camera` — camera preview в OCR wizard
- `cached_network_image` — lazy loading на vehicle images

**External Services:**
- Google Cloud Vision API — OCR (нужен API key)
- SMTP или AWS SES — email доставка
- **Third-party image CDNs (F7 fix — без собствен CDN):** carlogos.org за лога на марки, Wikipedia Commons за снимки на модели. Без setup — URLs са директни в seed данните.

### Testing Strategy

**КРИТИЧНО ПРАВИЛО: Тестове се пишат ЗАЕДНО с имплементацията — не след нея.**
- Всяка NestJS задача: unit тест за Service + интеграционен тест за Controller се пишат в СЪЩИЯ commit като имплементацията
- Всяка Flutter задача: widget тест се пише в СЪЩИЯ commit като screen-а
- `npm run test:cov` и `flutter test` трябва да минават преди всеки commit
- Никога не се натрупват незатестени функционалности

**Performance изисквания:**
- OCR scan response (Google Vision): < 3 секунди
- Quotes generation: < 500ms (mock — трябва да е instant)
- Login/Auth endpoints: < 200ms
- Vehicle catalog list (cached): < 100ms — Redis cache с TTL 1h за `GET /vehicle-catalog/makes`
- Policy purchase endpoint: < 1 секунда (без email delivery)
- Flutter app cold start: < 2 секунди на mid-range устройство

**Caching стратегия за performance:**
- `GET /vehicle-catalog/makes` → Redis cache, TTL 1h (static data)
- `GET /insurers` → Redis cache, TTL 24h
- `GET /quotes/:id` → НЕ се кешира (per-session)

**Unit тестове (NestJS) — пишат се в СЪЩИЯ commit:**
- `AuthService` — login, register, token refresh
- `SessionsService` — create, get, update, migrate
- `OcrService` — rate limiting, scan, ML Kit report
- `QuotesService` — mock quote generation с `deterministic: true`
- `PoliciesService` — checkout flow, duplicate email check, user creation, email trigger

**Widget тестове (Flutter) — пишат се в СЪЩИЯ commit:**
- `LoginScreen` — demo buttons fill credentials и submit
- `OcrConfirmationScreen` — low confidence highlight, high confidence анимация, field edit
- `QuotesListScreen` — render cards, sort by price, select quote

**Интеграционни тестове:**
- `anonymous_checkout_flow_test.dart` — пълен E2E flow с mock API (Задача 25)

**Manual тест сценарии:**
1. Пълен анонимен flow: Scan → Confirm → Quotes → Checkout → Success → Check email
2. Authenticated flow: Login → Scan → Confirm → Quotes → Checkout → Success
3. Demo Клиент бутон → OCR wizard се отваря директно
4. Demo Брокер бутон → Dashboard се отваря с полици
5. Rate limit тест: 11 OCR заявки в рамките на 60 секунди
6. Duplicate email тест: опит за покупка с вече съществуващ имейл

### Notes

**Рискове:**
- Google Vision API key трябва да е конфигуриран преди OCR да работи — без него само ML Kit fallback
- Email delivery за временната парола зависи от SMTP конфигурация — трябва `.env` setup преди тест
- `branivo_mvp` PostgreSQL schema трябва да е създадена преди миграциите: `CREATE SCHEMA IF NOT EXISTS branivo_mvp;` (вече е в миграция 001)
- **EGN_ENCRYPTION_KEY** трябва да е генериран и в `.env` преди `npm run start:dev`: `openssl rand -hex 32`
- Third-party CDN URLs (carlogos.org, Wikipedia Commons) могат да се счупят — добави `errorWidget` в `CachedNetworkImage` с fallback иконка
- Ако `AppModule` imports не са почистени след Task 1 (copy-first), `npm run build` ще fail-не веднага

**Бъдещи итерации (извън MVP обхвата):**
- Реален Stripe payment
- PDF генериране на полицата
- Push notifications при изтичаща полица
- Пълен автокаталог (всички марки/модели)
- KAT API интеграция за VIN валидация
- 2FA опционално за брокери
