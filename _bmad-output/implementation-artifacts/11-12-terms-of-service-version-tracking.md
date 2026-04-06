# Story 11.12: Terms of Service Version Tracking

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Broker Admin (и платформата),
I want всеки тенант да поддържа версионирани Общи Условия (ToS), а всеки краен клиент да бъде задължен да ги приеме при публикуване на нова версия,
so that Branivo спазва GDPR изискванията за информирано съгласие (чл. 7) и брокерите могат да обновяват правните си документи с гарантирана re-acceptance от клиентите.

## Acceptance Criteria

### AC1 — `tenant_tos_versions` таблицата съществува с правилна схема

**Given** миграцията е изпълнена,
**When** `tenant_tos_versions` таблицата се провери,
**Then** съдържа: `id` (UUID PK), `tenant_id` (FK → tenants.id), `version` (INTEGER), `content` (TEXT — markdown), `language` (VARCHAR(5), default `'bg'`), `is_published` (BOOLEAN, default false), `published_at` (TIMESTAMPTZ nullable), `created_by` (UUID nullable FK → users.id), `created_at`, `updated_at`, `deleted_at`; UNIQUE constraint на `(tenant_id, version, language)`.

### AC2 — `end_client_tos_acceptances` таблицата съществува с правилна схема

**Given** миграцията е изпълнена,
**When** `end_client_tos_acceptances` таблицата се провери,
**Then** съдържа: `id` (UUID PK), `client_id` (UUID NOT NULL FK → end_clients.id), `tenant_id` (UUID NOT NULL), `tos_version_id` (UUID NOT NULL FK → tenant_tos_versions.id), `accepted_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()), `ip_address` (VARCHAR(45) nullable), `user_agent` (TEXT nullable); UNIQUE constraint на `(client_id, tos_version_id)`.

### AC3 — Брокерът може да създаде нова ToS версия (draft)

**Given** автентициран брокер с роля `broker_admin` прави `POST /api/v1/tenants/tos`,
**When** тялото съдържа `{ content: "...", language: "bg" }`,
**Then** се създава нов запис с `is_published = false`; `version` се auto-increment-ва като `MAX(version) + 1` за тенанта и езика; отговорът съдържа `{ id, version, is_published, created_at }`.

### AC4 — Брокерът може да публикува ToS версия

**Given** съществува draft с `is_published = false`,
**When** брокерът прави `PUT /api/v1/tenants/tos/:id/publish`,
**Then** записът се обновява с `is_published = true` и `published_at = NOW()`; предишните published версии за същия tenant+language **не** се деактивират (историята се пази); в `audit_log` се записва `{ action: 'tos.published', entityType: 'tenant_tos_version', entityId, tenantId, userId }`; съществуващите приемания **не** се изтриват.

### AC5 — Публичен endpoint връща текущата (последна публикувана) версия

**Given** тенант с поне една публикувана ToS версия на `bg`,
**When** анонимна заявка `GET /api/v1/public/tos?lang=bg` (с Host header за тенанта),
**Then** се връща `{ id, version, content, language, published_at }` — версията с най-висок `version` при `is_published = true`; статус 200; **без JWT изисквания**.

### AC6 — 404 при липсваща публикувана ToS

**Given** тенант **без** публикувана ToS,
**When** `GET /api/v1/public/tos`,
**Then** се връща `404 Not Found` с `{ error: 'TOS_NOT_FOUND' }`.

### AC7 — Краен клиент може да приеме ToS

**Given** автентициран краен клиент прави `POST /api/v1/clients/tos/accept`,
**When** тялото съдържа `{ tosVersionId: "<uuid>" }`,
**Then** се създава запис в `end_client_tos_acceptances` с `client_id`, `tenant_id`, `tos_version_id`, `accepted_at = NOW()`, `ip_address` (от X-Forwarded-For), `user_agent` (от User-Agent header); отговорът съдържа `{ accepted: true, version: <int>, accepted_at: <iso> }`; ако клиентът е приел същата версия вече — UPSERT, без грешка (идемпотентно).

### AC8 — ToS status endpoint

**Given** автентициран краен клиент прави `GET /api/v1/clients/tos/status`,
**When** заявката е обработена,
**Then** се връща `{ requiresAcceptance: boolean, currentVersion: { id, version, content, language, published_at } | null, acceptedVersion: number | null }`; `requiresAcceptance = true` ако `latest_published_version > max(client_accepted_version)`.

### AC9 — Broker Admin може да листи всички ToS версии за своя тенант

**Given** автентициран `broker_admin`,
**When** `GET /api/v1/tenants/tos`,
**Then** се връщат всички версии (published + draft) за тенанта, сортирани `version DESC`; друг тенант **не** вижда тези данни (tenant isolation).

### AC10 — Flutter: Force re-accept при нова версия

**Given** краен клиент е логнат и отваря приложението,
**When** `GET /api/v1/clients/tos/status` върне `requiresAcceptance: true`,
**Then** `TosAcceptanceScreen` се показва **задължително** преди всякакъв друг content; клиентът не може да навигира другаде докато не натисне бутон "Прочетох и приемам Общите Условия"; след accept — нормален flow продължава.

### AC11 — Flutter: ToS link в регистрационния flow

**Given** нов потребител е на `SmsOtpScreen`,
**When** екранът се визуализира,
**Then** под бутона за изпращане на OTP е visible текст "Като продължавате, приемате нашите [Общи Условия]" — линкът отваря `TosScreen` (read-only). Линкът НЕ е задължителен checkbox — само информативен.

### AC12 — Seed: demo тенантът има стандартна публикувана ToS на старт

**Given** `NODE_ENV !== 'production'` и `npm run dev`,
**When** `seed.service.ts` се изпълни,
**Then** demo тенантът има поне 1 публикувана ToS версия на `bg` с placeholder съдържание (услуги, отговорности, плащания, юрисдикция, промени в условията).

### AC13 — Unit тестове покриват service логиката

**Given** `TosService` е имплементиран,
**When** `npm run test:cov` се изпълни,
**Then** следните случаи са покрити: create draft → version auto-increment; publish → `published_at` се записва; getPublished → връща MAX(version) при is_published=true; getPublished → хвърля NotFoundException при липса; accept → UPSERT, идемпотентно; getStatus → `requiresAcceptance: true` ако нова версия; tenant isolation (mock за грешен тенант → 0 резултати); audit_log entry при publish.

### AC14 — Lint, build и тестове минават без грешки

**Given** имплементацията е завършена,
**When** се изпълнят `npm run lint && npm run test:cov && npm run build` и `flutter analyze --no-fatal-infos && flutter test`,
**Then** 0 lint errors, 0 warnings; всички тестове минават; build успешен.

---

## Tasks / Subtasks

- [x] **Task 1: DB Migration — tenant_tos_versions** (AC1)
  - [x] 1.1 Създай `branivo-api/src/infrastructure/database/migrations/1710000062000-CreateTenantTosVersions.ts`
  - [x] 1.2 Schema: `id UUID PK`, `tenant_id UUID NOT NULL FK→tenants(id)`, `version INTEGER NOT NULL`, `content TEXT NOT NULL`, `language VARCHAR(5) NOT NULL DEFAULT 'bg'`, `is_published BOOLEAN NOT NULL DEFAULT false`, `published_at TIMESTAMPTZ NULL`, `created_by UUID NULL FK→users(id)`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`, `deleted_at TIMESTAMPTZ NULL`
  - [x] 1.3 UNIQUE constraint: `uq_tos_version_tenant_version_lang` on `(tenant_id, version, language)`
  - [x] 1.4 Index на `(tenant_id, language, is_published, version DESC)` за public lookup

- [x] **Task 2: DB Migration — end_client_tos_acceptances** (AC2)
  - [x] 2.1 В **същата** migration (1710000062000) добави `end_client_tos_acceptances` таблица
  - [x] 2.2 Schema: `id UUID PK DEFAULT gen_random_uuid()`, `client_id UUID NOT NULL FK→end_clients(id) ON DELETE CASCADE`, `tenant_id UUID NOT NULL`, `tos_version_id UUID NOT NULL FK→tenant_tos_versions(id)`, `accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `ip_address VARCHAR(45) NULL`, `user_agent TEXT NULL`
  - [x] 2.3 UNIQUE constraint: `uq_tos_acceptance_client_version` on `(client_id, tos_version_id)`
  - [x] 2.4 Index на `(client_id, tenant_id)` за status lookup

- [x] **Task 3: TypeORM Entities** (AC1, AC2)
  - [x] 3.1 Създай `branivo-api/src/modules/compliance/entities/tenant-tos-version.entity.ts` — аналогично на `tenant-privacy-policy.entity.ts`
  - [x] 3.2 Създай `branivo-api/src/modules/compliance/entities/end-client-tos-acceptance.entity.ts` с колони: `id`, `clientId`, `tenantId`, `tosVersionId`, `acceptedAt`, `ipAddress`, `userAgent`; `@ManyToOne(() => TenantTosVersion)` + `@JoinColumn({ name: 'tos_version_id' })`

- [x] **Task 4: DTOs** (AC3–AC9)
  - [x] 4.1 `create-tos.dto.ts`: `content: string` (IsNotEmpty), `language: string` (IsIn(['bg', 'en']), default 'bg')
  - [x] 4.2 `tos-response.dto.ts`: `id`, `version`, `content`, `language`, `isPublished`, `publishedAt`, `createdAt`
  - [x] 4.3 `tos-list-item.dto.ts`: без `content` — само metadata за list endpoint
  - [x] 4.4 `accept-tos.dto.ts`: `tosVersionId: string` (IsUUID)
  - [x] 4.5 `tos-status-response.dto.ts`: `requiresAcceptance: boolean`, `currentVersion: TosResponseDto | null`, `acceptedVersion: number | null`

- [x] **Task 5: TosService** (AC3–AC9)
  - [x] 5.1 Файл: `branivo-api/src/modules/compliance/tos.service.ts`
  - [x] 5.2 `create(dto, userId)`: `MAX(version) + 1` или `1` ако няма; INSERT с `is_published = false`
  - [x] 5.3 `publish(id, userId)`: намери запис по id с tenant_id scope; UPDATE `is_published=true`, `published_at=NOW()`; emit audit_log event
  - [x] 5.4 `getPublished(language)`: `WHERE tenant_id = ctx AND is_published=true AND language=lang ORDER BY version DESC LIMIT 1`; хвърля `NotFoundException('TOS_NOT_FOUND')` ако няма
  - [x] 5.5 `findAll()`: `WHERE tenant_id = ctx AND deleted_at IS NULL ORDER BY version DESC`
  - [x] 5.6 `accept(clientId, dto, ipAddress, userAgent)`: UPSERT в `end_client_tos_acceptances` с `ON CONFLICT (client_id, tos_version_id) DO UPDATE SET accepted_at=NOW()`; валидира че `tos_version_id` съществува и принадлежи на текущия тенант
  - [x] 5.7 `getStatus(clientId)`: зарежда latest published ToS; зарежда max accepted version за клиента; изчислява `requiresAcceptance`
  - [x] 5.8 Всеки метод задължително ползва `TenantContext.getTenantId()`

- [x] **Task 6: TosController (Admin)** (AC3, AC4, AC9)
  - [x] 6.1 Файл: `branivo-api/src/modules/compliance/tos.controller.ts`
  - [x] 6.2 `POST /api/v1/tenants/tos` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('broker_admin')`
  - [x] 6.3 `PUT /api/v1/tenants/tos/:id/publish` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('broker_admin')`
  - [x] 6.4 `GET /api/v1/tenants/tos` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('broker_admin', 'broker_agent')`

- [x] **Task 7: TosPublicController** (AC5, AC6)
  - [x] 7.1 Файл: `branivo-api/src/modules/compliance/tos-public.controller.ts`
  - [x] 7.2 `GET /api/v1/public/tos` — **БЕЗ auth guard**; query param `lang` (default: `bg`); взима тенанта от `TenantContext` (Host header)

- [x] **Task 8: TosClientController** (AC7, AC8)
  - [x] 8.1 Файл: `branivo-api/src/modules/compliance/tos-client.controller.ts`
  - [x] 8.2 `POST /api/v1/clients/tos/accept` — `@UseGuards(JwtClientAuthGuard)` (или ClientAuthGuard — провери имплементацията в auth/sessions модула); взима `clientId` от JWT payload; извлича `X-Forwarded-For` и `User-Agent` от заявката
  - [x] 8.3 `GET /api/v1/clients/tos/status` — `@UseGuards(JwtClientAuthGuard)` — връща ToS статус за клиента

- [x] **Task 9: Регистрация в ComplianceModule** (AC3–AC9)
  - [x] 9.1 Добави `TenantTosVersion` и `EndClientTosAcceptance` entities в `TypeOrmModule.forFeature([...])`
  - [x] 9.2 Добави `TosService`, `TosController`, `TosPublicController`, `TosClientController` в `ComplianceModule`
  - [x] 9.3 `ComplianceModule` вече е `@Global()` и в `AppModule` — не дублирай

- [x] **Task 10: Seed данни** (AC12)
  - [x] 10.1 В `seed.service.ts` добави метод `seedTos()`
  - [x] 10.2 Попълни с placeholder Общи Условия (markdown) за demo тенанта:
    - Секции: „Предмет на договора", „Услуги", „Права и задължения", „Плащания и такси", „Отговорност", „Изменение на условията", „Юрисдикция (Република България)"
  - [x] 10.3 `ON CONFLICT (tenant_id, version, language) DO NOTHING` — идемпотентно
  - [x] 10.4 Извикай `seedTos()` от `onApplicationBootstrap()`

- [x] **Task 11: Flutter — TosAcceptanceScreen (force re-accept)** (AC10)
  - [x] 11.1 Създай `branivo_app/lib/features/compliance/data/tos_service.dart` — fetch `GET /api/v1/clients/tos/status` + `POST /api/v1/clients/tos/accept`
  - [x] 11.2 Създай `branivo_app/lib/features/compliance/presentation/screens/tos_acceptance_screen.dart`:
    - ScrollView с markdown ToS content (`flutter_markdown`)
    - "Прочетох и приемам" бутон — активен само след scroll до дъното (или веднага, но явно видим)
    - Loading и error states
  - [x] 11.3 В `AppRouter` (или root navigator) добави check след login: ако `requiresAcceptance == true` → navigate to `TosAcceptanceScreen` преди main screen
  - [x] 11.4 След успешен accept → pop TosAcceptanceScreen и продължи нормалния flow
  - [x] 11.5 Провери дали `flutter_markdown` е в `pubspec.yaml` преди добавяне (вероятно вече е от story 11-11)

- [x] **Task 12: Flutter — ToS link в SmsOtpScreen** (AC11)
  - [x] 12.1 Създай `branivo_app/lib/features/compliance/presentation/screens/tos_screen.dart` (read-only view) — аналогично на `PrivacyPolicyScreen` от story 11-11
  - [x] 12.2 В `SmsOtpScreen` добави `RichText` под OTP бутона: "Като продължавате, приемате нашите [Общи Условия]" → navigate to `TosScreen`

- [x] **Task 13: Unit тестове** (AC13)
  - [x] 13.1 `tos.service.spec.ts` — минимум 8 теста (виж AC13)
  - [x] 13.2 `tos.controller.spec.ts` — controller integration тест за admin endpoints
  - [x] 13.3 `tos-client.controller.spec.ts` — integration тест за accept + status endpoints
  - [x] 13.4 Flutter widget тест за `TosAcceptanceScreen` (accept бутон, loading state)

- [x] **Task 14: CI verify** (AC14)
  - [x] `cd branivo-api && npm run lint && npm run test:cov && npm run build`
  - [x] `cd branivo_app && flutter analyze --no-fatal-infos && flutter test`

---

## Dev Notes

### Архитектурен контекст

Story 11.12 е **Wave 1 Legal Blocker** — трябва да е имплементирана преди production с реални клиенти. Тя е **директно следствие** на Story 11.11 (Privacy Policy) — архитектурата е аналогична, но с ключно допълнение: **задължителен user acceptance tracking** и **force re-accept при нова версия**.

**Wave 1 dependency order:**
```
11-1 (done) → 11-11 (ready-for-dev) → 11-12 (this) → 11-13 → 11-4 → 11-16
```

**Зависимости:**
- Story 11-1 (done): `ComplianceModule` съществува в `src/modules/compliance/`
- Story 11-11 (ready-for-dev): `TenantPrivacyPolicy` entity — **пример** за ToS entity структурата
- Story 11-12 се имплементира **след** 11-11 (или паралелно — нямат runtime dependencies)

**Какво НЕ прави тази story:**
- Не имплементира consent management (marketing/analytics) → Story 11-10
- Не имплементира Cookie Policy banner → Story 11-13
- Не добавя field-level encryption → Story 11-2
- Не имплементира broker (user) ToS за broker onboarding → Story 11-14 (DPA e-sign)

### Модулна структура

```
branivo-api/src/modules/compliance/
├── compliance.module.ts                              # СЪЩЕСТВУВА — разширяваме
├── pii-registry.service.ts                           # СЪЩЕСТВУВА (story 11-1)
├── privacy-policy.service.ts                         # СЪЩЕСТВУВА (story 11-11, ready-for-dev)
├── entities/
│   ├── tenant-privacy-policy.entity.ts               # СЪЩЕСТВУВА (story 11-11)
│   ├── tenant-tos-version.entity.ts                  # НОВО
│   └── end-client-tos-acceptance.entity.ts           # НОВО
├── tos.service.ts                                    # НОВО
├── tos.service.spec.ts                               # НОВО
├── tos.controller.ts                                 # НОВО (broker_admin endpoints)
├── tos.controller.spec.ts                            # НОВО
├── tos-public.controller.ts                          # НОВО (public endpoint — no auth)
├── tos-client.controller.ts                          # НОВО (client accept/status)
├── tos-client.controller.spec.ts                     # НОВО
└── dto/
    ├── create-tos.dto.ts                             # НОВО
    ├── accept-tos.dto.ts                             # НОВО
    ├── tos-response.dto.ts                           # НОВО
    ├── tos-list-item.dto.ts                          # НОВО
    └── tos-status-response.dto.ts                    # НОВО
```

```
branivo-api/src/infrastructure/database/migrations/
└── 1710000062000-CreateTenantTosVersions.ts          # НОВО (две таблици)
```

```
branivo_app/lib/features/compliance/
├── data/
│   ├── privacy_policy_service.dart                   # СЪЩЕСТВУВА (story 11-11)
│   └── tos_service.dart                              # НОВО
├── presentation/screens/
│   ├── privacy_policy_screen.dart                    # СЪЩЕСТВУВА (story 11-11)
│   ├── tos_screen.dart                               # НОВО (read-only)
│   └── tos_acceptance_screen.dart                    # НОВО (force accept)
```

### Следващ migration timestamp

Последната migration е `1710000061000-CreateTenantPrivacyPolicies.ts` (story 11-11).
Следващата: **`1710000062000-CreateTenantTosVersions.ts`** — съдържа и двете таблици.

### TenantTosVersion Entity Pattern

Следва точно същия pattern като `tenant-privacy-policy.entity.ts`:

```typescript
@Entity({ name: 'tenant_tos_versions' })
export class TenantTosVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 5, default: 'bg' })
  language!: string;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished!: boolean;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;
}
```

### EndClientTosAcceptance Entity

```typescript
@Entity({ name: 'end_client_tos_acceptances' })
export class EndClientTosAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'tos_version_id', type: 'uuid' })
  tosVersionId!: string;

  @ManyToOne(() => TenantTosVersion)
  @JoinColumn({ name: 'tos_version_id' })
  tosVersion!: TenantTosVersion;

  @Column({ name: 'accepted_at', type: 'timestamptz', default: () => 'NOW()' })
  acceptedAt!: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;
}
```

### Tenant Isolation — КРИТИЧНО

Всеки service метод **задължително** използва `TenantContext.getTenantId()`:

```typescript
// ПРАВИЛНО:
async getPublished(language: string): Promise<TenantTosVersion> {
  const tenantId = this.tenantContext.getTenantId();
  const tos = await this.tosRepo.findOne({
    where: { tenantId, language, isPublished: true, deletedAt: IsNull() },
    order: { version: 'DESC' },
  });
  if (!tos) throw new NotFoundException('TOS_NOT_FOUND');
  return tos;
}

// ГРЕШНО — tenant_id не се предава директно:
// async getPublished(tenantId: string, language: string) { ... }
```

### UPSERT Pattern за accept

```typescript
async accept(
  clientId: string,
  dto: AcceptTosDto,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<EndClientTosAcceptance> {
  const tenantId = this.tenantContext.getTenantId();
  // Валидация: tosVersionId принадлежи на текущия тенант
  const tosVersion = await this.tosRepo.findOne({
    where: { id: dto.tosVersionId, tenantId, deletedAt: IsNull() },
  });
  if (!tosVersion) throw new NotFoundException('TOS_VERSION_NOT_FOUND');

  // UPSERT — идемпотентно
  await this.acceptanceRepo
    .createQueryBuilder()
    .insert()
    .into(EndClientTosAcceptance)
    .values({ clientId, tenantId, tosVersionId: dto.tosVersionId, ipAddress, userAgent })
    .orUpdate(['accepted_at', 'ip_address', 'user_agent'], ['client_id', 'tos_version_id'])
    .execute();

  return this.acceptanceRepo.findOneOrFail({
    where: { clientId, tosVersionId: dto.tosVersionId },
  });
}
```

### getStatus Pattern

```typescript
async getStatus(clientId: string): Promise<TosStatusResponseDto> {
  const tenantId = this.tenantContext.getTenantId();

  // Latest published ToS
  const latestTos = await this.tosRepo.findOne({
    where: { tenantId, isPublished: true, deletedAt: IsNull() },
    order: { version: 'DESC' },
  });

  if (!latestTos) {
    return { requiresAcceptance: false, currentVersion: null, acceptedVersion: null };
  }

  // Client's max accepted version за текущия тенант
  const lastAcceptance = await this.acceptanceRepo
    .createQueryBuilder('a')
    .innerJoin('a.tosVersion', 'tv')
    .where('a.client_id = :clientId AND a.tenant_id = :tenantId', { clientId, tenantId })
    .orderBy('tv.version', 'DESC')
    .getOne();

  const acceptedVersion = lastAcceptance
    ? (await lastAcceptance.tosVersion).version  // или eager load
    : null;

  return {
    requiresAcceptance: acceptedVersion === null || acceptedVersion < latestTos.version,
    currentVersion: latestTos,
    acceptedVersion,
  };
}
```

**Бележка:** По-ефикасно е да се ползва subquery за MAX accepted version — провери как е имплементирано в data-export или renewal service за query patterns.

### Audit Log Pattern (установен в проекта)

```typescript
// При publish — emit EventEmitter2 event (не директен DB call):
this.eventEmitter.emit('audit.log', {
  action: 'tos.published',
  entityType: 'tenant_tos_version',
  entityId: tos.id,
  tenantId,
  userId,
  payload: { version: tos.version, language: tos.language },
});
```

Виж `data-export.service.ts` за точния audit log emit pattern.

### Client Authentication Guard

Крайните клиенти използват **различен** auth механизъм от брокерите. Провери:
- `src/modules/auth/` или `src/modules/sessions/` за `ClientAuthGuard` или `JwtClientAuthGuard`
- Как `clientId` се извлича от JWT payload в съществуващи client-facing endpoints (напр. `quotes/`, `policies/`)
- НЕ ползвай `JwtAuthGuard` (за broker users) — използвай правилния guard за клиенти

За извличане на `clientId` от request в controller:
```typescript
@Post('accept')
@UseGuards(JwtClientAuthGuard)
async accept(
  @Body() dto: AcceptTosDto,
  @Req() req: Request & { client: { id: string } },
  @Headers('x-forwarded-for') xForwardedFor?: string,
  @Headers('user-agent') userAgent?: string,
): Promise<TosAcceptanceResponseDto> {
  return this.tosService.accept(req.client.id, dto, xForwardedFor ?? null, userAgent ?? null);
}
```

### Public Endpoint — без TenantAuthGuard

```typescript
@Controller('api/v1/public')
export class TosPublicController {
  constructor(private readonly tosService: TosService) {}

  @Get('tos')
  async getPublished(@Query('lang') lang = 'bg'): Promise<TosResponseDto> {
    return this.tosService.getPublished(lang);
  }
}
```

### Flutter Force Re-Accept Flow

Проверката за ToS acceptance трябва да се случва **след успешен login** и **при всяко стартиране на app**:

```dart
// В AppRouter или main navigator observer:
Future<void> _checkTosAcceptance(BuildContext context) async {
  final status = await tosService.getStatus(); // GET /api/v1/clients/tos/status
  if (status.requiresAcceptance) {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => TosAcceptanceScreen(tosVersion: status.currentVersion!)),
    );
  }
}
```

`TosAcceptanceScreen` трябва да е **modal** или **fullscreen** — не може да се dismiss без accept. Ползвай `WillPopScope` (или `PopScope` в по-нови Flutter версии) за предотвратяване на back navigation.

### Провери преди имплементация

1. **`flutter_markdown` пакет** — провери `branivo_app/pubspec.yaml` дали е добавен от story 11-11. Ако не — предложи точна версия и изчакай одобрение (CLAUDE.md правило).
2. **ClientAuthGuard** — намери точното му име и импорт path в `src/modules/auth/` или `src/modules/sessions/`
3. **`ComplianceModule` import** — провери `app.module.ts` за текущото му местоположение; не дублирай

### Seed Placeholder Съдържание (Общи Условия)

```markdown
# Общи Условия — {BROKER_NAME}

**Последна актуализация:** {DATE}

## 1. Предмет на договора
Настоящите Общи Условия уреждат отношенията между {BROKER_NAME} и крайните клиенти при ползване на платформата за застрахователни услуги.

## 2. Предоставяни услуги
{BROKER_NAME} предоставя: (1) онлайн сравнение на застрахователни продукти; (2) сключване на застрахователни договори; (3) управление на полици и подновявания.

## 3. Права и задължения на клиента
Клиентът се задължава да предоставя вярна информация при сключване на застрахователен договор. Предоставянето на неверни данни освобождава застрахователя от задължения по полицата.

## 4. Плащания и такси
Всички плащания се обработват чрез Stripe. Таксите са посочени при всяка конкретна оферта. {BROKER_NAME} не съхранява данни за платежни карти.

## 5. Отговорност
{BROKER_NAME} действа като застрахователен посредник. Отговорността за изплащане на щети е на застрахователя, не на брокера.

## 6. Изменение на условията
{BROKER_NAME} може да изменя настоящите Общи Условия. При промяна клиентите ще бъдат уведомени и ще се изисква ново приемане.

## 7. Приложимо право
Настоящите Общи Условия се подчиняват на законодателството на Република България. Компетентен съд е Районен/Окръжен съд — гр. {CITY}.
```

Замени `{BROKER_NAME}`, `{DATE}`, `{CITY}` с demo стойности от demo тенанта в seed.service.ts.

### Критично: НИКОГА не нарушавай

- `audit_log` е IMMUTABLE — без UPDATE или DELETE (само INSERT чрез EventEmitter)
- Всяка DB заявка използва `TenantContext.getTenantId()` — никога `tenant_id` като param
- Публичният endpoint НЕ изисква JWT — само Host header за tenant resolution
- `end_client_tos_acceptances` записите са юридически доказателство — **не ги изтривай и не ги обновявай** (UPSERT е изключение за idempotency, но само `accepted_at` + context fields се обновяват, не се трие history)
- `insurer.api_key_enc` НЕ се излага в GET отговори (не се засяга, но правилото важи)

### Project Structure Notes

- `ComplianceModule` е `@Global()` и е регистриран в `AppModule` (от story 11-1) — НЕ добавяй отново в `AppModule`
- Добавянето на новите entities изисква `TypeOrmModule.forFeature([TenantTosVersion, EndClientTosAcceptance, ...existing...])` в `compliance.module.ts`
- Ако story 11-11 е вече имплементирана, `TenantPrivacyPolicy` ще е в `TypeOrmModule.forFeature` — добавяй двете нови entity-та до нея
- За Flutter: `lib/features/compliance/` вероятно ще е създадена от story 11-11 — ако не, създай я

### References

- Story 11-11 (`11-11-privacy-policy-white-label.md`) — идентичен архитектурен pattern; Version auto-increment, publish flow, public endpoint, audit log emit, seed structure
- Story 11-1 (`11-1-data-classification-pii-taxonomy.md`) — ComplianceModule foundation
- Sprint-status.yaml Wave 1 dependency order: 11-1 → 11-11 → **11-12** → 11-13 → 11-4 → 11-16
- `branivo-api/src/modules/compliance/entities/tenant-privacy-policy.entity.ts` — ToS entity reference
- `branivo-api/src/modules/compliance/privacy-policy.service.ts` — ToS service reference (виж implemented version)
- `branivo-api/src/modules/compliance/compliance.module.ts` — текущ модул за разширяване
- `branivo-api/src/infrastructure/database/migrations/1710000061000-CreateTenantPrivacyPolicies.ts` — migration reference
- Migration naming: `1710000062000-CreateTenantTosVersions.ts` (след 1710000061000)
- GDPR чл. 7 — условия за валидно съгласие; чл. 4(11) — дефиниция на „съгласие"
- Architecture.md: TenantContext usage rules, audit_log immutability, EventEmitter2 pattern

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(none)

### Completion Notes List

- Имплементирани 2 нови DB таблици (`tenant_tos_versions`, `end_client_tos_acceptances`) в единствена migration `1710000062000`
- `TosService` с пълна tenant isolation чрез `TenantContext.getTenantId()` на всеки метод
- UPSERT accept pattern с `ON CONFLICT DO UPDATE` за идемпотентност
- Audit log при publish чрез директен DataSource query (следва privacy-policy pattern)
- 3 backend controllers: admin (broker_admin only), public (no auth), client (ClientJwtAuthGuard)
- Flutter: `TosService`, `TosAcceptanceScreen` (force-accept с PopScope canPop=false), `TosScreen` (read-only), `_TosNotice` в registration flow
- ToS acceptance check в `HomeScreen.initState()` — след login и преди biometric prompt
- Seed с пълни 7-секционни Общи Условия за demo tenant; ON CONFLICT DO NOTHING
- `flutter_markdown: 0.7.4+2` добавен в pubspec.yaml; `TosAcceptanceScreen` и `TosScreen` обновени да ползват `MarkdownBody`/`Markdown`
- Code review fixes: RLS добавен за `end_client_tos_acceptances`; `accept()` вече проверява `isPublished: true`; `publish()` връща 400 при re-publish; extra `findOneOrFail` след UPSERT премахнат
- 34 NestJS теста (3 нови) + 5 Flutter widget теста; 0 lint errors; build success

### File List

**Нови файлове:**
- `branivo-api/src/infrastructure/database/migrations/1710000062000-CreateTenantTosVersions.ts`
- `branivo-api/src/modules/compliance/entities/tenant-tos-version.entity.ts`
- `branivo-api/src/modules/compliance/entities/end-client-tos-acceptance.entity.ts`
- `branivo-api/src/modules/compliance/dto/create-tos.dto.ts`
- `branivo-api/src/modules/compliance/dto/accept-tos.dto.ts`
- `branivo-api/src/modules/compliance/dto/tos-response.dto.ts`
- `branivo-api/src/modules/compliance/tos.service.ts`
- `branivo-api/src/modules/compliance/tos.service.spec.ts`
- `branivo-api/src/modules/compliance/tos.controller.ts`
- `branivo-api/src/modules/compliance/tos.controller.spec.ts`
- `branivo-api/src/modules/compliance/tos-public.controller.ts`
- `branivo-api/src/modules/compliance/tos-client.controller.ts`
- `branivo-api/src/modules/compliance/tos-client.controller.spec.ts`
- `branivo_app/lib/features/compliance/data/tos_service.dart`
- `branivo_app/lib/features/compliance/presentation/screens/tos_screen.dart`
- `branivo_app/lib/features/compliance/presentation/screens/tos_acceptance_screen.dart`
- `branivo_app/test/features/compliance/screens/tos_acceptance_screen_test.dart`

**Модифицирани файлове:**
- `branivo-api/src/modules/compliance/compliance.module.ts`
- `branivo-api/src/infrastructure/database/seed.service.ts`
- `branivo_app/lib/core/api/endpoints.dart`
- `branivo_app/lib/core/routing/app_router.dart`
- `branivo_app/lib/features/home/screens/home_screen.dart`
- `branivo_app/lib/features/registration/screens/registration_screen.dart`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `branivo_app/pubspec.yaml` (добавен `flutter_markdown: 0.7.4+2`)
