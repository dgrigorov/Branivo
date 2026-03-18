# Story 1.3: Broker Authentication with 2FA

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Broker,
I want to log in with email, password and 2FA,
So that my dashboard and tenant data are accessible only to me securely.

## Acceptance Criteria

1. **AC1 — Credential login:**
   **Given** valid email + password,
   **When** `POST /api/v1/auth/login`,
   **Then** се връща access token (JWT, exp 15 мин, съдържа `jti`) и refresh token (30 дни)

2. **AC2 — JWT claims:**
   **Given** successful login,
   **When** JWT is decoded,
   **Then** payload съдържа: `sub` (userId), `tid` (tenantId), `role`, `jti`, `exp`

3. **AC3 — 2FA challenge:**
   **Given** 2FA is enabled за акаунта,
   **When** credentials са валидни,
   **Then** се връща `{ requires_2fa: true, temp_token: "..." }` (temp_token е short-lived JWT без пълни claims, TTL 5 мин)

4. **AC4 — 2FA verification:**
   **Given** valid temp_token + valid TOTP code,
   **When** `POST /api/v1/auth/2fa/verify`,
   **Then** се издават пълни access + refresh tokens

5. **AC5 — Refresh token rotation:**
   **Given** valid refresh token,
   **When** `POST /api/v1/auth/refresh`,
   **Then** се издава нов access token + нов refresh token; старият refresh token се инвалидира в Redis

6. **AC6 — Redis fail-secure при refresh:**
   **Given** Redis is unavailable,
   **When** refresh token is used,
   **Then** broker е принуден да се логне отново (401 — fail-secure, NOT fail-open)

7. **AC7 — Invalid credentials:**
   **Given** invalid credentials,
   **When** `POST /api/v1/auth/login`,
   **Then** се връща 401 без информация коя конкретна стойност е грешна ("Invalid credentials")

8. **AC8 — Login lockout:**
   **Given** 5 consecutive failed login attempts,
   **When** `POST /api/v1/auth/login`,
   **Then** акаунтът е заключен за 15 мин → 429 Too Many Requests

9. **AC9 — Logout JTI blacklist:**
   **Given** valid access token,
   **When** `POST /api/v1/auth/logout`,
   **Then** JTI е в Redis blacklist за remaining TTL; всяка следваща заявка с този token → 401

10. **AC10 — Tenant resolution at login:**
    **Given** auth endpoints are excluded from TenantMiddleware,
    **When** `POST /api/v1/auth/login` с `Host: broker1.branivo.bg`,
    **Then** AuthService резолвира tenant от Host header директно (Redis → DB fallback), идентично на TenantMiddleware логиката

## Tasks / Subtasks

### Backend — Packages & Configuration

- [x] **Task 1: Инсталирай необходимите пакети** (AC: #1–#5)
  - [x] `npm install @nestjs/jwt @nestjs/passport passport passport-jwt passport-local bcrypt otplib`
  - [x] `npm install --save-dev @types/passport-jwt @types/passport-local @types/bcrypt`
  - [x] Провери че `@nestjs/throttler` вече е в dependencies (да — от Story 1.1)

### Backend — Database Migration

- [x] **Task 2: TypeORM migration за `users` таблица** (AC: #1, #2, #8)
  - [x] Създай `branivo-api/src/infrastructure/database/migrations/1710000002000-CreateUsersTable.ts`
  - [x] Колони:
    ```sql
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
    tenant_id       UUID NOT NULL REFERENCES tenants(id)
    email           VARCHAR(255) NOT NULL
    password_hash   VARCHAR(255) NOT NULL
    role            VARCHAR(50) NOT NULL DEFAULT 'broker_agent'
    two_fa_enabled  BOOLEAN NOT NULL DEFAULT false
    two_fa_secret_enc TEXT NULL        -- AES-256-GCM encrypted, NULL ако не е активирано
    failed_login_count INT NOT NULL DEFAULT 0
    locked_until    TIMESTAMPTZ NULL
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    deleted_at      TIMESTAMPTZ NULL
    ```
  - [x] Уникален индекс: `UNIQUE(tenant_id, email)` — имейлът е уникален в рамките на тенант
  - [x] Индекс: `idx_users_tenant_id`, `idx_users_email_tenant_id`
  - [x] RLS policy: идентична на другите таблици с `tenant_id` (вижте migration 1710000001000)
  - [x] Включи `down()` метод (DROP TABLE)

### Backend — User Entity & Module

- [x] **Task 3: User entity и UsersModule** (AC: #1, #2)
  - [x] Създай `branivo-api/src/modules/users/entities/user.entity.ts`
    - Всички колони с `{ name: 'snake_case' }` notation (вижте BaseRepository patterns)
    - `role` като `string` (enum стойности: `super_admin` | `broker_admin` | `broker_agent` | `broker_viewer`)
    - TypeScript strict: всички полета с `!` definite assignment assertion
  - [x] Създай `branivo-api/src/modules/users/users.repository.ts` — extends `BaseRepository<User>`
    - `findByEmailAndTenant(email: string, tenantId: string): Promise<User | null>` — изключи soft-deleted
    - `incrementFailedLoginCount(userId: string): Promise<void>`
    - `resetFailedLoginCount(userId: string): Promise<void>`
    - `lockUser(userId: string, until: Date): Promise<void>`
  - [x] Създай `branivo-api/src/modules/users/users.service.ts`
    - Само прости lookup методи — бизнес логиката е в AuthService
  - [x] Създай `branivo-api/src/modules/users/users.module.ts`
    - `TypeOrmModule.forFeature([User])`
    - exports: `UsersService`, `UsersRepository`

### Backend — Auth Core Implementation

- [x] **Task 4: AuthService** (AC: #1–#10)
  - [x] Инжектирай: `JwtService`, `ConfigService`, `UsersRepository`, `TenantsRepository`, `REDIS_CLIENT`
  - [x] **`login(host, email, password)`:**
    1. Резолвирай `tenantId` от `host` → Redis (`_system:host:{hostname}`) → DB fallback (идентично на TenantMiddleware)
    2. Намери user: `usersRepository.findByEmailAndTenant(email, tenantId)`
    3. Ако не намерен → `throw UnauthorizedException('Invalid credentials')` (НИКОГА не разкривай коя стойност е грешна)
    4. Провери lockout: ако `user.lockedUntil && user.lockedUntil > now` → `throw TooManyRequestsException('Account locked. Try again later.')`
    5. Провери password: `bcrypt.compare(password, user.passwordHash)` — ако false → increment `failedLoginCount`; ако ≥ 5 → `lockUser(userId, now + 15min)` → throw 401
    6. При success → `resetFailedLoginCount(userId)`
    7. Ако `user.twoFaEnabled` → генерирай temp_token (JWT `{ sub: userId, tid: tenantId, type: 'temp_2fa', exp: +5min }`) → return `{ requires_2fa: true, temp_token }`
    8. Ако без 2FA → `issueTokens(userId, tenantId, role)` → return `{ access_token, refresh_token, expires_in: 900 }`
  - [x] **`verify2FA(tempToken, otpCode)`:**
    1. Verify temp_token signature + `type === 'temp_2fa'`
    2. Вземи user → decrypt `two_fa_secret_enc` → verify TOTP: `authenticator.verify({ token: otpCode, secret: decryptedSecret })`
    3. Ако invalid → throw 401
    4. Ако valid → `issueTokens(userId, tenantId, role)`
  - [x] **`issueTokens(userId, tenantId, role)`** — private helper:
    1. Генерирай `jti = uuid()`
    2. Access token: `{ sub: userId, tid: tenantId, role, jti, exp: +15min }`
    3. Refresh token: `{ sub: userId, tid: tenantId, jti: refreshJti, type: 'refresh', exp: +30days }`
    4. Съхрани refresh token в Redis: key = `RedisKeyHelper.build(tenantId, 'auth', 'refresh:' + refreshJti)` → value = userId → TTL 30 days
    5. Return `{ access_token, refresh_token, expires_in: 900 }`
  - [x] **`refresh(refreshToken)`:**
    1. Verify JWT signature + `type === 'refresh'`; ако fail → 401 (НЕ 403)
    2. Провери Redis: `RedisKeyHelper.build(tenantId, 'auth', 'refresh:' + refreshJti)` → ако не съществува → fail-secure: 401 (Redis down или revoked)
    3. Изтрий стария refresh token от Redis (rotation!)
    4. Blacklist стария access JTI ако е подаден (optional)
    5. Генерирай нови tokens с `issueTokens()`
  - [x] **`logout(jti, tenantId, tokenExp)`:**
    1. Изчисли remaining TTL = tokenExp - now (в секунди)
    2. Redis SET: `RedisKeyHelper.build(tenantId, 'auth', 'blacklist:' + jti)` → `'1'` → TTL = remaining
    3. Return 200 OK

- [x] **Task 5: JWT Passport Strategy** (AC: #9)
  - [x] Създай `branivo-api/src/modules/auth/strategies/jwt.strategy.ts`
    - Extends `PassportStrategy(Strategy)`
    - `secretOrKey` от `ConfigService.getOrThrow('JWT_SECRET')`
    - `jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()`
    - **`validate(payload)`:**
      1. Провери Redis blacklist: `RedisKeyHelper.build(payload.tid, 'auth', 'blacklist:' + payload.jti)` → ако exists → `throw UnauthorizedException('Token revoked')`
      2. Return `{ userId: payload.sub, tenantId: payload.tid, role: payload.role, jti: payload.jti }`
  - [x] Създай `branivo-api/src/modules/auth/guards/jwt-auth.guard.ts` — extends `AuthGuard('jwt')`

- [x] **Task 6: AuthController** (AC: #1–#9)
  - [x] `POST /api/v1/auth/login` → `AuthService.login(host, dto.email, dto.password)`
    - Вземи host от `req.hostname`
    - DTO: `LoginDto { email: string (IsEmail, IsNotEmpty); password: string (IsNotEmpty) }`
    - Response: `LoginResponseDto { access_token?, refresh_token?, expires_in?, requires_2fa?, temp_token? }`
  - [x] `POST /api/v1/auth/2fa/verify` → `AuthService.verify2FA(dto.temp_token, dto.otp_code)`
    - DTO: `Verify2FADto { temp_token: string; otp_code: string (Length(6,6), IsNumberString) }`
  - [x] `POST /api/v1/auth/refresh` → `AuthService.refresh(dto.refresh_token)`
    - DTO: `RefreshDto { refresh_token: string (IsNotEmpty) }`
  - [x] `POST /api/v1/auth/logout` → `@UseGuards(JwtAuthGuard)` → `AuthService.logout(req.user.jti, req.user.tenantId, decodedExp)`
    - Извлечи `exp` от JWT payload (достъпен след guard validation)

- [x] **Task 7: Разшири AuthModule** (AC: #1–#9)
  - [x] `JwtModule.registerAsync({ useFactory: (config) => ({ secret: config.getOrThrow('JWT_SECRET'), signOptions: { expiresIn: '15m' } }) })`
  - [x] `PassportModule`
  - [x] imports: `UsersModule`, `TenantsModule`
  - [x] providers: `AuthService`, `JwtStrategy`
  - [x] Обнови `AppModule` exclusions (добави `2fa/verify` и `logout` ако е нужно)

- [x] **Task 8: CryptoService за AES-256-GCM** (AC: #3, #4)
  - [x] Създай `branivo-api/src/common/crypto/crypto.service.ts`
    - `encrypt(plaintext: string): string` → AES-256-GCM → base64 encoded `{iv}:{authTag}:{ciphertext}`
    - `decrypt(ciphertext: string): string` → reverse
    - Ключ от `ConfigService.getOrThrow('ENCRYPTION_KEY')` (32 bytes, hex-encoded)
  - [x] Регистрирай в `CommonModule` или директно в `AuthModule`
  - [x] **НИКОГА** не логвай plaintext secrets

### Backend — Обнови AppModule Exclusions

- [x] **Task 9: Добави нови auth пътища към TenantMiddleware exclusions** (AC: #10)
  - [x] В `branivo-api/src/app.module.ts` добави:
    ```typescript
    { path: 'api/v1/auth/2fa/verify', method: RequestMethod.POST },
    { path: 'api/v1/auth/logout', method: RequestMethod.POST },
    ```

### Next.js Web — Login Flow

- [x] **Task 10: Login страница** (AC: #1, #3, #4)
  - [x] Създай `branivo-web/src/app/login/page.tsx`
    - Form с email + password (React Hook Form + Zod validation)
    - При `requires_2fa: true` → покажи OTP input (6 цифри)
    - Store access token: httpOnly cookie (по-сигурно от localStorage за web)
    - Store refresh token: httpOnly cookie с `Secure; SameSite=Strict`
  - [x] Server Action или Route Handler за proxying към NestJS (не излагай JWT_SECRET на клиента)
  - [x] Error states: Invalid credentials, Account locked, 2FA invalid

### Flutter — Auth Flow

- [x] **Task 11: Flutter AuthBloc + LoginScreen** (AC: #1, #3, #4, #5)
  - [x] Създай `branivo_app/lib/features/auth/bloc/auth_bloc.dart`
    - Events: `LoginRequestedEvent`, `TwoFAVerifyRequestedEvent`, `LogoutRequestedEvent`, `TokenRefreshRequestedEvent`
    - States: `AuthInitialState`, `AuthLoadingState`, `AuthRequires2FAState`, `AuthAuthenticatedState`, `AuthErrorState`
  - [x] Създай `branivo_app/lib/features/auth/screens/login_screen.dart`
    - Email + password input (BLoC driven — ZERO business logic в build())
    - Max build() = 50 lines — извади sub-widgets
  - [x] Създай `branivo_app/lib/features/auth/screens/two_fa_screen.dart`
    - 6-digit OTP input
  - [x] `flutter_secure_storage` за access + refresh token съхранение
  - [x] Dio interceptor за автоматичен token refresh при 401

### Tests

- [x] **Task 12: Unit тестове за AuthService** (AC: #1–#10)
  - [x] `branivo-api/src/modules/auth/auth.service.spec.ts`
  - [x] Test: login с валидни credentials (без 2FA) → access + refresh tokens
  - [x] Test: login с валидни credentials (с 2FA) → `requires_2fa: true` + temp_token
  - [x] Test: login с невалидна парола → 401 (без hint коя стойност е грешна)
  - [x] Test: login при 5 грешки → account lock → 429
  - [x] Test: login при locked account → 429
  - [x] Test: login при unknown tenant host → 404
  - [x] Test: verify2FA с валиден TOTP → пълни tokens
  - [x] Test: verify2FA с невалиден код → 401
  - [x] Test: refresh с валиден token → нови tokens + старият невалиден
  - [x] Test: refresh при Redis unavailable → 401 (fail-secure)
  - [x] Test: refresh с revoked token → 401
  - [x] Test: logout → JTI в Redis blacklist

- [x] **Task 13: Unit тестове за JwtStrategy** (AC: #9)
  - [x] `branivo-api/src/modules/auth/strategies/jwt.strategy.spec.ts`
  - [x] Test: valid JWT → payload returned
  - [x] Test: blacklisted JTI → UnauthorizedException
  - [x] Test: Redis unavailable при blacklist check → fail-secure (throw) OR fail-open? → **fail-secure** (reject)

- [x] **Task 14: Unit тестове за UsersRepository** (AC: #1, #8)
  - [x] `branivo-api/src/modules/users/users.repository.spec.ts`
  - [x] Test: `findByEmailAndTenant` → връща user (не soft-deleted)
  - [x] Test: `findByEmailAndTenant` → не връща soft-deleted user
  - [x] Test: `incrementFailedLoginCount` → +1
  - [x] Test: `lockUser` → задава `lockedUntil`

- [x] **Task 15: Integration тест за AuthController** (AC: #1–#10)
  - [x] `branivo-api/src/modules/auth/auth.controller.spec.ts`
  - [x] Test: `POST /login` → 200 с tokens (без 2FA)
  - [x] Test: `POST /login` → 200 с `requires_2fa: true`
  - [x] Test: `POST /login` → 401 при invalid credentials
  - [x] Test: `POST /2fa/verify` → 200 с tokens
  - [x] Test: `POST /refresh` → 200 с нови tokens
  - [x] Test: `POST /logout` без Authorization → 401
  - [x] Test: response НИКОГА не съдържа `password_hash`, `two_fa_secret_enc`

- [x] **Task 16: Widget тест за Flutter LoginScreen** (AC: #1, #3)
  - [x] `branivo_app/test/features/auth/screens/login_screen_test.dart`
  - [x] Test: renders email + password fields
  - [x] Test: показва 2FA screen при `AuthRequires2FAState`
  - [x] Test: показва error message при `AuthErrorState`

## Dev Notes

### КРИТИЧНО: Защо auth endpoints са excluded от TenantMiddleware

От Story 1.2, `AppModule` изключва `/api/v1/auth/login` и `/api/v1/auth/refresh` от `TenantMiddleware`. Това означава `TenantContext` **не е инициализиран** в тези endpoints — извикването на `tenantContext.getTenantId()` ще хвърли Error.

**AuthService трябва сам да резолвира tenant от Host header** — използвай същата Redis → DB fallback логика като `TenantMiddleware`, но директно в `AuthService.login()`.

Redis ключ за hostname lookup (от Story 1.2): `RedisKeyHelper.buildSystem('host', hostname)` = `_system:host:{hostname}` → стойност = `tenantId`.

### Redis Key Conventions за Auth

```
_system:host:{hostname}          → tenantId (от TenantMiddleware, TTL 3600s)
{tenantId}:auth:refresh:{jti}    → userId (refresh token store, TTL 30 days в секунди)
{tenantId}:auth:blacklist:{jti}  → '1' (revoked access JTI, TTL = remaining token lifetime)
_system:auth:lockout:{tenantId}:{email} → failCount (login lockout, TTL 15 min)
```

Използвай `RedisKeyHelper.build(tenantId, 'auth', 'refresh:' + jti)` и `RedisKeyHelper.buildSystem('auth', 'lockout:' + tenantId + ':' + email)`.

### JWT Payload Structure

```typescript
// Access Token
interface AccessTokenPayload {
  sub: string;     // userId
  tid: string;     // tenantId
  role: string;    // broker_admin | broker_agent | broker_viewer | super_admin
  jti: string;     // UUID за blacklisting
  // exp, iat са добавени от @nestjs/jwt автоматично
}

// Temp 2FA Token (short-lived, не дава достъп)
interface TempTokenPayload {
  sub: string;     // userId
  tid: string;     // tenantId
  type: 'temp_2fa';
  // exp: now + 5 min
}

// Refresh Token
interface RefreshTokenPayload {
  sub: string;     // userId
  tid: string;     // tenantId
  jti: string;     // уникален UUID за rotation
  type: 'refresh';
  // exp: now + 30 days
}
```

### bcrypt Cost 12 + Password Policy

```typescript
const hash = await bcrypt.hash(password, 12);
const isValid = await bcrypt.compare(plaintext, hash);
```

Password validation (DTO ниво с class-validator):
```typescript
@Matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/, {
  message: 'Password must contain uppercase, digit and special character'
})
@MinLength(8)
password: string;
```

**Note:** Регистрацията на брокери е в Story 1.4 (Super Admin Onboarding). Тази story имплементира само login flow-а. Broker user-ите ще се създават от Super Admin в Story 1.4.

### TOTP с otplib

```typescript
import { authenticator } from 'otplib';

// При 2FA setup (Story 1.4 scope — НЕ тази story):
const secret = authenticator.generateSecret(); // 20 bytes base32
const otpauth = authenticator.keyuri(email, 'Branivo', secret);

// При verify (ТАЗИ story):
const isValid = authenticator.verify({ token: otpCode, secret: decryptedSecret });
// otplib по подразбиране приема window ±1 (30-second window tolerance)
```

**КРИТИЧНО:** `two_fa_secret_enc` е AES-256-GCM encrypted в DB. `CryptoService.decrypt()` преди `authenticator.verify()`.

### AES-256-GCM Encryption Pattern

```typescript
// branivo-api/src/common/crypto/crypto.service.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV за GCM
  const key = Buffer.from(this.encryptionKey, 'hex'); // 32 bytes
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  const key = Buffer.from(this.encryptionKey, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8');
}
```

`ENCRYPTION_KEY` в `.env`: 64 hex chars = 32 bytes. Генерирай с `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### JwtStrategy — Blacklist Check

JwtStrategy.validate() трябва да провери Redis blacklist. При Redis unavailable, **fail-secure** → throw UnauthorizedException. Не fail-open.

```typescript
async validate(payload: AccessTokenPayload) {
  const blacklistKey = RedisKeyHelper.build(payload.tid, 'auth', 'blacklist:' + payload.jti);
  try {
    const revoked = await this.redis.exists(blacklistKey);
    if (revoked) throw new UnauthorizedException('Token revoked');
  } catch (err) {
    if (err instanceof UnauthorizedException) throw err;
    // Redis down — fail-secure
    throw new UnauthorizedException('Auth service unavailable');
  }
  return { userId: payload.sub, tenantId: payload.tid, role: payload.role, jti: payload.jti };
}
```

### Fail-Secure при Refresh + Redis Down

```typescript
async refresh(refreshToken: string) {
  const payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken);

  let userId: string | null;
  try {
    const key = RedisKeyHelper.build(payload.tid, 'auth', 'refresh:' + payload.jti);
    userId = await this.redis.get(key);
  } catch {
    // Redis down — НЕ fail-open, force re-login
    throw new UnauthorizedException('Session service unavailable. Please log in again.');
  }

  if (!userId) throw new UnauthorizedException('Session expired or revoked');
  // ... continue with rotation
}
```

### Auth Endpoints НЕ използват TenantContext

Всички auth endpoints (**login, 2fa/verify, refresh, logout**) са excluded от `TenantMiddleware`. Не инжектирай `TenantContext` в `AuthService` — той няма да е инициализиран. Вместо това:
- За login: резолвирай tenant от Host header директно
- За 2fa/verify, refresh, logout: извличай `tenantId` от JWT payload-а

### Project Structure Notes

**Нови файлове:**
```
branivo-api/src/modules/auth/
├── auth.module.ts              (разширен)
├── auth.controller.ts          (имплементиран)
├── auth.service.ts             (имплементиран)
├── auth.repository.ts          (може да остане празен — UsersRepository поема)
├── strategies/
│   └── jwt.strategy.ts
├── guards/
│   └── jwt-auth.guard.ts
└── dto/
    ├── login.dto.ts
    ├── verify-2fa.dto.ts
    ├── refresh.dto.ts
    └── auth-response.dto.ts

branivo-api/src/modules/users/
├── users.module.ts
├── users.service.ts
├── users.repository.ts
└── entities/
    └── user.entity.ts

branivo-api/src/common/crypto/
└── crypto.service.ts

branivo-api/src/infrastructure/database/migrations/
└── 1710000002000-CreateUsersTable.ts

branivo-web/src/app/login/
└── page.tsx

branivo_app/lib/features/auth/
├── bloc/auth_bloc.dart
├── screens/login_screen.dart
└── screens/two_fa_screen.dart
```

**Модифицирани файлове:**
```
branivo-api/package.json                   # нови dependencies
branivo-api/src/app.module.ts              # добави 2fa/verify + logout exclusions
branivo-api/src/modules/auth/auth.module.ts  # пълна конфигурация
```

### References

- [Source: epics.md#Story 1.3] — Acceptance Criteria и user story statement
- [Source: architecture.md#Authentication & Security] — JWT TTL, bcrypt cost, otplib, rate limits
- [Source: project-context.md#5. Security Rules] — JWT jti blacklisting, bcrypt cost 12, password policy
- [Source: project-context.md#14. Key Numbers] — Access token 15 min, Refresh 30 days, OTP 6 digits / 5 min, OTP rate 3/hour, Lockout 5 failures → 15 min
- [Source: story-1-2.md#Dev Notes#AppModule] — TenantMiddleware exclusions (login, refresh)
- [Source: story-1-2.md#Dev Notes#Redis Key Conventions] — `RedisKeyHelper.buildSystem('host', hostname)` = `_system:host:{hostname}`
- [Source: story-1-2.md#Dev Notes#TenantContext] — Защо TenantContext НЕ е достъпен в auth endpoints
- [Source: architecture.md#Naming Patterns] — NestJS file naming (kebab-case), class naming (PascalCase)
- [Source: project-context.md#4. Architecture Rules] — Controller → Service → Repository; 30 lines/function; 300 lines/file

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
