# Story 11.13: Cookie Policy Banner

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a краен клиент (и анонимен потребител),
I want да виждам банер за cookie/съгласие при първото стартиране на приложението с опции за гранулярен избор (необходими / аналитични / маркетингови),
so that Branivo спазва GDPR чл. 7 изискванията за условията за съгласие и всеки брокер-тенант може да представи своята Cookie Policy под собствения си бранд.

## Acceptance Criteria

### AC1 — `tenant_cookie_policies` таблицата съществува с правилна схема

**Given** миграцията е изпълнена,
**When** `tenant_cookie_policies` таблицата се провери,
**Then** съдържа: `id` (UUID PK DEFAULT gen_random_uuid()), `tenant_id` (UUID NOT NULL FK → tenants.id), `version` (INTEGER NOT NULL), `content` (TEXT NOT NULL — markdown), `language` (VARCHAR(5) NOT NULL DEFAULT `'bg'`), `is_published` (BOOLEAN NOT NULL DEFAULT false), `published_at` (TIMESTAMPTZ NULL), `created_by` (UUID NULL FK → users.id), `created_at` (TIMESTAMPTZ DEFAULT NOW()), `updated_at` (TIMESTAMPTZ DEFAULT NOW()), `deleted_at` (TIMESTAMPTZ NULL); UNIQUE constraint `uq_cookie_policy_tenant_version_lang` на `(tenant_id, version, language)`; index на `(tenant_id, language, is_published, version DESC)` за public lookup.

### AC2 — `cookie_consent_records` таблицата съществува с правилна схема

**Given** миграцията е изпълнена,
**When** `cookie_consent_records` таблицата се провери,
**Then** съдържа: `id` (UUID PK DEFAULT gen_random_uuid()), `tenant_id` (UUID NOT NULL), `client_id` (UUID NULL FK → end_clients.id ON DELETE SET NULL), `necessary` (BOOLEAN NOT NULL DEFAULT true), `analytics` (BOOLEAN NOT NULL DEFAULT false), `marketing` (BOOLEAN NOT NULL DEFAULT false), `functional` (BOOLEAN NOT NULL DEFAULT false), `policy_version` (INTEGER NULL — версията на политиката в момента на съгласие), `ip_address` (VARCHAR(45) NULL), `user_agent` (TEXT NULL), `consented_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()), `created_at` (TIMESTAMPTZ DEFAULT NOW()), `updated_at` (TIMESTAMPTZ DEFAULT NOW()); UNIQUE constraint `uq_cookie_consent_tenant_client` на `(tenant_id, client_id)` WHERE `client_id IS NOT NULL`.

### AC3 — Брокерът може да създаде нова Cookie Policy версия (draft)

**Given** автентициран брокер с роля `broker_admin` прави `POST /api/v1/tenants/cookie-policy`,
**When** тялото съдържа `{ content: "...", language: "bg" }`,
**Then** се създава нов запис с `is_published = false`; `version` се auto-increment-ва като `MAX(version) + 1` за тенанта и езика (или `1` ако няма); отговорът съдържа `{ id, version, is_published, created_at }`.

### AC4 — Брокерът може да публикува Cookie Policy версия

**Given** съществува draft с `is_published = false`,
**When** брокерът прави `PUT /api/v1/tenants/cookie-policy/:id/publish`,
**Then** записът се обновява с `is_published = true` и `published_at = NOW()`; предишните published версии за същия tenant+language **не** се деактивират (историята се пази); в `audit_log` се записва `{ action: 'cookie_policy.published', entityType: 'tenant_cookie_policy', entityId, tenantId, userId }`; статус 200.

### AC5 — Публичен endpoint връща текущата (последна публикувана) Cookie Policy

**Given** тенант с поне една публикувана Cookie Policy на `bg`,
**When** анонимна заявка `GET /api/v1/public/cookie-policy?lang=bg` (с Host header за тенанта),
**Then** се връща `{ id, version, content, language, published_at }` — версията с най-висок `version` при `is_published = true`; статус 200; **без JWT изисквания**.

### AC6 — 404 при липсваща публикувана Cookie Policy

**Given** тенант **без** публикувана Cookie Policy,
**When** `GET /api/v1/public/cookie-policy`,
**Then** се връща `404 Not Found` с `{ error: 'COOKIE_POLICY_NOT_FOUND' }`.

### AC7 — Broker Admin може да листи всички Cookie Policy версии за своя тенант

**Given** автентициран `broker_admin`,
**When** `GET /api/v1/tenants/cookie-policy`,
**Then** се връщат всички версии (published + draft) за тенанта, сортирани `version DESC`; друг тенант **не** вижда тези данни (tenant isolation).

### AC8 — Краен клиент може да запази своите cookie consent choices

**Given** автентициран краен клиент прави `POST /api/v1/clients/cookie-consent`,
**When** тялото съдържа `{ necessary: true, analytics: boolean, marketing: boolean, functional: boolean }`,
**Then** се UPSERT-ва запис в `cookie_consent_records` с `client_id`, `tenant_id`, `consented_at = NOW()`, `ip_address` (от X-Forwarded-For), `user_agent` (от User-Agent header), `policy_version` (текущата published version); `necessary` се форсира на `true` независимо от входа; ако записът вече съществува за `(tenant_id, client_id)` — UPDATE всички полета; отговорът: `{ saved: true, consented_at: <iso> }`.

### AC9 — Краен клиент може да прочете текущите си cookie consent choices

**Given** автентициран краен клиент прави `GET /api/v1/clients/cookie-consent`,
**When** заявката е обработена,
**Then** се връща `{ necessary: true, analytics: boolean, marketing: boolean, functional: boolean, consented_at: string | null, policyVersion: number | null }`; ако клиентът **няма** запис — `consented_at: null` и всички optional категории `false`.

### AC10 — Flutter: Cookie consent банерът се показва при първо стартиране

**Given** нов потребител (или потребител без локален consent record) стартира приложението,
**When** приложението зарежда,
**Then** се показва `CookieConsentBanner` като bottom sheet **преди** основния content; банерът показва: кратко обяснение за cookie/tracking, линк към "Cookie Policy", три секции с toggles (Необходими — заключен/винаги ON, Аналитични — toggle, Маркетингови — toggle); два бутона: "Приеми всички" и "Запази избора ми"; банерът е **dismissible само** чрез натискане на бутон (не може да се затвори с swipe или tap извън него).

### AC11 — Flutter: Consent се запазва локално в Hive и не се показва отново

**Given** потребителят е дал своето съгласие (натиснал е бутон),
**When** приложението се затвори и стартира отново,
**Then** `CookieConsentBanner` **не** се показва отново; локалният Hive запис `cookie_consent` съдържа `{ necessary: true, analytics: bool, marketing: bool, functional: bool, consentedAt: ISO string }`; ако потребителят е логнат — конфигурацията се синхронизира с `POST /api/v1/clients/cookie-consent`.

### AC12 — Flutter: Аналитични функции се активират само при дадено consent

**Given** потребителят е дал `analytics: false`,
**When** приложението извърши analytics tracking операция,
**Then** операцията се **пропуска** тихо; `CookieConsentService.canTrackAnalytics` връща `false`; аналогично за marketing: `CookieConsentService.canUseMarketing`.

### AC13 — Flutter: "Настройки на бисквитките" е достъпно от Settings

**Given** потребителят вече е дал съгласие,
**When** навигира до Settings (или Profile → Настройки на поверителността),
**Then** вижда опция "Настройки на бисквитките"; при натискане се отваря `CookieConsentSheet` с текущите mu предпочитания предзаредени; може да ги промени и запази; при запазване — Hive се обновява и (ако логнат) backend се синхронизира.

### AC14 — Flutter: CookiePolicyScreen показва текущата Cookie Policy

**Given** потребителят натисне линка "Cookie Policy" в банера или в Settings,
**When** `CookiePolicyScreen` се зареди,
**Then** показва съдържанието от `GET /api/v1/public/cookie-policy?lang=bg` като `SelectableText`; при грешка/404 показва placeholder съобщение "Cookie Policy не е налична в момента"; AppBar с бутон "Назад".

### AC15 — Seed: demo тенантът има стандартна публикувана Cookie Policy на старт

**Given** `NODE_ENV !== 'production'` и `npm run dev`,
**When** `seed.service.ts` се изпълни,
**Then** demo тенантът има поне 1 публикувана Cookie Policy версия на `bg` с placeholder GDPR-съвместимо съдържание: секции „Какво са бисквитките", „Видове бисквитки (Необходими / Аналитични / Маркетингови / Функционални)", „Как да управлявате предпочитанията си", „Свържете се с нас".

### AC16 — Unit тестове покриват service логиката

**Given** `CookiePolicyService` и `CookieConsentService` са имплементирани,
**When** `npm run test:cov` се изпълни,
**Then** следните случаи са покрити: create draft → version auto-increment; publish → `published_at` се записва; getPublished → хвърля `NotFoundException('COOKIE_POLICY_NOT_FOUND')` при липса; saveConsent → UPSERT, `necessary` форсиран на `true`; getConsent → `{ analytics: false, ... }` при липсващ запис; tenant isolation (mock за грешен тенант → 0 резултати); audit_log entry при publish.

### AC17 — Lint, build и тестове минават без грешки

**Given** имплементацията е завършена,
**When** се изпълнят `npm run lint && npm run test:cov && npm run build` и `flutter analyze --no-fatal-infos && flutter test`,
**Then** 0 lint errors, 0 warnings; всички тестове минават; build успешен.

---

## Tasks / Subtasks

- [x] **Task 1: DB Migration — tenant_cookie_policies** (AC1)
  - [x] 1.1 Създай `branivo-api/src/infrastructure/database/migrations/1710000063000-CreateCookiePoliciesAndConsents.ts`
  - [x] 1.2 CREATE TABLE `tenant_cookie_policies`: `id UUID PK DEFAULT gen_random_uuid()`, `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, `version INTEGER NOT NULL`, `content TEXT NOT NULL`, `language VARCHAR(5) NOT NULL DEFAULT 'bg'`, `is_published BOOLEAN NOT NULL DEFAULT false`, `published_at TIMESTAMPTZ NULL`, `created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`, `deleted_at TIMESTAMPTZ NULL`
  - [x] 1.3 UNIQUE constraint `uq_cookie_policy_tenant_version_lang` на `(tenant_id, version, language)`
  - [x] 1.4 Index `idx_cookie_policy_public_lookup` на `(tenant_id, language, is_published, version DESC)`

- [x] **Task 2: DB Migration — cookie_consent_records** (AC2) — в СЪЩАТА migration (1710000063000)
  - [x] 2.1 CREATE TABLE `cookie_consent_records`: `id UUID PK DEFAULT gen_random_uuid()`, `tenant_id UUID NOT NULL`, `client_id UUID NULL REFERENCES end_clients(id) ON DELETE SET NULL`, `necessary BOOLEAN NOT NULL DEFAULT true`, `analytics BOOLEAN NOT NULL DEFAULT false`, `marketing BOOLEAN NOT NULL DEFAULT false`, `functional BOOLEAN NOT NULL DEFAULT false`, `policy_version INTEGER NULL`, `ip_address VARCHAR(45) NULL`, `user_agent TEXT NULL`, `consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
  - [x] 2.2 UNIQUE constraint `uq_cookie_consent_tenant_client` на `(tenant_id, client_id)` WHERE `client_id IS NOT NULL` (partial unique index)
  - [x] 2.3 Index `idx_cookie_consent_client_lookup` на `(client_id, tenant_id)`

- [x] **Task 3: TypeORM Entity — TenantCookiePolicy** (AC1)
  - [x] 3.1 Създай `branivo-api/src/modules/compliance/entities/tenant-cookie-policy.entity.ts`
  - [x] 3.2 Анотирай с `@Entity({ name: 'tenant_cookie_policies' })`; всички колони с правилни TypeORM типове
  - [x] 3.3 `@ManyToOne(() => Tenant)` + `@JoinColumn({ name: 'tenant_id' })`

- [x] **Task 4: TypeORM Entity — CookieConsentRecord** (AC2)
  - [x] 4.1 Създай `branivo-api/src/modules/compliance/entities/cookie-consent-record.entity.ts`
  - [x] 4.2 Анотирай с `@Entity({ name: 'cookie_consent_records' })`; всички колони: `id`, `tenantId`, `clientId`, `necessary`, `analytics`, `marketing`, `functional`, `policyVersion`, `ipAddress`, `userAgent`, `consentedAt`, `createdAt`, `updatedAt`
  - [x] 4.3 `@ManyToOne(() => EndClient, { nullable: true })` + `@JoinColumn({ name: 'client_id' })`

- [x] **Task 5: DTOs** (AC3–AC9)
  - [x] 5.1 `create-cookie-policy.dto.ts`: `content: string` (IsNotEmpty), `language: string` (IsIn(['bg', 'en']), default 'bg')
  - [x] 5.2 `cookie-policy-response.dto.ts`: `id`, `version`, `content`, `language`, `isPublished`, `publishedAt`, `createdAt`
  - [x] 5.3 `save-cookie-consent.dto.ts`: `necessary: boolean` (IsBoolean), `analytics: boolean` (IsBoolean), `marketing: boolean` (IsBoolean), `functional: boolean` (IsBoolean)
  - [x] 5.4 `cookie-consent-response.dto.ts`: `necessary: boolean`, `analytics: boolean`, `marketing: boolean`, `functional: boolean`, `consentedAt: string | null`, `policyVersion: number | null`

- [x] **Task 6: CookiePolicyService** (AC3–AC7)
  - [x] 6.1 Файл: `branivo-api/src/modules/compliance/cookie-policy.service.ts`
  - [x] 6.2 `create(dto, userId)`: `MAX(version) + 1` или `1` ако няма; INSERT с `is_published = false`; tenant-scoped
  - [x] 6.3 `publish(id, userId)`: намери по id с `TenantContext.getTenantId()` scope; UPDATE `is_published=true`, `published_at=NOW()`; emit audit_log: `{ action: 'cookie_policy.published', entityType: 'tenant_cookie_policy', entityId: id, tenantId, userId }`
  - [x] 6.4 `getPublished(language)`: `WHERE tenant_id = ctx AND is_published=true AND language=lang ORDER BY version DESC LIMIT 1`; хвърля `NotFoundException('COOKIE_POLICY_NOT_FOUND')` ако няма
  - [x] 6.5 `findAll()`: `WHERE tenant_id = ctx AND deleted_at IS NULL ORDER BY version DESC`

- [x] **Task 7: CookieConsentService** (AC8, AC9)
  - [x] 7.1 Файл: `branivo-api/src/modules/compliance/cookie-consent.service.ts`
  - [x] 7.2 `saveConsent(clientId, dto, ipAddress, userAgent)`: форсирай `necessary = true`; зареди текущата published policy version за `policyVersion`; UPSERT в `cookie_consent_records` — `INSERT ... ON CONFLICT (tenant_id, client_id) WHERE client_id IS NOT NULL DO UPDATE SET analytics=..., marketing=..., functional=..., policy_version=..., consented_at=NOW(), ip_address=..., user_agent=..., updated_at=NOW()`; tenant-scoped чрез `TenantContext.getTenantId()`
  - [x] 7.3 `getConsent(clientId)`: намери запис по `(tenant_id, client_id)`; ако не съществува — върни `{ necessary: true, analytics: false, marketing: false, functional: false, consentedAt: null, policyVersion: null }`

- [x] **Task 8: CookiePolicyController (Admin)** (AC3, AC4, AC7)
  - [x] 8.1 Файл: `branivo-api/src/modules/compliance/cookie-policy.controller.ts`
  - [x] 8.2 `POST /api/v1/tenants/cookie-policy` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('broker_admin')`
  - [x] 8.3 `PUT /api/v1/tenants/cookie-policy/:id/publish` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('broker_admin')`
  - [x] 8.4 `GET /api/v1/tenants/cookie-policy` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('broker_admin', 'broker_agent')`

- [x] **Task 9: CookiePolicyPublicController** (AC5, AC6)
  - [x] 9.1 Файл: `branivo-api/src/modules/compliance/cookie-policy-public.controller.ts`
  - [x] 9.2 `GET /api/v1/public/cookie-policy` — **БЕЗ auth guard**; query param `lang` (default: `bg`); тенантът от `TenantContext` (Host header)
  - [x] 9.3 Аналогично на `PrivacyPolicyPublicController` — `@Controller('api/v1/public')` prefix

- [x] **Task 10: CookieConsentClientController** (AC8, AC9)
  - [x] 10.1 Файл: `branivo-api/src/modules/compliance/cookie-consent-client.controller.ts`
  - [x] 10.2 `POST /api/v1/clients/cookie-consent` — `@UseGuards(JwtClientAuthGuard)` (или ClientAuthGuard — провери auth/sessions модула); взима `clientId` от JWT payload; извлича `X-Forwarded-For` и `User-Agent` header
  - [x] 10.3 `GET /api/v1/clients/cookie-consent` — `@UseGuards(JwtClientAuthGuard)` — връща текущи consent choices

- [x] **Task 11: Регистрация в ComplianceModule** (AC3–AC9)
  - [x] 11.1 Добави `TenantCookiePolicy` и `CookieConsentRecord` в `TypeOrmModule.forFeature([...])`
  - [x] 11.2 Добави `CookiePolicyService`, `CookieConsentService`, `CookiePolicyController`, `CookiePolicyPublicController`, `CookieConsentClientController` в `ComplianceModule`
  - [x] 11.3 `ComplianceModule` е вече `@Global()` и в `AppModule` — **не дублирай**

- [x] **Task 12: Seed данни** (AC15)
  - [x] 12.1 В `seed.service.ts` добави метод `seedCookiePolicy()`
  - [x] 12.2 Placeholder markdown съдържание на български — секции: „Какво са бисквитките", „Необходими бисквитки (винаги активни)", „Аналитични бисквитки (по избор)", „Маркетингови бисквитки (по избор)", „Функционални бисквитки (по избор)", „Как да управлявате предпочитанията си", „Свържете се с нас"
  - [x] 12.3 `ON CONFLICT (tenant_id, version, language) DO NOTHING` — идемпотентно
  - [x] 12.4 Извикай `seedCookiePolicy()` от `onApplicationBootstrap()`

- [x] **Task 13: Flutter — API Endpoints** (AC10, AC14)
  - [x] 13.1 В `branivo_app/lib/core/api/endpoints.dart` добави:
    - `static String cookiePolicy({String lang = 'bg'}) => '$_baseUrl/api/v1/public/cookie-policy?lang=$lang';`
    - `static String get cookieConsentSave => '$_baseUrl/api/v1/clients/cookie-consent';`
    - `static String get cookieConsentGet => '$_baseUrl/api/v1/clients/cookie-consent';`

- [x] **Task 14: Flutter — CookiePolicyService (data layer)** (AC10, AC14)
  - [x] 14.1 Създай `branivo_app/lib/features/compliance/data/cookie_policy_service.dart`
  - [x] 14.2 Клас `CookiePolicyData { version, content, language, publishedAt }` — аналогично на `PrivacyPolicyData`
  - [x] 14.3 Метод `fetchPublished({String lang = 'bg'})` — GET `ApiEndpoints.cookiePolicy(lang: lang)`; `skipAuth: true`

- [x] **Task 15: Flutter — CookieConsentService (data + local storage)** (AC10–AC13)
  - [x] 15.1 Създай `branivo_app/lib/features/compliance/data/cookie_consent_service.dart`
  - [x] 15.2 Hive box `'cookie_consent'`; ключове: `'necessary'`, `'analytics'`, `'marketing'`, `'functional'`, `'consentedAt'`
  - [x] 15.3 `Future<bool> hasGivenConsent()` → проверява дали `'consentedAt'` съществува в Hive
  - [x] 15.4 `Future<void> saveConsent({ required bool analytics, required bool marketing, bool functional = false })` → записва в Hive с `consentedAt = DateTime.now().toIso8601String()`; ако `dio` е наличен и потребителят е логнат — POST към `ApiEndpoints.cookieConsentSave`
  - [x] 15.5 `bool get canTrackAnalytics` → `Hive.box('cookie_consent').get('analytics', defaultValue: false) as bool`
  - [x] 15.6 `bool get canUseMarketing` → `Hive.box('cookie_consent').get('marketing', defaultValue: false) as bool`
  - [x] 15.7 `Map<String, dynamic> getCurrentConsent()` → връща текущите стойности от Hive

- [x] **Task 16: Flutter — CookiePolicyScreen** (AC14)
  - [x] 16.1 Създай `branivo_app/lib/features/compliance/presentation/screens/cookie_policy_screen.dart`
  - [x] 16.2 Аналогично на `PrivacyPolicyScreen` — `StatefulWidget` с `FutureBuilder<CookiePolicyData>`
  - [x] 16.3 При грешка/404: центрирано съобщение "Cookie Policy не е налична в момента." + icon
  - [x] 16.4 AppBar title: `'Cookie Policy'`

- [x] **Task 17: Flutter — CookieConsentSheet (bottom sheet widget)** (AC10, AC11, AC13)
  - [x] 17.1 Създай `branivo_app/lib/features/compliance/presentation/widgets/cookie_consent_sheet.dart`
  - [x] 17.2 Показва се като `showModalBottomSheet(isDismissible: false, enableDrag: false, ...)`
  - [x] 17.3 Съдържание:
    - Заглавие: "Настройки на бисквитките"
    - Кратък текст (2-3 изречения) за използването на cookies/tracking
    - Линк "[Cookie Policy]" → navigate to `CookiePolicyScreen`
    - `SwitchListTile` — "Необходими" (disabled, value: true) + subtitle "Необходими за работата на приложението"
    - `SwitchListTile` — "Аналитични" (enabled, mutable) + subtitle "Помагат ни да подобряваме приложението"
    - `SwitchListTile` — "Маркетингови" (enabled, mutable) + subtitle "Персонализирани предложения и новини"
    - `SwitchListTile` — "Функционални" (enabled, mutable) + subtitle "Запомняне на предпочитания"
    - Бутон "Приеми всички" (primary) → saveConsent(all true) → close sheet
    - Бутон "Запази избора ми" (outlined) → saveConsent с текущите toggles → close sheet
  - [x] 17.4 При натискане на бутон → `CookieConsentService.saveConsent(...)` → `Navigator.pop(context)`

- [x] **Task 18: Flutter — AppRouter/main integration** (AC10)
  - [x] 18.1 В `app_router.dart` (или в main `AppWidget`) след инициализация на Hive → провери `CookieConsentService.hasGivenConsent()`
  - [x] 18.2 Ако `false` → след показване на основния screen, извикай `showModalBottomSheet` с `CookieConsentSheet`
  - [x] 18.3 Показвай банера само веднъж — след като потребителят е дал consent, повторно стартиране **не** показва банера
  - [x] 18.4 Банерът се показва на **всички** основни screens (не само при login) — и за анонимни, и за логнати потребители

- [x] **Task 19: Flutter — Settings integration** (AC13)
  - [x] 19.1 В `branivo_app/lib/features/settings/` (или Profile/Settings screen) добави `ListTile` — "Настройки на бисквитките"
  - [x] 19.2 При натискане → `showModalBottomSheet` с `CookieConsentSheet` (предзаредени текущите стойности)

- [x] **Task 20: NestJS Unit тестове** (AC16)
  - [x] 20.1 `cookie-policy.service.spec.ts` — тестове: create → version auto-increment; publish → `published_at` записан; getPublished → MAX(version) при is_published=true; getPublished → хвърля NotFoundException; tenant isolation; audit_log entry при publish
  - [x] 20.2 `cookie-consent.service.spec.ts` — тестове: saveConsent → `necessary` форсиран на true; saveConsent → UPSERT (втори запис не дублира); getConsent → default values при липса; getConsent → правилни стойности при наличен запис
  - [x] 20.3 `cookie-policy.controller.spec.ts` — integration тест за admin endpoints (create, publish, list)

---

## Dev Notes

### Архитектурни изисквания (ЗАДЪЛЖИТЕЛНО)

- **НИКОГА** не правиш DB заявка без `tenant_id` scope → `TenantContext.getTenantId()` навсякъде
- **НИКОГА** не предаваш `tenantId` като функционален параметър — само чрез `TenantContext`
- `audit_log` е IMMUTABLE — само INSERT, никога UPDATE/DELETE
- `cookie_consent_records.necessary` се форсира на `true` в service слоя — никога не пропускай

### Структура на файловете

**NestJS backend** (в `branivo-api/src/modules/compliance/`):
```
entities/
  tenant-cookie-policy.entity.ts      ← нов
  cookie-consent-record.entity.ts     ← нов
dto/
  create-cookie-policy.dto.ts         ← нов
  cookie-policy-response.dto.ts       ← нов
  save-cookie-consent.dto.ts          ← нов
  cookie-consent-response.dto.ts      ← нов
cookie-policy.service.ts              ← нов
cookie-policy.service.spec.ts         ← нов
cookie-consent.service.ts             ← нов
cookie-consent.service.spec.ts        ← нов
cookie-policy.controller.ts           ← нов
cookie-policy-public.controller.ts    ← нов
cookie-consent-client.controller.ts   ← нов
cookie-policy.controller.spec.ts      ← нов
compliance.module.ts                  ← UPDATE (добави нови entities/services/controllers)
```

**Flutter** (в `branivo_app/lib/features/compliance/`):
```
data/
  cookie_policy_service.dart          ← нов
  cookie_consent_service.dart         ← нов
presentation/
  screens/
    cookie_policy_screen.dart         ← нов
  widgets/
    cookie_consent_sheet.dart         ← нов (StatefulWidget)
```

**Също:**
- `branivo_app/lib/core/api/endpoints.dart` — добави cookiePolicy, cookieConsentSave, cookieConsentGet endpoints
- `branivo-api/src/infrastructure/database/seed.service.ts` — добави `seedCookiePolicy()`
- `branivo-api/src/infrastructure/database/migrations/1710000063000-CreateCookiePoliciesAndConsents.ts` — нов

### Patterns от предишни stories (следвай точно)

**NestJS Service Pattern** — следвай `PrivacyPolicyService` от `privacy-policy.service.ts`:
```typescript
// Tenant scope — ЗАДЪЛЖИТЕЛНО
const tenantId = this.tenantContext.getTenantId();

// Auto-increment version
const maxVersionResult = await this.repo
  .createQueryBuilder('p')
  .select('MAX(p.version)', 'max')
  .where('p.tenantId = :tenantId AND p.language = :language', { tenantId, language })
  .getRawOne<{ max: number | null }>();
const nextVersion = (maxVersionResult?.max ?? 0) + 1;

// Audit log emit
await this.auditLogService.log({
  action: 'cookie_policy.published',
  entityType: 'tenant_cookie_policy',
  entityId: id,
  tenantId,
  userId,
});
```

**Public Controller Pattern** — следвай `PrivacyPolicyPublicController`:
```typescript
@Controller('api/v1/public')
export class CookiePolicyPublicController {
  @Get('cookie-policy')
  async getPublished(@Query('lang') lang = 'bg') {
    return this.cookiePolicyService.getPublished(lang);
  }
}
```

**Flutter Service Pattern** — следвай `PrivacyPolicyService` от `privacy_policy_service.dart`:
```dart
final response = await _dio.get<Map<String, dynamic>>(
  ApiEndpoints.cookiePolicy(lang: lang),
  options: Options(
    headers: {'Authorization': null},
    extra: {'skipAuth': true},
  ),
);
```

**Flutter Local Storage** — Hive е вече в `pubspec.yaml` (`hive: ^2.2.3`, `hive_flutter: ^1.1.0`); провери дали `Hive.openBox('cookie_consent')` е отворен в `main.dart` / bootstrap; ако не — отвори при нужда в `CookieConsentService`.

**ВНИМАНИЕ — НЕ ДОБАВЯЙ нови Flutter пакети без одобрение.** `shared_preferences` НЕ е в `pubspec.yaml` — използвай `hive` за local persistence. `flutter_markdown` НЕ е в `pubspec.yaml` — използвай `SelectableText` за cookie policy content (аналогично на `PrivacyPolicyScreen`).

### TypeScript — Забранен `any` тип

```typescript
// ГРЕШНО:
const result: any = await this.repo.findOne(...);

// ПРАВИЛНО:
const result = await this.repo.findOne<TenantCookiePolicy>({
  where: { id, tenantId }
});
```

За `Object.entries`:
```typescript
const entries: [string, boolean][] = Object.entries(dto);
```

За supertest в тестове:
```typescript
const body = res.body as CookiePolicyResponseDto;
```

### Guard за client endpoints

Провери в `branivo-api/src/modules/auth/` (или sessions модула) кой guard защитава client endpoints:
- Story 11-11: PrivacyPolicyController използва `JwtAuthGuard` + `RolesGuard` за broker endpoints
- Story 11-12: TosClientController използва `JwtClientAuthGuard` (или `ClientAuthGuard`) за client endpoints
- Последвай **същия** pattern от story 11-12 за `CookieConsentClientController` — провери `tos-client.controller.ts` (ако вече е имплементиран) или auth модула

### GDPR и IAB TCF 2.2 бележки

- IAB TCF 2.2 е стандарт за **web browsers** с CMP (Consent Management Platform); за Flutter mobile app прилагаме еквивалентен GDPR чл. 7 compliant consent
- Consent категориите са алайнирани с IAB Purposes: Необходими (Purpose 1), Аналитични (Purpose 7-8), Маркетингови (Purpose 3-4), Функционални (Purpose 2)
- `necessary` се форсира на `true` на backend — не може да се откаже; UI-ят показва disabled toggle
- Consent трябва да е **freely given, specific, informed, and unambiguous** (GDPR чл. 7) — банерът не е pre-checked за optional categories
- Пълна TCF 2.2 SDK интеграция (с CMP) е Phase 2 enhancement — извън scope на тази story

### Compliance Module — текущо съдържание

Преди тази story, `ComplianceModule` съдържа:
- `TenantPrivacyPolicy` entity
- `PrivacyPolicyService`, `PrivacyPolicyController`, `PrivacyPolicyPublicController`
- `PiiRegistryService`

Story 11-12 (ToS) добавя: `TenantTosVersion`, `EndClientTosAcceptance`, `TosService`, etc.

**Тази story добавя** Cos бисквитките entities и controllers — следвай точно същия pattern.

### Project Structure Notes

- Alignment: всички нови файлове в `branivo-api/src/modules/compliance/` (NestJS) и `branivo_app/lib/features/compliance/` (Flutter)
- Naming: `cookie-policy` prefix за NestJS файлове; `cookie_policy` / `cookie_consent` за Flutter файлове
- Migration: `1710000063000` — следваща след `1710000061000-CreateTenantPrivacyPolicies.ts` (story 11-11) и планираната `1710000062000` на story 11-12

### References

- Privacy Policy pattern: `branivo-api/src/modules/compliance/privacy-policy.service.ts` [Source: codebase]
- Public controller pattern: `branivo-api/src/modules/compliance/privacy-policy-public.controller.ts` [Source: codebase]
- Flutter service pattern: `branivo_app/lib/features/compliance/data/privacy_policy_service.dart` [Source: codebase]
- Flutter screen pattern: `branivo_app/lib/features/compliance/presentation/screens/privacy_policy_screen.dart` [Source: codebase]
- API endpoints pattern: `branivo_app/lib/core/api/endpoints.dart` [Source: codebase]
- ComplianceModule registration: `branivo-api/src/modules/compliance/compliance.module.ts` [Source: codebase]
- Seed pattern: `branivo-api/src/infrastructure/database/seed.service.ts` [Source: codebase]
- Hive packages available: `pubspec.yaml` — hive ^2.2.3, hive_flutter ^1.1.0 [Source: codebase]
- Architecture decision — no cookies in session storage: `_bmad-output/planning-artifacts/architecture.md#L109` [Source: architecture.md]
- Story 11-11 (Privacy Policy) — base pattern established: `_bmad-output/implementation-artifacts/11-11-privacy-policy-white-label.md` [Source: implementation-artifacts]
- Story 11-12 (ToS) — client auth guard pattern, Hive ToS acceptance: `_bmad-output/implementation-artifacts/11-12-terms-of-service-version-tracking.md` [Source: implementation-artifacts]
- Sprint-status: Epic 11 Wave 1 dependency order: 11-1 → 11-11 → 11-12 → 11-13 → 11-4 → 11-16 [Source: sprint-status.yaml]
- GDPR чл. 7 — условия за съгласие: freely given, specific, informed, unambiguous [Legal requirement]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
