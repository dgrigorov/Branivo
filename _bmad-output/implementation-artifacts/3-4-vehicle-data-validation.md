# Story 3.4: Vehicle Data Validation

Status: review

## Story

As an end-client,
I want my vehicle data validated against official registries,
So that I receive accurate quotes and my vehicle is confirmed as legitimate.

## Acceptance Criteria

1. **AC1 — VIN validation срещу КАТ API (< 3 сек):**
   **Given** VIN е въведен или OCR-извлечен (и минава regex `/^[A-HJ-NPR-Z0-9]{17}$/`),
   **When** validation runs,
   **Then** VIN се верифицира срещу КАТ Traffic Police API в < 3 сек; при успех response: `{ valid: true, katStatus: "ok" }`

2. **AC2 — КАТ API unavailable → manual fallback:**
   **Given** КАТ API не отговаря в 3 сек или връща грешка,
   **When** timeout/error настъпи,
   **Then** системата продължава с manual fallback — клиентът вижда предупреждение "Не успяхме да верифицираме VIN автоматично. Моля, проверете ръчно." и може да потвърди данните си и да продължи

3. **AC3 — Гаранционен фонд проверка за нерегламентиран статус:**
   **Given** vehicle data е подадена (VIN + регистрационен номер),
   **When** GF API е извикан,
   **Then** МПС се проверява за нерегламентиран статус; резултатът се cache-ва в Redis `gf:vehicle:{vin}` с TTL 24h

4. **AC4 — МПС е flagged от Гаранционен фонд → блокиране:**
   **Given** GF API върне позитивен резултат (МПС е нерегламентирано),
   **When** клиентът получи резултата,
   **Then** клиентът вижда ясно съобщение "Вашето МПС има нерегламентиран статус и не може да бъде застраховано."; proceed към quote е блокиран; validation_status = `"gf_blocked"` се записва в Redis анонимна сесия

5. **AC5 — Всички валидации са успешни → готово за Epic 4:**
   **Given** VIN формат е валиден AND (КАТ API OK или manual fallback потвърден) AND GF проверката е чиста,
   **When** validation завърши,
   **Then** anonymous session `vehicle_data.validation_status` = `"validated"`, `can_proceed_to_quote` = `true`; данните са готови за Quote заявка в Epic 4

6. **AC6 — VIN невалиден формат → 422:**
   **Given** VIN не минава regex `/^[A-HJ-NPR-Z0-9]{17}$/`,
   **When** validate endpoint е извикан,
   **Then** HTTP 422 `{ "statusCode": 422, "message": "VIN невалиден формат", "error": "Unprocessable Entity" }`

7. **AC7 — Session-scoped validation:**
   **Given** validation request идва с `X-Session-Token` header,
   **When** validation завърши,
   **Then** резултатите се записват в `anon:{sessionToken}:session` Redis key под `vehicle_data.validation_status` и `vehicle_data.can_proceed_to_quote`; TTL се опреснява до 48h

## Tasks / Subtasks

### Backend — VehiclesModule Skeleton

- [x] **Task 1: VehiclesModule файлова структура** (AC: #1-#7)
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.module.ts`
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.controller.ts` (FR19-21: VIN validation)
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.service.ts`
  - [x] Файл: `branivo-api/src/modules/vehicles/vehicles.repository.ts` — празен stub (ще е нужен за Story 3.5)
  - [x] **НЕ** се създава DB migration или entity — persistence е Story 3.5
  - [x] Добави `VehiclesModule` в `branivo-api/src/app.module.ts` imports

### Backend — External API Adapters

- [x] **Task 2: KatApiAdapter** (AC: #1, #2)
  - [x] Файл: `branivo-api/src/modules/vehicles/adapters/kat-api.adapter.ts`
  - [x] Инжектиране: `HttpService` от `@nestjs/axios`
  - [x] `validateVin(vin: string): Promise<KatValidationResult>`
  - [x] Env vars: `KAT_API_BASE_URL`, `KAT_API_KEY`

- [x] **Task 3: GarantsionenFondAdapter** (AC: #3, #4)
  - [x] Файл: `branivo-api/src/modules/vehicles/adapters/garantsionen-fond.adapter.ts`
  - [x] Redis cache `gf:vehicle:{vin}` TTL 24h
  - [x] Env vars: `GF_API_BASE_URL`, `GF_API_KEY`

### Backend — VehiclesService & Controller

- [x] **Task 4: VehiclesService** (AC: #1-#7)
  - [x] VIN validation, KAT, GF, session update

- [x] **Task 5: VehiclesController** (AC: #1-#7)
  - [x] `POST /vehicles/validate` with `X-Session-Token`

- [x] **Task 6: DTOs** (AC: #1-#6)
  - [x] `ValidateVehicleDto`, `VehicleValidationResultDto`, `CreateVehicleDto` (stub)

- [x] **Task 7: Custom Exceptions** (AC: #2, #4)
  - [x] `KatApiUnavailableError`, `GfApiUnavailableError`, `VehicleBlockedByGfException`

- [x] **Task 8: Redis Session Update в VehiclesService** (AC: #5, #7)
  - [x] `updateValidationStatus()` private method

- [x] **Task 9: VehiclesModule DI** (AC: #1-#7)
  - [x] `HttpModule`, `TenantContextModule`, всички providers

### Backend — Тестове

- [x] **Task 10: Unit тестове за VehiclesService** (AC: #1-#7)
  - [x] 8 теста — всички минават

- [x] **Task 11: Integration тестове за VehiclesController** (AC: #1, #4, #6)
  - [x] 5 теста — всички минават

### Next.js Web — Vehicle Validation UI

- [x] **Task 12: `useVehicleValidation` hook** (AC: #1-#5)
  - [x] Файл: `branivo-web/src/lib/hooks/use-vehicle-validation.ts`

- [x] **Task 13: BFF route за vehicle validation** (AC: #1-#5)
  - [x] Файл: `branivo-web/src/app/api/v1/vehicles/validate/route.ts`

- [x] **Task 14: VehicleValidationStatus компонент** (AC: #1-#5)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/vehicles/components/vehicle-validation-status.tsx`

- [x] **Task 15: Next.js тестове** (AC: #1-#4)
  - [x] 4 hook теста, 4 component теста — всички минават

### Flutter — Vehicle Validation

- [x] **Task 16: VehicleValidationBloc** (AC: #1-#5)
  - [x] `vehicle_validation_bloc.dart`, `_event.dart`, `_state.dart`

- [x] **Task 17: VehicleApiRepository** (AC: #1-#5)
  - [x] Файл: `branivo_app/lib/features/vehicles/data/repositories/vehicle_api_repository.dart`

- [x] **Task 18: VehicleValidationScreen** (AC: #1-#5)
  - [x] Файл: `branivo_app/lib/features/vehicles/screens/vehicle_validation_screen.dart`
  - [x] При `VehicleValidationKatFallback` → ElevatedButton "Продължи"
  - [x] При `VehicleValidationGfBlocked` → червен banner, NavigateBack бутон
  - [x] `Semantics(label: 'Статус на валидация')` за screen reader

- [x] **Task 19: Flutter тестове** (AC: #1-#5)
  - [x] Файл: `branivo_app/test/features/vehicles/vehicle_validation_bloc_test.dart`
  - [x] 5 bloc теста — всички минават

## Dev Notes

### VehiclesModule — Не съществува (НОВО)

`branivo-api/src/modules/vehicles/` директорията е **ПРАЗНА** — целият модул е нов. Провери с `ls branivo-api/src/modules/vehicles/` преди да пишеш — ако е празна, създавай всичко ново.

Добави `VehiclesModule` в `branivo-api/src/app.module.ts` imports (след `OcrModule`).

### No DB Migration за Story 3.4

**КРИТИЧНО:** Story 3.4 е само validation. Следователно **НЕ се създава** `vehicles` таблица и **НЕ се пише** migration. Persistence (vehicles таблица, UUID PK, owner_id, tenant_id RLS и т.н.) са задача на **Story 3.5**.

Next migration номер след Story 3.3 (`1710000010000`) → Story 3.5 ще ползва `1710000011000`.

### VIN Validation

```typescript
// Regex за валиден VIN (ISO 3779) — без I, O, Q
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

// Bulgarian license plate normalization (преди изпращане)
// "СА 1234 АА" → "СА1234АА" (strip spaces)
const normalizeLicensePlate = (plate: string): string => plate.replace(/\s+/g, '').toUpperCase();
```

### KAT API Adapter — Timeout Pattern

```typescript
// branivo-api/src/modules/vehicles/adapters/kat-api.adapter.ts
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { TimeoutError } from 'rxjs';

async validateVin(vin: string): Promise<KatValidationResult> {
  try {
    const response = await firstValueFrom(
      this.httpService.get(`${this.katApiBaseUrl}/vehicle`, {
        params: { vin },
        headers: { Authorization: `Bearer ${this.katApiKey}` },
      }).pipe(
        timeout(3000), // 3 seconds
        catchError(err => {
          if (err instanceof TimeoutError) throw new KatApiUnavailableError();
          throw err;
        })
      )
    );
    return { available: true, status: response.data.status as 'ok' | 'invalid' | 'stolen' };
  } catch (err) {
    if (err instanceof KatApiUnavailableError) throw err;
    throw new KatApiUnavailableError();
  }
}
```

**Важно:** Ползвай RxJS `timeout()` operator — по-идиоматично за NestJS + `@nestjs/axios` (HttpModule вече е configured с ioredis-подобен pattern).

### Гаранционен Фонд — Redis Cache Pattern

```typescript
// Redis key: gf:vehicle:{vin}  TTL: 24h (86400 сек)
async checkVehicle(vin: string, licensePlate: string): Promise<GfCheckResult> {
  // 1. Cache check
  const cacheKey = `gf:vehicle:${vin}`;
  const cached = await this.redis.get(cacheKey);
  if (cached) {
    return { ...JSON.parse(cached), source: 'cache' } as GfCheckResult;
  }

  // 2. API call
  try {
    const response = await firstValueFrom(
      this.httpService.post(`${this.gfApiBaseUrl}/check`, { vin, licensePlate }, {
        headers: { Authorization: `Bearer ${this.gfApiKey}` },
      }).pipe(timeout(5000), catchError(err => { throw new GfApiUnavailableError(); }))
    );
    const result: GfCheckResult = { flagged: response.data.flagged, reason: response.data.reason, source: 'api' };
    await this.redis.setex(cacheKey, 86400, JSON.stringify({ flagged: result.flagged, reason: result.reason }));
    return result;
  } catch (err) {
    if (err instanceof GfApiUnavailableError) throw err;
    throw new GfApiUnavailableError();
  }
}
```

### Anonymous Session Update Pattern

```typescript
// В VehiclesService — следвай точно Story 3.3 session update pattern:
const sessionKey = `anon:${sessionToken}:session`;
const existing = await this.redis.get(sessionKey);
if (!existing) return; // сесията е изтекла — само логвай, не хвърляй

const sessionData = JSON.parse(existing) as AnonymousSessionData;
sessionData.vehicle_data = {
  ...sessionData.vehicle_data,
  validation_status: result.canProceedToQuote ? 'validated' : 'gf_blocked',
  can_proceed_to_quote: result.canProceedToQuote,
  kat_status: result.katStatus,
  gf_status: result.gfStatus,
  validated_at: new Date().toISOString(),
};
// ВАЖНО: refresh TTL при всяка vehicle update (48h от последната активност)
await this.redis.setex(sessionKey, 48 * 3600, JSON.stringify(sessionData));
```

**Защо:** Анонимната сесия (`anon:{sessionToken}:session`) е вече имплементирана от Story 3.1. OCR резултатите са записани от Story 3.3. Story 3.4 добавя `validation_status` и `can_proceed_to_quote` към съществуващия `vehicle_data` обект.

### Env Variables (нови за Story 3.4)

```bash
# КАТ Traffic Police API
KAT_API_BASE_URL=https://api.kat.bg/v1   # стойност за dev — може да е mock
KAT_API_KEY=<secret>

# Гаранционен фонд API
GF_API_BASE_URL=https://api.gf.bg/v1    # стойност за dev — може да е mock
GF_API_KEY=<secret>
```

**За dev environment:** Ако КАТ/ГФ API-тата не са достъпни, имплементирай mock adapters, активирани при `NODE_ENV=test`:
```typescript
// Ако KAT_API_BASE_URL не е зададен → return { available: true, status: 'ok' }
```

### HttpModule Configuration

```typescript
// vehicles.module.ts
HttpModule.register({
  timeout: 5000,       // default timeout — adapters override per-call
  maxRedirects: 2,
})
```

**ВАЖНО:** `@nestjs/axios` HttpModule ≠ `axios` директно. Ползвай `firstValueFrom()` от `rxjs` за конвертиране Observable → Promise.

### VehiclesService — Паралелно vs Последователно

За Story 3.4 изпълнявай KAT и GF **последователно** (не паралелно), защото:
1. Ако VIN е невалиден по КАТ, GF check е безсмислен
2. GF check е cache-ван → бързо
3. При GF blocking е по-ясен error flow

Ако двата API са независими в бъдеще → `Promise.allSettled` оптимизация в Story 3.5+.

### Файлова Структура

```
branivo-api/src/modules/vehicles/
├── vehicles.module.ts                    ← НОВО
├── vehicles.controller.ts                ← НОВО (POST /validate)
├── vehicles.service.ts                   ← НОВО
├── vehicles.repository.ts                ← НОВО (stub — само за Story 3.5)
├── adapters/
│   ├── kat-api.adapter.ts               ← НОВО
│   └── garantsionen-fond.adapter.ts     ← НОВО
├── dto/
│   ├── validate-vehicle.dto.ts          ← НОВО
│   ├── vehicle-validation-result.dto.ts ← НОВО
│   └── create-vehicle.dto.ts            ← НОВО (empty stub за Story 3.5)
├── exceptions/
│   ├── kat-api-unavailable.exception.ts ← НОВО
│   ├── gf-api-unavailable.exception.ts  ← НОВО
│   └── vehicle-blocked-by-gf.exception.ts ← НОВО
├── vehicles.service.spec.ts             ← НОВО
└── vehicles.controller.spec.ts          ← НОВО

branivo-web/src/app/api/v1/vehicles/
└── validate/
    └── route.ts                         ← НОВО

branivo-web/src/app/[locale]/(client)/vehicles/
└── components/
    └── vehicle-validation-status.tsx    ← НОВО

branivo-web/src/lib/hooks/
└── use-vehicle-validation.ts            ← НОВО

branivo-web/src/__tests__/hooks/
└── use-vehicle-validation.test.ts       ← НОВО

branivo-web/src/__tests__/client/
└── vehicle-validation-status.test.tsx   ← НОВО

branivo_app/lib/features/vehicles/
├── bloc/
│   ├── vehicle_validation_bloc.dart     ← НОВО
│   ├── vehicle_validation_event.dart    ← НОВО
│   └── vehicle_validation_state.dart    ← НОВО
├── data/
│   └── repositories/
│       └── vehicle_api_repository.dart  ← НОВО
└── screens/
    └── vehicle_validation_screen.dart   ← НОВО

branivo_app/test/features/vehicles/
└── vehicle_validation_bloc_test.dart    ← НОВО
```

### Зависимости от предишни Stories

**Story 3.1 (done):**
- `AnonymousSessionsService` и Redis key pattern `anon:{sessionId}:session` вече съществуват
- `X-Session-Token` header convention е установен
- TTL 48h refresh pattern е установен

**Story 3.3 (done):**
- `vehicle_data` в Redis session вече съдържа OCR полета: `license_plate`, `vin`, `make`, `model`, `year`, `color`, `engine_volume`, `fuel_type`, `first_registration_date`
- Story 3.4 добавя `validation_status`, `can_proceed_to_quote`, `kat_status`, `gf_status`, `validated_at`
- `OcrModule` е в `AppModule` — не го пипай

**Story 3.2 (review статус):**
- `end_clients` таблицата съществува
- `ClientsModule` е в `AppModule`

**НЕ пренаписвай** файлове от Stories 3.1, 3.2, 3.3.

### Previous Story Intelligence (3.3)

- `HttpModule` от `@nestjs/axios` — за adapter HTTP calls
- NestJS exception filters: вместо throw standard `HttpException`, можеш да extend-неш за custom exceptions
- `Object.entries/values` ESLint issue: добавяй explicit тип анотации `([k, v]: [string, Type | undefined])` — ако не, lint ще fail-не
- Всички class properties в entities/DTOs: добавяй `!` postfix assertion или инициализирай стойности → избягва TS2564 strict property initialization error
- Mock Redis injection в тестове: `{ provide: getRedisToken(), useValue: mockRedis }` — НЕ `{ provide: 'REDIS', ... }`
- `res.body` в supertest: cast via `as MyResponseDto` — не оставяй `any`

### Git Intelligence

Последни patterns от Story 3.3:
- commit: `feat(story-3.3): Vehicle Document OCR Scanning`
- fix: `fix(story-3.3): code review — security, bucket name, type safety, UX`
- Story 3.4 branch: `feature/story-3-4-vehicle-data-validation`
- PR title format: `feat(story-3.4): Vehicle Data Validation`

### Project Structure Notes

- `VehiclesModule` е в Feature Modules tier — не в Infrastructure
- HTTP adapters за external APIs се поставят в `adapters/` subfolder на модула (не в shared `infrastructure/`)
- `HttpModule` се регистрира per-module (не global) — вече имплементирано в Story 3.1 sessions
- BullMQ **НЕ** се ползва за Story 3.4 — validation е синхронна операция (max 3+5 = 8 сек worst case)
- Ако двата external API са бавни, total latency е ~8 сек — acceptable за UX (показвай loading spinner)

### References

- [Source: epics.md#Story 3.4] — User story, AC1-AC5, КАТ/GF flow
- [Source: prd.md#FR19] — VIN validation срещу КАТ Traffic Police API с manual fallback
- [Source: prd.md#FR20] — Гаранционен фонд API check за нерегламентирани МПС
- [Source: architecture.md#External Dependencies Table] — КАТ timeout 3s; GF timeout 5s, Redis cache 24h/VIN
- [Source: architecture.md#Code Structure #vehicles] — vehicles.module.ts, adapters/, dto/, entities/
- [Source: architecture.md#Redis Keys] — `gf:vehicle:{vin}` TTL 24h; `kat:fines:{registrationPlate}` TTL 1h
- [Source: architecture.md#Error RFC 7807] — 422 VIN невалиден формат response format
- [Source: Story 3.3 Dev Notes] — Redis session update pattern; session key `anon:{sessionToken}:session`; TTL 48h refresh
- [Source: Story 3.3 Dev Notes] — `OcrFieldResult.vin` field вече е в session от OCR step
- [Source: branivo-skill] — `TenantContext.getTenantId()` задължително; никога не передавай tenant_id като параметър

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Имплементиран пълен VehiclesModule: KatApiAdapter (RxJS timeout 3s), GarantsionenFondAdapter (Redis cache 24h), VehiclesService (последователна валидация), VehiclesController (POST /vehicles/validate)
- Всички 7 AC-та са покрити: VIN regex 422, КАТ manual fallback, GF блокиране 403, session update Redis TTL 48h, GF unavailable не блокира
- Redis injection: `@Inject(REDIS_CLIENT)` pattern (не @InjectRedis)
- Timeout pattern: RxJS `timeout()` operator (не AbortController)
- Тестове: 13 backend (8 unit + 5 integration), 8 web (4 hook + 4 component), 5 Flutter bloc = 26 общо

### File List

branivo-api/src/app.module.ts
branivo-api/src/modules/vehicles/vehicles.module.ts
branivo-api/src/modules/vehicles/vehicles.controller.ts
branivo-api/src/modules/vehicles/vehicles.service.ts
branivo-api/src/modules/vehicles/vehicles.repository.ts
branivo-api/src/modules/vehicles/adapters/kat-api.adapter.ts
branivo-api/src/modules/vehicles/adapters/garantsionen-fond.adapter.ts
branivo-api/src/modules/vehicles/dto/validate-vehicle.dto.ts
branivo-api/src/modules/vehicles/dto/vehicle-validation-result.dto.ts
branivo-api/src/modules/vehicles/dto/create-vehicle.dto.ts
branivo-api/src/modules/vehicles/exceptions/kat-api-unavailable.exception.ts
branivo-api/src/modules/vehicles/exceptions/gf-api-unavailable.exception.ts
branivo-api/src/modules/vehicles/exceptions/vehicle-blocked-by-gf.exception.ts
branivo-api/src/modules/vehicles/vehicles.service.spec.ts
branivo-api/src/modules/vehicles/vehicles.controller.spec.ts
branivo-web/src/lib/hooks/use-vehicle-validation.ts
branivo-web/src/app/api/v1/vehicles/validate/route.ts
branivo-web/src/app/[locale]/(client)/vehicles/components/vehicle-validation-status.tsx
branivo-web/src/__tests__/hooks/use-vehicle-validation.test.ts
branivo-web/src/__tests__/client/vehicle-validation-status.test.tsx
branivo_app/lib/features/vehicles/bloc/vehicle_validation_bloc.dart
branivo_app/lib/features/vehicles/bloc/vehicle_validation_event.dart
branivo_app/lib/features/vehicles/bloc/vehicle_validation_state.dart
branivo_app/lib/features/vehicles/data/repositories/vehicle_api_repository.dart
branivo_app/lib/features/vehicles/screens/vehicle_validation_screen.dart
branivo_app/test/features/vehicles/vehicle_validation_bloc_test.dart
_bmad-output/implementation-artifacts/sprint-status.yaml
_bmad-output/implementation-artifacts/3-4-vehicle-data-validation.md
