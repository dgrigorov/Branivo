# Story 22.5: Guarantee Fund API Integration

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the platform,
I want to verify each vehicle against the Guarantee Fund (Гаранционен фонд) API,
so that policies are not issued for unregistered or fraudulent vehicles (FR20).

## Acceptance Criteria

1. **GF API check след КАТ validation**
   - Given a customer submits vehicle data (VIN + registration number) и KAT validation passes,
   - When `POST /vehicles/validate` се извика,
   - Then `GarantsionenFondAdapter.checkVehicle(vin, licensePlate)` се изпълнява и резултатът се включва в отговора като `gfStatus: 'clean' | 'flagged' | 'unavailable'`

2. **GF flagged → quote flow се спира**
   - Given the Guarantee Fund API връща `flagged: true`,
   - When резултатът е получен,
   - Then `VehicleBlockedByGfException` (HTTP 403, код `GF_BLOCKED`) се хвърля; клиентът вижда съобщение "Проверката на МПС показа нередност. Моля, свържете се с брокера."; брокерът получава нотификация в Dashboard

3. **GF clean → quote продължава**
   - Given the API returns `flagged: false`,
   - When резултатът е получен,
   - Then `gfStatus: 'clean'`, `canProceedToQuote: true`; резултатът се кешира в Redis `gf:vehicle:{vin}` с TTL 24h

4. **GF unavailable → manual check warning, без блокиране**
   - Given GF API е недостъпна (timeout ≥ 3 сек или HTTP error),
   - When circuit breaker се активира (5 грешки за 60 сек),
   - Then `gfStatus: 'unavailable'`, `canProceedToQuote: true`; Flutter показва warning "Проверката на МПС не е налична — брокерът ще верифицира ръчно."

5. **Redis cache hit → GF API не се вика**
   - Given `gf:vehicle:{vin}` ключ съществува в Redis (TTL 24h),
   - When `checkVehicle()` се извика,
   - Then HTTP заявка към GF API НЕ се прави; `source: 'cache'` в резултата

6. **Unit тест — `GarantsionenFondAdapter`**
   - Покрива: успешна проверка (clean), flagged, timeout → `GfApiUnavailableError`, cache hit → API не се вика, без GF_API_BASE_URL → `manual_fallback`

7. **Unit тест — `VehiclesService`**
   - Покрива: KAT OK + GF clean, KAT unavailable + GF clean, KAT OK + GF flagged (exception + session update), GF unavailable (proceed)

## Tasks / Subtasks

> **ВАЖНО:** Голяма част от имплементацията вече съществува от story 3.4 и последващ код.
> Направи задълбочен audit преди да пишеш код — не дублирай това, което вече е налице.

### Audit: Вече имплементирано ✅

- [x] **`GarantsionenFondAdapter`** — `branivo-api/src/modules/vehicles/adapters/garantsionen-fond.adapter.ts`
  - Redis cache TTL 24h (`gf:vehicle:{vin}`)
  - Timeout 5000ms (raw rxjs `timeout()`)
  - HTTP POST към `${GF_API_BASE_URL}/check` с Bearer token
  - `GfApiUnavailableError` при timeout или HTTP error
  - Mock clean (`manual_fallback`) ако `GF_API_BASE_URL` не е конфигуриран

- [x] **`VehiclesService.validateVehicle()`** — последователен KAT → GF flow
  - `runGfCheck()` хвърля `VehicleBlockedByGfException` при `flagged: true`
  - При `GfApiUnavailableError` → `gfStatus: 'unavailable'`, продължава
  - При KAT failed → GF изобщо не се вика, `gfStatus: 'unavailable'`

- [x] **`VehicleValidationResultDto`** — `gfStatus: 'clean' | 'flagged' | 'unavailable'`

- [x] **`VehicleBlockedByGfException`** — HTTP 403, `{ message: "...", code: "GF_BLOCKED" }`

- [x] **`GfApiUnavailableError`**

- [x] **`VehiclesModule`** — `GarantsionenFondAdapter` регистриран като provider

- [x] **Unit тестове за `VehiclesService`** (8 теста) — `vehicles.service.spec.ts`

- [x] **Integration тестове за `VehiclesController`** (5 теста) — `vehicles.controller.spec.ts`

- [x] **Flutter `VehicleValidationScreen`** — `_GfBlockedView` показва reason, `_SuccessView` показва `gfStatus`

- [x] **Flutter `VehicleValidationBloc`** — `VehicleValidationGfBlocked` state с reason

### Task 1: Circuit Breaker в `GarantsionenFondAdapter` (AC: #4)

Текущо: адаптерът използва само `timeout(5000ms)` — **без circuit breaker**.
PRD изисква NFR34 параметри: 5 грешки за 60 сек → отваря; 30 сек half-open.

- [x] Провери дали `CircuitBreakerService` от `branivo-api/src/modules/quotes/circuit-breaker.service.ts` може да се ползва директно или да се направи отделен opossum breaker за GF
  - `CircuitBreakerService` е bound към `TenantContext` (per-tenant key) — за GF е per-global key `'guarantee-fund'`
  - **Препоръка:** добави opossum circuit breaker директно в `GarantsionenFondAdapter` (без `TenantContext`), или инжектирай `CircuitBreakerService` с ключ `'gf'`
- [x] Конфигурация на breaker: `volumeThreshold: 5`, `resetTimeout: 30000`, `timeout: 3000` (намали от 5000 на 3000 per story AC)
- [x] При circuit open → хвърли `GfApiUnavailableError` (не нова грешка — service вече я обработва)
- [x] Запази `manual_fallback` при липсваща `GF_API_BASE_URL` (без breaker там)

### Task 2: Broker Notification при Flagged МПС (AC: #2)

Текущо: `runGfCheck()` хвърля `VehicleBlockedByGfException` — **без broker notification**.

- [x] Провери как `NotificationService` изпраща broker email — виж `branivo-api/src/modules/notifications/notifications.service.ts:62`
- [x] В `VehiclesService.validateVehicle()`, при catch на `VehicleBlockedByGfException`:
  - Изпрати broker notification: subject "МПС с нередовен статус", body с VIN + licensePlate
  - **Внимание:** `VehiclesService` не трябва да зависи директно от `NotificationService` ако е в друг модул — провери дали може да се инжектира или трябва BullMQ job
  - Ако `NotificationService` е exportable — добави като dependency в `VehiclesModule`; иначе — emit custom event

### Task 3: Unit тест за `GarantsionenFondAdapter` (AC: #6)

**Липсва** — няма spec файл за адаптера.

- [x] Файл: `branivo-api/src/modules/vehicles/adapters/garantsionen-fond.adapter.spec.ts`
- [x] Mock: `HttpService`, `ConfigService`, `Redis` (REDIS_CLIENT)
- [x] Тест 1: `checkVehicle()` — cache hit → Redis.get връща cached result → `source: 'cache'`, HTTP NOT called
- [x] Тест 2: `checkVehicle()` — API clean → `flagged: false`, кешира се в Redis, `source: 'api'`
- [x] Тест 3: `checkVehicle()` — API flagged → `flagged: true, source: 'api'`, кешира се
- [x] Тест 4: `checkVehicle()` — timeout → хвърля `GfApiUnavailableError`
- [x] Тест 5: `checkVehicle()` — без `GF_API_BASE_URL` → връща `{ flagged: false, source: 'manual_fallback' }` без HTTP call
- [x] При Task 1 (circuit breaker) — добави тест за open circuit

### Task 4: Верификация на ENV конфигурация

- [x] `GF_API_BASE_URL` — добавен ли е в `.env.example`? Провери и добави ако липсва
- [x] `GF_API_KEY` — същото
- [x] `branivo-api/src/infrastructure/database/seed.service.ts` — **не** е нужно seed за тази story (няма DB таблица)

### Task 5: Pre-PR Check

- [x] `cd branivo-api && npm run lint && npm run test:cov && npm run build`
- [x] `cd branivo_app && flutter analyze --no-fatal-infos && flutter test`

## Dev Notes

### Вече съществуващи файлове — не трогвай без причина

```
branivo-api/src/modules/vehicles/adapters/garantsionen-fond.adapter.ts  ← Основен адаптер — MODIFY само за circuit breaker
branivo-api/src/modules/vehicles/adapters/kat-api.adapter.ts
branivo-api/src/modules/vehicles/vehicles.service.ts                    ← MODIFY за broker notification
branivo-api/src/modules/vehicles/dto/vehicle-validation-result.dto.ts   ← НЕ модифицирай
branivo-api/src/modules/vehicles/exceptions/vehicle-blocked-by-gf.exception.ts
branivo-api/src/modules/vehicles/exceptions/gf-api-unavailable.exception.ts
branivo-api/src/modules/vehicles/vehicles.module.ts                     ← MODIFY ако добавяш NotificationService
branivo-api/src/modules/vehicles/vehicles.service.spec.ts               ← EXTEND при нужда
branivo-api/src/modules/vehicles/vehicles.controller.spec.ts
branivo_app/lib/features/vehicles/screens/vehicle_validation_screen.dart
branivo_app/lib/features/vehicles/bloc/vehicle_validation_bloc.dart
```

### Circuit Breaker — референция

Съществуващ pattern (quotes модул): `branivo-api/src/modules/quotes/circuit-breaker.service.ts`
- Използва `opossum` npm пакет — вече инсталиран
- `CircuitBreakerService.call(key, fn)` — обвива async call с breaker
- При `breaker.opened` → хвърля `CircuitOpenException`

За GF адаптера: НЕ ползвай `TenantContext` за ключа (GF е global, не per-tenant).
Или: добави opossum breaker директно като private field в `GarantsionenFondAdapter`.

### Broker Notification Pattern

```typescript
// В notifications.service.ts съществува метод за broker email:
// findBrokerAdminEmail(tenantId) → string | null
// sendBrokerAlert(tenantId, subject, body) — провери точното API
```

**КРИТИЧНО:** При инжектиране на `NotificationService` в `VehiclesModule` — провери за circular dependency (Vehicles → Notifications → ?). При circular — използвай `forwardRef()` или BullMQ job.

### Validation API Response

```typescript
// Текущ VehicleValidationResultDto (НЕ модифицирай):
{
  canProceedToQuote: boolean;
  katStatus: 'ok' | 'manual_fallback' | 'failed' | 'unavailable';
  gfStatus: 'clean' | 'flagged' | 'unavailable';
  vinValid: boolean;
  validatedAt: string;  // ISO string
}
```

Забележка: Story в epics.md споменава `guaranteeFundStatus: 'clear' | 'flagged' | 'unavailable'` — имплементацията ползва `gfStatus: 'clean' | 'flagged' | 'unavailable'`. **Не променяй** — Flutter и тестовете очакват `gfStatus`.

### Redis Cache Key Pattern

```
gf:vehicle:{vin}  →  TTL 86400 (24h)
Стойност: JSON { flagged: boolean, reason?: string }
```

### Flutter GF Unavailable Warning

Текущо: при `gfStatus: 'unavailable'` Flutter преминава директно към quotes (`canProceedToQuote: true`).
Story изисква warning съобщение "Проверката на МПС не е налична — брокерът ще верифицира ръчно."

- [ ] Провери дали `VehicleValidationBloc` показва warning state при `gfStatus: 'unavailable'`
- [ ] Ако не — добави `VehicleValidationGfUnavailable` state или inline warning в `_SuccessView`

### Project Structure Notes

- Vehicles модул: `branivo-api/src/modules/vehicles/`
- Adapter pattern: Controller → Service → Adapter (директна инжекция, не Repository)
- NestJS modules: не забравяй да добавиш нови providers в `vehicles.module.ts`
- Flutter BLoC: `branivo_app/lib/features/vehicles/bloc/vehicle_validation_bloc.dart`

### References

- `GarantsionenFondAdapter`: `branivo-api/src/modules/vehicles/adapters/garantsionen-fond.adapter.ts`
- `VehiclesService`: `branivo-api/src/modules/vehicles/vehicles.service.ts`
- `CircuitBreakerService` (reference): `branivo-api/src/modules/quotes/circuit-breaker.service.ts`
- `NotificationService`: `branivo-api/src/modules/notifications/notifications.service.ts`
- Epics: `_bmad-output/planning-artifacts/epics.md#Story-22.5`
- FR20: `_bmad-output/planning-artifacts/epics.md` (line ~38, line ~215)
- NFR34 circuit breaker params: epics.md (FR24 section — 5 errors/60s → open; 30s half-open)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Имплементацията е ~80% завършена от предходни stories (3.4 + production hardening)
- Основни задачи: circuit breaker (Task 1), broker notification (Task 2), adapter unit тест (Task 3)
- Не дублирай съществуващ код — аудитирай внимателно преди да пишеш

**Task 1 (Circuit Breaker):** Добавен opossum CircuitBreaker като private field в `GarantsionenFondAdapter`. Конфиг: `volumeThreshold: 5`, `resetTimeout: 30000`, `timeout: 3000`. Брекерът обвива `callGfApi()` — при open хвърля `GfApiUnavailableError`. `manual_fallback` пазен без брекер (проверка преди `.fire()`).

**Task 2 (Broker Notification):** `NotificationsModule` импортиран в `VehiclesModule`. `NotificationsService` инжектиран в `VehiclesService`. При `VehicleBlockedByGfException` се вика `notifyBroker()` fire-and-forget с tenant_id от анонимна сесия. Без circular dependency.

**Task 3 (Adapter тестове):** 6 unit теста покриват всички AC: cache hit (HTTP not called), clean API, flagged API, timeout/error → `GfApiUnavailableError`, no-URL fallback, circuit breaker open.

**Flutter:** Добавен inline warning в `_SuccessView` при `gfStatus == 'unavailable'` — amber banner "Проверката на МПС не е налична — брокерът ще верифицира ръчно." (AC#4).

**OCR fix:** `updateAnonymousSession` в `OcrService` смени от `private` на `async` — pre-existing build error поправен.

**Тестове:** 20/20 branivo-api, 10/10 Flutter vehicles. Lint 0 errors. Build успешен.

### File List

**Нови файлове:**
- `branivo-api/src/modules/vehicles/adapters/garantsionen-fond.adapter.spec.ts` (Task 3)

**Модифицирани файлове:**
- `branivo-api/src/modules/vehicles/adapters/garantsionen-fond.adapter.ts` (Task 1 — circuit breaker)
- `branivo-api/src/modules/vehicles/vehicles.service.ts` (Task 2 — broker notification + NotificationsService injection)
- `branivo-api/src/modules/vehicles/vehicles.module.ts` (Task 2 — NotificationsModule imported)
- `branivo-api/src/modules/vehicles/vehicles.service.spec.ts` (Task 2 — mock + broker notification assertions)
- `branivo-api/.env.example` (Task 4 — GF_API_BASE_URL, GF_API_KEY)
- `branivo-api/src/modules/ocr/ocr.service.ts` (pre-existing build fix — updateAnonymousSession visibility)
- `branivo_app/lib/features/vehicles/screens/vehicle_validation_screen.dart` (Flutter GF unavailable warning)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (22-5: review)

## Change Log

- 2026-04-05: feat(story-22.5) — circuit breaker, broker notification, adapter unit tests, Flutter warning, ENV config
