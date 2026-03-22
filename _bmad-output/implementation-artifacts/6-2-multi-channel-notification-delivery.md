# Story 6.2: Multi-Channel Notification Delivery

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Platform,
I want to deliver renewal notifications via push, SMS and email with automatic fallbacks,
So that clients reliably receive reminders even when one channel is unavailable.

## Acceptance Criteria

1. **AC1 — Channel dispatch по stage:**
   **Given** `notification:renewal` job е queue-ван (от Story 6.1),
   **When** `NotificationProcessor` го обработи,
   **Then** каналите се изпълняват по default escalation mapping за stage:
   - `d_minus_30` → push
   - `d_minus_7` → push
   - `d_minus_3` → SMS
   - `d_minus_1` → email
   - `d_plus_1` → broker dashboard notification (не до клиент)

2. **AC2 — Push notification (D-30, D-7):**
   **Given** push канал е избран,
   **When** end_client има валиден `push_token`,
   **Then** push notification се изпраща чрез FCM (Firebase Admin SDK) с тема "Вашата ГО полица изтича на {date}. Поднови сега → {renewal_link}"

3. **AC3 — Push fallback при липса на token:**
   **Given** push канал е избран,
   **When** end_client няма `push_token` (NULL),
   **Then** `notification_log` запис с `channel = 'push'`, `status = 'push_skipped'`; системата НЕ се опитва да изпрати по друг канал (само логва)

4. **AC4 — SMS (D-3) с fallback:**
   **Given** SMS канал е избран (d_minus_3),
   **When** Twilio е недостъпен или връща грешка,
   **Then** автоматично fallback към email канал; `notification_log` запис за SMS с `status = 'sms_failed'` + нов запис за email attempt

5. **AC5 — Email (D-1) с fallback:**
   **Given** email канал е избран (d_minus_1),
   **When** SendGrid/primary SMTP е недостъпен,
   **Then** retry на transporter (nodemailer SMTP вече е с retry логика); при permanent failure → `status = 'failed'` в `notification_log` + Super Admin алерт

6. **AC6 — Брокер dashboard notification (D+1):**
   **Given** d_plus_1 stage е обработен,
   **When** полицата все още не е подновена,
   **Then** `NotificationsService.notifyBroker()` изпраща email до tenant admin user-а на съответния тенант

7. **AC7 — notification_log запис:**
   **Given** всяко notification attempt (успешно или не),
   **When** е изпратено или провалено,
   **Then** `notification_log` запис съдържа: `policy_id`, `stage`, `tenant_id`, `channel` (`push`/`sms`/`email`/`dashboard`), `status` (`sent`/`push_skipped`/`sms_failed`/`failed`), `delivered_at` (NULL при failure), `created_at`

8. **AC8 — Съдържание на notification:**
   **Given** notification е изпратена (push/SMS/email),
   **When** съдържанието е съставено,
   **Then** включва: конкретна дата на изтичане (`coverage_end_date`) и renewal link `https://{tenant_domain}/renewal/{policy_id}`

## Tasks / Subtasks

### DB Migrations

- [x] **Task 1: Миграция `1710000023000-AddNotificationFieldsToEndClients.ts`** (AC: #2, #3)
  - [ ] Файл: `branivo-api/src/infrastructure/database/migrations/1710000023000-AddNotificationFieldsToEndClients.ts`
  - [ ] Добави колони в `end_clients`:
    ```sql
    ALTER TABLE end_clients ADD COLUMN email VARCHAR(255) NULL;
    ALTER TABLE end_clients ADD COLUMN push_token TEXT NULL;
    ```
  - [ ] Down migration: DROP COLUMN за двете колони
  - [ ] Без NOT NULL constraint — съществуващи клиенти нямат тези данни

- [x] **Task 2: Миграция `1710000024000-CreateNotificationLog.ts`** (AC: #7)
  - [ ] Файл: `branivo-api/src/infrastructure/database/migrations/1710000024000-CreateNotificationLog.ts`
  - [ ] Таблица:
    ```sql
    CREATE TABLE notification_log (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL,
      policy_id    UUID NOT NULL,
      stage        VARCHAR(20) NOT NULL,   -- 'd_minus_30', 'd_minus_7', 'd_minus_3', 'd_minus_1', 'd_plus_1'
      channel      VARCHAR(20) NOT NULL,   -- 'push', 'sms', 'email', 'dashboard'
      status       VARCHAR(20) NOT NULL,   -- 'sent', 'push_skipped', 'sms_failed', 'failed'
      delivered_at TIMESTAMPTZ NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_notification_log_tenant_id ON notification_log(tenant_id);
    CREATE INDEX idx_notification_log_policy_id ON notification_log(policy_id);
    ```
  - [ ] Down migration: `DROP TABLE IF EXISTS notification_log`
  - [ ] **КРИТИЧНО:** Без RLS — таблицата се записва от platform-level processor (без TenantContext)
  - [ ] `notification_log` е IMMUTABLE лог — без UPDATE/DELETE endpoints

### Backend — Entity & Repository Updates

- [x] **Task 3: Обнови `EndClient` entity** (AC: #2, #3)
  - [ ] Файл: `branivo-api/src/modules/clients/entities/end-client.entity.ts`
  - [ ] Добави два нови optional полета:
    ```typescript
    @Column({ name: 'email', nullable: true, type: 'varchar', length: 255 })
    email!: string | null;

    @Column({ name: 'push_token', nullable: true, type: 'text' })
    pushToken!: string | null;
    ```

- [x] **Task 4: Създай `NotificationLog` entity** (AC: #7)
  - [ ] Файл: `branivo-api/src/modules/notifications/entities/notification-log.entity.ts`
  - [ ] TypeORM entity: `id`, `tenantId`, `policyId`, `stage`, `channel`, `status`, `deliveredAt`, `createdAt`
  - [ ] Без `@UpdateDateColumn` и `@DeleteDateColumn` — IMMUTABLE лог
  - [ ] Дефинирай и двата union type:
    ```typescript
    export type NotificationChannel = 'push' | 'sms' | 'email' | 'dashboard';
    export type NotificationStatus = 'sent' | 'push_skipped' | 'sms_failed' | 'failed';
    ```

- [x] **Task 5: Разшири `NotificationsRepository`** (AC: #7)
  - [ ] Файл: `branivo-api/src/modules/notifications/notifications.repository.ts`
  - [ ] Инжектирай: `DataSource`, `Repository<NotificationLog>` (TypeORM)
  - [ ] Методи:
    ```typescript
    // Запиши notification attempt (IMMUTABLE лог)
    logNotification(params: {
      tenantId: string;
      policyId: string;
      stage: RenewalStage;
      channel: NotificationChannel;
      status: NotificationStatus;
      deliveredAt: Date | null;
    }): Promise<void>

    // Вземи end_client с email + push_token за policy
    findEndClientForPolicy(policyId: string): Promise<EndClientRow | null>

    // Вземи tenant domain за renewal link
    findTenantDomain(tenantId: string): Promise<string | null>

    // Вземи broker admin email за tenant (за D+1 dashboard notification)
    findBrokerAdminEmail(tenantId: string): Promise<string | null>
    ```
  - [ ] `findEndClientForPolicy` — JOIN на `policies` + `end_clients` (без RLS — platform context)
  - [ ] `findTenantDomain` — query в `tenant_domains` WHERE `tenant_id = $1 AND is_primary = true`
  - [ ] `findBrokerAdminEmail` — query в `users` WHERE `tenant_id = $1 AND role = 'broker_admin' AND deleted_at IS NULL LIMIT 1`

### Backend — Notification Channels

- [x] **Task 6: Създай `PushChannel`** (AC: #2, #3)
  - [ ] Файл: `branivo-api/src/modules/notifications/channels/push.channel.ts`
  - [ ] Инжектирай: `ConfigService`
  - [ ] Method: `send(params: PushNotificationParams): Promise<PushResult>`
    ```typescript
    interface PushNotificationParams {
      pushToken: string | null;
      title: string;
      body: string;
    }
    interface PushResult {
      status: 'sent' | 'push_skipped';
    }
    ```
  - [ ] Ако `pushToken === null` → `return { status: 'push_skipped' }` (не throws)
  - [ ] Firebase Admin SDK: `firebase-admin` пакет (`npm install firebase-admin`)
  - [ ] Инициализация: `admin.initializeApp({ credential: admin.credential.cert(serviceAccountJson) })` — env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
  - [ ] Lazy initialization pattern — инициализирай само веднъж (check `admin.apps.length === 0`)
  - [ ] **КРИТИЧНО:** `FIREBASE_PRIVATE_KEY` съдържа `\n` — при четене от env: `privateKey.replace(/\\n/g, '\n')`
  - [ ] При FCM error → throw (BullMQ ще retry); при `registration-token-not-registered` → log warning, return `{ status: 'push_skipped' }`

- [x] **Task 7: Създай `SmsChannel`** (AC: #4)
  - [ ] Файл: `branivo-api/src/modules/notifications/channels/sms.channel.ts`
  - [ ] Инжектирай: `ConfigService`, `EmailChannel` (за fallback)
  - [ ] Method: `send(params: SmsNotificationParams): Promise<SmsResult>`
    ```typescript
    interface SmsNotificationParams {
      phoneNumber: string;
      message: string;
      fallbackEmail?: string | null;
      emailSubject?: string;
      emailBody?: string;
    }
    interface SmsResult {
      status: 'sent' | 'sms_failed';
      fallbackUsed: boolean;
    }
    ```
  - [ ] Pattern: Twilio REST API (НЕ SDK) — следвай `clients/sms.service.ts:34-57` точно
  - [ ] При Twilio failure → опитай email fallback ако `fallbackEmail` е предоставен
  - [ ] Не инжектирай `TenantContext` — тази услуга работи в platform context
  - [ ] Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

- [x] **Task 8: Създай `EmailChannel`** (AC: #5)
  - [ ] Файл: `branivo-api/src/modules/notifications/channels/email.channel.ts`
  - [ ] Инжектирай: `EmailService` (от `infrastructure/email/email.service.ts`)
  - [ ] Method: `send(params: EmailNotificationParams): Promise<void>`
    ```typescript
    interface EmailNotificationParams {
      to: string;
      subject: string;
      html: string;
      tenantName: string;
    }
    ```
  - [ ] Делегирай към `emailService.transporter.sendMail()` директно (не добавяй нов метод в EmailService)
  - [ ] При failure → throws (BullMQ retry handles it)

### Backend — NotificationsService (разширен)

- [x] **Task 9: Разшири `NotificationsService`** (AC: #1-#8)
  - [ ] Файл: `branivo-api/src/modules/notifications/notifications.service.ts`
  - [ ] Инжектирани зависимости: `NotificationsRepository`, `PushChannel`, `SmsChannel`, `EmailChannel`, `ConfigService`, `Logger`
  - [ ] Запази съществуващия `notifyBroker()` метод (използва се от billing и др.)
  - [ ] Добави нов главен метод:
    ```typescript
    async deliverRenewalNotification(data: RenewalNotificationJobData): Promise<void>
    ```
  - [ ] `RenewalNotificationJobData`:
    ```typescript
    interface RenewalNotificationJobData {
      policyId: string;
      stage: RenewalStage;
      tenantId: string;
      coverageEndDate: string; // ISO string
    }
    ```
  - [ ] Default channel mapping (за Story 6.3 ще стане конфигурируемо):
    ```typescript
    const DEFAULT_CHANNEL_MAP: Record<RenewalStage, NotificationChannel> = {
      d_minus_30: 'push',
      d_minus_7: 'push',
      d_minus_3: 'sms',
      d_minus_1: 'email',
      d_plus_1: 'dashboard',
    };
    ```
  - [ ] Логика в `deliverRenewalNotification()`:
    1. Fetch `endClient` via `notificationsRepository.findEndClientForPolicy(policyId)`
    2. Fetch `tenantDomain` via `notificationsRepository.findTenantDomain(tenantId)`
    3. Build `renewalLink = https://${tenantDomain}/renewal/${policyId}` (fallback domain: `branivo.com`)
    4. Build `expiryDate = new Date(coverageEndDate).toLocaleDateString('bg-BG')`
    5. Determine `channel = DEFAULT_CHANNEL_MAP[stage]`
    6. Dispatch по channel — виж helper methods долу
    7. Log результата чрез `notificationsRepository.logNotification()`
  - [ ] Helper: `private async sendPush(endClient, title, body): Promise<NotificationStatus>`
  - [ ] Helper: `private async sendSms(endClient, message, emailFallbackParams): Promise<NotificationStatus>`
  - [ ] Helper: `private async sendEmail(endClient, subject, html, tenantName): Promise<NotificationStatus>`
  - [ ] Helper: `private async sendDashboard(tenantId, policyId, coverageEndDate): Promise<NotificationStatus>`
    - Вземи broker admin email: `notificationsRepository.findBrokerAdminEmail(tenantId)`
    - Извикай `this.notifyBroker({ tenantId, subject: ..., message: ... })`
    - **ОБНОВИ** `notifyBroker()` да изпрати реален email до broker admin (не само logger.warn)
  - [ ] **MAX 30 реда** на метод — извлечи в private helpers ако е по-дълго

### Backend — NotificationProcessor

- [x] **Task 10: Създай `NotificationProcessor`** (AC: #1)
  - [ ] Файл: `branivo-api/src/modules/notifications/processors/notification.processor.ts`
  - [ ] **MAX 20 реда — dispatch само, нула бизнес логика**
  - [ ] `@Processor(QUEUE_NOTIFICATIONS)` — същата константа като RenewalCheckProcessor
  - [ ] `@Process('notification:renewal')` — различно job name, без конфликт
  - [ ] При failure → throws за BullMQ retry (attempts: 3, backoff: exponential вече зададен от RenewalService)
  - [ ] Pattern (следвай RenewalCheckProcessor):
    ```typescript
    @Process('notification:renewal')
    async handleRenewalNotification(job: Job<RenewalNotificationJobData>): Promise<void> {
      await this.notificationsService.deliverRenewalNotification(job.data);
    }
    ```
  - [ ] **КРИТИЧНО:** НЕ добавяй `@OnQueueFailed()` тук — `RenewalCheckProcessor` вече го обработва за DLQ-а; retry логиката е наследена от job options в RenewalService

### Backend — NotificationsModule (разширен)

- [x] **Task 11: Разшири `NotificationsModule`** (AC: #1-#8)
  - [ ] Файл: `branivo-api/src/modules/notifications/notifications.module.ts`
  - [ ] Добави:
    - `TypeOrmModule.forFeature([NotificationLog])` — нов entity
    - `BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })` — за Processor регистрация
    - Providers: `NotificationsRepository`, `PushChannel`, `SmsChannel`, `EmailChannel`, `NotificationProcessor`
    - Imports: `EmailModule` (от `infrastructure/email/email.module.ts`)
  - [ ] `exports: [NotificationsService]` — вече се използва от `BillingModule`, `RenewalModule` и др.
  - [ ] **КРИТИЧНО:** Провери дали `NotificationsModule` е в `app.module.ts` — ако не е добавен, добави го

### Тестове

- [x] **Task 12: Unit тест за `NotificationsService`** (AC: #1-#8)
  - [ ] Файл: `branivo-api/src/modules/notifications/notifications.service.spec.ts`
  - [ ] Тествай:
    - `deliverRenewalNotification()` → d_minus_30 → push sent ✓
    - `deliverRenewalNotification()` → d_minus_30, push_token null → push_skipped ✓
    - `deliverRenewalNotification()` → d_minus_3, Twilio fails → SMS fallback to email ✓
    - `deliverRenewalNotification()` → d_minus_1 → email sent ✓
    - `deliverRenewalNotification()` → d_plus_1 → dashboard broker email ✓
    - `logNotification()` извиква се след всеки channel attempt ✓
    - Renewal link format: `https://{domain}/renewal/{policyId}` ✓
  - [ ] **Без `any` тип** — typed mocks, typed job data

- [x] **Task 13: Unit тест за `NotificationProcessor`** (AC: #1)
  - [ ] Файл: `branivo-api/src/modules/notifications/processors/notification.processor.spec.ts`
  - [ ] `handleRenewalNotification(job)` → `deliverRenewalNotification(job.data)` ✓

- [x] **Task 14: Unit тест за `PushChannel`** (AC: #2, #3)
  - [ ] Файл: `branivo-api/src/modules/notifications/channels/push.channel.spec.ts`
  - [ ] push_token null → push_skipped без грешка ✓
  - [ ] valid push_token → FCM изпращане ✓ (mock firebase-admin)

- [x] **Task 15: Unit тест за `SmsChannel`** (AC: #4)
  - [ ] Файл: `branivo-api/src/modules/notifications/channels/sms.channel.spec.ts`
  - [ ] Twilio success → `{ status: 'sent', fallbackUsed: false }` ✓
  - [ ] Twilio failure + email fallback → `{ status: 'sms_failed', fallbackUsed: true }` ✓

### Seeder

- [x] **Task 16: Провери seed данни**
  - [ ] `notification_log` е лог — без seed данни
  - [ ] Добави `email` и `push_token` стойности за demo клиенти в `seed.service.ts`:
    - Намери demo end_client(s) и обнови с `email = 'demo.client@example.com'`, `push_token = NULL`
    - Използвай `ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`

## Dev Notes

### Архитектурен Overview — Notification Delivery Flow

```
RenewalService (Story 6.1)
  → BullMQ 'notifications' queue
  → job: 'notification:renewal' { policyId, stage, tenantId, coverageEndDate }

NotificationProcessor (@Process('notification:renewal'))  [MAX 20 lines]
  → NotificationsService.deliverRenewalNotification(data)
    → Fetch end_client (email, push_token, phone_number)
    → Fetch tenant_domain for renewal_link
    → Determine channel by DEFAULT_CHANNEL_MAP[stage]
    → Dispatch:
        d_minus_30 / d_minus_7 → PushChannel.send()
        d_minus_3             → SmsChannel.send() → fallback EmailChannel
        d_minus_1             → EmailChannel.send()
        d_plus_1              → Dashboard (broker admin email)
    → NotificationsRepository.logNotification()
```

### BullMQ Multiple Processors — Без Конфликт

`RenewalCheckProcessor` и `NotificationProcessor` са на един `@Processor(QUEUE_NOTIFICATIONS)`. В Bull, всеки `@Process('job-name')` декоратор обработва само конкретното job name. Двата processor-а слушат различни jobs:
- `RenewalCheckProcessor` → `@Process('renewal:daily-check')`
- `NotificationProcessor` → `@Process('notification:renewal')`

**КРИТИЧНО:** И двата трябва да са в providers на модулите, регистрирани с `BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })`. Ако `NotificationProcessor` не е в `NotificationsModule` providers, BullMQ няма да го инициализира.

### FCM Firebase Admin Setup

```typescript
// push.channel.ts — lazy initialization
import * as admin from 'firebase-admin';

@Injectable()
export class PushChannel {
  private initFirebase(): void {
    if (admin.apps.length > 0) return;
    const privateKey = (this.config.get<string>('FIREBASE_PRIVATE_KEY') ?? '')
      .replace(/\\n/g, '\n');  // КРИТИЧНО: \n escape в env vars
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: this.config.get<string>('FIREBASE_PROJECT_ID'),
        clientEmail: this.config.get<string>('FIREBASE_CLIENT_EMAIL'),
        privateKey,
      }),
    });
  }

  async send(params: PushNotificationParams): Promise<PushResult> {
    if (!params.pushToken) return { status: 'push_skipped' };
    this.initFirebase();
    try {
      await admin.messaging().send({
        token: params.pushToken,
        notification: { title: params.title, body: params.body },
      });
      return { status: 'sent' };
    } catch (err) {
      // Token invalid/unregistered — treat as skipped, not error
      const errorCode = (err as { code?: string }).code;
      if (errorCode === 'messaging/registration-token-not-registered') {
        return { status: 'push_skipped' };
      }
      throw err; // other FCM errors → BullMQ retry
    }
  }
}
```

### SMS Channel — Platform Context (без TenantContext)

За разлика от `clients/sms.service.ts`, `SmsChannel` работи в **platform context** (cron/queue). Не инжектирай `TenantContext`. Следвай Twilio REST API fetch pattern от `sms.service.ts:34-57` — идентична имплементация, но без tenant domain resolving.

```typescript
// sms.channel.ts — Twilio REST без TenantContext
async send(params: SmsNotificationParams): Promise<SmsResult> {
  const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
  // ... (следвай sms.service.ts Twilio REST pattern)
  try {
    // Twilio REST call...
    return { status: 'sent', fallbackUsed: false };
  } catch {
    if (params.fallbackEmail && params.emailBody) {
      await this.emailChannel.send({ to: params.fallbackEmail, ... });
      return { status: 'sms_failed', fallbackUsed: true };
    }
    return { status: 'sms_failed', fallbackUsed: false };
  }
}
```

### NotificationsRepository — Raw SQL (Platform Context)

Точно като `RenewalRepository` — директен `DataSource.query()`, без `TenantContext`:

```typescript
async findEndClientForPolicy(policyId: string): Promise<EndClientRow | null> {
  const rows = await this.dataSource.query<EndClientRow[]>(`
    SELECT ec.id, ec.email, ec.push_token, ec.phone_number, ec.first_name
    FROM policies p
    JOIN end_clients ec ON p.end_client_id = ec.id
    WHERE p.id = $1 AND p.deleted_at IS NULL AND ec.deleted_at IS NULL
    LIMIT 1
  `, [policyId]);
  return rows[0] ?? null;
}

async findTenantDomain(tenantId: string): Promise<string | null> {
  const rows = await this.dataSource.query<Array<{ domain: string }>>(`
    SELECT domain FROM tenant_domains
    WHERE tenant_id = $1 AND is_primary = true AND deleted_at IS NULL
    LIMIT 1
  `, [tenantId]);
  return rows[0]?.domain ?? null;
}

async findBrokerAdminEmail(tenantId: string): Promise<string | null> {
  const rows = await this.dataSource.query<Array<{ email: string }>>(`
    SELECT email FROM users
    WHERE tenant_id = $1 AND role = 'broker_admin' AND deleted_at IS NULL
    LIMIT 1
  `, [tenantId]);
  return rows[0]?.email ?? null;
}
```

### Renewal Link Format

```typescript
const domain = await this.notificationsRepository.findTenantDomain(tenantId)
  ?? 'branivo.com';
const renewalLink = `https://${domain}/renewal/${policyId}`;
// D-30 push body: `Вашата ГО полица изтича на ${expiryDate}. Поднови сега → ${renewalLink}`
// D-3 SMS: `ГО изтича ${expiryDate}. Поднови: ${renewalLink}`
// D-1 email subject: `Напомняне: Вашата ГО полица изтича утре`
```

### Конфигурация на story 6.3

**Story 6.2 hard-codes** `DEFAULT_CHANNEL_MAP`. **Story 6.3** ще въведе `tenant_renewal_config` таблица и ще замени константата с DB query. При имплементацията на 6.2 остави коментар:
```typescript
// TODO (Story 6.3): Replace DEFAULT_CHANNEL_MAP with tenant-specific config from DB
```

### Структура на Новите Файлове

```
branivo-api/src/modules/notifications/
├── notifications.module.ts                    # разширен — добавено BullModule, TypeORM, channels
├── notifications.service.ts                   # разширен — deliverRenewalNotification()
├── notifications.repository.ts               # попълнен — raw SQL platform-context queries
├── notifications.service.spec.ts             # нов unit тест
├── entities/
│   └── notification-log.entity.ts            # нов entity
├── channels/
│   ├── push.channel.ts                       # FCM web push
│   ├── push.channel.spec.ts
│   ├── sms.channel.ts                        # Twilio REST + email fallback
│   ├── sms.channel.spec.ts
│   └── email.channel.ts                      # делегира към EmailService
└── processors/
    ├── notification.processor.ts             # MAX 20 реда — dispatch само
    └── notification.processor.spec.ts

branivo-api/src/infrastructure/database/migrations/
├── 1710000023000-AddNotificationFieldsToEndClients.ts  # email + push_token
└── 1710000024000-CreateNotificationLog.ts              # notification_log таблица

branivo-api/src/modules/clients/entities/
└── end-client.entity.ts                     # модифициран — добавени email, pushToken
```

### TypeScript — Типове без `any`

```typescript
// В notifications.service.ts:
export type RenewalStage = 'd_minus_30' | 'd_minus_7' | 'd_minus_3' | 'd_minus_1' | 'd_plus_1';
export type NotificationChannel = 'push' | 'sms' | 'email' | 'dashboard';
export type NotificationStatus = 'sent' | 'push_skipped' | 'sms_failed' | 'failed';

export interface RenewalNotificationJobData {
  policyId: string;
  stage: RenewalStage;
  tenantId: string;
  coverageEndDate: string; // ISO string — Dates не се сериализират в BullMQ
}

// В processor: const data = job.data as RenewalNotificationJobData;
// В repository raw SQL: await this.dataSource.query<EndClientRow[]>(...)

interface EndClientRow {
  id: string;
  email: string | null;
  push_token: string | null;
  phone_number: string;
  first_name: string | null;
}
```

### Зависимост от Story 6.1

Story 6.2 **обработва** `notification:renewal` jobs, queue-вани от Story 6.1. Story 6.1 вече е done и jobs се изпращат към `QUEUE_NOTIFICATIONS`. Без промени в Story 6.1 код.

### Съществуващи Pattern References

- `renewal-check.processor.ts:1-35` — Processor с `@Process` + `@OnQueueFailed` pattern
- `clients/sms.service.ts:24-57` — Twilio REST API без SDK (без TenantContext в channels!)
- `infrastructure/email/email.service.ts:1-50` — SMTP transporter pattern
- `renewal.repository.ts:1-60` — Raw SQL `DataSource.query()` в platform context
- `billing/processors/invoice-generation.processor.ts:33-50` — TypedJobData interface pattern

### Project Structure Notes

- `QUEUE_NOTIFICATIONS = 'notifications'` — дефинирано в `src/infrastructure/queues/queue.module.ts:6`
- `EmailModule` е в `src/infrastructure/email/email.module.ts` — вече е в `app.module.ts` globals (провери преди добавяне)
- Последна migration: `1710000022000` → следващите са `1710000023000` и `1710000024000`
- `end_client.entity.ts` — файл `branivo-api/src/modules/clients/entities/end-client.entity.ts`
- `NotificationsModule` е в `app.module.ts` — `import { NotificationsModule } from './modules/notifications/notifications.module'`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2] — User story, AC, push/SMS/email/dashboard channels
- [Source: _bmad-output/planning-artifacts/prd.md#FR37-FR42] — Multi-channel renewal requirements
- [Source: _bmad-output/planning-artifacts/prd.md#NFR37] — SendGrid → SMTP fallback, Twilio → email fallback
- [Source: _bmad-output/planning-artifacts/architecture.md#BullMQ Queue Architecture] — 3 queues, notifications = time-sensitive
- [Source: _bmad-output/planning-artifacts/architecture.md#notifications/ module structure] — channels/, processors/, templates/
- [Source: branivo-api/src/modules/renewal/renewal.service.ts:85-98] — notification:renewal job data structure
- [Source: branivo-api/src/modules/renewal/processors/renewal-check.processor.ts] — Processor pattern MAX 20 lines
- [Source: branivo-api/src/modules/clients/sms.service.ts:24-57] — Twilio REST fetch pattern
- [Source: branivo-api/src/infrastructure/email/email.service.ts] — SMTP transporter reuse
- [Source: branivo-api/src/modules/notifications/notifications.service.ts] — съществуващ notifyBroker() stub
- [Source: branivo-api/src/modules/clients/entities/end-client.entity.ts] — entity за разширяване
- [Source: branivo-api/src/infrastructure/database/migrations/1710000022000-CreateRenewalNotificationLog.ts] — migration pattern (без RLS)
- [Source: _bmad-output/implementation-artifacts/6-1-renewal-check-scheduled-job.md] — processor, queue, job naming learnings

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Имплементирани всички 16 Tasks: DB миграции, entity, repository, 3 channels (push/SMS/email), NotificationsService с DEFAULT_CHANNEL_MAP, NotificationProcessor, разширен NotificationsModule
- `firebase-admin` инсталиран и lazy-initialized в PushChannel
- SmsChannel с Twilio REST API и email fallback (без SDK, без TenantContext)
- EmailChannel делегира към `emailService.transporter.sendMail()` директно
- `notification_log` е IMMUTABLE — само INSERT, без UPDATE/DELETE
- Seed данни: demo end_client с `email = 'demo.client@example.com'`, `push_token = NULL`
- 469 теста минават (14 нови + 455 регресионни), lint 0 грешки, build успешен

### File List

- `branivo-api/src/infrastructure/database/migrations/1710000023000-AddNotificationFieldsToEndClients.ts` (нов)
- `branivo-api/src/infrastructure/database/migrations/1710000024000-CreateNotificationLog.ts` (нов)
- `branivo-api/src/modules/clients/entities/end-client.entity.ts` (модифициран — добавени email, pushToken)
- `branivo-api/src/modules/notifications/entities/notification-log.entity.ts` (нов)
- `branivo-api/src/modules/notifications/notifications.repository.ts` (попълнен)
- `branivo-api/src/modules/notifications/channels/push.channel.ts` (нов)
- `branivo-api/src/modules/notifications/channels/push.channel.spec.ts` (нов)
- `branivo-api/src/modules/notifications/channels/sms.channel.ts` (нов)
- `branivo-api/src/modules/notifications/channels/sms.channel.spec.ts` (нов)
- `branivo-api/src/modules/notifications/channels/email.channel.ts` (нов)
- `branivo-api/src/modules/notifications/processors/notification.processor.ts` (нов)
- `branivo-api/src/modules/notifications/processors/notification.processor.spec.ts` (нов)
- `branivo-api/src/modules/notifications/notifications.service.ts` (разширен)
- `branivo-api/src/modules/notifications/notifications.service.spec.ts` (нов)
- `branivo-api/src/modules/notifications/notifications.module.ts` (разширен)
- `branivo-api/src/infrastructure/email/email.service.ts` (transporter: private → readonly)
- `branivo-api/src/infrastructure/database/seed.service.ts` (добавени email/push_token в seedEndClients)
- `branivo-api/package.json` (добавен firebase-admin)

## Change Log

- Имплементирана Story 6.2: Multi-Channel Notification Delivery — push (FCM), SMS (Twilio REST), email (SMTP), dashboard (broker admin email). DB миграции, NotificationLog entity/repository, 3 channel класа, NotificationsService разширен, NotificationProcessor добавен. 14 нови unit теста. (Date: 2026-03-21)
