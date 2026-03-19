# Story 3.2: SMS OTP Inline Registration

Status: review

## Story

As an anonymous end-client,
I want to register with my phone number via SMS OTP without leaving the current page,
So that I can create an account in under 20 seconds and continue where I left off.

## Acceptance Criteria

1. **AC1 — Inline разгъване (не modal, не redirect):**
   **Given** клиент натисне "Регистрирай се" докато разглежда оферти,
   **When** UI за регистрация се появи,
   **Then** формата се разгъва inline на същата страница с smooth expand animation (CSS transition) — без modal overlay и без page redirect

2. **AC2 — Screen reader достъпност (WCAG 2.1 AA):**
   **Given** inline registration form се разгъне,
   **When** screen reader е активен,
   **Then** announce-ва "Регистрационен формуляр се разгъна" чрез `aria-live="polite"` region

3. **AC3 — SMS OTP изпращане:**
   **Given** клиент въведе телефонен номер,
   **When** submit,
   **Then** SMS с 6-цифрен OTP се изпраща (TTL 5 мин, максимум 3 опита за нов код/час per номер per tenant); response: `{ message: "OTP изпратен", expires_in: 300 }`

4. **AC4 — Успешна регистрация < 20 сек:**
   **Given** клиент въведе верен OTP,
   **When** submit,
   **Then** акаунтът е създаден (или съществуващ е потвърден), анонимната сесия е мигрирана, клиентът е автентициран с JWT — целият процес < 20 сек; `access_token` и `refresh_token` се записват (web: httpOnly cookie; Flutter: flutter_secure_storage)

5. **AC5 — SMS auto-fill:**
   **Given** OTP е получен по SMS,
   **When** клиентът е на поддържано устройство,
   **Then** OTP input полето има `autocomplete="one-time-code"` и `inputmode="numeric"` за OS-level auto-fill

6. **AC6 — Rate limiting при грешен OTP:**
   **Given** 3 грешни OTP опита в рамките на 1 час,
   **When** клиентът опита отново,
   **Then** получава HTTP 429 с `{ message: "Твърде много опити. Опитайте след 1 час.", retry_after: 3600 }`

7. **AC7 — Изтекъл OTP:**
   **Given** OTP е изтекъл (> 5 минути),
   **When** клиентът го submit-не,
   **Then** получава HTTP 422 с ясна грешка `{ message: "Кодът е изтекъл. Поискайте нов код." }` и бутон "Изпрати нов код"

8. **AC8 — Миграция на анонимна сесия:**
   **Given** клиентът е имал активна анонимна сесия преди регистрацията,
   **When** OTP е верифициран успешно,
   **Then** `POST /api/v1/sessions/anonymous/:sessionId/migrate` се извиква с новия JWT; всички vehicle_data от Redis мигрират в акаунта; анонимният Redis ключ се изтрива

9. **AC9 — Съществуващ акаунт (same phone):**
   **Given** клиент въведе телефон, с който вече е регистриран в tenant-а,
   **When** OTP е верифициран,
   **Then** системата автентицира съществуващия акаунт (не създава дублиран) и мигрира сесията

## Tasks / Subtasks

### Backend — DB Migration & Entity

- [x] **Task 1: Миграция — CreateEndClientsTable** (AC: #4, #8, #9)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000009000-CreateEndClientsTable.ts`
  - [x] Таблица `end_clients` с UUID PK, tenant_id FK, phone_number, phone_verified, first/last_name, timestamps, soft delete
  - [x] UNIQUE INDEX `(tenant_id, phone_number)` WHERE `deleted_at IS NULL`
  - [x] RLS policy `end_clients_tenant_isolation` с `current_setting('app.current_tenant_id')`

- [x] **Task 2: EndClientEntity** (AC: #4, #9)
  - [x] Файл: `branivo-api/src/modules/clients/entities/end-client.entity.ts`
  - [x] phoneNumber, phoneVerified, firstName (nullable), lastName (nullable), timestamps, deletedAt

### Backend — ClientsModule

- [x] **Task 3: Създай ClientsModule** (AC: #4, #9)
  - [x] Файл: `branivo-api/src/modules/clients/clients.module.ts`
  - [x] JwtModule.registerAsync с ConfigService, SessionsModule import, TypeOrmModule, TenantContextModule
  - [x] ClientsModule добавен в AppModule

- [x] **Task 4: EndClientRepository** (AC: #4, #9)
  - [x] Файл: `branivo-api/src/modules/clients/repositories/end-client.repository.ts`
  - [x] findByPhone, findOrCreate, markPhoneVerified — всички ползват setTenantSession()

- [x] **Task 5: ClientAuthService** (AC: #3, #4, #6, #7, #8, #9)
  - [x] Файл: `branivo-api/src/modules/clients/client-auth.service.ts`
  - [x] requestOtp с Redis rate limiting (client_otp_req, max 3/hour)
  - [x] verifyOtp с attempts tracking, OTP expiry, cleanup
  - [x] generateTokens с JWT payload `{ sub, tid, role: 'end_client', jti }`

- [x] **Task 6: SmsService** (AC: #3)
  - [x] Файл: `branivo-api/src/modules/clients/sms.service.ts`
  - [x] Twilio REST API (без директен SDK), iOS auto-fill формат (@domain #code)

- [x] **Task 7: ClientAuthController** (AC: #1, #3, #4, #6, #7)
  - [x] Файл: `branivo-api/src/modules/clients/client-auth.controller.ts`
  - [x] POST request-otp с @Throttle, POST verify-otp с httpOnly cookie
  - [x] TenantContext.getTenantId() за tenant resolution

- [x] **Task 8: DTOs** (AC: #3, #4)
  - [x] request-otp.dto.ts, verify-otp.dto.ts, client-auth-response.dto.ts

### Backend — Тестове

- [x] **Task 9: Unit тестове за ClientAuthService** (AC: #3, #4, #6, #7, #9)
  - [x] 7 unit теста: requestOtp sends OTP, rate limit 3+, verifyOtp correct, expired, wrong code, 3 attempts, existing account

- [x] **Task 10: Integration тестове за ClientAuthController** (AC: #3, #4, #6, #7)
  - [x] 5 integration теста: request-otp 200, 429 propagated, verify-otp 200, 422, migrate session

### Next.js Web — Inline Registration

- [x] **Task 11: InlineRegistration компонент** (AC: #1, #2, #5, #6, #7)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/quotes/components/inline-registration.tsx`
  - [x] State машина, CSS transition, aria-live WCAG, OTP autocomplete="one-time-code", timer, error messages

- [x] **Task 12: `useClientAuth` hook** (AC: #3, #4, #6, #7, #8)
  - [x] Файл: `branivo-web/src/lib/hooks/use-client-auth.ts`
  - [x] requestOtp, verifyOtp, RateLimitError, OtpExpiredError, no localStorage

- [x] **Task 13: BFF routes за client auth** (AC: #3, #4)
  - [x] request-otp/route.ts, verify-otp/route.ts — Host header forwarding, Set-Cookie propagation

- [x] **Task 14: Обнови Quotes страницата** (AC: #1, #4)
  - [x] "Регистрирай се / Влез" бутон, InlineRegistration inline, welcome banner

### Next.js Web — Тестове

- [x] **Task 15: Component тест за InlineRegistration** (AC: #1, #2, #5, #6, #7)
  - [x] 6 компонент теста

- [x] **Task 16: Unit тест за `useClientAuth` hook** (AC: #3, #4, #6, #7)
  - [x] 4 hook теста

### Flutter — Registration

- [x] **Task 17: RegistrationBloc** (AC: #3, #4, #6, #7, #8)
  - [x] registration_bloc.dart, registration_event.dart, registration_state.dart

- [x] **Task 18: ClientAuthRepository** (AC: #3, #4)
  - [x] client_auth_repository.dart — Dio, flutter_secure_storage, RateLimitException, OtpExpiredException

- [x] **Task 19: Registration Screen** (AC: #1, #3, #5)
  - [x] registration_screen.dart — BlocConsumer, phone form, OTP form с timer, error states

- [x] **Task 20: Widget тест за RegistrationBloc** (AC: #3, #4, #6, #7)
  - [x] 5 bloc теста

## Dev Notes

### Redis Key Pattern за OTP

```typescript
// OTP код (TTL 5 мин = 300 сек)
const otpKey = `client_otp:${tenantId}:${phoneNumber}`;
await this.redis.setex(otpKey, 300, otpCode);

// Attempt counter за грешни кодове (TTL 1 час)
const attemptsKey = `client_otp_attempts:${tenantId}:${phoneNumber}`;
const attempts = await this.redis.incr(attemptsKey);
if (attempts === 1) await this.redis.expire(attemptsKey, 3600); // само при 1-ви increment

// Request rate (колко нови кода са поискани) — TTL 1 час
const reqKey = `client_otp_req:${tenantId}:${phoneNumber}`;
const reqCount = await this.redis.incr(reqKey);
if (reqCount === 1) await this.redis.expire(reqKey, 3600);
if (reqCount > 3) throw new TooManyRequestsException({ retry_after: 3600 });
```

**Защо tenant-scoped ключ:** За разлика от анонимните сесии (`anon:{sessionId}:session` — non-tenant-scoped), OTP ключовете **трябва** да са tenant-scoped, защото един телефонен номер може да е регистриран при различни broker тенанта.

### Интеграция с Story 3.1 — migrate endpoint

Story 3.1 вече е имплементирала `POST /api/v1/sessions/anonymous/:sessionId/migrate`. Тя изисква JWT (`JwtAuthGuard`). Flow в Story 3.2:

```typescript
// В ClientAuthController.verifyOtp():
// 1. Верифицирай OTP → вземи EndClientEntity
// 2. Генерирай JWT tokens
// 3. Ако session_id е подаден:
const jwt = this.jwtService.sign({ sub: client.id, ... });
// Извикай AnonymousSessionsService директно (не HTTP call):
const sessionData = await this.anonymousSessionsService.migrateSession(
  dto.sessionId,
  tenantId,
  client.id.toString()
);
// ВАЖНО: AnonymousSessionsModule трябва да е imported в ClientsModule
// или използвай EventEmitter за loose coupling
```

**Предпочитан подход:** Импортирай `SessionsModule` в `ClientsModule` (директен import на service, не HTTP call) — по-прост, по-бърз, без distributed transaction.

### Структура на end_clients таблицата — бъдещи stories

```
end_clients
├── id (UUID PK)
├── tenant_id (UUID FK)
├── phone_number (VARCHAR, unique per tenant)
├── phone_verified (BOOLEAN)
├── first_name (nullable — Story 3.2 не го изисква)
├── last_name (nullable)
├── created_at / updated_at / deleted_at
│
└── [Story 3.5 ще добави OneToMany]: vehicles → vehicles.owner_id → end_clients.id
```

**Следващи migrations:**
- `1710000010000` — Story 3.3 (OCR jobs таблица)
- `1710000011000` — Story 3.5 (vehicles таблица с `owner_id → end_clients`)

### JWT за End Clients — разграничение от Broker Users

```typescript
// End Client JWT payload (Story 3.2)
{ sub: clientId, jti: uuid(), role: 'end_client', tenantId, iat, exp }

// Broker Admin JWT payload (Story 1.3 — вече съществува)
{ sub: userId, jti: uuid(), role: BrokerRole, tenantId, iat, exp, twoFaVerified: boolean }
```

**ВАЖНО:** `JwtAuthGuard` проверява само `sub` и `tenantId`. End clients и broker admins ползват **едни и същи JWT guards** — `role` разграничава достъпа чрез `RolesGuard`.

**`migrate` endpoint-ът в Story 3.1** вече изисква `JwtAuthGuard` — след Story 3.2 end client JWT ще го удовлетворява. **Не модифицирай** `JwtAuthGuard` или `JwtStrategy` — те са вече коректни.

### Twilio SMS Integration

```typescript
// ConfigService environment variables:
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+359xxxxxxxxx  // или +1xxx за international

// SmsService.sendOtp() pattern:
import Twilio from 'twilio';
const client = Twilio(this.config.get('TWILIO_ACCOUNT_SID'), this.config.get('TWILIO_AUTH_TOKEN'));
await client.messages.create({
  body: `Вашият Branivo код е: ${otpCode}. Валиден 5 минути.`,
  from: this.config.get('TWILIO_PHONE_NUMBER'),
  to: phoneNumber,
});
```

**SMS Auto-fill (WebOTP API):** Браузърите поддържат `autocomplete="one-time-code"` нативно. iOS Safari и Android Chrome ще предложат OTP от SMS. Не е нужна допълнителна JS логика — само правилните HTML атрибути.

### NestJS Module Structure — Clients

```
branivo-api/src/modules/clients/
├── clients.module.ts
├── client-auth.controller.ts
├── client-auth.service.ts
├── sms.service.ts                    ← или reuse от notifications/
├── repositories/
│   └── end-client.repository.ts
├── entities/
│   └── end-client.entity.ts
├── dto/
│   ├── request-otp.dto.ts
│   ├── verify-otp.dto.ts
│   └── client-auth-response.dto.ts
├── client-auth.controller.spec.ts
└── client-auth.service.spec.ts
```

**Провери преди имплементация:** Ако `branivo-api/src/modules/notifications/channels/sms.channel.ts` вече съществува (Story 1.x може да е добавило базова нотификационна инфраструктура), ползвай него вместо нов `SmsService`. Ако не — създай `sms.service.ts` в `clients/`.

### Next.js — Нови/Променени файлове

```
branivo-web/src/app/[locale]/(client)/quotes/
├── page.tsx                                ← ПРОМЕНЕН (добавен регистрационен бутон)
└── components/
    └── inline-registration.tsx             ← НОВО

branivo-web/src/app/api/v1/auth/client/
├── request-otp/
│   └── route.ts                            ← НОВО
└── verify-otp/
    └── route.ts                            ← НОВО

branivo-web/src/lib/hooks/
└── use-client-auth.ts                      ← НОВО
```

### Flutter — Нови файлове

```
branivo_app/lib/features/registration/
├── bloc/
│   ├── registration_bloc.dart
│   ├── registration_event.dart
│   └── registration_state.dart
├── data/
│   └── repositories/
│       └── client_auth_repository.dart
└── screens/
    └── registration_screen.dart

branivo_app/test/features/registration/
└── registration_bloc_test.dart
```

### UX Copy — точни текстове

| Ситуация | Текст |
|----------|-------|
| OTP изпратен | "Изпратихме код на {phone}. Валиден 5 минути." |
| Грешен OTP | "Грешен код. Опитвания: {X}/3." |
| OTP изтекъл | "Кодът изтече. Поискайте нов код." |
| Rate limit (опити) | "Твърде много опити. Опитайте след 1 час." |
| Rate limit (нови кодове) | "Изпратихте твърде много кодове. Опитайте след 1 час." |
| Успешна регистрация | "Добре дошъл! Данните ти са запазени." |
| WCAG announce | "Регистрационен формуляр се разгъна" |

**НЕ ползвай:** "OTP", "token", "HTTP 429", "rate limit", "Redis" в потребителски съобщения.

### Dependency от Story 3.1

Story 3.2 **директно зависи** от Story 3.1:
- `AnonymousSessionsService.migrateSession()` — вече е имплементирана
- `SessionsModule` — вече е в `AppModule`
- `(client)/layout.tsx` — вече съществува
- `useAnonymousSession()` hook — вече съществува; expose-ва `sessionId`

**НЕ пренаписвай** файлове от Story 3.1. Само ги **използвай**.

### Project Structure Notes

**Alignment с архитектурата:**
- Controller → Service → Repository pattern (без прескачане)
- `TenantContext.getTenantId()` — задължително; не предавай като параметър
- `BaseRepository` extends с auto soft delete
- `flutter_secure_storage` за JWT tokens (не Hive)
- BLoC pattern за Flutter (не setState/Provider)
- Rate limiting на controller + бизнес ниво (двойна защита)
- httpOnly cookie за refresh token (CSRF protection)

**Конфликти/Отклонения:**
- `SmsService` може да е нов клас — проверява се дали notifications/ го вече съдържа
- `clients_otp_*` Redis ключовете са tenant-scoped (за разлика от `anon:` ключовете от Story 3.1)

### References

- [Source: epics.md#Story 3.2] — User story, Acceptance Criteria, inline animation, 20-сек target
- [Source: prd.md#Journey 1b: Николай купува ГО за пръв път] — Micro-registration, OTP flow, session migration
- [Source: architecture.md#Authentication & Security] — JWT TTL, otplib, Twilio → email fallback, rate limits
- [Source: architecture.md#Cross-Cutting Concerns — #9] — Anonymous → Authenticated migration flow
- [Source: architecture.md#Explicit Architectural Constraints — #2] — localStorage/secure_storage, httpOnly cookies
- [Source: architecture.md#NestJS Module Boundary Rules] — InfrastructureModule shared; директни domain imports забранени
- [Source: Story 3.1 Dev Notes] — `AnonymousSessionsService.migrateSession()`, Redis key patterns, `SessionsModule` структура
- [Source: architecture.md#SMS Integration] — Twilio → email OTP fallback pattern
- [Source: branivo-api/src/modules/sessions/anonymous-sessions.service.ts] — Redis SETEX/DEL patterns
- [Source: branivo-api/src/common/guards/jwt-auth.guard.ts] — Existing JWT guard (не модифицирай)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_(none)_

### Completion Notes List

- Имплементирани 20 задачи: DB migration, EndClientEntity, ClientsModule, EndClientRepository, ClientAuthService, SmsService, ClientAuthController, DTOs, InlineRegistration компонент, useClientAuth hook, BFF routes, Quotes page update, RegistrationBloc, ClientAuthRepository, RegistrationScreen
- AuthModule не exports JwtModule — ClientsModule ползва собствен JwtModule.registerAsync (same secret)
- NotificationsModule е празен — SmsService е нов в clients/ (Twilio REST API без SDK)
- Redis ключове: `client_otp:{tenantId}:{phone}` (TTL 300s), `client_otp_attempts:...` (TTL 3600s), `client_otp_req:...` (TTL 3600s)
- isNew логиката: `!client.phoneVerified` ПРЕДИ markPhoneVerified (верен индикатор)
- 254 API теста + 69 Web теста + 16 Flutter теста — всички минават без регресии
- Build: API ✓, Web ✓, Flutter analyze --no-fatal-infos ✓ (1 info за null-aware — стилистичен)

### File List

**Backend (branivo-api)**
- branivo-api/src/infrastructure/database/migrations/1710000009000-CreateEndClientsTable.ts _(ново)_
- branivo-api/src/modules/clients/entities/end-client.entity.ts _(ново)_
- branivo-api/src/modules/clients/repositories/end-client.repository.ts _(ново)_
- branivo-api/src/modules/clients/client-auth.service.ts _(ново)_
- branivo-api/src/modules/clients/client-auth.service.spec.ts _(ново)_
- branivo-api/src/modules/clients/client-auth.controller.ts _(ново)_
- branivo-api/src/modules/clients/client-auth.controller.spec.ts _(ново)_
- branivo-api/src/modules/clients/sms.service.ts _(ново)_
- branivo-api/src/modules/clients/clients.module.ts _(ново)_
- branivo-api/src/modules/clients/dto/request-otp.dto.ts _(ново)_
- branivo-api/src/modules/clients/dto/verify-otp.dto.ts _(ново)_
- branivo-api/src/modules/clients/dto/client-auth-response.dto.ts _(ново)_
- branivo-api/src/app.module.ts _(променен — добавен ClientsModule)_

**Next.js Web (branivo-web)**
- branivo-web/src/app/[locale]/(client)/quotes/components/inline-registration.tsx _(ново)_
- branivo-web/src/app/api/v1/auth/client/request-otp/route.ts _(ново)_
- branivo-web/src/app/api/v1/auth/client/verify-otp/route.ts _(ново)_
- branivo-web/src/lib/hooks/use-client-auth.ts _(ново)_
- branivo-web/src/app/[locale]/(client)/quotes/page.tsx _(променен)_
- branivo-web/src/__tests__/client/inline-registration.test.tsx _(ново)_
- branivo-web/src/__tests__/hooks/use-client-auth.test.ts _(ново)_

**Flutter (branivo_app)**
- branivo_app/lib/features/registration/bloc/registration_bloc.dart _(ново)_
- branivo_app/lib/features/registration/bloc/registration_event.dart _(ново)_
- branivo_app/lib/features/registration/bloc/registration_state.dart _(ново)_
- branivo_app/lib/features/registration/data/repositories/client_auth_repository.dart _(ново)_
- branivo_app/lib/features/registration/screens/registration_screen.dart _(ново)_
- branivo_app/test/features/registration/registration_bloc_test.dart _(ново)_

**Sprint Status**
- _bmad-output/implementation-artifacts/sprint-status.yaml _(променен — 3-2 → review)_

## Change Log

- 2026-03-19: Имплементирана Story 3.2 SMS OTP Inline Registration — ClientsModule (backend), InlineRegistration + useClientAuth (web), RegistrationBloc + ClientAuthRepository (Flutter). 254 API + 69 Web + 16 Flutter теста — всички минават.
