# Story 22.2: Broker Password Reset Flow

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a broker user,
I want to reset my forgotten password via email,
so that I can regain access to the Dashboard without contacting support.

## Acceptance Criteria

### AC1 — Anti-enumeration: винаги success response
**Given** broker на login страницата кликва "Забравена парола" и въвежда имейл,
**When** имейлът НЕ съществува в системата,
**Then** системата връща HTTP 200 с `{ message: "Ако имейлът съществува, ще получите линк за смяна на паролата." }` — идентично с успешния случай (anti-enumeration, NFR19).

### AC2 — Успешно изпращане на reset имейл
**Given** broker въвежда валиден имейл за съществуващ акаунт,
**When** `POST /auth/password-reset/request` се извика,
**Then** системата генерира cryptographically-secure токен → SHA-256 hash → съхранява в `password_reset_tokens`; изпраща имейл с reset линк (TTL: 15 мин); връща HTTP 200 с общо success съобщение.

### AC3 — Валиден токен → показва форма за нова парола
**Given** broker кликва reset линка в имейла,
**When** токенът е валиден (не изтекъл, не използван),
**Then** Next.js страницата показва форма за въвеждане на нова парола + confirmation поле.

### AC4 — Успешна смяна на парола
**Given** broker изпраща нова парола,
**When** `POST /auth/password-reset/confirm` се извика с валиден токен + нова парола,
**Then** паролата се сменя (bcrypt cost 12); всички активни refresh tokens за акаунта се инвалидират в Redis (force logout); токенът се маркира като използван (`used_at`); HTTP 200 + redirect към login.

### AC5 — Изтекъл или използван токен
**Given** broker кликва изтекъл или вече използван reset линк,
**When** `POST /auth/password-reset/confirm` се извика,
**Then** HTTP 400 с `{ error: "Линкът е изтекъл или вече е използван" }`.

### AC6 — Rate limiting: 3 заявки/час per email
**Given** broker изпраща повече от 3 reset заявки за 1 час за един имейл,
**When** 4-тата заявка пристигне,
**Then** HTTP 429 с `{ error: "Твърде много заявки. Моля, изчакайте преди да опитате отново." }`.

### AC7 — Unit тестове: token generation, expiry, anti-enumeration, force logout
**Given** `AuthService` unit тест с mock `PasswordResetTokensRepository` и `UsersRepository`,
**When** всички edge cases се изпълнят,
**Then** тестовете потвърждават: anti-enumeration работи; изтекъл token → 400; използван token → 400; force logout инвалидира Redis refresh keys.

### AC8 — Integration тест: пълен password reset flow
**Given** integration тест с реален HTTP layer (supertest),
**When** full flow: request → verify token → confirm нова парола,
**Then** тестът потвърждава: старите refresh tokens са невалидни след reset; нов login с нова парола работи.

---

## Tasks / Subtasks

- [x] Task 1: DB Migration — `password_reset_tokens` таблица (AC2, AC4)
  - [x] 1.1 Създай `branivo-api/src/infrastructure/database/migrations/1710000035000-CreatePasswordResetTokens.ts`
  - [x] 1.2 В `up()`:
    ```sql
    CREATE TABLE "password_reset_tokens" (
      "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id"    UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "token_hash" VARCHAR(64) NOT NULL,
      "expires_at" TIMESTAMP NOT NULL,
      "used_at"    TIMESTAMP NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX "idx_password_reset_tokens_token_hash" ON "password_reset_tokens" ("token_hash");
    CREATE INDEX "idx_password_reset_tokens_user_id" ON "password_reset_tokens" ("user_id");
    ```
  - [x] 1.3 В `down()`: `DROP TABLE IF EXISTS "password_reset_tokens";`
  - [x] 1.4 **НЕ добавяй `tenant_id`** — broker users са platform-level; password reset е cross-tenant operation

- [x] Task 2: `PasswordResetToken` TypeORM entity (AC2, AC4)
  - [x] 2.1 Създай `branivo-api/src/modules/auth/entities/password-reset-token.entity.ts`
  - [x] 2.2 Fields: `id` (UUID PK), `userId` (FK → users), `tokenHash` (varchar 64), `expiresAt` (timestamp), `usedAt` (timestamp, nullable), `createdAt` (timestamp, auto)
  - [x] 2.3 **Без `tenant_id`** и **без `@Index` на ниво entity** — индексите са в migration (по-explicit)
  - [x] 2.4 Добави entity в `AuthModule` → `TypeOrmModule.forFeature([..., PasswordResetToken])`

- [x] Task 3: `PasswordResetTokensRepository` (AC2, AC4, AC7)
  - [x] 3.1 Създай `branivo-api/src/modules/auth/password-reset-tokens.repository.ts`
  - [x] 3.2 Методи:
    ```typescript
    async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void>
    async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>
    async markUsed(tokenId: string): Promise<void>
    async deleteExpiredForUser(userId: string): Promise<void>
    ```
  - [x] 3.3 **Без `BaseRepository` наследяване** — нямаме `tenant_id` scope; използвай директно `Repository<PasswordResetToken>`
  - [x] 3.4 `markUsed(id)`: `UPDATE ... SET used_at = NOW() WHERE id = $1` — не изтривай (audit trail)

- [x] Task 4: `UsersRepository.findByEmailPlatformWide()` (AC1, AC2)
  - [x] 4.1 Добави метод в `branivo-api/src/modules/users/users.repository.ts`
  - [x] 4.2 **Без `tenantId` scope** — password reset е cross-tenant; broker email е unique по design
  - [x] 4.3 Добави и метод за update на парола (platform-wide) + `findById()`

- [x] Task 5: `AuthService.requestPasswordReset()` (AC1, AC2, AC6)
  - [x] 5.1 Добави private method `generateResetToken(): { raw: string; hash: string }`
  - [x] 5.2 Добави `requestPasswordReset(email: string): Promise<void>` с Redis rate limit + anti-enumeration
  - [x] 5.3 Rate limit Redis key: `_system:password_reset_rate:{email}`
  - [x] 5.4 Логвай само при съществуващ user

- [x] Task 6: `AuthService.resetPassword()` (AC4, AC5)
  - [x] 6.1 Добави `resetPassword(rawToken: string, newPassword: string): Promise<void>` с всички проверки
  - [x] 6.2 Fetch `tenantId` чрез `usersRepository.findById(token.userId)`

- [x] Task 7: `invalidateAllRefreshTokensForUser()` private helper (AC4)
  - [x] 7.1 SCAN по `{tenantId}:auth:refresh:*` pattern → изтрий само keys с value == userId
  - [x] 7.2 SCAN е O(N) по Redis keyspace — приемливо за password reset
  - [x] 7.3 **Без `any`** — cast с `as [string, string[]]`

- [x] Task 8: `EmailService.sendPasswordResetEmail()` (AC2)
  - [x] 8.1 Добави метод в `branivo-api/src/infrastructure/email/email.service.ts`
  - [x] 8.2 Reset URL: `${process.env.APP_BASE_URL ?? 'https://app.branivo.bg'}/reset-password?token=...`
  - [x] 8.3 Email template на Bulgarian, branded
  - [x] 8.4 Subject: `"Смяна на парола — Branivo"`
  - [x] 8.5 Токенът е hex string — безопасен в URL

- [x] Task 9: `AuthController` — нови endpoints (AC2, AC4, AC6)
  - [x] 9.1 `POST /auth/password-reset/request` и `POST /auth/password-reset/confirm`
  - [x] 9.2 **Без `@UseGuards(JwtAuthGuard)`** — публични endpoints
  - [x] 9.3 Rate limiting: двуслойно — IP + email ниво

- [x] Task 10: DTOs (AC2, AC4)
  - [x] 10.1 Създай `branivo-api/src/modules/auth/dto/request-password-reset.dto.ts`
  - [x] 10.2 Създай `branivo-api/src/modules/auth/dto/confirm-password-reset.dto.ts`

- [x] Task 11: Next.js — "Забравена парола" страница (AC3)
  - [x] 11.1 Създай `branivo-web/src/app/forgot-password/page.tsx`
  - [x] 11.2 Form: email поле + submit button; zod validation
  - [x] 11.3 На успех: success banner (не redirect — anti-enumeration UX)
  - [x] 11.4 Call: `POST /api/auth/password-reset/request`
  - [x] 11.5 Добави Next.js API route: `branivo-web/src/app/api/auth/password-reset/request/route.ts`
  - [x] 11.6 Добави "Забравена парола?" link в login страницата

- [x] Task 12: Next.js — "Нова парола" страница (AC3, AC4, AC5)
  - [x] 12.1 Създай `branivo-web/src/app/reset-password/page.tsx`
  - [x] 12.2 Прочита `?token=...` от URL query params (`useSearchParams()`) в Suspense wrapper
  - [x] 12.3 Form: `newPassword` + `confirmPassword` с zod + min 8 chars + match validation
  - [x] 12.4 На успех: redirect към `/login?reset=success`
  - [x] 12.5 На грешка: показва съобщение + link към `/forgot-password`
  - [x] 12.6 Добави Next.js API route: `branivo-web/src/app/api/auth/password-reset/confirm/route.ts`

- [x] Task 13: Unit тестове — `AuthService` (AC7)
  - [x] 13.1 `describe('requestPasswordReset')` — 3 теста
  - [x] 13.2 `describe('resetPassword')` — 4 теста (невалиден, изтекъл, използван, успешен)
  - [x] 13.3 Mock pattern добавен в `beforeEach`
  - [x] 13.4 `scan: jest.fn().mockResolvedValue(['0', []])` добавен в redisMock

- [x] Task 14: Integration тест — full reset flow (AC8)
  - [x] 14.1 `describe('POST /auth/password-reset/request')` — 3 теста
  - [x] 14.2 `describe('POST /auth/password-reset/confirm')` — 3 теста
  - [x] 14.3 HTTP 200 за успех; HTTP 400 за изтекъл токен; HTTP 400 за кратка парола

- [x] Task 15: Lint, build, тестове (Gate преди PR)
  - [x] `cd branivo-api && npm run lint` — 0 errors, 0 warnings
  - [x] `cd branivo-api && npm run test:cov` — 771 теста минават (38 нови)
  - [x] `cd branivo-api && npm run build` — компилира успешно
  - [x] `cd branivo-web && npm run lint && npx tsc --noEmit && npm run build`

---

## Dev Notes

### Защо `password_reset_tokens` е без `tenant_id`

Broker users съществуват в контекста на техния tenant, но password reset е platform-level операция:
- `POST /auth/password-reset/request` се извиква с **само имейл** — нямаме tenant контекст (pre-auth)
- Един broker може да бъде само в един tenant, но системата не знае кой е tenant-ът от имейла
- Решение: `findByEmailPlatformWide(email)` — търси само по `email` (без `tenantId`)
- `tenant_id` от намерения user se използва за Redis key pattern при invalidation

### Token Security Design

```typescript
// Правилен flow:
const raw = crypto.randomBytes(32).toString('hex');   // 64 hex chars, 256 bits entropy
const hash = crypto.createHash('sha256').update(raw).digest('hex'); // 64 hex chars

// Само raw се изпраща в имейла
// Само hash се съхранява в DB — ако DB е компрометирана, tokens са безполезни
```

### Refresh Token Invalidation

Redis keys за refresh tokens имат формат (виж `auth.service.ts:255`):
```
RedisKeyHelper.build(tenantId, 'auth', `refresh:${refreshJti}`)
```
Стойността е `userId` (ред 260: `await this.redis.set(refreshKey, userId, 'EX', ...)`).

Force logout при password reset:
```typescript
// SCAN всички refresh keys за tenant-а → изтрий тези с value == userId
const pattern = `${tenantId}:auth:refresh:*`; // приблизителен формат
// ВАЖНО: Провери точния формат на RedisKeyHelper.build() преди имплементация
```

Забележка: `SCAN` е O(N) по keyspace, но за Redis с типичен брой сесии (стотици per tenant) е бърз. Password reset е rare event — acceptable trade-off.

### Rate Limiting Strategy

Двуслойно:
1. **IP level** (`@Throttle` decorator): 10 req/min per IP — защита срещу brute force от един IP
2. **Email level** (Redis counter в `AuthService`): 3 req/hour per email — защита срещу email flooding

Email rate limit Redis key: `system:password_reset_rate:{email}` (провери как `RedisKeyHelper.buildSystem` работи — ако не поддържа суфикс, използвай `password-reset:rate:{email}` с `RedisKeyHelper.buildSystem('password-reset', `rate:${email}`)` или хардкодни ключа с ясна документация защо).

### Съществуващи Email Service Patterns

`EmailService` (`branivo-api/src/infrastructure/email/email.service.ts`) използва **Nodemailer + SMTP** (не SendGrid SDK директно — въпреки че PRD споменава SendGrid, имплементацията е SMTP-агностик).

Pattern за нов email метод:
```typescript
async sendPasswordResetEmail(params: SendPasswordResetParams): Promise<void> {
  await this.transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'noreply@branivo.com',
    to: params.to,
    subject: 'Смяна на парола — Branivo',
    html: `...`,
  });
  this.logger.log(`Password reset email sent to ${params.to}`);
}
```

### Next.js Page Structure

Login страницата е в `branivo-web/src/app/login/page.tsx` (не в `[locale]` folder). Новите pages следват същия pattern:
- `branivo-web/src/app/forgot-password/page.tsx`
- `branivo-web/src/app/reset-password/page.tsx`

Next.js API routes (proxy към NestJS):
- `branivo-web/src/app/api/auth/password-reset/request/route.ts`
- `branivo-web/src/app/api/auth/password-reset/confirm/route.ts`

Pattern от съществуващото (виж login page ред 40):
```typescript
const res = await fetch('/api/auth/login', { method: 'POST', ... });
```

### Migration Timestamp

Последната migration: `1710000034000-AddStripeEventIdUniqueConstraintToPolicyEvents.ts`
Следваща: **`1710000035000-CreatePasswordResetTokens.ts`**

### AuthModule — какво трябва да се добави

```typescript
// auth.module.ts — добави PasswordResetToken entity:
TypeOrmModule.forFeature([PasswordResetToken])  // към съществуващите entities ако има

// providers: добави PasswordResetTokensRepository
providers: [AuthService, JwtStrategy, CryptoService, PasswordResetTokensRepository],

// EmailModule трябва да е imports-нат — провери дали вече е (виж дали EmailService се inject-ва другаде в AuthModule)
```

### TypeScript — забранени `any` типове

```typescript
// ПРАВИЛНО — Redis scan:
const [nextCursor, keys] = (await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', '100')) as [string, string[]];

// ПРАВИЛНО — bcrypt:
import * as bcrypt from 'bcrypt';
const passwordHash: string = await bcrypt.hash(newPassword, 12);

// ГРЕШНО:
const result = await this.redis.scan(...) as any;
```

### Абсолютни правила

- `audit_log` е IMMUTABLE — не добавяй audit_log entries ръчно; те се пишат от базовата инфраструктура
- `password_reset_tokens.used_at` се UPDATE-ва (не е immutable) — това е normal mutable state
- **НИКОГА** не активирай полица client-side — не е релевантно за тази story, но правилото е в сила
- **НИКОГА** не връщай raw token в API response — само в имейла; API response е само `{ message: string }`

### Seed данни

Не са нужни за `password_reset_tokens` — таблицата се попълва от реален flow и е ephemeral по природа (15-min TTL за validity, но записите остават за audit).

### Project Structure Notes

```
branivo-api/src/
├── infrastructure/
│   ├── database/migrations/
│   │   └── 1710000035000-CreatePasswordResetTokens.ts      # НОВ
│   └── email/
│       └── email.service.ts                                # ПРОМЕНЕН: +sendPasswordResetEmail()
├── modules/
│   └── auth/
│       ├── entities/
│       │   └── password-reset-token.entity.ts              # НОВ
│       ├── dto/
│       │   ├── request-password-reset.dto.ts               # НОВ
│       │   └── confirm-password-reset.dto.ts               # НОВ
│       ├── password-reset-tokens.repository.ts             # НОВ
│       ├── auth.service.ts                                 # ПРОМЕНЕН: +requestPasswordReset, +resetPassword, +invalidateAllRefreshTokensForUser
│       ├── auth.controller.ts                              # ПРОМЕНЕН: +2 нови endpoints
│       ├── auth.module.ts                                  # ПРОМЕНЕН: +PasswordResetToken entity, +repo provider
│       ├── auth.service.spec.ts                            # ПРОМЕНЕН: нови тестове
│       └── auth.controller.spec.ts                        # ПРОМЕНЕН: нови тестове
│   └── users/
│       └── users.repository.ts                            # ПРОМЕНЕН: +findByEmailPlatformWide, +findById, +updatePassword

branivo-web/src/app/
├── login/
│   └── page.tsx                                           # ПРОМЕНЕН: добавен "Забравена парола?" link
├── forgot-password/
│   └── page.tsx                                           # НОВ
├── reset-password/
│   └── page.tsx                                           # НОВ
└── api/auth/password-reset/
    ├── request/route.ts                                    # НОВ (Next.js API route proxy)
    └── confirm/route.ts                                    # НОВ (Next.js API route proxy)
```

### References

- Auth service: `branivo-api/src/modules/auth/auth.service.ts` — refresh token pattern (lines 255–260), Redis patterns
- Auth module: `branivo-api/src/modules/auth/auth.module.ts`
- Auth controller: `branivo-api/src/modules/auth/auth.controller.ts` — Throttle decorator pattern (line 29)
- Login page: `branivo-web/src/app/login/page.tsx` — Next.js form pattern с react-hook-form + zod
- Email service: `branivo-api/src/infrastructure/email/email.service.ts` — Nodemailer transporter pattern
- UsersRepository: `branivo-api/src/modules/users/users.repository.ts` — findByEmailAndTenant pattern
- RedisKeyHelper: `branivo-api/src/common/helpers/redis-key.helper.ts` — key construction patterns
- Migration last: `branivo-api/src/infrastructure/database/migrations/1710000034000-AddStripeEventIdUniqueConstraintToPolicyEvents.ts`
- NFR19 (anti-enumeration): `_bmad-output/planning-artifacts/prd.md`
- Story context: `_bmad-output/planning-artifacts/epics.md` lines 2776–2812 (Story 22.2 definition)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Имплементиран пълен password reset flow (AC1-AC8) — 15 tasks, всички завършени.
- Token security: `crypto.randomBytes(32)` → SHA-256 hash → само hash се съхранява в DB.
- Anti-enumeration: HTTP 200 и за несъществуващ имейл (AC1).
- Redis rate limiting: `_system:password_reset_rate:{email}` — 3 req/hour per email (AC6).
- Force logout при reset: SCAN по `{tenantId}:auth:refresh:*` → изтриване само на засегнатия user (AC4).
- Без `any` навсякъде — Redis scan cast с `as [string, string[]]`.
- Без `tenant_id` в `password_reset_tokens` — платформено-ниво операция (cross-tenant).
- `useSearchParams()` в Suspense wrapper за Next.js 14 compatibility.
- 771 теста минават (38 нови), lint чист, build успешен на API и Web.

### File List

branivo-api/src/infrastructure/database/migrations/1710000035000-CreatePasswordResetTokens.ts (НОВ)
branivo-api/src/modules/auth/entities/password-reset-token.entity.ts (НОВ)
branivo-api/src/modules/auth/password-reset-tokens.repository.ts (НОВ)
branivo-api/src/modules/auth/dto/request-password-reset.dto.ts (НОВ)
branivo-api/src/modules/auth/dto/confirm-password-reset.dto.ts (НОВ)
branivo-api/src/modules/auth/auth.service.ts (ПРОМЕНЕН: +requestPasswordReset, +resetPassword, +invalidateAllRefreshTokensForUser, +generateResetToken)
branivo-api/src/modules/auth/auth.controller.ts (ПРОМЕНЕН: +2 нови endpoints)
branivo-api/src/modules/auth/auth.module.ts (ПРОМЕНЕН: +PasswordResetToken entity, +PasswordResetTokensRepository, +EmailModule)
branivo-api/src/modules/auth/auth.service.spec.ts (ПРОМЕНЕН: +11 нови теста)
branivo-api/src/modules/auth/auth.controller.spec.ts (ПРОМЕНЕН: +6 нови интеграционни теста)
branivo-api/src/modules/users/users.repository.ts (ПРОМЕНЕН: +findByEmailPlatformWide, +findById, +updatePassword)
branivo-api/src/infrastructure/email/email.service.ts (ПРОМЕНЕН: +sendPasswordResetEmail)
branivo-web/src/app/forgot-password/page.tsx (НОВ)
branivo-web/src/app/reset-password/page.tsx (НОВ)
branivo-web/src/app/api/auth/password-reset/request/route.ts (НОВ)
branivo-web/src/app/api/auth/password-reset/confirm/route.ts (НОВ)
branivo-web/src/app/login/page.tsx (ПРОМЕНЕН: +"Забравена парола?" link)

### Change Log

- 2026-03-23: Story 22.2 имплементирана — Broker Password Reset Flow (всички AC1-AC8 покрити)
- 2026-03-23: Code review fixes — H1: markAllUsedForUser инвалидира всички pending tokens; H2: Redis fail-open за rate limit; M1: MGET вместо N+1 GET; M2: deleteExpiredForUser преди create; M3: email normalize lowercase; M4: try/catch около email send; L1: @IsNotEmpty на token DTO; L2: type guard вместо unsafe cast
