# Story 11.11: Privacy Policy White-Label

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Broker (и платформата),
I want всеки тенант да има собствена, версионирана Privacy Policy достъпна на публичен URL без автентикация,
so that Branivo спазва GDPR чл. 13 изискванията за информиране на субектите при събиране на лични данни и всеки брокер-тенант може да представи своята Политика за поверителност под собствения си бранд.

## Acceptance Criteria

### AC1 — Privacy Policy таблицата съществува с правилна схема

**Given** миграцията е изпълнена,
**When** `tenant_privacy_policies` таблицата се провери,
**Then** съдържа: `id` (UUID PK), `tenant_id` (FK → tenants.id), `version` (INTEGER), `content` (TEXT — markdown), `language` (VARCHAR(5), default `'bg'`), `is_published` (BOOLEAN, default false), `published_at` (TIMESTAMPTZ nullable), `created_by` (UUID nullable FK → users.id), `created_at`, `updated_at`, `deleted_at`; UNIQUE constraint на `(tenant_id, version, language)`.

### AC2 — Брокерът може да създаде нова Privacy Policy версия (draft)

**Given** автентициран брокер с роля `broker_admin` прави `POST /api/v1/tenants/privacy-policy`,
**When** тялото съдържа `{ content: "...", language: "bg" }`,
**Then** се създава нова запис с `is_published = false`; `version` се auto-increment-ва като `MAX(version) + 1` за тенанта и езика; отговорът съдържа `{ id, version, is_published, created_at }`.

### AC3 — Брокерът може да публикува Privacy Policy версия

**Given** съществува draft с `is_published = false`,
**When** брокерът прави `PUT /api/v1/tenants/privacy-policy/:id/publish`,
**Then** записът се обновява с `is_published = true` и `published_at = NOW()`; предишните published версии за същия tenant+language **не** се деактивират (историята се пази); в `audit_log` се записва `{ action: 'privacy_policy.published', entityType: 'tenant_privacy_policy', entityId, tenantId, userId }`.

### AC4 — Публичен endpoint връща текущата (последна публикувана) версия

**Given** тенант с slug `broker1` има поне една публикувана политика на `bg`,
**When** анонимна заявка `GET /api/v1/public/privacy-policy?lang=bg` (с Host header за тенанта),
**Then** се връща `{ version, content, language, published_at }` — версията с най-висок `version` при `is_published = true`; статус 200; **без JWT изисквания**.

### AC5 — 404 при липсваща публикувана политика

**Given** тенант **без** публикувана Privacy Policy,
**When** `GET /api/v1/public/privacy-policy`,
**Then** се връща `404 Not Found` с `{ error: 'PRIVACY_POLICY_NOT_FOUND' }`.

### AC6 — Broker Admin може да листи всички версии за своя тенант

**Given** автентициран `broker_admin`,
**When** `GET /api/v1/tenants/privacy-policy`,
**Then** се връщат всички версии (published + draft) за тенанта на автентицирания потребител, сортирани `version DESC`; друг тенант **не** вижда тези данни (tenant isolation).

### AC7 — Seed: demo тенантът има стандартна публикувана Privacy Policy на старт

**Given** `NODE_ENV !== 'production'` и `npm run dev`,
**When** `seed.service.ts` се изпълни,
**Then** demo тенантът има поне 1 публикувана Privacy Policy версия на `bg` с placeholder GDPR чл. 13 съдържание (брокерско лого, DPO контакт placeholder, цели на обработката, права на субекта).

### AC8 — Flutter: Privacy Policy линк е видим в SMS OTP регистрационния flow

**Given** нов потребител е на `SmsOtpScreen` (inline micro-registration),
**When** екранът се визуализира,
**Then** под бутона за изпращане на OTP е visible текст "Като продължавате, приемате нашата [Политика за поверителност]" — линкът отваря `PrivacyPolicyScreen` (WebView или scrollable text). Линкът НЕ е задължителен checkbox — само информативен, съгласно GDPR чл. 13.

### AC9 — Unit тестове покриват service логиката

**Given** `PrivacyPolicyService` е имплементиран,
**When** `npm run test:cov` се изпълни,
**Then** следните случаи са покрити: create draft → version auto-increment; publish → `published_at` се записва; getPublished → връща MAX(version) при is_published=true; getPublished → хвърля NotFoundException при липса; tenant isolation (mock за грешен тенант → 0 резултати); audit_log entry при publish.

### AC10 — Lint, build и тестове минават без грешки

**Given** имплементацията е завършена,
**When** се изпълнят `npm run lint && npm run test:cov && npm run build`,
**Then** 0 lint errors, 0 warnings; всички тестове минават; build успешен.

---

## Tasks / Subtasks

- [x] **Task 1: DB Migration** (AC1)
  - [x] 1.1 Създай `branivo-api/src/infrastructure/database/migrations/1710000061000-CreateTenantPrivacyPolicies.ts`
  - [x] 1.2 Schema: `id UUID PK`, `tenant_id UUID NOT NULL FK→tenants(id)`, `version INTEGER NOT NULL`, `content TEXT NOT NULL`, `language VARCHAR(5) NOT NULL DEFAULT 'bg'`, `is_published BOOLEAN NOT NULL DEFAULT false`, `published_at TIMESTAMPTZ NULL`, `created_by UUID NULL FK→users(id)`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`, `deleted_at TIMESTAMPTZ NULL`
  - [x] 1.3 UNIQUE constraint: `uq_privacy_policy_tenant_version_lang` on `(tenant_id, version, language)`
  - [x] 1.4 Index на `(tenant_id, language, is_published, version DESC)` за public lookup

- [x] **Task 2: TypeORM Entity** (AC1)
  - [x] 2.1 Създай `branivo-api/src/modules/compliance/entities/tenant-privacy-policy.entity.ts`
  - [x] 2.2 Анотирай с `@Entity({ name: 'tenant_privacy_policies' })`; добави всички колони с правилни типове
  - [x] 2.3 `@ManyToOne(() => Tenant)` + `@JoinColumn({ name: 'tenant_id' })`

- [x] **Task 3: DTOs** (AC2, AC3, AC4, AC6)
  - [x] 3.1 `create-privacy-policy.dto.ts`: `content: string` (IsNotEmpty), `language: string` (IsIn(['bg', 'en']), default 'bg')
  - [x] 3.2 `privacy-policy-response.dto.ts`: `id`, `version`, `content`, `language`, `isPublished`, `publishedAt`, `createdAt`
  - [x] 3.3 `privacy-policy-list-item.dto.ts`: без `content` (само metadata за list endpoint) — в privacy-policy-response.dto.ts

- [x] **Task 4: PrivacyPolicyService** (AC2, AC3, AC4, AC5, AC6)
  - [x] 4.1 Файл: `branivo-api/src/modules/compliance/privacy-policy.service.ts`
  - [x] 4.2 `create(dto, userId)`: `MAX(version) + 1` или `1` ако няма; INSERT с `is_published = false`
  - [x] 4.3 `publish(id, userId)`: намери запис по id с tenant_id scope; UPDATE `is_published=true`, `published_at=NOW()`; emit audit_log event
  - [x] 4.4 `getPublished(language)`: `WHERE tenant_id = ctx AND is_published=true AND language=lang ORDER BY version DESC LIMIT 1`; хвърля `NotFoundException` ако няма
  - [x] 4.5 `findAll()`: `WHERE tenant_id = ctx AND deleted_at IS NULL ORDER BY version DESC` — всички версии за текущия тенант
  - [x] 4.6 `findOne(id)`: tenant-scoped lookup

- [x] **Task 5: PrivacyPolicyController** (AC2, AC3, AC4, AC5, AC6)
  - [x] 5.1 Файл: `branivo-api/src/modules/compliance/privacy-policy.controller.ts`
  - [x] 5.2 `POST /api/v1/tenants/privacy-policy` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('broker_admin')`
  - [x] 5.3 `PUT /api/v1/tenants/privacy-policy/:id/publish` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('broker_admin')`
  - [x] 5.4 `GET /api/v1/tenants/privacy-policy` — `@UseGuards(JwtAuthGuard)`; листи всички версии
  - [x] 5.5 `GET /api/v1/tenants/privacy-policy/:id` — `@UseGuards(JwtAuthGuard)` — конкретна версия
  - [x] 5.6 **Public controller** — отделен `PrivacyPolicyPublicController` без auth guard:
    - `GET /api/v1/public/privacy-policy` — взима тенант от `TenantContext`; query param `lang` (default: `bg`)

- [x] **Task 6: Регистрация в ComplianceModule** (AC2–AC6)
  - [x] 6.1 Добави `TenantPrivacyPolicy` entity в `TypeOrmModule.forFeature([...])` в `ComplianceModule`
  - [x] 6.2 Добави `PrivacyPolicyService`, `PrivacyPolicyController`, `PrivacyPolicyPublicController` в `ComplianceModule`
  - [x] 6.3 Провери дали `ComplianceModule` вече е регистриран в `AppModule` (да — от story 11-1)

- [x] **Task 7: Seed данни** (AC7)
  - [x] 7.1 В `seed.service.ts` добави метод `seedPrivacyPolicy()`
  - [x] 7.2 Попълни с placeholder GDPR чл. 13 markdown съдържание за demo тенанта:
    - Секции: „Администратор на лични данни", „Цели и основание за обработката", „Категории лични данни", „Получатели (sub-processors)", „Права на субекта на данни", „Право на жалба до КЗЛД", „Срок на съхранение"
  - [x] 7.3 `ON CONFLICT (tenant_id, version, language) DO NOTHING` — идемпотентно

- [x] **Task 8: Flutter — Privacy Policy линк в регистрационния flow** (AC8)
  - [x] 8.1 Локализирай URL за privacy policy в Flutter: `GET {baseUrl}/api/v1/public/privacy-policy`
  - [x] 8.2 Добави `PrivacyPolicyScreen` виджет: `Scaffold` с `SingleChildScrollView` + `SelectableText` (без flutter_markdown — пакетът не е в pubspec.yaml)
  - [x] 8.3 В `RegistrationScreen` добави `RichText` под `_PhoneEntryForm` бутона с `TextSpan` за линк → navigates to `/privacy-policy`
  - [x] 8.4 Добави `privacy_policy_service.dart` за fetch на public endpoint

- [x] **Task 9: Unit тестове** (AC9)
  - [x] 9.1 `privacy-policy.service.spec.ts` — 10 теста: create (2), publish (3), getPublished (2), tenant isolation (1), findOne implied
  - [x] 9.2 `privacy-policy.controller.spec.ts` — controller integration тест за всеки endpoint (8 теста)
  - [x] 9.3 Flutter widget тест за `PrivacyPolicyScreen` (4 теста)

- [x] **Task 10: CI verify** (AC10)
  - [x] `cd branivo-api && npm run lint` — 0 errors, 0 warnings
  - [x] `cd branivo-api && npm run test:cov` — 18 нови теста минават; pre-existing failures са unrelated
  - [x] `cd branivo-api && npm run build` — успешен
  - [x] `cd branivo_app && flutter analyze --no-fatal-infos` — 0 грешки в новите файлове; pre-existing errors от story 15-1 (biometric tests)
  - [x] `cd branivo_app && flutter test` — 4 нови теста минават

---

## Dev Notes

### Архитектурен контекст

Story 11.11 е **Wave 1 Legal Blocker** — трябва да е имплементирана преди production с реални клиенти, тъй като GDPR чл. 13 изисква субектите да бъдат информирани *при* събиране на личните им данни. SMS OTP регистрацията (Story 3.2) събира телефонен номер → link към Privacy Policy е задължителен от moment 0.

**Зависимости:**
- Story 11-1 (done): `ComplianceModule` вече съществува в `src/modules/compliance/`; само разширяваме го
- Story 11-12 (следваща в Wave 1): Terms of Service с version accept tracking — аналогична архитектура

**Какво НЕ прави тази story:**
- Не имплементира force re-accept flow → Story 11-12 (ToS tracking)
- Не имплементира consent management → Story 11-10
- Не добавя field-level encryption → Story 11-2
- Не е Cookie Policy → Story 11-13

### Модулна структура

```
branivo-api/src/modules/compliance/
├── compliance.module.ts                          # СЪЩЕСТВУВА — разширяваме
├── pii-registry.service.ts                       # СЪЩЕСТВУВА (story 11-1)
├── pii-registry.service.spec.ts                  # СЪЩЕСТВУВА (story 11-1)
├── entities/
│   └── tenant-privacy-policy.entity.ts           # НОВО
├── privacy-policy.service.ts                     # НОВО
├── privacy-policy.service.spec.ts                # НОВО
├── privacy-policy.controller.ts                  # НОВО (auth endpoints)
├── privacy-policy.controller.spec.ts             # НОВО
├── privacy-policy-public.controller.ts           # НОВО (public endpoint — no auth)
└── dto/
    ├── create-privacy-policy.dto.ts              # НОВО
    └── privacy-policy-response.dto.ts            # НОВО
```

```
branivo-api/src/infrastructure/database/migrations/
└── 1710000061000-CreateTenantPrivacyPolicies.ts  # НОВО
```

```
branivo_app/lib/features/compliance/
├── data/
│   └── privacy_policy_service.dart               # НОВО
├── presentation/screens/
│   └── privacy_policy_screen.dart                # НОВО
```

### Tenant Isolation — КРИТИЧНО

Всеки service метод **задължително** използва `TenantContext.getTenantId()`:

```typescript
// ПРАВИЛНО:
async getPublished(language: string): Promise<TenantPrivacyPolicy> {
  const tenantId = this.tenantContext.getTenantId();
  return this.repo.findOne({
    where: { tenantId, language, isPublished: true, deletedAt: IsNull() },
    order: { version: 'DESC' },
  }) ?? throw new NotFoundException('PRIVACY_POLICY_NOT_FOUND');
}

// ГРЕШНО — tenant_id не се предава директно:
// async getPublished(tenantId: string, language: string) { ... }
```

### Version Auto-Increment Pattern

```typescript
async create(dto: CreatePrivacyPolicyDto, userId: string): Promise<TenantPrivacyPolicy> {
  const tenantId = this.tenantContext.getTenantId();
  const lastVersion = await this.repo
    .createQueryBuilder('pp')
    .where('pp.tenant_id = :tenantId AND pp.language = :lang', { tenantId, lang: dto.language })
    .select('MAX(pp.version)', 'maxVersion')
    .getRawOne<{ maxVersion: number | null }>();
  const version = (lastVersion?.maxVersion ?? 0) + 1;
  return this.repo.save({ tenantId, version, content: dto.content, language: dto.language, createdBy: userId });
}
```

### Audit Log Pattern (установен в проекта)

```typescript
// При publish — emit EventEmitter2 event (не директен DB call):
this.eventEmitter.emit('audit.log', {
  action: 'privacy_policy.published',
  entityType: 'tenant_privacy_policy',
  entityId: policy.id,
  tenantId,
  userId,
  payload: { version: policy.version, language: policy.language },
});
```

Провери как audit logging е имплементиран в съществуващите services (напр. `data-export.service.ts`) и следвай същия pattern.

### Public Endpoint — без TenantAuthGuard

Public controller-ът взима тенанта от `TenantContext` (резолвира се от Host header middleware) — **не** от JWT. Не слагай `@UseGuards` на public endpoint-а:

```typescript
@Controller('api/v1/public')
export class PrivacyPolicyPublicController {
  constructor(private readonly privacyPolicyService: PrivacyPolicyService) {}

  @Get('privacy-policy')
  async getPublished(@Query('lang') lang = 'bg') {
    return this.privacyPolicyService.getPublished(lang);
  }
}
```

### Flutter Integration

- Privacy Policy content е markdown. Използвай `flutter_markdown` пакет (вероятно вече е в `pubspec.yaml` — провери преди добавяне).
- Ако пакетът липсва, предложи точна версия и изчакай одобрение (per CLAUDE.md правило за npm/pub packages).
- `PrivacyPolicyScreen` да има loading state + error state (ако API не е достъпен).
- Fetch се прави с `http.get` (без auth token) към публичния endpoint.

### Seed Placeholder Съдържание (GDPR чл. 13)

```markdown
# Политика за поверителност — {BROKER_NAME}

**Последна актуализация:** {DATE}

## Администратор на лични данни
{BROKER_NAME}, ЕИК: {EIN}, адрес: {ADDRESS}
Контакт: {SUPPORT_EMAIL}

## Цели и правно основание за обработката
Обработваме личните Ви данни за: (1) сключване и управление на застрахователен договор (GDPR чл. 6, ал. 1, б. „б"); (2) изпълнение на законови задължения (чл. 6, ал. 1, б. „в"); (3) маркетинг — само с Ваше съгласие (чл. 6, ал. 1, б. „а").

## Категории лични данни
Обработваме: три имена, ЕГН (при нужда), телефон, имейл, данни за МПС (рег. номер, VIN), история на полиците.

## Получатели на данните (под-обработващи)
AWS (хостинг), Stripe (плащания), SendGrid (имейли), Twilio (SMS). Актуален списък: {SUPPORT_EMAIL}

## Права на субекта на данни
Имате право на: достъп, коригиране, изтриване, ограничаване, преносимост, възражение. За упражняване: {SUPPORT_EMAIL}

## Право на жалба
КЗЛД, адрес: гр. София 1592, бул. „Проф. Цветан Лазаров" № 2, www.cpdp.bg

## Срок на съхранение
Данните се съхраняват за срока на полицата + 5 години (КФН изискване) или по-малко ако законодателството позволява.
```

Seed-ването трябва да замени `{BROKER_NAME}`, `{EIN}`, etc. с demo стойности от demo тенанта.

### Критично: НИКОГА не нарушавай

- `audit_log` е IMMUTABLE — без UPDATE или DELETE (само INSERT чрез EventEmitter)
- `insurer.api_key_enc` НЕ се излага в GET отговори (не се засяга тук, но правилото важи)
- Публичният endpoint НЕ изисква JWT — само Host header за tenant resolution
- Всяка DB заявка използва `TenantContext.getTenantId()` (никога `tenant_id` като param)

### Project Structure Notes

- `ComplianceModule` вече е `@Global()` и регистриран в `AppModule` (от story 11-1)
- Добавянето на `TenantPrivacyPolicy` entity изисква да я добавиш в `TypeOrmModule.forFeature([PiiRegistryService_entities..., TenantPrivacyPolicy])` в `compliance.module.ts`
- Провери `app.module.ts` за импортираните модули — не дублирай `ComplianceModule`
- За Flutter: провери дали съществува `lib/features/compliance/` директория; ако не, създай

### References

- GDPR чл. 13 — задължителна информация при събиране на лични данни директно от субекта
- Architecture.md: GDPR & Audit pattern (audit_log immutable, EventEmitter2)
- Architecture.md: TenantContext usage rules
- Story 11-1 (`11-1-data-classification-pii-taxonomy.md`): ComplianceModule structure + PiiRegistryService pattern
- Sprint-status.yaml Wave 1 dependency order: 11-1 → **11-11** → 11-12 → 11-13 → 11-4 → 11-16
- `branivo-api/src/modules/compliance/compliance.module.ts` — текущ модул за разширяване
- `branivo-api/src/modules/tenants/entities/tenant-config.entity.ts` — tenant config pattern
- `branivo-api/src/modules/data-export/data-export.service.ts` — audit log emit pattern
- Migration naming: `1710000061000-CreateTenantPrivacyPolicies.ts` (timestamp след последния: 1710000060000)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_Без блокери. Pre-existing test failures (admin-insurer-monitor.controller.spec.ts + biometric auth tests от story 15-1) са несвързани с тази story._

### Completion Notes List

- Имплементирана пълна white-label Privacy Policy система: migration, entity, service, 2 controllers (auth + public), ComplianceModule update, seed data
- `PrivacyPolicyService`: create (version auto-increment), publish (audit_log INSERT), getPublished (tenant-scoped, 404 ако няма), findAll, findOne — всички с TenantContext isolation
- Audit log: директен `dataSource.query` INSERT (следва commissions.service.ts pattern, не EventEmitter2)
- Flutter: `PrivacyPolicyService`, `PrivacyPolicyScreen` (SelectableText, без flutter_markdown — не е в pubspec.yaml), линк в `RegistrationScreen._PhoneEntryForm`, route `/privacy-policy` в AppRouter
- Тестове: 10 unit теста (service) + 8 controller integration теста + 4 Flutter widget теста = 22 нови теста, всички зелени
- CI: lint 0/0, build ok, Jest 18/18, Flutter 4/4

### Change Log

- 2026-04-05: Story 11-11 имплементирана (claude-sonnet-4-6) — Privacy Policy white-label, GDPR чл. 13 compliance, Flutter registration flow integration

### File List

**New files:**
- `branivo-api/src/infrastructure/database/migrations/1710000061000-CreateTenantPrivacyPolicies.ts`
- `branivo-api/src/modules/compliance/entities/tenant-privacy-policy.entity.ts`
- `branivo-api/src/modules/compliance/dto/create-privacy-policy.dto.ts`
- `branivo-api/src/modules/compliance/dto/privacy-policy-response.dto.ts`
- `branivo-api/src/modules/compliance/privacy-policy.service.ts`
- `branivo-api/src/modules/compliance/privacy-policy.service.spec.ts`
- `branivo-api/src/modules/compliance/privacy-policy.controller.ts`
- `branivo-api/src/modules/compliance/privacy-policy.controller.spec.ts`
- `branivo-api/src/modules/compliance/privacy-policy-public.controller.ts`
- `branivo_app/lib/features/compliance/data/privacy_policy_service.dart`
- `branivo_app/lib/features/compliance/presentation/screens/privacy_policy_screen.dart`
- `branivo_app/test/features/compliance/screens/privacy_policy_screen_test.dart`

**Modified files:**
- `branivo-api/src/modules/compliance/compliance.module.ts`
- `branivo-api/src/infrastructure/database/seed.service.ts`
- `branivo_app/lib/core/api/endpoints.dart`
- `branivo_app/lib/core/routing/app_router.dart`
- `branivo_app/lib/features/registration/screens/registration_screen.dart`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
