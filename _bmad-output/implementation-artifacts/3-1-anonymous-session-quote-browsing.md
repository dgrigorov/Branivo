# Story 3.1: Anonymous Session & Quote Browsing

Status: done

## Story

As an anonymous end-client,
I want to browse and compare insurance quotes without registering,
So that I can evaluate options before committing to creating an account.

## Acceptance Criteria

1. **AC1 — Анонимна сесия се генерира при първо посещение:**
   **Given** краен клиент посещава портала за пръв път,
   **When** страницата се зарежда,
   **Then** генерира се уникален анонимен UUID и се запазва в `localStorage` под ключ `branivo_anon_session_id`; бекендът създава Redis запис `anon:{uuid}:session` с TTL 48h

2. **AC2 — Данните се съхраняват в сесията:**
   **Given** анонимна сесия съществува,
   **When** клиентът въвежда данни за МПС или OCR сканира документ,
   **Then** данните се запазват в Redis с ключ `anon:{uuid}:session` (TTL се нулира на 48h при всяка актуализация)

3. **AC3 — Миграция при регистрация:**
   **Given** анонимна сесия е активна,
   **When** клиентът се регистрира с SMS OTP (Story 3.2),
   **Then** `POST /api/v1/sessions/anonymous/:sessionId/migrate` мигрира данните в акаунта; анонимният Redis ключ се изтрива след успешна миграция

4. **AC4 — Изтекла сесия:**
   **Given** 48 часа са минали без регистрация,
   **When** клиентът се върне,
   **Then** `GET /api/v1/sessions/anonymous/:sessionId` връща 404; frontend изчиства `localStorage` и инициира нова сесия; клиентът вижда банер "Сесията ви изтече — моля, въведете данните отново"

5. **AC5 — Graceful degradation при Redis недостъпност:**
   **Given** Redis е недостъпен,
   **When** анонимен клиент опита да разглежда,
   **Then** `POST /api/v1/sessions/anonymous` връща 503 с `{ "requires_login": true, "message": "Временно изискваме регистрация" }`; frontend пренасочва към login страницата (NFR14)

6. **AC6 — Cross-device ограничение:**
   **Given** клиентът смени устройство или браузър,
   **When** посети портала,
   **Then** получава нова анонимна сесия — cross-device не е поддържан; UX показва: "Офертите важат 48 часа. Отворете от същото устройство за да продължите по-късно."

7. **AC7 — Сесията е tenant-scoped:**
   **Given** клиент посещава конкретен broker portal (по Host header),
   **When** анонимна сесия е създадена,
   **Then** `tenant_id` е embeddnat в сесийните данни в Redis; клиент не може да достъпи сесия от друг tenant

8. **AC8 — Страница за разглеждане на оферти:**
   **Given** анонимна сесия е активна,
   **When** клиентът отвори `/[locale]/quotes`,
   **Then** вижда tenant-branded quote browsing страница с входни полета за МПС данни и бутон "Сравни оферти"; страницата е достъпна без автентикация

## Tasks / Subtasks

### Backend — AnonymousSessionsModule

- [x] **Task 1: Създай AnonymousSessionsModule** (AC: #1, #2, #3, #4, #5, #7)
  - [x] Файл: `branivo-api/src/modules/sessions/sessions.module.ts`
  - [x] Регистрирай `AnonymousSessionsController`, `AnonymousSessionsService`
  - [x] Импортирай `InfrastructureModule` (за Redis); не импортирай директно от TenantsModule — ползвай shared InfrastructureModule
  - [x] Добави `SessionsModule` в `AppModule` imports

- [x] **Task 2: AnonymousSessionsService** (AC: #1, #2, #3, #4, #5, #7)
  - [x] Файл: `branivo-api/src/modules/sessions/anonymous-sessions.service.ts`
  - [x] `createSession(tenantId: string): Promise<{ sessionId: string; expiresAt: Date }>` — генерира UUID v4, записва в Redis `anon:{uuid}:session`, TTL 172800 (48h); при Redis error → хвърля `ServiceUnavailableException` с `{ requires_login: true }`
  - [x] `getSession(sessionId: string, tenantId: string): Promise<AnonSessionData | null>` — Redis GET `anon:{sessionId}:session`; проверява `tenant_id` match; връща `null` при 404 или mismatch
  - [x] `updateSessionData(sessionId: string, tenantId: string, data: Partial<AnonSessionData>): Promise<void>` — Redis SET с TTL reset (SETEX) — не EXPIRE само
  - [x] `migrateSession(sessionId: string, tenantId: string, userId: string): Promise<AnonSessionData>` — взима данните, триe Redis ключа (`DEL`), връща данните за migration в Story 3.2
  - [x] `deleteSession(sessionId: string): Promise<void>` — Redis DEL `anon:{sessionId}:session`
  - [x] Redis ключ: `anon:{sessionId}:session` (НЕ tenant-scoped ключ — `tenant_id` е в payload-а)
  - [x] **КРИТИЧНО:** При Redis `ECONNREFUSED` или timeout → `ServiceUnavailableException` (не 500)

- [x] **Task 3: AnonymousSessionsController** (AC: #1, #2, #3, #4, #5)
  - [x] Файл: `branivo-api/src/modules/sessions/anonymous-sessions.controller.ts`
  - [x] `POST /api/v1/sessions/anonymous` — извиква `createSession(tenantContext.getTenantId())`; response: `{ session_id, expires_at }`
  - [x] `GET /api/v1/sessions/anonymous/:sessionId` — `getSession()`; 404 при изтекла/несъществуваща сесия
  - [x] `PUT /api/v1/sessions/anonymous/:sessionId/data` — `updateSessionData()`; body: `UpdateAnonSessionDto`
  - [x] `POST /api/v1/sessions/anonymous/:sessionId/migrate` — `migrateSession()`; изисква JWT (JwtAuthGuard) — само логнат потребител може да мигрира
  - [x] **ВАЖНО:** `POST`, `GET`, `PUT` endpoints НЕ изискват JWT — публични; само `migrate` изисква JWT
  - [x] **Rate limiting:** `@Throttle(10, 60)` на controller ниво (10 req/min/IP)
  - [x] Използвай `TenantContext` (задължително — НЕ предавай tenant_id като параметър)

- [x] **Task 4: DTOs и интерфейси** (AC: #2, #3)
  - [x] Файл: `branivo-api/src/modules/sessions/dto/create-session-response.dto.ts`
  - [x] Файл: `branivo-api/src/modules/sessions/dto/update-anon-session.dto.ts`
  - [x] Файл: `branivo-api/src/modules/sessions/interfaces/anon-session.interface.ts`
  - [x] **Забранено:** `insurer_api_key_enc` никога в сесийни данни; само vehicle/quote IDs

### Backend — Тестове

- [x] **Task 5: Unit тестове за AnonymousSessionsService** (AC: #1, #2, #4, #5, #7)
  - [x] Файл: `branivo-api/src/modules/sessions/anonymous-sessions.service.spec.ts`
  - [x] Test: `createSession` — записва Redis ключ с TTL 172800 и връща `{ sessionId, expiresAt }`
  - [x] Test: `createSession` — Redis error → `ServiceUnavailableException`
  - [x] Test: `getSession` — несъществуващ ключ → `null`
  - [x] Test: `getSession` — tenant_id mismatch → `null` (tenant isolation)
  - [x] Test: `updateSessionData` — използва `SETEX` (не само `SET` + `EXPIRE`)
  - [x] Test: `migrateSession` — изтрива Redis ключа след успешна миграция
  - [x] 7 unit теста ✅

- [x] **Task 6: Integration тестове за AnonymousSessionsController** (AC: #1, #4, #5)
  - [x] Файл: `branivo-api/src/modules/sessions/anonymous-sessions.controller.spec.ts`
  - [x] Test: `POST /api/v1/sessions/anonymous` → 201 с `{ session_id, expires_at }`
  - [x] Test: `GET /api/v1/sessions/anonymous/:id` — несъществуващ ID → 404
  - [x] Test: `GET /api/v1/sessions/anonymous/:id` — съществуващ ID → 200
  - [x] Test: `POST /api/v1/sessions/anonymous/:id/migrate` с JWT → 200
  - [x] Test: `PUT /api/v1/sessions/anonymous/:id/data` с валиден body → 200
  - [x] 6 integration теста ✅

### Next.js Web — (client) route group

- [x] **Task 7: Създай (client) route group layout** (AC: #8)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/layout.tsx`
  - [x] Server Component — зарежда tenant branding от `/api/v1/tenants/config`
  - [x] Прилага tenant CSS variables (аналогично на `(broker)/layout.tsx`)
  - [x] Публично достъпен — без auth проверка

- [x] **Task 8: Quotes страница (client-facing shell)** (AC: #6, #8)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/quotes/page.tsx`
  - [x] `'use client'` компонент
  - [x] Използва `useAnonymousSession()` hook при mount за инициализация на сесия
  - [x] Показва входна форма за МПС данни (reg_number, vin, make, model, year)
  - [x] Банер при изтекла сесия: "Сесията ви изтече — моля, въведете данните отново"
  - [x] Банер за cross-device limitation: "Офертите важат 48 часа. Отворете от същото устройство за да продължите по-късно."
  - [x] При Redis degradation (`requires_login: true`): redirect към `/[locale]/login`
  - [x] Форма fields: регистрационен номер, VIN, марка, модел, година

- [x] **Task 9: `useAnonymousSession` hook** (AC: #1, #4, #5, #6)
  - [x] Файл: `branivo-web/src/lib/hooks/use-anonymous-session.ts`
  - [x] `localStorage` ключ: `branivo_anon_session_id`
  - [x] При mount: проверява дали съществува UUID в localStorage → `GET /api/v1/sessions/anonymous/:id`
  - [x] При 404 (изтекла) → изчиства localStorage, инициира `POST /api/v1/sessions/anonymous`
  - [x] При липса (нова сесия) → `POST /api/v1/sessions/anonymous` и запазва UUID в localStorage
  - [x] При 503 (`requires_login: true`) → връща `{ requiresLogin: true }` без localStorage запис
  - [x] Exposes: `{ sessionId, isLoading, isExpired, requiresLogin, updateSessionData }`
  - [x] **ВАЖНО:** localStorage е достъпен само client-side — хукът се инициализира само при mount (`useEffect`)

- [x] **Task 10: BFF route за sessions** (AC: #1, #4, #5)
  - [x] Файл: `branivo-web/src/app/api/v1/sessions/anonymous/route.ts` — `POST` (create)
  - [x] Файл: `branivo-web/src/app/api/v1/sessions/anonymous/[sessionId]/route.ts` — `GET` (get), `PUT` (update)
  - [x] Файл: `branivo-web/src/app/api/v1/sessions/anonymous/[sessionId]/migrate/route.ts` — `POST` (migrate, изисква auth cookie)
  - [x] Forward-ва `Host` header към NestJS за tenant resolution

### Next.js Web — Тестове

- [x] **Task 11: Component тест за Quotes страница** (AC: #6, #8)
  - [x] Файл: `branivo-web/src/__tests__/client/quotes.page.test.tsx`
  - [x] Test: нова сесия → показва форма с МПС полета
  - [x] Test: изтекла сесия (404) → показва expiry banner
  - [x] Test: Redis degradation (503 + `requires_login`) → redirect към login
  - [x] Test: cross-device banner е видим по default
  - [x] 4 компонент теста ✅

- [x] **Task 12: Unit тест за `useAnonymousSession` hook** (AC: #1, #4, #5)
  - [x] Файл: `branivo-web/src/__tests__/hooks/use-anonymous-session.test.ts`
  - [x] Test: при mount без localStorage → POST за нова сесия → записва в localStorage
  - [x] Test: при mount с валиден localStorage UUID → GET проверка → сесия е active
  - [x] Test: при 404 → изчиства localStorage и генерира нова сесия
  - [x] Test: при 503 с `requires_login: true` → `requiresLogin = true`, без localStorage запис
  - [x] 4 hook теста ✅

### Flutter — AnonymousSession

- [x] **Task 13: AnonymousSessionBloc** (AC: #1, #2, #4, #5, #6)
  - [x] Файл: `branivo_app/lib/features/anonymous_session/bloc/anonymous_session_bloc.dart`
  - [x] Файл: `branivo_app/lib/features/anonymous_session/bloc/anonymous_session_event.dart`
  - [x] Файл: `branivo_app/lib/features/anonymous_session/bloc/anonymous_session_state.dart`
  - [x] Events: `AnonymousSessionInitializeEvent`, `AnonymousSessionUpdateDataEvent`, `AnonymousSessionMigrateEvent`
  - [x] States: `AnonymousSessionLoadingState`, `AnonymousSessionActiveState`, `AnonymousSessionExpiredState`, `AnonymousSessionRequiresLoginState`, `AnonymousSessionErrorState`
  - [x] При initialize: `flutter_secure_storage` → get `anon_session_id` → API GET → ако 404 → нова сесия
  - [x] UUID се пази в `flutter_secure_storage` (ключ: `anon_session_id`) — **НЕ в Hive**

- [x] **Task 14: AnonymousSessionRepository** (AC: #1, #2, #4, #5)
  - [x] Файл: `branivo_app/lib/features/anonymous_session/data/repositories/anonymous_session_repository.dart`
  - [x] `createSession()` → `POST /api/v1/sessions/anonymous`
  - [x] `getSession(sessionId)` → `GET /api/v1/sessions/anonymous/{sessionId}`
  - [x] `updateSession(sessionId, data)` → `PUT /api/v1/sessions/anonymous/{sessionId}/data`
  - [x] При 503 → `SessionUnavailableException` (maps to `RequiresLoginState`)

- [x] **Task 15: Widget тест за AnonymousSessionBloc** (AC: #1, #4, #5)
  - [x] Файл: `branivo_app/test/features/anonymous_session/anonymous_session_bloc_test.dart`
  - [x] Test: initialize без secure storage → нова сесия → `AnonymousSessionActiveState`
  - [x] Test: initialize с валиден ID → GET → `AnonymousSessionActiveState`
  - [x] Test: 404 response → нова сесия (auto-renew) с interim `AnonymousSessionExpiredState`
  - [x] Test: 503 response → `AnonymousSessionRequiresLoginState`
  - [x] 4 bloc теста ✅

## Dev Notes

### Redis Key Pattern за Анонимни Сесии

Анонимните сесии използват **system-level** (не tenant-scoped) Redis ключ, защото `tenant_id` е в payload:

```typescript
// НЕ: RedisKeyHelper.build(tenantId, 'anon', sessionId) → '{tenantId}:anon:{id}'
// ДА:
const key = `anon:${sessionId}:session`;
await this.redis.setex(key, 172800, JSON.stringify(sessionData));
```

Причина: При `GET` заявка знаем само `sessionId` — `tenant_id` е в payload-а. Tenant isolation се enforces чрез payload check (AC7), не чрез ключ namespacing.

**ВАЖНО:** `RedisKeyHelper.buildSystem()` е за hostname → tenantId reverse lookups. Анонимните сесии използват отделен `anon:` prefix — не `_system:`.

### Graceful Degradation — Redis Unavailability

```typescript
// В AnonymousSessionsService.createSession():
try {
  await this.redis.setex(key, 172800, JSON.stringify(data));
} catch (err) {
  this.logger.error('Redis unavailable for anonymous session creation', err);
  throw new ServiceUnavailableException({
    statusCode: 503,
    requires_login: true,
    message: 'Временно изискваме регистрация',
  });
}
```

Frontend трябва да проверява `response.data.requires_login === true` при 503 и да пренасочва към login.

### Сесийни данни — структура в Redis

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "tenant-uuid-here",
  "created_at": "2026-03-19T10:00:00.000Z",
  "vehicle_data": {
    "reg_number": "CA1234AB",
    "vin": "WVWZZZ1KZAM123456",
    "make": "Volkswagen",
    "model": "Golf",
    "year": 2020
  },
  "selected_quote_id": null
}
```

TTL се нулира при всяка `updateSessionData` → ползвай `SETEX` (не `SET` + `EXPIRE`).

### localStorage vs flutter_secure_storage

| Platform | Storage | Ключ |
|----------|---------|------|
| Next.js web | `localStorage` | `branivo_anon_session_id` |
| Flutter | `flutter_secure_storage` | `anon_session_id` |
| **Забранено за Flutter:** | Hive | — само за policies/themes |

Архитектурна причина: Анонимната сесия е device-bound (conscious decision от Architecture.md#Explicit Architectural Constraints). Cookies биха позволили cross-device достъп — съзнателно избегнато.

### Throttling за публичните endpoints

```typescript
@Controller('sessions/anonymous')
@Throttle(10, 60)  // 10 req/min/IP — same as OCR rate limit
export class AnonymousSessionsController {
```

Без throttle: сесиите могат да се злоупотребяват за Redis exhaustion.

### NestJS Module Structure — Sessions

```
branivo-api/src/modules/sessions/
├── sessions.module.ts
├── anonymous-sessions.controller.ts
├── anonymous-sessions.service.ts
├── anonymous-sessions.controller.spec.ts
├── anonymous-sessions.service.spec.ts
├── dto/
│   ├── create-session-response.dto.ts
│   └── update-anon-session.dto.ts
└── interfaces/
    └── anon-session.interface.ts
```

### Next.js — Нови файлове

```
branivo-web/src/app/[locale]/(client)/
├── layout.tsx                          ← нов route group layout
└── quotes/
    └── page.tsx                        ← quote browsing shell

branivo-web/src/app/api/v1/sessions/anonymous/
├── route.ts                            ← POST (create session)
└── [sessionId]/
    ├── route.ts                        ← GET + PUT (get/update)
    └── migrate/
        └── route.ts                    ← POST (migrate to user)

branivo-web/src/lib/hooks/
└── use-anonymous-session.ts            ← session management hook
```

### Flutter — Нови файлове

```
branivo_app/lib/features/anonymous_session/
├── bloc/
│   ├── anonymous_session_bloc.dart
│   ├── anonymous_session_event.dart
│   └── anonymous_session_state.dart
└── data/
    └── repositories/
        └── anonymous_session_repository.dart

branivo_app/test/features/anonymous_session/
└── anonymous_session_bloc_test.dart
```

### НЯМА нова DB миграция

Анонимните сесии са **Redis-only** (ephemeral). Не е нужна `vehicles` таблица за Story 3.1 — тя идва в Story 3.5. `end_clients` таблица идва в Story 3.2.

**Следваща migration** (когато е нужна): `1710000009000-CreateEndClientsTable.ts` — Story 3.2.

### Dependency между Stories

```
Story 3.1 (сесия) → Story 3.2 ще извика /sessions/anonymous/:id/migrate
Story 3.1 (форма) → Story 3.3 ще попълва vehicle_data в сесията чрез OCR
Story 3.1 (сесия) → Story 4.1 ще използва session_id за quote aggregation
```

`migrateSession()` endpoint-ът трябва да е готов в Story 3.1, дори Story 3.2 да не е имплементирана — endpoint-ът просто ще се извика по-късно.

### UX copy — точни текстове

| Ситуация | Текст |
|----------|-------|
| Нова сесия | "Офертите важат 48 часа. Отворете от същото устройство за да продължите по-късно." |
| Изтекла сесия | "Сесията ви изтече — моля, въведете данните отново" |
| Redis degradation | "Временно изискваме регистрация" |

НЕ ползвай технически термини: "Session expired", "Redis unavailable", "503 error".

### Project Structure Notes

**Alignment с архитектурата:**
- `(client)` route group добавен за client-facing flows (съгласно Architecture.md#Next.js App Router Structure)
- BLoC pattern за Flutter (единствен позволен — без Provider/Riverpod/setState за business logic)
- `flutter_secure_storage` за session UUID (не Hive — правилно per architecture)
- Rate limiting на controller ниво — 10 req/min/IP (same as OCR)

**Конфликти/Отклонения:**
- `RedisKeyHelper` не се ползва за `anon:` ключове — съзнателно, защото pattern е различен от tenant-scoped ключове

### References

- [Source: epics.md#Story 3.1] — User story, Acceptance Criteria, Redis key pattern `anon:{uuid}:session`
- [Source: prd.md#Journey 1b: Николай купува ГО за пръв път] — Анонимен flow, 48h session, cross-device limitation
- [Source: architecture.md#Cross-Cutting Concerns — #9 Anonymous→Authenticated Flow] — Device-bound design decision
- [Source: architecture.md#Explicit Architectural Constraints — #2] — localStorage/secure_storage, no cookies
- [Source: architecture.md#Authentication & Security] — Rate limiting: 10/min/IP за OCR (прилагаме same за sessions)
- [Source: architecture.md#NestJS Module Structure] — Controller → Service → Repository pattern
- [Source: architecture.md#Flutter — flutter_secure_storage, Hive] — Auth/session tokens в secure_storage ONLY
- [Source: branivo-api/src/common/helpers/redis-key.helper.ts] — Existing Redis key helper (не се ползва за anon:)
- [Source: branivo-api/src/modules/tenants/feature-flags.service.ts] — Redis + ioredis pattern reference
- [Source: Story 2.3 Dev Notes] — JwtAuthGuard path: `../auth/guards/jwt-auth.guard`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_Без значими debug события._

### Completion Notes List

- Code review завършен — 5 issues оправени (3 High, 2 Medium)
- H1: `migrateSession` → `NotFoundException` вместо `ServiceUnavailableException` при не намерена сесия
- H2: `updateSessionData` → `NotFoundException` вместо silent return при не намерена сесия
- H3: `quotes/page.tsx` → redirect с locale prefix `/${locale}/login`
- M1: `(client)/layout.tsx` → реален Host header чрез `headers()` от `next/headers`
- M2: Flutter `_onMigrate` → извиква `repository.migrateSession()` и emit-ва `AnonymousSessionMigratedState`
- Добавен `migrateSession()` метод в `AnonymousSessionRepository`
- Тестове: +1 unit (updateSessionData NotFoundException), +1 bloc (migrate event) = 27 теста общо
- Имплементирани всички 15 задачи за Story 3.1
- Redis ключ `anon:{sessionId}:session` (не tenant-scoped) — tenant isolation чрез payload check (AC7)
- `ServiceUnavailableException` с `{ requires_login: true }` при Redis unavailability (AC5)
- Rate limiting: `@Throttle({ public: { ttl: 60000, limit: 10 } })` — 10 req/min/IP
- `migrate` endpoint изисква JWT; всички останали са публични
- Next.js: `localStorage` за session UUID (device-bound — съзнателен дизайн)
- Flutter: `flutter_secure_storage` (не Hive) за session UUID
- Тестове: 7 unit + 6 integration (NestJS) + 4 hook + 4 component (Next.js) + 4 bloc (Flutter) = 25 теста

### File List

**branivo-api (NestJS)**
- `branivo-api/src/modules/sessions/sessions.module.ts` (ново)
- `branivo-api/src/modules/sessions/anonymous-sessions.service.ts` (ново)
- `branivo-api/src/modules/sessions/anonymous-sessions.controller.ts` (ново)
- `branivo-api/src/modules/sessions/dto/create-session-response.dto.ts` (ново)
- `branivo-api/src/modules/sessions/dto/update-anon-session.dto.ts` (ново)
- `branivo-api/src/modules/sessions/interfaces/anon-session.interface.ts` (ново)
- `branivo-api/src/modules/sessions/anonymous-sessions.service.spec.ts` (ново)
- `branivo-api/src/modules/sessions/anonymous-sessions.controller.spec.ts` (ново)
- `branivo-api/src/app.module.ts` (променено — добавен SessionsModule)

**branivo-web (Next.js)**
- `branivo-web/src/app/[locale]/(client)/layout.tsx` (ново)
- `branivo-web/src/app/[locale]/(client)/quotes/page.tsx` (ново)
- `branivo-web/src/lib/hooks/use-anonymous-session.ts` (ново)
- `branivo-web/src/app/api/v1/sessions/anonymous/route.ts` (ново)
- `branivo-web/src/app/api/v1/sessions/anonymous/[sessionId]/route.ts` (ново)
- `branivo-web/src/app/api/v1/sessions/anonymous/[sessionId]/migrate/route.ts` (ново)
- `branivo-web/src/__tests__/client/quotes.page.test.tsx` (ново)
- `branivo-web/src/__tests__/hooks/use-anonymous-session.test.ts` (ново)

**branivo_app (Flutter)**
- `branivo_app/lib/features/anonymous_session/bloc/anonymous_session_bloc.dart` (ново)
- `branivo_app/lib/features/anonymous_session/bloc/anonymous_session_event.dart` (ново)
- `branivo_app/lib/features/anonymous_session/bloc/anonymous_session_state.dart` (ново)
- `branivo_app/lib/features/anonymous_session/data/repositories/anonymous_session_repository.dart` (ново)
- `branivo_app/test/features/anonymous_session/anonymous_session_bloc_test.dart` (ново)

**Sprint tracking**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (променено — статус → done)
- `_bmad-output/implementation-artifacts/3-1-anonymous-session-quote-browsing.md` (променено — статус, completion notes)
