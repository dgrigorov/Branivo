# Story 15.2: Sign in with Google

Status: done

## Story

As a new end customer,
I want to register and log in using my Google account,
So that I can start using the platform without going through the SMS OTP flow.

## Acceptance Criteria

**AC1:** При натискане на „Продължи с Google" бутон → Google OAuth 2.0 consent screen се отваря в нативен WebView (google_sign_in Flutter package). При успешен consent → Flutter получава Google ID token.

**AC2:** Flutter изпраща `POST /api/v1/auth/client/google` с `{ id_token, session_id? }` → API верифицира Google ID token чрез `google-auth-library` → ако имейлът не съществува → нов `end_clients` запис с `auth_provider = 'google'`, `google_sub = sub` → издава Branivo JWT (access + refresh token).

**AC3:** Ако `end_clients` запис с `google_sub = sub` вече съществува → логва директно; ако `end_clients` запис с `email = email_from_google` (и `auth_provider = 'sms'`) съществува → auto-merge: `google_sub` се записва, `auth_provider` се update-ва на `'google'`; Flutter получава съобщение `"Свързахме Google акаунта ви"`.

**AC4:** Google OAuth customer може да достъпи всички screens; при опит за първа покупка (ако `phone_verified = false`) → popup/gate: „Добавете телефонен номер за верификация" → SMS OTP flow за телефонна верификация (КФН изискване).

**AC5:** Google ID token НИКОГА не се съхранява в API или Flutter storage — само Branivo JWT (access + refresh) се съхраняват в `flutter_secure_storage`.

**AC6:** Widget тест за GoogleSignIn button: успешен flow, cancelled flow, API error.

**AC7:** Unit тест за `POST /auth/client/google`: нов customer, съществуващ google customer (login), merge от SMS customer.

## Tasks / Subtasks

- [x] 1. DB миграция — нови колони в `end_clients` (AC: 2, 3)
  - [x] Добави TypeORM migration: `ALTER TABLE end_clients ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'sms'`
  - [x] Добави TypeORM migration: `ALTER TABLE end_clients ADD COLUMN google_sub VARCHAR(255) NULL`
  - [x] Добави TypeORM migration: `ALTER TABLE end_clients ADD COLUMN apple_sub VARCHAR(255) NULL` (за следващата story 15-3 — добавяме сега)
  - [x] Добави UNIQUE INDEX на `(tenant_id, google_sub)` WHERE `google_sub IS NOT NULL`
  - [x] Обнови `EndClient` entity: добави `authProvider`, `googleSub`, `appleSub` колони

- [x] 2. Инсталирай `google-auth-library` в branivo-api (AC: 2)
  - [x] `npm install google-auth-library` (проверка за latest stable — v9.x)
  - [x] Добави `GOOGLE_CLIENT_ID` в `.env.example` и `ConfigService`

- [x] 3. Нов DTO и endpoint `POST /auth/client/google` (AC: 2, 3)
  - [x] Нов файл: `branivo-api/src/modules/clients/dto/google-auth.dto.ts` с `id_token: string`, `session_id?: string`
  - [x] Добави `googleAuth(dto)` метод в `ClientAuthService`:
    - Verify Google ID token чрез `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`
    - Extract `sub`, `email`, `given_name`, `family_name` от payload
    - Намери по `google_sub` → директен login
    - Намери по `email` (SMS customer) → merge (update `google_sub` + `auth_provider`)
    - Ако не намери → create нов `end_clients` запис с `auth_provider = 'google'`
    - Генерира Branivo JWT чрез съществуващия `generateTokens(client)` метод
    - **НИКОГА** не съхранява Google ID token
  - [x] Добави `@Post('google')` в `ClientAuthController` — следва паттерна на `verifyOtp()`: сесия migration + refresh_token cookie + access_token response
  - [x] Response: `{ access_token, user: { id, phone_number, is_new, account_merged, phone_verified } }`

- [x] 4. Обнови `EndClientRepository` (AC: 2, 3)
  - [x] Добави `findByGoogleSub(tenantId, googleSub): Promise<EndClient | null>`
  - [x] Добави `findByEmail(tenantId, email): Promise<EndClient | null>`
  - [x] Добави `createGoogleClient()`, `mergeGoogleAccount()`, `updatePhone()` методи

- [x] 5. Flutter: Инсталирай `google_sign_in` package (AC: 1)
  - [x] `google_sign_in: ^6.2.2` добавен в `pubspec.yaml`
  - [x] iOS: `GIDClientID` placeholder отбелязан в Dev Notes (изисква реален client ID)
  - [x] Android: placeholder инструкции отбелязани в Dev Notes

- [x] 6. Нов `GoogleSignInService` в Flutter (AC: 1, 5)
  - [x] Нов файл: `branivo_app/lib/features/auth/services/google_sign_in_service.dart`
  - [x] `signIn()` → `GoogleSignIn().signIn()` → `authentication.idToken`
  - [x] `signOut()` → `GoogleSignIn().signOut()`
  - [x] Injectable (конструктор параметър) — следва `BiometricAuthService` паттерна за testability

- [x] 7. Разшири `AuthBloc` с Google event (AC: 2, 3, 4)
  - [x] Добави `GoogleSignInRequestedEvent` в `auth_event.dart`
  - [x] Добави `_onGoogleSignInRequested` handler в `auth_bloc.dart`
  - [x] Handler flow:
    1. `GoogleSignInService.signIn()` → получи `idToken`
    2. Ако `idToken == null` (cancelled) → emit `AuthInitialState` (не emit грешка)
    3. `POST /api/v1/auth/client/google { id_token: idToken, session_id }`
    4. Съхрани `access_token` + `phone_verified` в `flutter_secure_storage`
    5. Ако `account_merged == true` → SnackBar в `LoginScreen`
    6. emit `AuthAuthenticatedState(accountMerged, phoneVerified)`
  - [x] `AuthBloc` приема `GoogleSignInService` като допълнителен параметър

- [x] 8. Добави „Продължи с Google" бутон в `LoginScreen` (AC: 1)
  - [x] В `login_screen.dart` → добави `_GoogleSignInButton` widget
  - [x] UI: `OutlinedButton.icon` с `Icons.g_mobiledata` (Google цвят)
  - [x] Label: „Продължи с Google"
  - [x] `onTap` → `context.read<AuthBloc>().add(GoogleSignInRequestedEvent())`
  - [x] Separator „или" между Google бутона и анонимния scan бутон

- [x] 9. Phone verification gate при първа покупка (AC: 4)
  - [x] `PaymentScreen.initState` чете `phone_verified` от `flutter_secure_storage`
  - [x] Ако `phone_verified == 'false'` → показва `PhoneVerificationDialog`
  - [x] `PhoneVerificationDialog` вика `POST /auth/client/phone/request-otp` + `POST /auth/client/phone/verify`
  - [x] След верификация → update `phone_verified = 'true'` в storage + `end_clients`

- [x] 10. Обнови `app_router.dart` (AC: 1)
  - [x] Добави `_googleSignInService` global instance
  - [x] Подай `googleSignInService` като параметър на `AuthBloc` в `/login` route

- [x] 11. Seed данни (нов `authProvider` поле) (AC: 2)
  - [x] `seed.service.ts` — demo end_client ще получи `auth_provider = 'sms'` чрез DEFAULT (не нужна промяна)

- [x] 12. Тестове (AC: 6, 7)
  - [x] Unit тест: `client-auth.service.spec.ts` — `googleAuth()`: нов, съществуващ, merge, invalid token, null payload
  - [x] Unit тест: `client-auth.service.spec.ts` — `verifyPhoneOtp()`: успешно, ConflictException
  - [x] Integration тест: `client-auth.controller.spec.ts` — `POST /auth/client/google`: нов, merge, login, invalid
  - [x] Widget тест: `branivo_app/test/features/auth/google_sign_in_service_test.dart`:
    - Mock `GoogleSignIn` чрез mocktail
    - [x] Тест: успешен signIn → idToken returned
    - [x] Тест: cancelled signIn → null returned
    - [x] Тест: GoogleSignIn error → exception propagated

## Dev Notes

### Архитектурни решения — КРИТИЧНО

**Кой сервиз обработва клиентска auth?**
- `branivo-api/src/modules/clients/client-auth.service.ts` — НЕ `auth.service.ts` (broker auth)
- Endpoint base: `POST /api/v1/auth/client/google` (следва `/auth/client/verify-otp`)
- `ClientAuthController` @ `branivo-api/src/modules/clients/client-auth.controller.ts`

**Защо `end_clients`, не `customers`?**
- Архитектурният документ споменава `customers` таблица, но реалният entity е `end_clients`
- `branivo-api/src/modules/clients/entities/end-client.entity.ts` — TypeORM entity
- Всяка DB промяна трябва да е в `end_clients` таблицата

**Token верификация — Google:**
```typescript
// google-auth-library v9.x паттерн
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const ticket = await client.verifyIdToken({
  idToken: dto.id_token,
  audience: GOOGLE_CLIENT_ID,
});
const payload = ticket.getPayload();
// payload.sub, payload.email, payload.given_name, payload.family_name
```

**Auth flow диаграма:**
```
Flutter GoogleSignIn.signIn()
  → Google OAuth consent
  → idToken (Google JWT)
  → POST /api/v1/auth/client/google { id_token }
  → API: verifyIdToken → payload
  → намери/създай end_clients запис
  → generateTokens(client) → { access_token, refresh_token }
  → refresh_token → httpOnly cookie (path: /api/v1/auth/client/refresh)
  → access_token → Flutter secure storage
  → emit AuthAuthenticatedState
```

**Phone verification gate (КФН):**
- `phone_verified` вече съществува в `end_clients` entity (bool, default false)
- За SMS OTP customers: `phone_verified = true` след `verifyOtp()`
- За Google OAuth customers: `phone_verified = false` при създаване
- Gate се активира при checkout (не при login) — не блокира browsing/quotes

**Account merge логика:**
```
1. Намери по google_sub (tenant_id, google_sub) → login (no merge needed)
2. Намери по email (tenant_id, email) + auth_provider = 'sms' → merge:
   UPDATE end_clients SET google_sub = $sub, auth_provider = 'google' WHERE id = $id AND tenant_id = $tenantId
3. Нищо не намери → INSERT нов record
```

**Сигурност:**
- Google ID token се верифицира САМО срещу `GOOGLE_CLIENT_ID` (audience check)
- Google ID token НЕ се съхранява никъде (нито Redis, нито DB)
- `google_sub` е непроменима стойност от Google — достатъчна за идентификация

### Flutter архитектурни бележки

**`GoogleSignInService` паттерн** — следва `BiometricAuthService` от Story 15-1:
- Injectable чрез конструктор параметър
- Mock-ваем в тестове чрез mocktail
- Инстанциран в `app_router.dart` (глобална инстанция)

**`AuthBloc` разширение:**
- `AuthBloc` вече приема `biometricService` (Story 15-1) — добави `googleSignInService` като втори опционален параметър
- Не промяй съществуващите `_onBiometricLoginRequested` и другите handlers

**Storage keys (flutter_secure_storage)** — непроменени от Story 15-1:
| Key | Тип | Описание |
|-----|-----|----------|
| `access_token` | String | JWT access token |
| `refresh_token` | String | JWT refresh token |
| `biometric_enabled` | `'true'` / null | Биометрия флаг |
| `biometric_failure_count` | String / null | Неуспехи |

### Съществуващи файлове за модификация

| Файл | Промяна |
|------|---------|
| `branivo-api/src/modules/clients/entities/end-client.entity.ts` | Добави `authProvider`, `googleSub`, `appleSub` |
| `branivo-api/src/modules/clients/client-auth.service.ts` | Добави `googleAuth()` метод |
| `branivo-api/src/modules/clients/client-auth.controller.ts` | Добави `POST /google` endpoint |
| `branivo-api/src/modules/clients/repositories/end-client.repository.ts` | Добави `findByGoogleSub()`, `findByEmail()` |
| `branivo-api/src/modules/clients/clients.module.ts` | Добави `OAuth2Client` provider ако нужно |
| `branivo_app/lib/features/auth/bloc/auth_event.dart` | Добави `GoogleSignInRequestedEvent` |
| `branivo_app/lib/features/auth/bloc/auth_bloc.dart` | Добави `googleSignInService` + `_onGoogleSignInRequested` |
| `branivo_app/lib/features/auth/screens/login_screen.dart` | Добави `_GoogleSignInButton` widget |
| `branivo_app/lib/core/routing/app_router.dart` | Добави `_googleSignInService` + подай на `AuthBloc` |
| `branivo_app/pubspec.yaml` | Добави `google_sign_in` |

### Нови файлове

| Файл | Описание |
|------|---------|
| `branivo-api/src/modules/clients/dto/google-auth.dto.ts` | DTO за `/auth/client/google` |
| `branivo-api/migrations/YYYYMMDD-add-auth-provider-google-sub.ts` | TypeORM migration |
| `branivo_app/lib/features/auth/services/google_sign_in_service.dart` | Flutter Google Sign-In service |
| `branivo_app/test/features/auth/google_sign_in_service_test.dart` | Widget/unit тестове |

### TypeScript ограничения (NO `any`)

```typescript
// ПРАВИЛНО
const payload = ticket.getPayload();
if (!payload) throw new UnauthorizedException('Invalid Google token');
const sub: string = payload.sub ?? '';
const email: string | undefined = payload.email;

// ГРЕШНО — не ползвай
const payload: any = ticket.getPayload();
```

### References

- Architecture § Epic 15 OAuth: `_bmad-output/planning-artifacts/architecture.md#1447`
- Epics Story 15.2: `_bmad-output/planning-artifacts/epics.md#2129`
- ClientAuthService (SMS OTP): `branivo-api/src/modules/clients/client-auth.service.ts`
- ClientAuthController: `branivo-api/src/modules/clients/client-auth.controller.ts`
- EndClient entity: `branivo-api/src/modules/clients/entities/end-client.entity.ts`
- BiometricAuthService (паттерн от 15-1): `branivo_app/lib/features/auth/services/biometric_auth_service.dart`
- AuthBloc (разшири): `branivo_app/lib/features/auth/bloc/auth_bloc.dart`
- AppRouter (глобални сервиси): `branivo_app/lib/core/routing/app_router.dart`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(няма — имплементацията мина без HALT условия)

### Completion Notes List

- Имплементиран `POST /auth/client/google` endpoint в `ClientAuthController` + `ClientAuthService.googleAuth()`
- Верификация на Google ID token чрез `google-auth-library` v9.15.1 (`OAuth2Client.verifyIdToken`)
- Три auth пътя: директен login по `google_sub`, auto-merge по email (SMS → Google), create нов клиент
- `phone_number` е направен nullable в DB (Google OAuth users нямат телефон при регистрация)
- `AuthBloc` разширен с `GoogleSignInRequestedEvent` + `_onGoogleSignInRequested` handler
- `phone_verified` се съхранява в `flutter_secure_storage` и се проверява преди Payment
- `PhoneVerificationDialog` (КФН requirement) показва SMS OTP gate преди първа покупка
- `POST /auth/client/phone/request-otp` + `POST /auth/client/phone/verify` endpoints за OAuth phone gate
- 23 нови NestJS теста (service + controller) + 4 Flutter теста — всички минават
- Pre-existing OCR test failures (2) и Data Breach test failure (1) не са свързани с тази story

### File List

**Нови файлове:**
- `branivo-api/src/infrastructure/database/migrations/1710000066000-AddAuthProviderToEndClients.ts`
- `branivo-api/src/modules/clients/dto/google-auth.dto.ts`
- `branivo_app/lib/features/auth/services/google_sign_in_service.dart`
- `branivo_app/lib/features/auth/widgets/phone_verification_dialog.dart`
- `branivo_app/test/features/auth/google_sign_in_service_test.dart`

**Модифицирани файлове:**
- `branivo-api/.env.example` (GOOGLE_CLIENT_ID)
- `branivo-api/package.json` (google-auth-library 9.15.1)
- `branivo-api/src/modules/clients/entities/end-client.entity.ts` (authProvider, googleSub, appleSub, nullable phoneNumber)
- `branivo-api/src/modules/clients/repositories/end-client.repository.ts` (findByGoogleSub, findByEmail, mergeGoogleAccount, createGoogleClient, updatePhone)
- `branivo-api/src/modules/clients/client-auth.service.ts` (googleAuth, requestPhoneOtp, verifyPhoneOtp)
- `branivo-api/src/modules/clients/client-auth.controller.ts` (POST /google, POST /phone/request-otp, POST /phone/verify)
- `branivo-api/src/modules/clients/client-auth.service.spec.ts` (googleAuth + verifyPhoneOtp tests)
- `branivo-api/src/modules/clients/client-auth.controller.spec.ts` (POST /google tests)
- `branivo_app/pubspec.yaml` (google_sign_in ^6.2.2)
- `branivo_app/lib/features/auth/bloc/auth_event.dart` (GoogleSignInRequestedEvent)
- `branivo_app/lib/features/auth/bloc/auth_state.dart` (AuthAuthenticatedState + accountMerged + phoneVerified)
- `branivo_app/lib/features/auth/bloc/auth_bloc.dart` (googleSignInService + _onGoogleSignInRequested)
- `branivo_app/lib/features/auth/screens/login_screen.dart` (_GoogleSignInButton widget + separator)
- `branivo_app/lib/features/payments/screens/payment_screen.dart` (phone verification gate)
- `branivo_app/lib/core/routing/app_router.dart` (_googleSignInService + AuthBloc param)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (15-2: review)

### Change Log

- 2026-04-08 — Story 15.2 имплементирана: Google OAuth за end-clients, phone verification gate, 27 нови теста
