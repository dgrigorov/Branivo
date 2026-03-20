# Story 4.1: Parallel Quote Aggregation

Status: review

## Story

As an end-client,
I want to see insurance quotes from all available insurers simultaneously,
So that I can compare options and choose the best offer in under 5 seconds.

## Acceptance Criteria

1. **AC1 — Паралелни заявки към всички активни застрахователи:**
   **Given** клиент подава данни за МПС,
   **When** quote request се инициира,
   **Then** паралелни заявки се изпращат към всички активни застрахователи едновременно (`Promise.allSettled` с 5 сек timeout per insurer)

2. **AC2 — Резултати в < 5 сек:**
   **Given** всички отговори са получени (или timeout-нали),
   **When** резултатите се показват,
   **Then** клиентът вижда всички оферти в < 5 сек от подаване на заявката

3. **AC3 — Препоръчана оферта с audit trail (КФН compliance):**
   **Given** quote резултати са показани,
   **When** scoring алгоритъмът работи,
   **Then** препоръчаната оферта (`is_recommended: true`) е маркирана визуално; входните данни, weights и резултатът се логват в `audit_log` (MAX 1 `is_recommended: true` per quote set)

4. **AC4 — Circuit breaker per insurer:**
   **Given** insurer API fails 5 пъти за 60 секунди,
   **When** circuit breaker се отвори,
   **Then** заявките към него спират за 30 сек; останалите застрахователи продължават нормално; при half-open state — 1 probe заявка

5. **AC5 — Accessibility:**
   **Given** quote cards са рендирани,
   **When** screen reader е активен,
   **Then** препоръчаната оферта се announce-ва; всяка карта е keyboard navigable (Tab + Enter)

6. **AC6 — Graceful degradation при insurer error:**
   **Given** insurer връща грешка,
   **When** резултатите се показват,
   **Then** клиентът вижда останалите оферти; недостъпният застраховател е маркиран като "временно недостъпен"

## Tasks / Subtasks

### Backend — Database & Migrations

- [x] **Task 1: Migration — Create `insurers` table** (AC: #1, #4)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000012000-CreateInsurersTable.ts`
  - [x] Таблицата е **НЕ tenant-scoped** (platform-wide, управлява се от Super Admin)
  - [x] Колони: `id UUID PK DEFAULT gen_random_uuid()`, `name VARCHAR(255) NOT NULL`, `code VARCHAR(50) UNIQUE NOT NULL` (напр. 'allianz', 'generali', 'dsk', 'bulstrad'), `is_active BOOLEAN DEFAULT true`, `rating DECIMAL(3,2) NOT NULL` (1.00–5.00), `claim_speed DECIMAL(3,1) NOT NULL` (1.0–10.0), `extras_config JSONB DEFAULT '{}'`, `adapter_class VARCHAR(100) NOT NULL` (напр. `'AllianzAdapter'`), `api_endpoint VARCHAR(500)`, `api_key_enc VARCHAR(500)` (AES-256-GCM encrypted — **НИКОГА** не се връща в GET response), `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`, `deleted_at TIMESTAMPTZ`

- [x] **Task 2: Migration — Create `quotes` table** (AC: #1, #2, #3)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000013000-CreateQuotesTable.ts`
  - [x] Един ред = една оферта от един застраховател за една сесия
  - [x] Колони: `id UUID PK DEFAULT gen_random_uuid()`, `tenant_id UUID NOT NULL`, `session_token VARCHAR(255) NOT NULL`, `vehicle_id UUID NULLABLE` (FK към `vehicles.id` — NULL при анонимна сесия без персистиран vehicle), `insurer_id UUID NOT NULL REFERENCES insurers(id)`, `status VARCHAR(20) NOT NULL DEFAULT 'pending'` (enum: `pending | success | error | timeout`), `price DECIMAL(10,2) NULLABLE`, `currency VARCHAR(3) DEFAULT 'BGN'`, `cover_details JSONB DEFAULT '{}'`, `extras JSONB DEFAULT '{}'`, `score DECIMAL(5,4) NULLABLE`, `is_recommended BOOLEAN DEFAULT false`, `raw_response JSONB NULLABLE`, `error_message VARCHAR(500) NULLABLE`, `expires_at TIMESTAMPTZ NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`, `deleted_at TIMESTAMPTZ`
  - [x] Indexes: `idx_quotes_tenant_id`, `idx_quotes_session_token`, `idx_quotes_insurer_id`, `idx_quotes_session_token_tenant_id` (composite)
  - [x] RLS: `CREATE POLICY quotes_tenant_isolation ON quotes USING (tenant_id = current_setting('app.current_tenant_id')::UUID)`

### Backend — Entities & Repository

- [x] **Task 3: `Insurer` entity** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/quotes/entities/insurer.entity.ts`
  - [x] `@Entity('insurers')` — **без** `tenant_id`
  - [x] Всички колони с explicit `{ name: 'snake_case' }` в `@Column()`
  - [x] `apiKeyEnc` е САМО за write операции — **НИКОГА** не го включвай в response DTO
  - [x] Не extends `BaseRepository` (не е tenant-scoped)

- [x] **Task 4: `Quote` entity** (AC: #1, #2, #3)
  - [x] Файл: `branivo-api/src/modules/quotes/entities/quote.entity.ts`
  - [x] `@Entity('quotes')` с `tenant_id`, `deleted_at`
  - [x] `@ManyToOne(() => Insurer) @JoinColumn({ name: 'insurer_id' }) insurer!: Insurer`
  - [x] Status enum: `export enum QuoteStatus { PENDING = 'pending', SUCCESS = 'success', ERROR = 'error', TIMEOUT = 'timeout' }`

- [x] **Task 5: `QuotesRepository`** (AC: #1, #2)
  - [x] Файл: `branivo-api/src/modules/quotes/quotes.repository.ts`
  - [x] `extends BaseRepository<Quote>` — автоматично scope-ва soft delete
  - [x] `findBySessionToken(sessionToken: string, tenantId: string): Promise<Quote[]>`
  - [x] `findActiveInsurers(): Promise<Insurer[]>` — директна DataSource query (не tenant-scoped)
  - [x] `bulkCreate(quotes: Partial<Quote>[]): Promise<Quote[]>` — INSERT INTO quotes за всички insurers наведнъж

### Backend — InsurerAdapter Pattern

- [x] **Task 6: `InsurerAdapter` interface** (AC: #1, #4, #6)
  - [x] Файл: `branivo-api/src/modules/quotes/adapters/insurer-adapter.interface.ts`
  - [x] ```typescript
    export interface QuoteRequest {
      sessionToken: string;
      tenantId: string;
      vehicle: {
        vin: string;
        licensePlate: string;
        make: string;
        model: string;
        year: number;
      };
    }
    export interface QuoteResult {
      insurerCode: string;
      price: number;
      currency: string;
      coverDetails: Record<string, unknown>;
      extras: Record<string, unknown>;
      rawResponse: Record<string, unknown>;
    }
    export interface InsurerAdapter {
      readonly insurerCode: string;
      fetchQuote(request: QuoteRequest): Promise<QuoteResult>;
    }
    ```

- [x] **Task 7: Mock adapters за всеки активен застраховател** (AC: #1, #2, #6)
  - [x] Файл: `branivo-api/src/modules/quotes/adapters/mock-insurer.adapter.ts`
  - [x] `MockInsurerAdapter` имплементира `InsurerAdapter`
  - [x] Симулира реален API: 200–800ms рандом delay, 10% chance of error
  - [x] Генерира реалистична цена: `basePrice * (1 + Math.random() * 0.3)` (±30% вариация)
  - [x] Per-insurer конфигурируем `basePrice` (Allianz: 450, Generali: 420, DSK: 380, Bulstrad: 400)
  - [x] Адаптерите се регистрират като Injectable providers с token `INSURER_ADAPTERS`
  - [x] **ВАЖНО:** В production тук влизат реалните HTTP adapter имплементации — mock-овете са само за dev/test

### Backend — Circuit Breaker

- [x] **Task 8: `CircuitBreakerService`** (AC: #4, #6)
  - [x] Файл: `branivo-api/src/modules/quotes/circuit-breaker.service.ts`
  - [x] Ползвай `opossum` npm пакет: `npm install opossum && npm install --save-dev @types/opossum`
  - [x] Singleton service с `Map<string, CircuitBreaker>` — един breaker per insurer code
  - [x] Config per breaker: `{ timeout: 5000, errorThresholdPercentage: 50, volumeThreshold: 5, resetTimeout: 30000 }` (5 failures/60s → open; 30s half-open)
  - [x] `async call<T>(insurerCode: string, fn: () => Promise<T>): Promise<T>`
  - [x] При open state → `throw new CircuitOpenException(insurerCode)` (custom exception)
  - [x] Logger на state transitions: `open`, `halfOpen`, `close` events от opossum
  - [x] ```typescript
    // NestJS injection на opossum
    import CircuitBreaker from 'opossum';

    @Injectable()
    export class CircuitBreakerService {
      private readonly breakers = new Map<string, CircuitBreaker>();

      getBreaker(code: string, fn: (...args: unknown[]) => Promise<unknown>): CircuitBreaker {
        if (!this.breakers.has(code)) {
          const breaker = new CircuitBreaker(fn, {
            timeout: 5000,
            errorThresholdPercentage: 50,
            volumeThreshold: 5,
            resetTimeout: 30000,
          });
          this.breakers.set(code, breaker);
        }
        return this.breakers.get(code)!;
      }
    }
    ```

### Backend — Scoring Service

- [x] **Task 9: `ScoringService`** (AC: #3)
  - [x] Файл: `branivo-api/src/modules/quotes/scoring/scoring.service.ts`
  - [x] **Immutable formula** — НИКОГА не променяй weights без product decision:
    ```typescript
    // score = 0.40 * priceScore + 0.30 * (rating/5) + 0.20 * (claimSpeed/10) + 0.10 * extrasScore
    // priceScore = 1 - (price - minPrice) / (maxPrice - minPrice || 1)
    // extrasScore = selectedExtrasCount / totalAvailableExtras || 0
    ```
  - [x] `scoreOffers(offers: QuoteResult[], insurers: Insurer[]): ScoredOffer[]`
  - [x] `is_recommended: true` само за **1** оферта (MAX) — при tie → по-висок `insurer.rating` печели
  - [x] **КФН Audit Trail** — задължително логвай структурирано след всеки scoring run:
    ```typescript
    // structured log (NFR44) — в audit_log таблицата
    {
      action: 'quote.scored',
      entityType: 'quote_session',
      entityId: sessionToken,
      payload: {
        inputs: { sessionToken, vehicleVin, insurerCount },
        weights: { price: 0.40, rating: 0.30, claimSpeed: 0.20, extras: 0.10 },
        results: [{ insurerCode, price, score, isRecommended }]
      }
    }
    ```
  - [x] **ЗАБРАНЕНО:** Per-tenant scoring weights. `is_recommended: true` за > 1 оферта.

### Backend — Quotes Service & Controller

- [x] **Task 10: `QuotesService`** (AC: #1, #2, #3, #4, #6)
  - [x] Файл: `branivo-api/src/modules/quotes/quotes.service.ts`
  - [x] `createQuoteRequest(dto: CreateQuoteDto): Promise<QuoteResponseDto>`
    - Зареди активните insurers от DB
    - Създай pending quote редове в DB (bulk INSERT) — по един per insurer
    - **Паралелно с `Promise.allSettled()`**: изпрати заявки към всички insurers едновременно
    - Per insurer: обвий в `CircuitBreakerService.call()` + race с 5s timeout (`Promise.race([adapter.fetchQuote(), timeout(5000)])`)
    - При fulfilled → update quote ред на `success`, запази price/extras/rawResponse
    - При rejected → update quote ред на `error` или `timeout`
    - Стартирай `ScoringService.scoreOffers()` само върху successful offers
    - Update `is_recommended` и `score` в DB за successful offers
  - [x] `getQuotesBySession(sessionToken: string): Promise<QuoteResponseDto>`
    - Зареди всички quote редове по sessionToken (BaseRepository — tenant-scoped)
    - Return с insurer details (БЕЗ `api_key_enc`)
  - [x] **КРИТИЧНО:** `TenantContext.getTenantId()` — НИКОГА не предавай tenantId като параметър

- [x] **Task 11: `QuotesController`** (AC: #1, #2, #5)
  - [x] Файл: `branivo-api/src/modules/quotes/quotes.controller.ts`
  - [x] `POST /api/v1/quotes` — публичен endpoint (NO JWT required за анонимни клиенти)
  - [x] `GET /api/v1/quotes/:sessionToken` — публичен endpoint
  - [x] Rate limiting: `@Throttle(5, 60)` (5 quote requests/min/IP)
  - [x] Request: `CreateQuoteDto { sessionToken: string (IsNotEmpty), vehicleData?: VehicleDataDto }`
  - [x] Response format: `{ data: QuoteResponseDto, meta: { timestamp } }`
  - [x] **ЗАБРАНЕНО:** `insurer.api_key_enc` в response — никога
  - [x] TenantResolutionMiddleware се прилага автоматично (вече конфигурирано в AppModule)

### Backend — DTOs & Module

- [x] **Task 12: DTOs** (AC: #1-#6)
  - [x] Файл: `branivo-api/src/modules/quotes/dto/create-quote.dto.ts`
    - `sessionToken: string` (`@IsNotEmpty()`)
    - `vehicleData?: VehicleDataDto` (`@IsOptional() @ValidateNested() @Type(() => VehicleDataDto)`)
  - [x] Файл: `branivo-api/src/modules/quotes/dto/quote-response.dto.ts`
    - `sessionToken: string`, `offers: QuoteOfferDto[]`, `status: 'pending' | 'complete'`, `requestedAt: string`
  - [x] Файл: `branivo-api/src/modules/quotes/dto/quote-offer.dto.ts`
    - `id: string`, `insurerCode: string`, `insurerName: string`, `price: number | null`, `currency: string`, `score: number | null`, `isRecommended: boolean`, `status: QuoteStatus`, `extras: Record<string, unknown>`, `errorReason?: 'unavailable' | 'timeout'`
    - **НЕ включвай:** `apiKeyEnc`, `rawResponse` — само в DB

- [x] **Task 13: `QuotesModule` конфигурация** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/quotes/quotes.module.ts`
  - [x] Регистрирай: `QuotesController`, `QuotesService`, `QuotesRepository`, `CircuitBreakerService`, `ScoringService`
  - [x] Provide mock adapters: `{ provide: INSURER_ADAPTERS, useFactory: () => [new MockInsurerAdapter('allianz', 450), ...], multi: false }` — или по-добре individual providers
  - [x] Import `TypeOrmModule.forFeature([Quote, Insurer])`
  - [x] Import `InfrastructureModule` (за Redis достъп ако е нужен)
  - [x] Добави `QuotesModule` в `AppModule` imports

### Backend — Seeder за Insurers

- [x] **Task 14: Seeder за тестови застрахователи** (dev-only)
  - [x] Файл: `branivo-api/src/infrastructure/database/seed.service.ts` (ОБНОВИ — добави нови методи)
  - [x] Добави `seedInsurers()` извикван от `onApplicationBootstrap()`:
    ```typescript
    private async seedInsurers(): Promise<void> {
      const insurers = [
        { code: 'allianz', name: 'Allianz Bulgaria', rating: 4.5, claim_speed: 8.5, base_price_hint: 450, adapter_class: 'MockInsurerAdapter' },
        { code: 'generali', name: 'Generali Bulgaria', rating: 4.2, claim_speed: 7.8, base_price_hint: 420, adapter_class: 'MockInsurerAdapter' },
        { code: 'dsk', name: 'ДЗИ (DSK)', rating: 4.0, claim_speed: 7.0, base_price_hint: 380, adapter_class: 'MockInsurerAdapter' },
        { code: 'bulstrad', name: 'Булстрад', rating: 3.8, claim_speed: 6.5, base_price_hint: 400, adapter_class: 'MockInsurerAdapter' },
      ];
      for (const ins of insurers) {
        await this.dataSource.query(
          `INSERT INTO insurers (id, name, code, is_active, rating, claim_speed, extras_config, adapter_class)
           VALUES (gen_random_uuid(), $1, $2, true, $3, $4, '{"roadside_assistance": true, "glass": true, "legal": false}', $5)
           ON CONFLICT (code) DO NOTHING`,
          [ins.name, ins.code, ins.rating, ins.claim_speed, ins.adapter_class],
        );
      }
    }
    ```
  - [x] Seeder проверява дали застрахователите вече съществуват: `ON CONFLICT (code) DO NOTHING`
  - [x] **ВАЖНО:** Seeder НЕ се изпълнява в production (`NODE_ENV === 'production'` check вече съществува)

### Backend — Тестове

- [x] **Task 15: Unit тестове за `ScoringService`** (AC: #3)
  - [x] Файл: `branivo-api/src/modules/quotes/scoring/scoring.service.spec.ts` (НОВ)
  - [x] Mock `DataSource` за audit_log write
  - [x] Тест: scoring formula дава правилен резултат (snapshot test с known inputs)
  - [x] Тест: `is_recommended` е `true` само за 1 оферта
  - [x] Тест: при tie — по-висок rating печели
  - [x] Тест: само `success` offers участват в scoring

- [x] **Task 16: Unit тестове за `QuotesService`** (AC: #1, #4, #6)
  - [x] Файл: `branivo-api/src/modules/quotes/quotes.service.spec.ts` (НОВ)
  - [x] Mock `QuotesRepository`, `CircuitBreakerService`, `ScoringService`, `TenantContext`
  - [x] Тест: `createQuoteRequest` — 4 adapters → `Promise.allSettled` → 4 quote редове
  - [x] Тест: 1 adapter timeout → останалите 3 offer-а се show-ват
  - [x] Тест: circuit breaker open → insurer се пропуска с `status: 'error'`
  - [x] Тест: `tenantId` идва от `TenantContext.getTenantId()` — НЕ от параметър

- [x] **Task 17: Integration тестове за `QuotesController`** (AC: #1, #2, #5)
  - [x] Файл: `branivo-api/src/modules/quotes/quotes.controller.spec.ts` (НОВ)
  - [x] `POST /quotes` — 201 Created с quote session данни
  - [x] `GET /quotes/:sessionToken` — 200 с offers array
  - [x] `GET /quotes/:sessionToken` — response не съдържа `api_key_enc`
  - [x] Rate limit тест: 6-та заявка от same IP → 429

### Flutter — Quote Feature

- [x] **Task 18: `QuoteApiRepository`** (AC: #1, #2)
  - [x] Файл: `branivo_app/lib/features/quotes/data/quote_api_repository.dart` (НОВ)
  - [x] `createQuoteRequest(sessionToken: String, vehicleData: VehicleData?): Future<QuoteSession>`
    - POST `/api/v1/quotes` с Bearer token (или без за анонимен)
    - Headers: `X-Session-Token: {sessionToken}`
  - [x] `getQuotesBySession(sessionToken: String): Future<QuoteSession>`
    - GET `/api/v1/quotes/{sessionToken}`
  - [x] Models: `QuoteSession { sessionToken, offers: List<QuoteOffer>, status, requestedAt }`
  - [x] Models: `QuoteOffer { id, insurerCode, insurerName, price, currency, score, isRecommended, status, extras, errorReason? }`

- [x] **Task 19: `QuoteBloc` + Events + States** (AC: #1, #2, #3, #6)
  - [x] Файл: `branivo_app/lib/features/quotes/bloc/quote_bloc.dart` (НОВ)
  - [x] Файл: `branivo_app/lib/features/quotes/bloc/quote_event.dart` (НОВ)
  - [x] Файл: `branivo_app/lib/features/quotes/bloc/quote_state.dart` (НОВ)
  - [x] Events:
    - `QuoteLoadRequestedEvent { sessionToken: String, vehicleData?: VehicleData }`
    - `QuoteRefreshRequestedEvent { sessionToken: String }`
  - [x] States:
    - `QuoteInitialState`
    - `QuoteLoadingState` — показва skeleton
    - `QuoteLoadedState { offers: List<QuoteOffer>, recommendedOffer: QuoteOffer? }`
    - `QuoteErrorState { message: String }`
    - `QuotePartialState { offers: List<QuoteOffer>, pendingCount: int }` — прогресивно reveal
  - [x] BLoC naming convention: `QuoteLoadRequestedEvent`, `QuoteLoadingState` — **без** `Load` вместо `LoadRequested`

- [x] **Task 20: `OffersScreen`** (AC: #2, #3, #5, #6)
  - [x] Файл: `branivo_app/lib/features/quotes/screens/offers_screen.dart` (НОВ)
  - [x] **Progressive reveal**: skeleton → first offer → second → ... (не показвай spinner)
  - [x] Skeleton за всяка offer card (имитира layout-а)
  - [x] `BlocProvider` + `BlocBuilder<QuoteBloc, QuoteState>`
  - [x] Accessibility: `Semantics(label: isRecommended ? 'Препоръчана оферта от ${offer.insurerName}' : 'Оферта от ${offer.insurerName}')`
  - [x] Недостъпен застраховател: показва карта с "Временно недостъпен" и muted styling
  - [x] Route: `/quotes/offers` (добави в `app_router.dart`)

- [x] **Task 21: `OfferCard` widget** (AC: #2, #3, #5)
  - [x] Файл: `branivo_app/lib/features/quotes/widgets/offer_card.dart` (НОВ)
  - [x] Props: `QuoteOffer offer, bool isRecommended`
  - [x] Препоръчана оферта: визуален badge "⭐ Препоръчано", highlighted border
  - [x] Error state: muted card с икона и текст "Временно недостъпен"
  - [x] Keyboard navigable: `FocusableActionDetector` + Enter handler за избор
  - [x] `Semantics(button: true, label: ...)` за accessibility

- [x] **Task 22: `app_router.dart` — добави quotes route** (AC: #1)
  - [x] Файл: `branivo_app/lib/core/routing/app_router.dart` (ОБНОВИ)
  - [x] Route: `/quotes/offers` → `OffersScreen` с `BlocProvider<QuoteBloc>`
  - [x] Route args: `QuoteOffersRouteArgs { sessionToken: String }`

- [x] **Task 23: Flutter тестове** (AC: #2, #3, #5, #6)
  - [x] Файл: `branivo_app/test/features/quotes/bloc/quote_bloc_test.dart` (НОВ)
    - Тест: `QuoteLoadRequestedEvent` → `QuoteLoadingState` → `QuoteLoadedState`
    - Тест: API error → `QuoteErrorState`
    - Тест: partial results (2/4 success) → `QuoteLoadedState` с 2 offers
  - [x] Файл: `branivo_app/test/features/quotes/widgets/offer_card_test.dart` (НОВ)
    - Тест: рендира recommended badge при `isRecommended: true`
    - Тест: рендира "Временно недостъпен" при `status: error`
    - Тест: Semantics label съдържа insurer name
  - [x] Файл: `branivo_app/test/features/quotes/screens/offers_screen_test.dart` (НОВ)
    - Тест: skeleton се показва при `QuoteLoadingState`
    - Тест: offer cards се рендират при `QuoteLoadedState`

### Next.js — Quote Results Web

- [x] **Task 24: `useQuotes` hook** (AC: #1, #2, #3)
  - [x] Файл: `branivo-web/src/lib/hooks/use-quotes.ts` (НОВ)
  - [x] `createQuoteRequest(sessionToken: string, vehicleData?: VehicleData): Promise<QuoteSession>`
  - [x] `useQuotesBySession(sessionToken: string)` — TanStack Query с **`staleTime: 0, gcTime: 0`** (задължително — стари цени са недопустими, regulatory requirement)
  - [x] Loading/error states

- [x] **Task 25: Web Quotes Page — показва offer results** (AC: #2, #3, #5)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/quotes/page.tsx` (ОБНОВИ — добави offer results section)
  - [x] Запази съществуващия vehicle data form (от Story 3.1)
  - [x] Добави: след submit → `createQuoteRequest()` → показва `OfferCard` list
  - [x] Препоръчана оферта: визуален badge "Препоръчано", highlighted border
  - [x] `staleTime: 0, gcTime: 0` — **задължително** за `useQuery` на quote results
  - [x] `Suspense` + `loading.tsx` за initial load
  - [x] Screen reader: `aria-label="Препоръчана оферта от {name}"` за recommended card

- [x] **Task 26: `OfferCard` Next.js компонент** (AC: #3, #5)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/quotes/components/offer-card.tsx` (НОВ)
  - [x] Props: `{ offer: QuoteOffer; isRecommended: boolean }`
  - [x] Tailwind CSS — без допълнителни UI libraries
  - [x] Accessibility: `role="article"`, `aria-label`, keyboard navigable с Tab + Enter

- [x] **Task 27: Next.js тестове** (AC: #2, #3, #5)
  - [x] Файл: `branivo-web/src/__tests__/hooks/use-quotes.test.ts` (НОВ)
    - 3 теста: createQuoteRequest success, useQuotesBySession success, error state
  - [x] Файл: `branivo-web/src/__tests__/client/offer-card.test.tsx` (НОВ)
    - Тест: recommended badge е видим при `isRecommended: true`
    - Тест: "Временно недостъпен" при error status

## Dev Notes

### Scoring Formula — IMMUTABLE (NFR44, КФН Compliance)

```typescript
// branivo-api/src/modules/quotes/scoring/scoring.service.ts
// НИКОГА не променяй тези weights без product decision (PR review required)
const SCORING_WEIGHTS = { price: 0.40, rating: 0.30, claimSpeed: 0.20, extras: 0.10 } as const;

// priceScore: 0.0 (най-скъп) → 1.0 (най-евтин)
const prices = offers.map(o => o.price);
const minPrice = Math.min(...prices);
const maxPrice = Math.max(...prices);
const priceScore = maxPrice === minPrice ? 1.0 : 1 - (price - minPrice) / (maxPrice - minPrice);

// extrasScore: брой активни extras / общ брой налични extras
const extrasScore = availableExtrasCount > 0 ? activeExtrasCount / availableExtrasCount : 0;

const score = SCORING_WEIGHTS.price * priceScore
            + SCORING_WEIGHTS.rating * (insurer.rating / 5)
            + SCORING_WEIGHTS.claimSpeed * (insurer.claimSpeed / 10)
            + SCORING_WEIGHTS.extras * extrasScore;
```

**ЗАБРАНЕНО:** Промяна на weights. Per-tenant scoring. `is_recommended: true` за > 1 оферта.

### Promise.allSettled + Timeout Pattern

```typescript
// branivo-api/src/modules/quotes/quotes.service.ts
const timeoutFn = (ms: number): Promise<never> =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
  );

const results = await Promise.allSettled(
  activeInsurers.map(insurer =>
    this.circuitBreakerService.call(insurer.code, () =>
      Promise.race([
        this.getAdapter(insurer.code).fetchQuote(request),
        timeoutFn(5000),
      ]),
    ),
  ),
);

for (let i = 0; i < results.length; i++) {
  const result = results[i];
  if (result.status === 'fulfilled') {
    // update quote row → success
  } else {
    const reason = result.reason as Error;
    const isTimeout = reason.message.includes('Timeout');
    // update quote row → error or timeout
  }
}
```

### Circuit Breaker — opossum конфигурация

```typescript
// npm install opossum
// npm install --save-dev @types/opossum

import CircuitBreaker from 'opossum';

const breakerOptions: CircuitBreaker.Options = {
  timeout: 5000,                  // 5s max per call
  errorThresholdPercentage: 50,   // >50% failures → open
  volumeThreshold: 5,             // min 5 calls before trip
  resetTimeout: 30000,            // 30s half-open
};
```

**State transitions:** closed → (5 failures/60s) → open → (30s) → half-open → (1 probe success) → closed

### Insurer Adapter Interface — NFR33

Нов застраховател = нов клас, **без core промяна**:
```typescript
// branivo-api/src/modules/quotes/adapters/allianz.adapter.ts (future real adapter)
@Injectable()
export class AllianzAdapter implements InsurerAdapter {
  readonly insurerCode = 'allianz';
  async fetchQuote(request: QuoteRequest): Promise<QuoteResult> {
    // real HTTP call to Allianz API
  }
}
```

Регистрацията е в QuotesModule — swap от Mock → Real без service промяна.

### КРИТИЧНО: api_key_enc НИКОГА в response

```typescript
// В QuoteOfferDto НЕ включвай:
// ❌ apiKeyEnc, rawResponse, api_key_enc

// Правилно — само клиентски данни:
// ✅ insurerCode, insurerName, price, currency, score, isRecommended, status, extras
```

### TanStack Query — staleTime: 0 (задължително)

```typescript
// branivo-web/src/lib/hooks/use-quotes.ts
const { data, isPending, isError } = useQuery({
  queryKey: ['quotes', 'list', sessionToken],
  queryFn: () => fetchQuotes(sessionToken),
  staleTime: 0,   // ЗАДЪЛЖИТЕЛНО — регулаторно изискване (стари цени са недопустими)
  gcTime: 0,      // ЗАДЪЛЖИТЕЛНО — не кешира quote резултати
});
```

### Flutter — Progressive Reveal Pattern

```dart
// branivo_app/lib/features/quotes/screens/offers_screen.dart
BlocBuilder<QuoteBloc, QuoteState>(
  builder: (context, state) {
    if (state is QuoteLoadingState) {
      return ListView.builder(
        itemCount: 4, // примерен брой insurers
        itemBuilder: (_, __) => const OfferCardSkeleton(),
      );
    }
    if (state is QuoteLoadedState) {
      return ListView.builder(
        itemCount: state.offers.length,
        itemBuilder: (_, i) => OfferCard(
          offer: state.offers[i],
          isRecommended: state.offers[i].isRecommended,
        ),
      );
    }
    // ... error state
  },
)
```

НЕ ползвай generic `CircularProgressIndicator` за offer list — само skeleton screens.

### Audit Log Pattern (КФН Compliance)

```typescript
// В ScoringService — след scoring
await this.dataSource.query(
  `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, payload, created_at)
   VALUES (gen_random_uuid(), $1, NULL, 'quote.scored', 'quote_session', $2, $3, NOW())`,
  [tenantId, sessionToken, JSON.stringify({
    inputs: { sessionToken, vehicleVin, insurerCount },
    weights: { price: 0.40, rating: 0.30, claimSpeed: 0.20, extras: 0.10 },
    results: scoredOffers.map(o => ({ insurerCode: o.insurerCode, price: o.price, score: o.score, isRecommended: o.isRecommended })),
  })],
);
// audit_log е IMMUTABLE — без UPDATE или DELETE
```

### Зависимости от предишни Stories

**Story 3.1 (done):**
- `AnonymousSessionsService` съществува — `anon:{sessionId}:session` Redis ключ с `{ session_id, tenant_id, created_at, vehicle_data? }`
- `@Inject(REDIS_CLIENT)` injection pattern е установен
- Next.js quotes page (`/[locale]/(client)/quotes/page.tsx`) вече съществува — само я extend-ни

**Story 3.5 (done):**
- `vehicles` таблица съществува — `vehicle_id` FK в quotes таблицата
- `Vehicle` entity е пример за TypeORM entity pattern
- Последна миграция: `1710000011000-CreateVehiclesTable.ts` → следващи: `1710000012000`, `1710000013000`

**Story 3.6 (review):**
- `@Inject(REDIS_CLIENT)` pattern — `import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module'`
- TypeScript: `!` postfix assertion за class properties
- `import type` при `isolatedModules`
- Mock pattern: `{ provide: ServiceName, useValue: mockService }` в NestJS tests
- `res.body as QuoteResponseDto` cast в supertest

**Story 3.2 (done):**
- `end_clients` таблица съществува — не е нужна за 4.1 директно, но `ownerId` ще се използва в следващи stories

### Git Intelligence

```
Последна migration:  1710000011000-CreateVehiclesTable.ts
Следващи migrations: 1710000012000-CreateInsurersTable.ts, 1710000013000-CreateQuotesTable.ts

Story 4.1 branch:    feature/story-4-1-parallel-quote-aggregation
Commit format:       feat(story-4.1): Parallel Quote Aggregation
PR title:            feat(story-4.1): Parallel Quote Aggregation
PR base:             main  ← ЗАДЪЛЖИТЕЛНО --base main
```

### Инсталирай нови npm пакети

```bash
cd branivo-api && npm install opossum && npm install --save-dev @types/opossum
```

### Файлова Структура

```
branivo-api/src/infrastructure/database/migrations/
├── 1710000012000-CreateInsurersTable.ts      ← НОВО
└── 1710000013000-CreateQuotesTable.ts        ← НОВО

branivo-api/src/infrastructure/database/
└── seed.service.ts                           ← ОБНОВЕН (seedInsurers())

branivo-api/src/modules/quotes/
├── adapters/
│   ├── insurer-adapter.interface.ts          ← НОВО
│   └── mock-insurer.adapter.ts              ← НОВО
├── dto/
│   ├── create-quote.dto.ts                  ← НОВО
│   ├── quote-offer.dto.ts                   ← НОВО
│   └── quote-response.dto.ts                ← НОВО
├── entities/
│   ├── insurer.entity.ts                    ← НОВО
│   └── quote.entity.ts                      ← НОВО
├── scoring/
│   ├── scoring.service.ts                   ← НОВО
│   └── scoring.service.spec.ts              ← НОВО
├── circuit-breaker.service.ts               ← НОВО
├── quotes.controller.ts                     ← ОБНОВЕН
├── quotes.controller.spec.ts                ← НОВО
├── quotes.module.ts                         ← ОБНОВЕН
├── quotes.repository.ts                     ← ОБНОВЕН
├── quotes.service.ts                        ← ОБНОВЕН
└── quotes.service.spec.ts                   ← НОВО

branivo_app/lib/features/quotes/
├── bloc/
│   ├── quote_bloc.dart                      ← НОВО
│   ├── quote_event.dart                     ← НОВО
│   └── quote_state.dart                     ← НОВО
├── data/
│   └── quote_api_repository.dart            ← НОВО
├── screens/
│   └── offers_screen.dart                   ← НОВО
└── widgets/
    └── offer_card.dart                      ← НОВО

branivo_app/lib/core/routing/
└── app_router.dart                          ← ОБНОВЕН (добавен /quotes/offers route)

branivo_app/test/features/quotes/
├── bloc/quote_bloc_test.dart                ← НОВО
├── screens/offers_screen_test.dart          ← НОВО
└── widgets/offer_card_test.dart             ← НОВО

branivo-web/src/lib/hooks/
└── use-quotes.ts                            ← НОВО

branivo-web/src/app/[locale]/(client)/quotes/
├── page.tsx                                 ← ОБНОВЕН (добавен offer results section)
└── components/
    └── offer-card.tsx                       ← НОВО

branivo-web/src/__tests__/
├── client/offer-card.test.tsx              ← НОВО
└── hooks/use-quotes.test.ts               ← НОВО
```

### Project Structure Notes

- Epic 4 е в `backlog` → при create на тази story се update-ва на `in-progress`
- `QuotesModule` вече е skeleton в AppModule — просто разшири съществуващия
- `insurers` таблицата е **платформена** (не tenant-scoped) — Super Admin я управлява; достъпна без RLS
- Mock adapters са за dev/test; production adapter-ите ще бъдат имплементирани отделно при реална API интеграция
- `SeedService.seedInsurers()` осигурява 4 тестови застрахователи при `npm run dev`
- Accessibility за web quotes: `staleTime: 0` е регулаторно (КФН), не performance choice
- BullMQ не се ползва в story 4.1 — PDF generation е story 4.4

### References

- [Source: epics.md#Story 4.1] — User story, AC1-AC6, паралелни заявки, circuit breaker
- [Source: architecture.md#L331-333] — `InsurerAdapter` interface pattern, `Promise.allSettled`, opossum circuit breaker config
- [Source: architecture.md#L635-643] — Scoring formula 40/30/20/10, КФН audit trail, is_recommended rules
- [Source: architecture.md#L625] — `staleTime: 0, gcTime: 0` за quote TanStack Query — regulatory
- [Source: architecture.md#L854-870] — Quotes module directory structure
- [Source: architecture.md#L1012-1016] — Flutter QuoteBloc, OfferCard, quote_event/state naming
- [Source: architecture.md#NFR2] — Quotes < 5 сек, per-insurer timeout 5s
- [Source: architecture.md#NFR34] — Circuit breaker 5/60s → open; 30s half-open
- [Source: architecture.md#NFR44] — КФН scoring audit trail
- [Source: branivo-api/src/modules/vehicles/entities/vehicle.entity.ts] — TypeORM entity pattern (explicit @Column name)
- [Source: branivo-api/src/infrastructure/database/seed.service.ts] — Seed pattern (DataSource.query, ON CONFLICT DO NOTHING)
- [Source: branivo-api/src/modules/sessions/anonymous-sessions.service.ts] — @Inject(REDIS_CLIENT), Redis patterns
- [Source: Story 3.6 Dev Notes] — @Inject(REDIS_CLIENT) pattern, TypeScript no-any rules, mock patterns
- [Source: CLAUDE.md] — Абсолютни правила: TenantContext, api_key_enc, audit_log immutability, feature flags

## Change Log
- feat(story-4.1): Parallel Quote Aggregation — complete implementation (2026-03-20)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented all 27 tasks across NestJS backend, Flutter mobile, and Next.js web
- Migrations: CreateInsurersTable (1710000012000) and CreateQuotesTable (1710000013000)
- InsurerAdapter pattern with MockInsurerAdapter for 4 insurers (Allianz, Generali, DSK, Bulstrad)
- CircuitBreakerService using opossum with 5s timeout, 50% threshold, 30s reset
- ScoringService with immutable 40/30/20/10 weights and КФН audit trail
- QuotesService using Promise.allSettled for parallel requests
- Flutter: QuoteBloc, OfferCard, OffersScreen with skeleton progressive reveal
- Next.js: useQuotes hook with staleTime: 0 (КФН regulatory requirement), OfferCard component
- 15 NestJS tests, 4 Flutter bloc tests, 7 Flutter widget tests, 3 Next.js tests — all passing
- api_key_enc never included in any response (select: false on entity)
- TenantContext.getTenantId() used throughout — never passed as parameter

### File List

- branivo-api/src/infrastructure/database/migrations/1710000012000-CreateInsurersTable.ts
- branivo-api/src/infrastructure/database/migrations/1710000013000-CreateQuotesTable.ts
- branivo-api/src/infrastructure/database/seed.service.ts
- branivo-api/src/modules/quotes/adapters/insurer-adapter.interface.ts
- branivo-api/src/modules/quotes/adapters/mock-insurer.adapter.ts
- branivo-api/src/modules/quotes/circuit-breaker.service.ts
- branivo-api/src/modules/quotes/dto/create-quote.dto.ts
- branivo-api/src/modules/quotes/dto/quote-offer.dto.ts
- branivo-api/src/modules/quotes/dto/quote-response.dto.ts
- branivo-api/src/modules/quotes/dto/vehicle-data.dto.ts
- branivo-api/src/modules/quotes/entities/insurer.entity.ts
- branivo-api/src/modules/quotes/entities/quote.entity.ts
- branivo-api/src/modules/quotes/scoring/scoring.service.ts
- branivo-api/src/modules/quotes/scoring/scoring.service.spec.ts
- branivo-api/src/modules/quotes/quotes.controller.ts
- branivo-api/src/modules/quotes/quotes.controller.spec.ts
- branivo-api/src/modules/quotes/quotes.module.ts
- branivo-api/src/modules/quotes/quotes.repository.ts
- branivo-api/src/modules/quotes/quotes.service.ts
- branivo-api/src/modules/quotes/quotes.service.spec.ts
- branivo_app/lib/features/quotes/bloc/quote_bloc.dart
- branivo_app/lib/features/quotes/bloc/quote_event.dart
- branivo_app/lib/features/quotes/bloc/quote_state.dart
- branivo_app/lib/features/quotes/data/quote_api_repository.dart
- branivo_app/lib/features/quotes/screens/offers_screen.dart
- branivo_app/lib/features/quotes/widgets/offer_card.dart
- branivo_app/lib/core/routing/app_router.dart
- branivo_app/test/features/quotes/bloc/quote_bloc_test.dart
- branivo_app/test/features/quotes/screens/offers_screen_test.dart
- branivo_app/test/features/quotes/widgets/offer_card_test.dart
- branivo-web/src/lib/hooks/use-quotes.ts
- branivo-web/src/app/[locale]/(client)/quotes/page.tsx
- branivo-web/src/app/[locale]/(client)/quotes/components/offer-card.tsx
- branivo-web/src/__tests__/hooks/use-quotes.test.ts
- branivo-web/src/__tests__/client/offer-card.test.tsx
