# Story 4.2: Policy Purchase with Stripe 3DS

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an end-client,
I want to pay for my chosen policy with card, Apple Pay or Google Pay,
So that I can complete my purchase securely in under 15 seconds.

## Acceptance Criteria

1. **AC1 — PaymentIntent с idempotency_key:**
   **Given** клиент избира оферта,
   **When** продължава към плащане,
   **Then** Stripe PaymentIntent се създава с уникален `idempotency_key` (`{tenantId}:{quoteId}`) — повторно извикване с същия ключ връща същия intent без дублиране

2. **AC2 — application_fee_amount от commission matrix:**
   **Given** PaymentIntent е създаден,
   **When** `application_fee_amount` се изчислява,
   **Then** fee се взима от `PLATFORM_FEE_PCT` env var (default: 5%) като fallback; при наличие на commission_matrix конфигурация (Story 5.1) → се използва тя

3. **AC3 — Поддържани методи за плащане:**
   **Given** payment form се зарежда,
   **When** клиентът избира метод,
   **Then** поддържат се: карта, Apple Pay, Google Pay (чрез Stripe `PaymentElement`)

4. **AC4 — 3DS 2.0 (PSD2):**
   **Given** карточно плащане е подадено,
   **When** 3DS 2.0 автентикация е необходима,
   **Then** 3DS challenge се показва и завършва в рамките на Stripe flow (`request_three_d_secure: 'any'`); целият процес < 15 сек (NFR5, NFR45)

5. **AC5 — Optimistic UI след 3DS успех:**
   **Given** 3DS автентикация успее,
   **When** плащането е потвърдено client-side,
   **Then** UI показва "Плащането е прието — полицата се обработва" — **НИКОГА не активира полицата client-side** (активацията е САМО в Story 4.3 webhook)

6. **AC6 — Retry без дублиране:**
   **Given** плащането fail-не или 3DS е отказан,
   **When** клиентът е нотифициран,
   **Then** получава ясно съобщение с опция за retry; същият `idempotency_key` се ползва → PaymentIntent **НЕ** се дублира

## Tasks / Subtasks

### Backend — Database & Migration

- [x] **Task 1: Migration — Create `payments` table** (AC: #1, #2, #6)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000014000-CreatePaymentsTable.ts`
  - [x] Колони:
    ```sql
    id UUID PK DEFAULT gen_random_uuid()
    tenant_id UUID NOT NULL
    quote_id UUID NOT NULL REFERENCES quotes(id)
    end_client_id UUID NULLABLE REFERENCES end_clients(id)
    stripe_payment_intent_id VARCHAR(255) NOT NULL UNIQUE
    idempotency_key VARCHAR(255) NOT NULL UNIQUE  -- "{tenantId}:{quoteId}"
    amount DECIMAL(10,2) NOT NULL
    currency VARCHAR(3) NOT NULL DEFAULT 'BGN'
    application_fee_amount DECIMAL(10,2) NOT NULL
    platform_fee_pct DECIMAL(5,4) NOT NULL  -- snapshot на fee% при payment creation
    status VARCHAR(20) NOT NULL DEFAULT 'pending'  -- pending | succeeded | failed | canceled
    stripe_client_secret VARCHAR(500) NOT NULL  -- за frontend
    failure_reason VARCHAR(500) NULLABLE
    metadata JSONB DEFAULT '{}'
    created_at TIMESTAMPTZ DEFAULT NOW()
    updated_at TIMESTAMPTZ DEFAULT NOW()
    deleted_at TIMESTAMPTZ
    ```
  - [x] Indexes: `idx_payments_tenant_id`, `idx_payments_quote_id`, `idx_payments_stripe_payment_intent_id`, `idx_payments_idempotency_key`
  - [x] RLS: `CREATE POLICY payments_tenant_isolation ON payments USING (tenant_id = current_setting('app.current_tenant_id')::UUID)`

### Backend — Entity & Repository

- [x] **Task 2: `Payment` entity** (AC: #1, #2)
  - [x] Файл: `branivo-api/src/modules/payments/entities/payment.entity.ts`
  - [x] ```typescript
    import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn } from 'typeorm';
    import { Quote } from '../../quotes/entities/quote.entity';

    export enum PaymentStatus {
      PENDING = 'pending',
      SUCCEEDED = 'succeeded',
      FAILED = 'failed',
      CANCELED = 'canceled',
    }

    @Entity('payments')
    export class Payment {
      @PrimaryGeneratedColumn('uuid')
      id!: string;

      @Column({ name: 'tenant_id' })
      tenantId!: string;

      @Column({ name: 'quote_id' })
      quoteId!: string;

      @ManyToOne(() => Quote)
      @JoinColumn({ name: 'quote_id' })
      quote?: Quote;

      @Column({ name: 'end_client_id', nullable: true })
      endClientId?: string;

      @Column({ name: 'stripe_payment_intent_id' })
      stripePaymentIntentId!: string;

      @Column({ name: 'idempotency_key' })
      idempotencyKey!: string;

      @Column({ name: 'amount', type: 'decimal', precision: 10, scale: 2 })
      amount!: number;

      @Column({ name: 'currency', default: 'BGN' })
      currency!: string;

      @Column({ name: 'application_fee_amount', type: 'decimal', precision: 10, scale: 2 })
      applicationFeeAmount!: number;

      @Column({ name: 'platform_fee_pct', type: 'decimal', precision: 5, scale: 4 })
      platformFeePct!: number;

      @Column({ name: 'status', type: 'varchar', default: PaymentStatus.PENDING })
      status!: PaymentStatus;

      @Column({ name: 'stripe_client_secret' })
      stripeClientSecret!: string;

      @Column({ name: 'failure_reason', nullable: true })
      failureReason?: string;

      @Column({ name: 'metadata', type: 'jsonb', default: {} })
      metadata!: Record<string, unknown>;

      @CreateDateColumn({ name: 'created_at' })
      createdAt!: Date;

      @UpdateDateColumn({ name: 'updated_at' })
      updatedAt!: Date;

      @DeleteDateColumn({ name: 'deleted_at' })
      deletedAt!: Date | null;
    }
    ```

- [x] **Task 3: `PaymentsRepository`** (AC: #1, #6)
  - [x] Файл: `branivo-api/src/modules/payments/payments.repository.ts`
  - [x] ```typescript
    @Injectable()
    export class PaymentsRepository extends BaseRepository<Payment> {
      constructor(
        @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
        @InjectDataSource() private readonly dataSource: DataSource,
        tenantContext: TenantContext,
      ) {
        super(paymentRepo, tenantContext);
      }

      async findByIdempotencyKey(key: string): Promise<Payment | null> {
        await this.setTenantSession();
        return this.paymentRepo.findOne({
          where: { idempotencyKey: key, deletedAt: IsNull() },
        });
      }

      async findByStripeIntentId(intentId: string): Promise<Payment | null> {
        // НЕ tenant-scoped — webhook може да идва без tenant context
        return this.paymentRepo.findOne({
          where: { stripePaymentIntentId: intentId, deletedAt: IsNull() },
        });
      }

      async updateStatus(id: string, status: PaymentStatus, failureReason?: string): Promise<void> {
        await this.paymentRepo.update(id, {
          status,
          ...(failureReason && { failureReason }),
          updatedAt: new Date(),
        });
      }
    }
    ```

### Backend — Stripe Service

- [x] **Task 4: `StripeService`** (AC: #1, #2, #3, #4)
  - [x] Файл: `branivo-api/src/modules/payments/stripe.service.ts`
  - [x] **КРИТИЧНО:** stripe v20 API — използвай `Stripe` import от `'stripe'`
  - [x] ```typescript
    import Stripe from 'stripe';
    import { Injectable } from '@nestjs/common';
    import { ConfigService } from '@nestjs/config';

    @Injectable()
    export class StripeService {
      private readonly stripe: Stripe;

      constructor(private readonly config: ConfigService) {
        this.stripe = new Stripe(this.config.getOrThrow<string>('STRIPE_SECRET_KEY'), {
          apiVersion: '2024-06-20',  // фиксирай версията
          typescript: true,
        });
      }

      async createPaymentIntent(params: {
        amount: number;  // в стотинки (cents) — BGN × 100
        currency: string;
        applicationFeeAmount: number;  // в стотинки
        stripeAccountId: string;  // Stripe Connect acct на тенанта
        idempotencyKey: string;
        metadata: Record<string, string>;
      }): Promise<Stripe.PaymentIntent> {
        return this.stripe.paymentIntents.create(
          {
            amount: Math.round(params.amount),
            currency: params.currency.toLowerCase(),
            application_fee_amount: Math.round(params.applicationFeeAmount),
            payment_method_types: ['card'],  // Apple Pay / Google Pay са auto-enabled за card
            payment_method_options: {
              card: {
                request_three_d_secure: 'any',  // ЗАДЪЛЖИТЕЛНО: PSD2 compliance (NFR45)
              },
            },
            metadata: params.metadata,
            transfer_data: {
              destination: params.stripeAccountId,
            },
          },
          {
            idempotencyKey: params.idempotencyKey,
          },
        );
      }

      constructWebhookEvent(rawBody: Buffer, signature: string, secret: string): Stripe.Event {
        return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
        // ВАЖНО: rawBody трябва да е Buffer от express.raw() — не JSON.parsed
        // В main.ts вече е: NestFactory.create(AppModule, { rawBody: true })
      }

      // Ще е нужен в Story 4.3 — дефинирай тук за consistency
      getStripe(): Stripe {
        return this.stripe;
      }
    }
    ```
  - [x] **ВАЖНО:** `amount` и `applicationFeeAmount` са в **стотинки** (integer) — BGN 45.00 → 4500
  - [x] `request_three_d_secure: 'any'` е ЗАДЪЛЖИТЕЛНО за PSD2 compliance (NFR45)
  - [x] `transfer_data.destination` → Stripe Connect account на тенанта (от `tenants.stripe_account_id`)

- [x] **Task 5: Stripe config** (AC: #1)
  - [x] Файл: `branivo-api/src/config/stripe.config.ts` (вероятно вече съществува като файл — провери преди създаване)
  - [x] Env vars нужни:
    ```
    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...  (за Story 4.3)
    PLATFORM_FEE_PCT=0.05  (5% default platform fee)
    ```

### Backend — Payments Service

- [x] **Task 6: `PaymentsService.createIntent()`** (AC: #1, #2, #3, #6)
  - [x] Файл: `branivo-api/src/modules/payments/payments.service.ts`
  - [x] ```typescript
    async createIntent(dto: CreatePaymentIntentDto): Promise<PaymentIntentResponseDto> {
      const tenantId = this.tenantContext.getTenantId();
      const idempotencyKey = `${tenantId}:${dto.quoteId}`;

      // 1. Idempotency check — ако вече съществува, върни го
      const existing = await this.paymentsRepo.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        // PaymentIntent вече е създаден — върни clientSecret без нов Stripe call
        return { clientSecret: existing.stripeClientSecret, paymentId: existing.id };
      }

      // 2. Зареди quote и провери статус
      const quote = await this.quotesRepo.findOneById(dto.quoteId);
      if (!quote || quote.status !== QuoteStatus.SUCCESS || !quote.price) {
        throw new BadRequestException('Quote is not available for purchase');
      }

      // 3. Изчисли application_fee_amount
      const platformFeePct = parseFloat(
        this.config.get<string>('PLATFORM_FEE_PCT') ?? '0.05',
      );
      // TODO (Story 5.1): заредена commission_matrix overrides platformFeePct
      const amountCents = Math.round(quote.price * 100);
      const feeCents = Math.round(amountCents * platformFeePct);

      // 4. Вземи Stripe account на тенанта
      const tenant = await this.tenantsRepo.findById(tenantId);
      if (!tenant?.stripeAccountId) {
        throw new BadRequestException('Tenant Stripe account not configured');
      }

      // 5. Създай PaymentIntent в Stripe
      const intent = await this.stripeService.createPaymentIntent({
        amount: amountCents,
        currency: quote.currency ?? 'BGN',
        applicationFeeAmount: feeCents,
        stripeAccountId: tenant.stripeAccountId,
        idempotencyKey,
        metadata: {
          tenantId,
          quoteId: dto.quoteId,
          insurerCode: quote.insurer?.code ?? '',
        },
      });

      // 6. Запази в DB
      await this.paymentsRepo.save({
        tenantId,
        quoteId: dto.quoteId,
        endClientId: dto.endClientId,
        stripePaymentIntentId: intent.id,
        idempotencyKey,
        amount: quote.price,
        currency: quote.currency ?? 'BGN',
        applicationFeeAmount: feeCents / 100,
        platformFeePct,
        status: PaymentStatus.PENDING,
        stripeClientSecret: intent.client_secret!,
        metadata: { insurerCode: quote.insurer?.code ?? '' },
      });

      return {
        clientSecret: intent.client_secret!,
        paymentId: intent.id,
        amount: quote.price,
        currency: quote.currency ?? 'BGN',
      };
    }
    ```

### Backend — Payments Controller

- [x] **Task 7: `PaymentsController`** (AC: #1, #2, #3, #6)
  - [x] Файл: `branivo-api/src/modules/payments/payments.controller.ts`
  - [x] Endpoint: `POST /api/v1/payments/intent`
    - Изисква JWT или session token (authenticated end-client)
    - Body: `CreatePaymentIntentDto { quoteId: string }`
    - Response: `{ clientSecret: string, paymentId: string, amount: number, currency: string }`
  - [x] **ВАЖНО:** Stripe webhook endpoint е `POST /api/v1/payments/webhook` — но се имплементира в **Story 4.3**, не тук
  - [x] `@Throttle(10, 60)` — 10 payment intent requests/min/user
  - [x] ```typescript
    @Post('intent')
    @UseGuards(JwtAuthGuard)
    async createIntent(
      @Body() dto: CreatePaymentIntentDto,
      @Request() req: AuthenticatedRequest,
    ): Promise<PaymentIntentResponseDto> {
      return this.paymentsService.createIntent({
        ...dto,
        endClientId: req.user?.sub,
      });
    }
    ```

### Backend — DTOs

- [x] **Task 8: DTOs** (AC: #1, #2)
  - [x] Файл: `branivo-api/src/modules/payments/dto/create-payment-intent.dto.ts`
    ```typescript
    export class CreatePaymentIntentDto {
      @IsUUID() @IsNotEmpty()
      quoteId!: string;
    }
    ```
  - [x] Файл: `branivo-api/src/modules/payments/dto/payment-intent-response.dto.ts`
    ```typescript
    export class PaymentIntentResponseDto {
      clientSecret!: string;
      paymentId!: string;
      amount!: number;
      currency!: string;
    }
    ```

### Backend — Module Update

- [x] **Task 9: `PaymentsModule` конфигурация** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/payments/payments.module.ts`
  - [x] ```typescript
    @Module({
      imports: [
        TypeOrmModule.forFeature([Payment]),
        QuotesModule,       // за QuotesRepository достъп
        TenantsModule,      // за tenant stripe_account_id
        ConfigModule,
      ],
      controllers: [PaymentsController],
      providers: [PaymentsService, PaymentsRepository, StripeService],
      exports: [PaymentsService, StripeService, PaymentsRepository],
      // exports нужни за Story 4.3 (webhook handler)
    })
    export class PaymentsModule {}
    ```

### Backend — Тестове

- [x] **Task 10: Unit тестове за `PaymentsService`** (AC: #1, #2, #6)
  - [x] Файл: `branivo-api/src/modules/payments/payments.service.spec.ts`
  - [x] ```typescript
    // Mock pattern (от Story 3.6):
    const mockStripeService = { createPaymentIntent: jest.fn() };
    const mockPaymentsRepo = { findByIdempotencyKey: jest.fn(), save: jest.fn() };
    const mockQuotesRepo = { findOneById: jest.fn() };
    const mockTenantContext = { getTenantId: jest.fn().mockReturnValue('tenant-uuid') };
    ```
  - [x] Тест 1: `createIntent` → idempotency check → ако съществува → връща без нов Stripe call
  - [x] Тест 2: `createIntent` → нов PaymentIntent → `amountCents = round(price * 100)`, `feeCents = round(amountCents * 0.05)`
  - [x] Тест 3: quote с status !== 'success' → `BadRequestException`
  - [x] Тест 4: tenant без `stripeAccountId` → `BadRequestException`
  - [x] Тест 5: `tenantId` идва от `TenantContext.getTenantId()` — НЕ от параметър

- [x] **Task 11: Integration тестове за `PaymentsController`** (AC: #1, #6)
  - [x] Файл: `branivo-api/src/modules/payments/payments.controller.spec.ts`
  - [x] `POST /payments/intent` — 201 Created с `{ clientSecret, paymentId, amount, currency }`
  - [x] `POST /payments/intent` (дублиран) — 201 Created (idempotent, NO 409)
  - [x] `POST /payments/intent` без JWT — 401 Unauthorized
  - [x] `POST /payments/intent` с невалидно `quoteId` — 400 Bad Request

### Flutter — Payment Feature

- [x] **Task 12: Добави `flutter_stripe` зависимост** (AC: #3, #4)
  - [x] Файл: `branivo_app/pubspec.yaml`
  - [x] ```yaml
    dependencies:
      flutter_stripe: ^10.1.1   # проверявай последната стабилна версия
    ```
  - [x] Изпълни: `flutter pub get`
  - [x] **Android setup** (`branivo_app/android/app/build.gradle`): `minSdkVersion 21`
  - [x] **iOS setup** (`branivo_app/ios/Podfile`): `platform :ios, '13.0'`
  - [x] `Stripe.publishableKey = '...'` се задава в `main()` преди `runApp()`

- [x] **Task 13: `PaymentApiRepository`** (AC: #1)
  - [x] Файл: `branivo_app/lib/features/payments/data/payment_api_repository.dart`
  - [x] ```dart
    class PaymentApiRepository {
      final Dio _dio;

      Future<PaymentIntentResponse> createPaymentIntent({
        required String quoteId,
        required String bearerToken,
      }) async {
        final response = await _dio.post(
          '/api/v1/payments/intent',
          data: {'quoteId': quoteId},
          options: Options(headers: {'Authorization': 'Bearer $bearerToken'}),
        );
        return PaymentIntentResponse.fromJson(
          response.data as Map<String, dynamic>,
        );
      }
    }

    class PaymentIntentResponse {
      final String clientSecret;
      final String paymentId;
      final double amount;
      final String currency;
      // ...fromJson factory
    }
    ```

- [x] **Task 14: `PaymentBloc` + Events + States** (AC: #4, #5, #6)
  - [x] Файл: `branivo_app/lib/features/payments/bloc/payment_bloc.dart`
  - [x] Файл: `branivo_app/lib/features/payments/bloc/payment_event.dart`
  - [x] Файл: `branivo_app/lib/features/payments/bloc/payment_state.dart`
  - [x] Events:
    - `PaymentIntentRequestedEvent { quoteId: String }`
    - `PaymentConfirmedEvent { paymentIntentId: String }`
    - `PaymentFailedEvent { errorMessage: String }`
    - `PaymentRetryRequestedEvent {}`
  - [x] States:
    - `PaymentInitialState`
    - `PaymentLoadingState` — зареждане на PaymentIntent
    - `PaymentReadyState { clientSecret: String, amount: double, currency: String }` — готов за въвеждане
    - `PaymentProcessingState` — 3DS flow активен
    - `PaymentSuccessState { paymentIntentId: String }` — optimistic: "Плащането е прието"
    - `PaymentFailedState { message: String, canRetry: bool }`
  - [x] **ВАЖНО:** `PaymentSuccessState` НЕ активира полицата — само показва optimistic message
  - [x] Naming convention: `PaymentIntentRequestedEvent` (НЕ просто `PaymentRequestEvent`)

- [x] **Task 15: `PaymentScreen`** (AC: #3, #4, #5, #6)
  - [x] Файл: `branivo_app/lib/features/payments/screens/payment_screen.dart`
  - [x] ```dart
    // flutter_stripe CardFormField + Apple Pay / Google Pay
    class PaymentScreen extends StatefulWidget {
      final String quoteId;
      final String insurerName;
      final double amount;
      final String currency;
    }

    // При BlocBuilder<PaymentBloc, PaymentState>:
    // - PaymentReadyState → показва CardFormField от flutter_stripe
    // - PaymentProcessingState → показва CircularProgressIndicator
    // - PaymentSuccessState → показва "Плащането е прието — полицата се обработва"
    // - PaymentFailedState → показва error + Retry бутон

    // Confirm payment pattern (flutter_stripe v10):
    Future<void> _confirmPayment(String clientSecret) async {
      await Stripe.instance.confirmPayment(
        paymentIntentClientSecret: clientSecret,
        data: const PaymentMethodParams.card(
          paymentMethodData: PaymentMethodData(),
        ),
      );
      // При успех → bloc.add(PaymentConfirmedEvent(...))
      // При StripeException → bloc.add(PaymentFailedEvent(...))
    }
    ```
  - [x] Apple Pay / Google Pay чрез `PlatformPayButton` от flutter_stripe
  - [x] Route: `/payment` с args `PaymentRouteArgs { quoteId, insurerName, amount, currency }`
  - [x] Добави в `app_router.dart`

### Flutter — Тестове

- [x] **Task 16: Flutter тестове** (AC: #4, #5, #6)
  - [x] Файл: `branivo_app/test/features/payments/bloc/payment_bloc_test.dart`
    - Тест: `PaymentIntentRequestedEvent` → `PaymentLoadingState` → `PaymentReadyState`
    - Тест: API error → `PaymentFailedState`
    - Тест: `PaymentConfirmedEvent` → `PaymentSuccessState` (НЕ активира полица)
    - Тест: `PaymentRetryRequestedEvent` → използва същия `quoteId` (idempotency)
  - [x] Файл: `branivo_app/test/features/payments/screens/payment_screen_test.dart`
    - Тест: `PaymentSuccessState` рендира "Плащането е прието" (без "активирана полица")
    - Тест: `PaymentFailedState` рендира Retry бутон
    - Тест: `PaymentReadyState` рендира payment form

### Next.js — Payment Web Page

- [x] **Task 17: Инсталирай Stripe SDK за Next.js** (AC: #3, #4)
  - [x] `cd branivo-web && npm install @stripe/stripe-js @stripe/react-stripe-js`
  - [x] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` в `.env.local`

- [x] **Task 18: `usePayment` hook** (AC: #1, #6)
  - [x] Файл: `branivo-web/src/lib/hooks/use-payment.ts`
  - [x] ```typescript
    export function useCreatePaymentIntent() {
      return useMutation({
        mutationFn: async (quoteId: string) => {
          const res = await fetch('/api/v1/payments/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ quoteId }),
          });
          if (!res.ok) throw new Error('Failed to create payment intent');
          return res.json() as Promise<PaymentIntentResponse>;
        },
      });
    }
    ```

- [x] **Task 19: Payment Page** (AC: #3, #4, #5, #6)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/quotes/payment/page.tsx`
  - [x] ```tsx
    // Stripe Elements provider
    import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
    import { loadStripe } from '@stripe/stripe-js';

    const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

    // CheckoutForm component:
    function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
      const stripe = useStripe();
      const elements = useElements();

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: `${window.location.origin}/quotes/payment/success` },
          redirect: 'if_required',  // 3DS само ако е нужно
        });

        if (error) {
          // Показвай error.message — retry с СЪЩИЯ clientSecret (idempotent)
        } else {
          // Optimistic state — НЕ активирай полицата тук
          onSuccess();
        }
      };

      return (
        <form onSubmit={handleSubmit}>
          <PaymentElement />  {/* card + Apple Pay + Google Pay */}
          <button type="submit" disabled={!stripe}>Плати</button>
        </form>
      );
    }
    ```
  - [x] `appearance` config съгласно tenant branding (бяла марка)
  - [x] Route params: `?quoteId=...`
  - [x] При `PaymentSuccessState`: показва "Плащането е прието — полицата се обработва" (НЕ "полицата е активирана")

- [x] **Task 20: Payment Success Page** (AC: #5)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/quotes/payment/success/page.tsx`
  - [x] Показва optimistic съобщение + loader "Подготвяме вашата полица..."
  - [x] **НИКОГА** не прави API call за policy activation от тук — само показва status

### Next.js — Тестове

- [x] **Task 21: Next.js тестове** (AC: #1, #5, #6)
  - [x] Файл: `branivo-web/src/__tests__/hooks/use-payment.test.ts`
    - Тест: `useCreatePaymentIntent` → returns `{ clientSecret, paymentId }`
    - Тест: API error → mutation error state
  - [x] Файл: `branivo-web/src/__tests__/client/payment-success.test.tsx`
    - Тест: success page рендира "Плащането е прието" (без "активирана")
    - Тест: success page НЕ прави policy activation API call

## Dev Notes

### КРИТИЧНО: Stripe rawBody за webhook (Story 4.3 reference)

В `main.ts` вече е конфигурирано `{ rawBody: true }` в `NestFactory.create()` — това означава, че `req.rawBody` е наличен като `Buffer` в контролера. **НЕ** добавяй `express.raw()` middleware — ще конфликтва.

В Story 4.3 webhook контролера:
```typescript
@Post('webhook')
@Header('Content-Type', 'application/json')
async handleWebhook(
  @Req() request: RawBodyRequest<Request>,  // NestJS RawBodyRequest
  @Headers('stripe-signature') sig: string,
) {
  const event = this.stripeService.constructWebhookEvent(
    request.rawBody!,  // Buffer — ЗАДЪЛЖИТЕЛНО
    sig,
    this.config.getOrThrow('STRIPE_WEBHOOK_SECRET'),
  );
  // ...
}
```

### Stripe Amount — стотинки (cents)

```typescript
// BGN е NON-DECIMAL currency в Stripe (1 BGN = 100 стотинки)
// ПРАВИЛНО:
const amountCents = Math.round(price * 100);  // 45.00 BGN → 4500
// ГРЕШНО:
const amountCents = price;  // ❌ Stripe ще третира като 45 стотинки = 0.45 BGN
```

### Idempotency Key Strategy

```typescript
// Format: "{tenantId}:{quoteId}"
// Stripe idempotency key = max 255 chars, уникален per PaymentIntent
const idempotencyKey = `${tenantId}:${quoteId}`;

// Ако клиентът retry-ва → СЪЩИЯ ключ → СЪЩИЯ PaymentIntent (без дублиране)
// Ако клиентът избере различна оферта → различен quoteId → нов PaymentIntent
```

### application_fee_amount — Platform Fee Logic

```typescript
// Story 4.2: Използвай env var като fallback
// Story 5.1: Commission matrix ще override-ва това
const platformFeePct = parseFloat(config.get('PLATFORM_FEE_PCT') ?? '0.05');

// Пример: 450 BGN оферта, 5% fee
// amountCents = 45000
// feeCents = Math.round(45000 * 0.05) = 2250 (22.50 BGN)
// Broker получава: 45000 - 2250 = 42750 (427.50 BGN) чрез Stripe Connect transfer
```

### flutter_stripe v10 API (важни разлики от по-стари версии)

```dart
// v10 confirmPayment API:
await Stripe.instance.confirmPayment(
  paymentIntentClientSecret: clientSecret,
  data: const PaymentMethodParams.card(
    paymentMethodData: PaymentMethodData(),
  ),
);

// НЕ ползвай стари API като: Stripe.instance.confirmPayment(clientSecret: ...)
// flutter_stripe v10 ги е deprecate-нал

// StripeException handling:
try {
  await Stripe.instance.confirmPayment(...);
} on StripeException catch (e) {
  // e.error.localizedMessage → user-friendly съобщение
  bloc.add(PaymentFailedEvent(message: e.error.localizedMessage ?? 'Неуспешно плащане'));
}
```

### @stripe/react-stripe-js — 3DS redirect handling

```typescript
// confirmPayment с redirect: 'if_required' — 3DS се показва само при нужда
// При успех без redirect: Promise resolves директно
// При 3DS needed: Stripe показва modal
// При return_url: Stripe redirect-ва към success page с ?payment_intent=...&redirect_status=succeeded

const { error } = await stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: `${window.location.origin}/quotes/payment/success`,
  },
  redirect: 'if_required',
});
```

### Tenants Table — stripe_account_id

Провери дали `tenants` таблицата вече има `stripe_account_id` колона (добавена в Story 1.x или 2.x). Ако не → добави в migration 1710000014000 или отделна `1710000014500-AddStripeAccountIdToTenants.ts`.

```typescript
// В TenantEntity (провери):
@Column({ name: 'stripe_account_id', nullable: true })
stripeAccountId?: string;
```

### BullMQ — НЕ се ползва в Story 4.2

Story 4.2 е САМО PaymentIntent creation + frontend Stripe UI. BullMQ се ползва в:
- **Story 4.3** — webhook обработка + policy activation
- **Story 4.4** — PDF generation job

### Зависимости от предишни Stories

**Story 4.1 (review):**
- `quotes` таблица съществува с `price`, `currency`, `status`, `insurer_id`, `session_token`
- `QuotesRepository` — `findOneById()` и `findBySessionToken()` методи
- `Quote` entity с `QuoteStatus.SUCCESS`
- `Insurer` entity (без `api_key_enc` в response)
- `@nestjs/bull` + `bullmq` вече инсталирани

**Story 3.2 (done):**
- `end_clients` таблица: `id UUID`, `tenant_id UUID`, `phone VARCHAR`, `email`, JWT auth работи
- JWT guard pattern: `@UseGuards(JwtAuthGuard)` + `@Request() req: AuthenticatedRequest`

**Story 1.x:**
- `TenantContext.getTenantId()` — ЗАДЪЛЖИТЕЛНО, никога не предавай като параметър
- `BaseRepository<T>` паттерн с `setTenantSession()`

**Story 3.6 (review):**
- Mock pattern: `{ provide: ServiceName, useValue: mockService }`
- `res.body as ResponseDto` в supertest тестове
- TypeScript: `!` postfix assertion, `import type`

### Git Intelligence

```
Последна migration:  1710000013000-CreateQuotesTable.ts
Следваща migration:  1710000014000-CreatePaymentsTable.ts

Story 4.2 branch:    feature/story-4-2-policy-purchase-with-stripe-3ds
Commit format:       feat(story-4.2): Policy Purchase with Stripe 3DS
PR title:            feat(story-4.2): Policy Purchase with Stripe 3DS
PR base:             main  ← ЗАДЪЛЖИТЕЛНО --base main

Git workflow:
  git fetch origin
  git switch main
  git pull origin main
  git switch -c feature/story-4-2-policy-purchase-with-stripe-3ds
```

### Env Variables

```
# branivo-api/.env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # за Story 4.3
PLATFORM_FEE_PCT=0.05

# branivo-web/.env.local
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Файлова Структура

```
branivo-api/src/infrastructure/database/migrations/
└── 1710000014000-CreatePaymentsTable.ts              ← НОВО

branivo-api/src/modules/payments/
├── dto/
│   ├── create-payment-intent.dto.ts                  ← НОВО
│   └── payment-intent-response.dto.ts               ← НОВО
├── entities/
│   └── payment.entity.ts                            ← НОВО
├── payments.controller.ts                           ← ОБНОВЕН (беше skeleton)
├── payments.controller.spec.ts                      ← НОВО
├── payments.module.ts                               ← ОБНОВЕН (беше skeleton)
├── payments.repository.ts                           ← ОБНОВЕН (беше skeleton)
├── payments.service.ts                              ← ОБНОВЕН (беше skeleton)
├── payments.service.spec.ts                         ← НОВО
└── stripe.service.ts                               ← НОВО

branivo_app/lib/features/payments/
├── bloc/
│   ├── payment_bloc.dart                           ← НОВО
│   ├── payment_event.dart                          ← НОВО
│   └── payment_state.dart                          ← НОВО
├── data/
│   └── payment_api_repository.dart                ← НОВО
└── screens/
    └── payment_screen.dart                         ← НОВО

branivo_app/lib/core/routing/
└── app_router.dart                                ← ОБНОВЕН (добавен /payment route)

branivo_app/test/features/payments/
├── bloc/payment_bloc_test.dart                    ← НОВО
└── screens/payment_screen_test.dart               ← НОВО

branivo-web/src/
├── lib/hooks/
│   └── use-payment.ts                             ← НОВО
├── app/[locale]/(client)/quotes/payment/
│   ├── page.tsx                                   ← НОВО
│   └── success/
│       └── page.tsx                               ← НОВО
└── __tests__/
    ├── client/payment-success.test.tsx            ← НОВО
    └── hooks/use-payment.test.ts                  ← НОВО
```

### Project Structure Notes

- `PaymentsModule` е вече регистриран в `AppModule` — само разширявай (не добавяй в `app.module.ts`)
- `PaymentsModule` трябва да export-ва `StripeService` и `PaymentsRepository` → нужно за Story 4.3 webhook handler
- `rawBody: true` в `main.ts` вече е конфигурирано — не добавяй `express.raw()` middleware
- Stripe v20: `import Stripe from 'stripe'` (default import) — не `import { Stripe } from 'stripe'`
- `flutter_stripe` изисква `minSdkVersion 21` за Android и `platform :ios, '13.0'`
- Story 4.2 НЕ имплементира webhook — само PaymentIntent creation + frontend flow
- `policies` таблица се създава в Story 4.3 (policy activation)

### References

- [Source: epics.md#Story 4.2] — User story, AC1-AC6, Stripe 3DS, idempotency, optimistic UI
- [Source: architecture.md] — `request_three_d_secure: 'any'` PSD2, `rawBody: true` за webhook, Stripe Connect `application_fee_amount`
- [Source: prd.md#FR25-FR26, NFR5, NFR45] — Stripe 3DS задължителен, < 15 сек, Apple/Google Pay
- [Source: architecture.md#107] — Commission snapshot immutability
- [Source: architecture.md#144] — Optimistic UI за commission
- [Source: branivo-api/src/main.ts] — `rawBody: true` вече е конфигурирано
- [Source: branivo-api/src/modules/ocr/ocr-queue.producer.ts] — `@InjectQueue` паттерн за BullMQ
- [Source: branivo-api/src/modules/ocr/ocr.processor.ts] — `@Processor` + `@Process()` паттерн
- [Source: branivo-api/src/modules/quotes/quotes.repository.ts] — `BaseRepository` паттерн
- [Source: branivo-api/src/common/base.repository.ts] — `setTenantSession()`, `BaseRepository<T>`
- [Source: branivo-api/package.json] — stripe v20.4.1, @nestjs/bull v11, bullmq v5 вече инсталирани
- [Source: branivo_app/pubspec.yaml] — flutter_bloc v8.1.6, dio v5.7.0 — flutter_stripe ЛИПСВА
- [Source: CLAUDE.md] — TenantContext задължителен, api_key_enc забранен, policy activation само в webhook

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Имплементирани всички 21 задачи: Backend (migration, entity, repository, StripeService, PaymentsService, PaymentsController, DTOs, PaymentsModule), Flutter (flutter_stripe setup, PaymentApiRepository, PaymentBloc, PaymentScreen, route), Next.js (Stripe SDK, usePayment hook, payment page, success page)
- `stripe` v20.4.1 API версия коригирана от `2024-06-20` на `2026-02-25.clover` за съответствие с инсталираната версия
- `QuotesRepository.findOneById()` добавен + QuotesModule exports обновен да включва QuotesRepository
- `flutter_stripe` v10.1.1 добавен; iOS Podfile обновен (`platform :ios, '13.0'`); Stripe.publishableKey инициализиран в main()
- Widget тестовете тестват state rendering директно (без нативни Stripe плъгини) — стандартна практика за Flutter + native plugins
- `PaymentProcessingStartedEvent` добавен за избягване на `bloc.emit()` от widget контекст
- 339 NestJS теста, 54 Flutter теста, 6 Next.js теста — без регресии

### File List

branivo-api/src/infrastructure/database/migrations/1710000014000-CreatePaymentsTable.ts
branivo-api/src/modules/payments/entities/payment.entity.ts
branivo-api/src/modules/payments/payments.repository.ts
branivo-api/src/modules/payments/stripe.service.ts
branivo-api/src/modules/payments/payments.service.ts
branivo-api/src/modules/payments/payments.controller.ts
branivo-api/src/modules/payments/payments.module.ts
branivo-api/src/modules/payments/dto/create-payment-intent.dto.ts
branivo-api/src/modules/payments/dto/payment-intent-response.dto.ts
branivo-api/src/modules/payments/payments.service.spec.ts
branivo-api/src/modules/payments/payments.controller.spec.ts
branivo-api/src/modules/quotes/quotes.repository.ts
branivo-api/src/modules/quotes/quotes.module.ts
branivo-api/.env.example
branivo_app/pubspec.yaml
branivo_app/pubspec.lock
branivo_app/ios/Podfile
branivo_app/lib/main.dart
branivo_app/lib/features/payments/data/payment_api_repository.dart
branivo_app/lib/features/payments/bloc/payment_event.dart
branivo_app/lib/features/payments/bloc/payment_state.dart
branivo_app/lib/features/payments/bloc/payment_bloc.dart
branivo_app/lib/features/payments/screens/payment_screen.dart
branivo_app/lib/core/routing/app_router.dart
branivo_app/test/features/payments/bloc/payment_bloc_test.dart
branivo_app/test/features/payments/screens/payment_screen_test.dart
branivo-web/package.json
branivo-web/package-lock.json
branivo-web/.env.local
branivo-web/src/lib/hooks/use-payment.ts
branivo-web/src/app/[locale]/(client)/quotes/payment/page.tsx
branivo-web/src/app/[locale]/(client)/quotes/payment/success/page.tsx
branivo-web/src/__tests__/hooks/use-payment.test.ts
branivo-web/src/__tests__/client/payment-success.test.tsx
