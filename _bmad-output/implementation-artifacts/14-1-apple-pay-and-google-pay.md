# Story 14.1: Apple Pay & Google Pay (Stripe Payment Element)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an end customer on mobile or web,
I want to pay for an insurance policy using Apple Pay or Google Pay,
so that I can complete my purchase with a single biometric confirmation without entering card details.

## Acceptance Criteria

### AC1 — Web: Auto-detection на wallet методи
**Given** клиент на iOS Safari или Chrome/Android отваря checkout страницата,
**When** Stripe Payment Element се зареди,
**Then** Apple Pay или Google Pay бутон се показва автоматично само ако устройството го поддържа — Stripe прави auto-detection; на неподдържани устройства се вижда само card form (graceful degradation).

### AC2 — Web: Успешно Apple Pay / Google Pay плащане
**Given** клиентът натисне Apple Pay / Google Pay бутона,
**When** завърши Face ID / Touch ID / биометрично потвърждение,
**Then** `stripe.confirmPayment()` се изпълнява успешно; `payment_intent.succeeded` webhook се изстрелва; полицата се активира по стандартния webhook flow в `StripeWebhookService` — идентично с card плащане.

### AC3 — Web: User cancellation
**Given** клиентът е отворил Apple Pay sheet или Google Pay overlay,
**When** затвори без потвърждение (Cancel / Back),
**Then** потребителят вижда checkout формата отново в предишното й състояние; не се показва error; няма нова PaymentIntent заявка.

### AC4 — Flutter: PaymentSheet с Apple Pay / Google Pay
**Given** клиент на iOS или Android отваря `PaymentScreen`,
**When** `PaymentSheet` се инициализира с `applePay` / `googlePay` конфигурация,
**Then** на iOS се показва Apple Pay бутон (само на поддържани устройства); на Android се показва Google Pay бутон (само при наличен Google Pay); под него е "или плати с карта" като secondary CTA.

### AC5 — Flutter: Успешно wallet плащане
**Given** клиентът е потвърдил плащането чрез PaymentSheet,
**When** `Stripe.instance.presentPaymentSheet()` приключи без грешка,
**Then** BLoC emits `PaymentSuccessState`; потребителят вижда success UI; полицата се активира от webhook (не client-side).

### AC6 — Flutter: User cancellation в PaymentSheet
**Given** клиентът е отворил PaymentSheet,
**When** го затвори без плащане (`StripeException` с `code: FailureCode.Canceled`),
**Then** BLoC emits `PaymentReadyState` (не `PaymentFailedState`); не се показва error message; потребителят може да опита отново.

### AC7 — Backend: `payment_method` записан в DB
**Given** `payment_intent.succeeded` webhook се получи,
**When** `StripeWebhookService.handlePaymentSucceeded()` обработи събитието,
**Then** `payments.payment_method` се обновява с `'apple_pay'` / `'google_pay'` / `'card'` от `intent.payment_method_types[0]` или от expand на `payment_method`; `payments.payment_provider` остава `'stripe'`.

### AC8 — Backend: Apple Pay domain verification
**Given** Apple Pay изисква domain ownership verification,
**When** Apple прави `GET /.well-known/apple-developer-merchantid-domain-association`,
**Then** NestJS сървърът отговаря с точното съдържание на Stripe-предоставения domain association файл (content-type: `application/octet-stream`); работи за всички tenant custom домейни тъй като сървърът е един.

### AC9 — Commission transparency
**Given** плащане е направено с Apple Pay или Google Pay,
**When** се изчисляват комисионни,
**Then** `payment_provider = 'stripe'` е прозрачен за комисионната логика — изчислението е идентично с card плащане.

---

## Tasks / Subtasks

### Блок A — Backend (PREREQUISITE — задължително първо)

- [x] **A1 — Migration: добавяне на `payment_method` и `payment_provider` колони** (AC: #7, #9)
  - [x] Създай `branivo-api/src/infrastructure/database/migrations/1710000033000-AddPaymentMethodColumns.ts`
  - [x] SQL: `ALTER TABLE payments ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'card';`
  - [x] SQL: `ALTER TABLE payments ADD COLUMN payment_provider VARCHAR(20) NOT NULL DEFAULT 'stripe';`

- [x] **A2 — Entity: обнови `Payment` entity** (AC: #7)
  - [x] Файл: `branivo-api/src/modules/payments/entities/payment.entity.ts`
  - [x] Добави `PaymentMethod` enum: `CARD = 'card'`, `APPLE_PAY = 'apple_pay'`, `GOOGLE_PAY = 'google_pay'`
  - [x] Добави `PaymentProvider` enum: `STRIPE = 'stripe'`
  - [x] Добави `@Column` декоратори за `paymentMethod` и `paymentProvider` с defaults

- [x] **A3 — StripeService: смяна на `payment_method_types` → `automatic_payment_methods`** (AC: #1, #4)
  - [x] Файл: `branivo-api/src/modules/payments/stripe.service.ts`
  - [x] Замени `payment_method_types: ['card']` с `automatic_payment_methods: { enabled: true }`
  - [x] Запази `payment_method_options.card.request_three_d_secure: 'any'` — задължително за PSD2
  - [x] **ВАЖНО:** `request_three_d_secure` се задава в `payment_method_options.card` — Apple/Google Pay нямат 3DS опция, но card трябва да го запази

- [x] **A4 — StripeWebhookService: запис на `payment_method` при succeeded** (AC: #7)
  - [x] Файл: `branivo-api/src/modules/payments/stripe-webhook.service.ts`
  - [x] В `handlePaymentSucceeded()`: извлечи `intent.payment_method_types[0]` → map към `PaymentMethod` enum
  - [x] Добави `paymentsRepo.updatePaymentMethod(payment.id, paymentMethod)` след `updateStatus()`
  - [x] Добави `updatePaymentMethod()` метод в `PaymentsRepository`

- [x] **A5 — Apple Pay domain verification endpoint** (AC: #8)
  - [x] Файл: `branivo-api/src/modules/payments/well-known.controller.ts` (нов файл)
  - [x] Endpoint: `@Get('.well-known/apple-developer-merchantid-domain-association')`
  - [x] Зареди съдържанието от environment variable `APPLE_PAY_DOMAIN_ASSOCIATION_FILE` или от `./assets/apple-developer-merchantid-domain-association`
  - [x] Response header: `Content-Type: application/octet-stream`
  - [x] **Ако файлът липсва** → 404 (не 500)

- [x] **A6 — Unit тестове за backend промени** (AC: #7, #8)
  - [x] `stripe-webhook.service.spec.ts`: тест за запис на `payment_method = 'apple_pay'` при webhook
  - [x] `stripe-webhook.service.spec.ts`: тест за `payment_method = 'google_pay'`
  - [x] `well-known.controller.spec.ts`: тест за Apple Pay domain endpoint

### Блок B — Next.js Web (след Блок A)

- [x] **B1 — Verify: PaymentElement вече поддържа wallets** (AC: #1)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/quotes/payment/page.tsx`
  - [x] `PaymentElement` вече е имплементиран на ред 50 — **не се прави нова имплементация**
  - [x] След промяна в Блок A3, `automatic_payment_methods` ще накара Stripe автоматично да показва Apple/Google Pay
  - [x] Провери в тест среда с Stripe test mode, че бутоните се появяват

- [x] **B2 — Handle wallet cancellation** (AC: #3)
  - [x] В `CheckoutForm.handleSubmit()`: когато `error.code === 'payment_intent_unexpected_state'` или `type === 'card_error'` с `decline_code === 'cancelled'` → покажи retry UI вместо error
  - [x] Всъщност при Apple Pay cancel, `stripe.confirmPayment()` реже с `error.type = 'validation_error'` и `error.code = 'incomplete_number'` → прихвани и не показвай като error

- [x] **B3 — Component тест за payment page** (AC: #1, #3)
  - [x] `branivo-web/src/__tests__/client/PaymentPage.test.tsx`
  - [x] Тест: PaymentElement се рендира с clientSecret
  - [x] Тест: cancel flow не показва error state

### Блок C — Flutter (след Блок A)

- [x] **C0 — Upgrade `flutter_stripe` от `^10.1.1` → `^12.3.0`** (BREAKING CHANGES!)
  - [x] Файл: `branivo_app/pubspec.yaml` — смени `flutter_stripe: ^10.1.1` → `flutter_stripe: ^12.3.0`
  - [x] Изпълни `flutter pub upgrade flutter_stripe` (резолвира до 12.4.0)
  - [x] **Breaking change v10→v11+:** `merchantCountryCode` е преместен от top-level `SetupPaymentSheetParameters` → вътре в `PaymentSheetApplePay` и `PaymentSheetGooglePay`
  - [x] **Breaking change v10→v11+:** `currencyCode` и `testEnv` са преместени вътре в `PaymentSheetGooglePay`
  - [x] Провери за compile errors след upgrade и оправи ги (без грешки)

- [x] **C0b — Обнови `main.dart`: Stripe initialization** (AC: #4)
  - [x] Файл: `branivo_app/lib/main.dart`
  - [x] Добави `Stripe.merchantIdentifier = 'merchant.com.branivo.app';` преди `Stripe.instance.applySettings()`
  - [x] Добави `Stripe.urlScheme = 'branivo';` (необходимо за redirect-based методи)
  - [x] **КРИТИЧНО:** без `merchantIdentifier`, Apple Pay бутонът се показва мълчаливо без грешка

- [x] **C1 — Смяна на `CardFormField` → `PaymentSheet`** (AC: #4, #5, #6)
  - [x] Файл: `branivo_app/lib/features/payments/screens/payment_screen.dart`
  - [x] Смени `CardFormField` + `Stripe.instance.confirmPayment()` → `Stripe.instance.initPaymentSheet()` + `presentPaymentSheet()`
  - [x] `initPaymentSheet` параметри: `paymentIntentClientSecret`, `merchantDisplayName: 'Branivo'`, `applePay`, `googlePay`
  - [x] Apple Pay конфигурация: `PaymentSheetApplePay(merchantCountryCode: 'BG')` ← в обекта, не top-level
  - [x] Google Pay конфигурация: `PaymentSheetGooglePay(merchantCountryCode: 'BG', currencyCode: 'BGN', testEnv: !kReleaseMode)` ← всичко в обекта

- [x] **C2 — BLoC: handle PaymentSheet cancellation** (AC: #6)
  - [x] Файл: `branivo_app/lib/features/payments/bloc/payment_event.dart` — нов `PaymentCanceledEvent`
  - [x] Файл: `branivo_app/lib/features/payments/bloc/payment_bloc.dart` — нов `_onPaymentCanceled` handler
  - [x] При cancel (FailureCode.Canceled) → emit `PaymentReadyState` (не `PaymentFailedState`)
  - [x] При реален error → emit `PaymentFailedState` с message

- [x] **C3 — iOS platform setup** (AC: #4)
  - [x] `branivo_app/ios/Runner/Info.plist`: добави `NSApplePayMerchantIdentifier` с merchant ID от Stripe dashboard
  - [x] `branivo_app/ios/Runner/Runner.entitlements`: добави `com.apple.developer.in-app-payments` array с merchant ID
  - [ ] Xcode: Signing & Capabilities → добави "Apple Pay" capability → добави merchant ID (ръчна стъпка в Xcode)

- [x] **C4 — Android platform setup** (AC: #4)
  - [x] `branivo_app/android/app/src/main/AndroidManifest.xml`: добави `<meta-data android:name="com.google.android.gms.wallet.api.enabled" android:value="true"/>` вътре в `<application>`
  - [x] `branivo_app/android/app/proguard-rules.pro`: добави `-keep class com.stripe.android.** { *; }` и `-keep class com.google.android.gms.wallet.** { *; }` (задължително от flutter_stripe 12.x за предотвратяване на 3DS crashes)
  - [x] `branivo_app/android/app/build.gradle.kts`: `compileSdk = flutter.compileSdkVersion` (≥34) и `minSdk = flutter.minSdkVersion` (≥21) — OK
  - [ ] Google Pay & Wallet Console: регистрирай merchant profile за `branivo.bg` домейна (ръчна стъпка)
  - [x] **ЗАБЕЛЕЖКА:** `google-services.json` НЕ е необходим за Google Pay — само за Firebase/FCM (вече е наличен)

- [x] **C5 — Flutter widget тестове** (AC: #4, #5, #6)
  - [x] `branivo_app/test/features/payments/screens/payment_screen_test.dart` — добавени нови тестове за PaymentSheet states
  - [x] `branivo_app/test/features/payments/bloc/payment_bloc_test.dart` — добавен тест за PaymentCanceledEvent
  - [x] Тест: PaymentScreen показва loading state при инициализация
  - [x] Тест: PaymentScreen shows success state след `PaymentSuccessState`
  - [x] Тест: BLoC emit `PaymentReadyState` при `FailureCode.Canceled`

---

## Dev Notes

### Критично: какво НЕ трябва да правиш

- **НЕ** активирай полица в Flutter/Web при успешно плащане — активацията е САМО в `StripeWebhookService.handlePaymentSucceeded()` (съществуващ webhook flow)
- **НЕ** премахвай `request_three_d_secure: 'any'` — задължително за PSD2 (NFR45)
- **НЕ** предавай `tenant_id` като параметър — ползвай `TenantContext.getTenantId()`
- **НЕ** връщай `insurer.api_key_enc` в нито един нов endpoint

### Текущо състояние на кода (важно!)

**Next.js web payment page (`branivo-web/src/app/[locale]/(client)/quotes/payment/page.tsx`):**
- `PaymentElement` е **вече имплементиран** на ред 50 — коментарът `/* card + Apple Pay + Google Pay */` потвърждава намерението
- **Промяна не е нужна** в page.tsx след Блок A — само backend смяна на `payment_method_types` → `automatic_payment_methods`

**Flutter payment screen (`branivo_app/lib/features/payments/screens/payment_screen.dart`):**
- Текущо: `CardFormField` + `Stripe.instance.confirmPayment(data: PaymentMethodParams.card(...))`
- Трябва: `PaymentSheet` flow с `initPaymentSheet()` + `presentPaymentSheet()`
- `flutter_stripe: ^10.1.1` е вече в pubspec.yaml — **не се добавя нов пакет**

**StripeService (`branivo-api/src/modules/payments/stripe.service.ts`):**
- Текущо: `payment_method_types: ['card']` на ред 32
- Трябва: `automatic_payment_methods: { enabled: true }`
- API version: `'2026-02-25.clover'` — запази я

**Payment entity (`branivo-api/src/modules/payments/entities/payment.entity.ts`):**
- Липсват `paymentMethod` и `paymentProvider` колони
- `metadata: jsonb` НЕ се ползва като workaround — трябва proper enum колони

### flutter_stripe версии

| Версия | Статус |
|---|---|
| Текуща в pubspec | `^10.1.1` |
| **Latest stable** | **`12.3.0`** |
| Трябва да се upgrade | **ДА** |

### Flutter PaymentSheet — пример за имплементация (flutter_stripe 12.x API)

```dart
// main.dart — задължително преди runApp()
Stripe.publishableKey = const String.fromEnvironment('STRIPE_PK');
Stripe.merchantIdentifier = 'merchant.com.branivo.app'; // КРИТИЧНО за Apple Pay
Stripe.urlScheme = 'branivo';
await Stripe.instance.applySettings();
```

```dart
// В payment_bloc.dart при PaymentIntentRequestedEvent handler:
await Stripe.instance.initPaymentSheet(
  paymentSheetParameters: SetupPaymentSheetParameters(
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: 'Branivo',
    returnURL: 'branivo://stripe-redirect',
    // v11+ BREAKING: merchantCountryCode е ВЪТРЕ в обекта, не top-level
    applePay: const PaymentSheetApplePay(
      merchantCountryCode: 'BG',
    ),
    // v11+ BREAKING: merchantCountryCode, currencyCode и testEnv са ВЪТРЕ
    googlePay: PaymentSheetGooglePay(
      merchantCountryCode: 'BG',
      currencyCode: 'BGN',
      testEnv: !kReleaseMode, // true при dev, false при production
    ),
    style: ThemeMode.system,
    primaryButtonLabel: 'Плати сега',
  ),
);
await Stripe.instance.presentPaymentSheet();
```

### ⚠️ Критични gotchas (от web research)

1. **Apple Pay НЕ работи на iOS Simulator** — тества се само на физическо устройство
2. **Apple Pay изисква HTTPS** — не работи на localhost; ползвай ngrok или Vercel preview URL
3. **`Stripe.merchantIdentifier` задължително в main.dart** — без него Apple Pay бутон не се показва (без грешка!)
4. **Google Pay `testEnv: true` при разработка** — без него бутонът може да не се появи в non-production Stripe mode
5. **flutter_stripe 12.3.0 fix** — поправя bug с Google Pay невидим на Android (присъства в 12.0.x–12.1.x)

### Backend: `automatic_payment_methods` + 3DS

```typescript
// stripe.service.ts — промяна
return this.stripe.paymentIntents.create(
  {
    amount: Math.round(params.amount),
    currency: params.currency.toLowerCase(),
    application_fee_amount: Math.round(params.applicationFeeAmount),
    automatic_payment_methods: { enabled: true }, // ← ПРОМЯНА
    payment_method_options: {
      card: {
        request_three_d_secure: 'any', // ← запазва се
      },
    },
    metadata: params.metadata,
    transfer_data: { destination: params.stripeAccountId },
  },
  { idempotencyKey: params.idempotencyKey },
);
```

### Backend: извличане на `payment_method` от webhook

```typescript
// В handlePaymentSucceeded():
const rawMethod = intent.payment_method_types?.[0] ?? 'card';
const methodMap: Record<string, PaymentMethod> = {
  card: PaymentMethod.CARD,
  apple_pay: PaymentMethod.APPLE_PAY,
  google_pay: PaymentMethod.GOOGLE_PAY,
};
const paymentMethod = methodMap[rawMethod] ?? PaymentMethod.CARD;
await this.paymentsRepo.updatePaymentMethod(payment.id, paymentMethod);
```

### Apple Pay Domain Verification

Stripe предоставя файл `apple-developer-merchantid-domain-association` от Stripe Dashboard → Settings → Payment Methods → Apple Pay. Файлът трябва да е достъпен на:
`https://<всеки-tenant-домейн>/.well-known/apple-developer-merchantid-domain-association`

Тъй като NestJS API-то е един сървър зад CloudFront, файлът се serve-ва веднъж и е валиден за всички tenant домейни (Stripe Connect модел).

### Stripe Test Cards за дебитни карти

| Карта | Номер | Резултат |
|---|---|---|
| Visa Debit (success) | `4000 0566 5566 5556` | ✅ Успешно |
| Mastercard Debit | `5200 8282 8282 8210` | ✅ Успешно |
| 3DS required | `4000 0027 6000 3184` | 3DS challenge |
| Declined | `4000 0000 0000 0002` | ❌ Отказано |

**Expiry:** всяка бъдеща дата | **CVV:** `123` | **ZIP:** `42424`

За Apple Pay/Google Pay в Stripe test mode: Stripe автоматично симулира wallet плащания в тестова среда — не е нужна реална Apple/Google конфигурация за тестване.

### Project Structure Notes

- Migration файл: `branivo-api/src/infrastructure/database/migrations/1710000033000-AddPaymentMethodColumns.ts`
- Entity: `branivo-api/src/modules/payments/entities/payment.entity.ts`
- StripeService: `branivo-api/src/modules/payments/stripe.service.ts`
- WebhookService: `branivo-api/src/modules/payments/stripe-webhook.service.ts`
- Repository: `branivo-api/src/modules/payments/payments.repository.ts`
- Flutter screen: `branivo_app/lib/features/payments/screens/payment_screen.dart`
- Flutter BLoC: `branivo_app/lib/features/payments/bloc/payment_bloc.dart`
- Web payment page: `branivo-web/src/app/[locale]/(client)/quotes/payment/page.tsx` (**минимална промяна**)

### References

- Stripe Payment Element docs: поддържа Apple Pay и Google Pay нативно при `automatic_payment_methods: { enabled: true }` [Source: architecture.md#Epic 14]
- flutter_stripe `^10.1.1` — вече в pubspec.yaml [Source: branivo_app/pubspec.yaml:44]
- Съществуващ PaymentElement в web [Source: branivo-web/src/app/[locale]/(client)/quotes/payment/page.tsx:50]
- `payment_method_types: ['card']` в StripeService [Source: branivo-api/src/modules/payments/stripe.service.ts:32]
- Липсващи колони в Payment entity [Source: branivo-api/src/modules/payments/entities/payment.entity.ts]
- Apple Pay domain verification: `.well-known/apple-developer-merchantid-domain-association` — static, CloudFront-served [Source: architecture.md#Epic 14]
- PSD2: `request_three_d_secure: 'any'` е задължително [Source: branivo-skill/SKILL.md — Payment & Policy Safety]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Имплементирани всички 9 Acceptance Criteria (AC1–AC9)
- Backend: Миграция + Entity enums (PaymentMethod, PaymentProvider) + StripeService → automatic_payment_methods + Webhook запис на payment_method + Apple Pay domain verification endpoint (well-known.controller.ts) с VERSION_NEUTRAL и setGlobalPrefix exclusion
- Web: PaymentElement вече поддържа wallets (без промяна) + cancel handling за Apple Pay (validation_error/incomplete_number) и Google Pay (card_error/cancelled)
- Flutter: upgrade flutter_stripe 10.1.1 → 12.4.0 + PaymentSheet flow (initPaymentSheet + presentPaymentSheet) + PaymentCanceledEvent за AC6 + iOS entitlements/Info.plist + Android manifest/proguard
- Всички тестове минават: 734 backend (Jest) + 5 web (Jest/RTL) + 94 Flutter

### File List

branivo-api/src/infrastructure/database/migrations/1710000033000-AddPaymentMethodColumns.ts
branivo-api/src/modules/payments/entities/payment.entity.ts
branivo-api/src/modules/payments/stripe.service.ts
branivo-api/src/modules/payments/stripe-webhook.service.ts
branivo-api/src/modules/payments/payments.repository.ts
branivo-api/src/modules/payments/well-known.controller.ts
branivo-api/src/modules/payments/well-known.controller.spec.ts
branivo-api/src/modules/payments/stripe-webhook.service.spec.ts
branivo-api/src/modules/payments/payments.module.ts
branivo-api/src/app.module.ts
branivo-api/src/main.ts
branivo-web/src/app/[locale]/(client)/quotes/payment/page.tsx
branivo-web/src/__tests__/client/PaymentPage.test.tsx
branivo_app/pubspec.yaml
branivo_app/lib/main.dart
branivo_app/lib/features/payments/screens/payment_screen.dart
branivo_app/lib/features/payments/bloc/payment_bloc.dart
branivo_app/lib/features/payments/bloc/payment_event.dart
branivo_app/ios/Runner/Info.plist
branivo_app/ios/Runner/Runner.entitlements
branivo_app/ios/Runner.xcodeproj/project.pbxproj
branivo_app/ios/Runner.xcworkspace/contents.xcworkspacedata
branivo_app/android/app/src/main/AndroidManifest.xml
branivo_app/android/app/proguard-rules.pro
branivo_app/test/features/payments/screens/payment_screen_test.dart
branivo_app/test/features/payments/bloc/payment_bloc_test.dart
