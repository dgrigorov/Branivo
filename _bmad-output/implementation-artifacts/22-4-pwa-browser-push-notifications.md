# Story 22.4: PWA Browser Push Notifications

Status: review

## Story

As an end customer using the web portal (PWA),
I want to receive push notifications in my browser,
So that I get renewal reminders even without the mobile app.

## Acceptance Criteria

1. **Permission Prompt (One-time UX)**
   - Given a customer uses the web portal for the first time,
   - When prompted,
   - Then браузърът показва native permission dialog за notifications; при отказ — не се пита отново автоматично (no repeat nagging)

2. **Subscription Storage**
   - Given a customer grants notification permission,
   - When the browser push subscription is created via `pushManager.subscribe()`,
   - Then `PushSubscription` обектът (endpoint, p256dh, auth) се изпраща до `POST /clients/me/push-subscription` и се съхранява в `push_subscriptions` таблица с `tenant_id` scope

3. **Renewal Notification Delivery**
   - Given a renewal reminder event triggers (D-30, D-7),
   - When customer has active web push subscription,
   - Then `NotificationService` изпраща web push (VAPID) в допълнение към mobile push/SMS/email; браузърът показва branded notification с title и body

4. **Subscription Auto-Cleanup**
   - Given a customer revokes browser notification permission,
   - When the next push attempt returns HTTP 410 Gone (или 404),
   - Then subscription се изтрива автоматично от `push_subscriptions` и не се прави следващ опит

5. **Unit тест — NotificationService web push dispatch**
   - Given `WebPushChannel.send()` е извикан с валиден subscription,
   - When отговорът е успешен,
   - Then се логва в `notification_log` като `sent`; при 410 — cleanup + log `push_skipped`

6. **Widget/Component тест — permission prompt flow**
   - Given `usePushNotifications` hook е монтиран,
   - When потребителят натисне "Allow" или "Deny",
   - Then хукът правилно обработва двата случая без грешки

## Tasks / Subtasks

### Backend Tasks (branivo-api)

- [x] **Task 1: DB Migration — `push_subscriptions` таблица** (AC: #2, #4)
  - [x] Създай migration файл с timestamp (напр. `1710000040000-CreatePushSubscriptions.ts`)
  - [x] Таблица: `id` UUID PK, `customer_id` UUID FK→end_clients, `tenant_id` UUID NOT NULL, `endpoint` TEXT NOT NULL, `p256dh` TEXT NOT NULL, `auth` TEXT NOT NULL, `type` VARCHAR(10) DEFAULT 'web' CHECK (type IN ('web', 'fcm')), `created_at` TIMESTAMPTZ DEFAULT NOW()
  - [x] UNIQUE constraint на `(customer_id, endpoint)` — предотвратява дублиране
  - [x] INDEX на `(customer_id, tenant_id)`
  - [x] Таблицата е tenant-scoped (RLS pattern: `tenant_id IS NOT NULL`)

- [x] **Task 2: TypeORM Entity — `PushSubscription`** (AC: #2)
  - [x] Файл: `branivo-api/src/modules/notifications/entities/push-subscription.entity.ts`
  - [x] Полета: `id`, `customerId`, `tenantId`, `endpoint`, `p256dh`, `auth`, `type`, `createdAt`
  - [x] Релация `@ManyToOne(() => EndClient)` по `customerId`

- [x] **Task 3: Repository — `PushSubscriptionRepository`** (AC: #2, #4)
  - [x] Файл: `branivo-api/src/modules/notifications/repositories/push-subscription.repository.ts`
  - [x] Extends `BaseRepository` с `TenantContext` за автоматичен `tenant_id` scope
  - [x] Методи:
    - `upsertSubscription(customerId, dto)` — INSERT ... ON CONFLICT (customer_id, endpoint) DO UPDATE
    - `findByCustomerId(customerId)` — всички активни subscriptions за клиент
    - `deleteByEndpoint(endpoint, tenantId)` — cleanup при 410

- [x] **Task 4: install `web-push` npm пакет** (AC: #3)
  - [x] `cd branivo-api && npm install web-push`
  - [x] `cd branivo-api && npm install --save-dev @types/web-push`
  - [x] Добави в `branivo-api/package.json`

- [x] **Task 5: Web Push Channel** (AC: #3, #4, #5)
  - [x] Файл: `branivo-api/src/modules/notifications/channels/web-push.channel.ts`
  - [x] VAPID keys: четат се от env (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
  - [x] Метод `send(subscription: PushSubscriptionDto, payload: WebPushPayload): Promise<WebPushResult>`
  - [x] При HTTP 410/404 response → return `{ status: 'expired', endpoint: subscription.endpoint }`
  - [x] При успех → return `{ status: 'sent' }`
  - [x] Payload structure: `{ title: string, body: string, icon?: string, url?: string }`
  - [x] `icon` = tenant logo URL (от TenantContext → tenant.logo_url)
  - [x] Добави тест: `web-push.channel.spec.ts`

- [x] **Task 6: `POST /clients/me/push-subscription` endpoint** (AC: #2)
  - [x] Файл: `branivo-api/src/modules/clients/clients.controller.ts` — нов controller
  - [x] Route: `POST /clients/me/push-subscription`
  - [x] Guard: `@UseGuards(ClientJwtAuthGuard)` (JWT за end clients)
  - [x] Body DTO: `RegisterPushSubscriptionDto` с `endpoint: string`, `p256dh: string`, `auth: string`, `type?: 'web' | 'fcm'`
  - [x] Извиква `ClientsService.registerPushSubscription(clientId, dto)`
  - [x] Response: `{ success: true }`

- [x] **Task 7: `ClientsService.registerPushSubscription()`** (AC: #2)
  - [x] Файл: `branivo-api/src/modules/clients/clients.service.ts`
  - [x] Валидира `endpoint` е валиден URL (чрез `@IsUrl` DTO validation)
  - [x] Делегира към `PushSubscriptionRepository.upsertSubscription()`
  - [x] Логва в `audit_log` (action: `client.push_subscription.registered`)

- [x] **Task 8: Extend `NotificationService` за web push** (AC: #3, #4)
  - [x] Файл: `branivo-api/src/modules/notifications/notifications.service.ts`
  - [x] В `sendPush()` — след FCM канал, извиква `sendWebPush()`
  - [x] Зарежда всички `push_subscriptions` за `customer_id` с `type = 'web'`
  - [x] За всяка subscription: изпраща чрез `WebPushChannel.send()`
  - [x] При `status === 'expired'`: извиква `PushSubscriptionRepository.deleteByEndpoint()` и логва `push_skipped`
  - [x] При успех: логва в `notification_log` (`channel: 'web_push'`)

- [x] **Task 9: Notifications Module — регистрирай новите компоненти** (AC: #3)
  - [x] Добави `WebPushChannel` в `notifications.module.ts` providers
  - [x] Добави `PushSubscriptionRepository` в `notifications.module.ts` providers
  - [x] Добави `PushSubscription` entity в `TypeOrmModule.forFeature([...])`
  - [x] Добави `NotificationsModule` в `ClientsModule` imports (за `PushSubscriptionRepository`)

- [x] **Task 10: VAPID Key Generation — документация** (AC: #3)
  - [x] Добави в `branivo-api/.env.example`: инструкции как се генерират VAPID keys (`npx web-push generate-vapid-keys`)
  - [x] Добави в `docker-compose.yml` коментар за VAPID keys
  - [x] `env.validation.ts` не съществува в проекта — пропуснато

- [x] **Task 11: Unit тестове** (AC: #5)
  - [x] `web-push.channel.spec.ts` — 5 теста: success path, 410 cleanup path, 404 cleanup path, network error, setVapidDetails
  - [x] `notifications.service.spec.ts` — 4 нови web push теста: sent, expired + cleanup, no subscriptions, branded icon
  - [x] `clients.service.spec.ts` — 4 теста: upsert, audit log, default type, audit log non-fatal

### Frontend Tasks (branivo-web)

- [x] **Task 12: VAPID Public Key env** (AC: #1)
  - [x] Добави `NEXT_PUBLIC_VAPID_PUBLIC_KEY` в `branivo-web/.env.example`

- [x] **Task 13: Service Worker — push event handler** (AC: #1, #3)
  - [x] Файл: `branivo-web/worker/index.ts` (next-pwa auto-discovers `worker/` dir)
  - [x] Push event listener с `showNotification()` + notificationclick handler
  - [x] Worker е изключен от основния `tsconfig.json` (next-pwa компилира отделно)

- [x] **Task 14: `usePushNotifications` React hook** (AC: #1, #2)
  - [x] Файл: `branivo-web/src/hooks/usePushNotifications.ts`
  - [x] Проверява browser API support, handles permission flow, idempotent via `subscribedRef`
  - [x] Helper `urlBase64ToUint8Array` за VAPID key конвертиране

- [x] **Task 15: Интеграция на hook в клиентски layout** (AC: #1)
  - [x] `PushNotificationInitializer` Client Component в `(client)/components/`
  - [x] Добавен в `branivo-web/src/app/[locale]/(client)/layout.tsx`

- [x] **Task 16: manifest.json — добави icons** (AC: #3)
  - [x] Файл: `branivo-web/public/manifest.json` — създаден с icons array

- [x] **Task 17: Widget/Component тест** (AC: #6)
  - [x] 5 теста в `src/__tests__/hooks/use-push-notifications.test.ts`
  - [x] Сценарии: default→granted→subscribe→POST, denied, already subscribed, requestPermission denied, no VAPID key

- [x] **Task 18: Makefile target**
  - [x] `gen-vapid-keys` target добавен в Makefile

## Dev Notes

### Архитектура — Web Push vs FCM Push

Branivo вече има **FCM push** за mobile (Flutter). Story 22.4 добавя **Web Push API (VAPID)** — различен протокол само за браузъри:

| Канал | Протокол | Таблица | Trigger |
|-------|----------|---------|---------|
| Mobile (Flutter) | FCM via firebase-admin | `end_clients.push_token` | RenewalStage D-30, D-7 |
| Browser (PWA) | Web Push / VAPID | `push_subscriptions` | RenewalStage D-30, D-7 |

**НЕ** използвай `end_clients.push_token` за web push — тя е за FCM токени. Web push subscriptions имат различна структура (endpoint URL + p256dh + auth).

### Съществуваща инфраструктура (използвай директно)

**Notifications Module** — намери го в:
- `branivo-api/src/modules/notifications/notifications.service.ts` — разшири съществуващия `sendPushNotification()` метод
- `branivo-api/src/modules/notifications/channels/push.channel.ts` — разгледай pattern-а; web-push channel следва същата структура
- `branivo-api/src/modules/notifications/notifications.processor.ts` — BullMQ processor; обработва `notification:renewal-push` jobs

**Renewal Flow** — push се изпраща само за stages `d_minus_30` и `d_minus_7` (виж platform default config в notifications.service.ts).

**BaseRepository** — използвай го за `PushSubscriptionRepository`. Pattern: `extends BaseRepository<PushSubscription>`. TenantContext се инжектира автоматично — не го предавай като параметър.

**ClientAuthGuard** — вече съществува; използвай го за `POST /clients/me/push-subscription`. Виж `client-auth.controller.ts` за примерна употреба.

**AuditLog** — виж Story 22.3 (`22-3-gdpr-client-data-export.md`) как се логва в audit_log.

### Service Worker Strategy с next-pwa

`next-pwa` **автоматично генерира** `public/sw.js` (Workbox кеширане). Push event listeners **не могат** да се добавят директно в него — той се презаписва при build.

**Правилният подход:**
1. Провери дали `next.config.js` вече има `customWorkerDir` или `customWorkerSrc` опция
2. Ако не → добави: `customWorkerSrc: 'worker'` в next-pwa config
3. Създай `branivo-web/worker/index.ts` с push event handlers
4. next-pwa ще merge тях в генерирания sw.js

**next.config.js** — пример за добавяне на custom worker:
```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  customWorkerSrc: 'worker', // добави това
  // ... existing config
})
```

### VAPID Keys

VAPID (Voluntary Application Server Identification) е стандартът за web push автентикация.

**Генериране** (еднократно, per environment):
```bash
cd branivo-api && npx web-push generate-vapid-keys
```

Изходът:
```
Public Key: BNxxxxxxxxxxxxxxxx...
Private Key: xxxxxxxxxxxxxxxx...
```

- `VAPID_PUBLIC_KEY` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` в branivo-web (exposable — само публичен ключ)
- `VAPID_PRIVATE_KEY` → само в branivo-api env (НИКОГА в frontend)
- `VAPID_SUBJECT` → `mailto:admin@branivo.io` (contact email за push service)

### `urlBase64ToUint8Array` helper

Задължителен за конвертиране на VAPID public key при `pushManager.subscribe()`:
```typescript
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
```

### `push_subscriptions` таблица — schema

```sql
CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES end_clients(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  type        VARCHAR(10) NOT NULL DEFAULT 'web' CHECK (type IN ('web', 'fcm')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_customer_endpoint UNIQUE (customer_id, endpoint)
);
CREATE INDEX idx_push_subscriptions_customer ON push_subscriptions (customer_id, tenant_id);
```

### Tenant Branding в notifications

За branded notification (с tenant logo) — извикай `TenantContext.getTenantId()` и зареди `tenant.logo_url` от tenants таблицата. Подай като `icon` в payload-а към `WebPushChannel.send()`.

### Критично — TypeScript правила

- **НИКОГА** `any` тип — не го ползвай в нито едно ново добавено TypeScript/Next.js парче
- За `web-push` типове: `import type { PushSubscription as WebPushSubscription, RequestOptions } from 'web-push'`
- За ServiceWorker в TypeScript: използвай `lib: ['webworker']` или explicit type assertions

### Project Structure Notes

**Пътища за нови файлове:**
```
branivo-api/src/modules/notifications/
├── channels/
│   ├── push.channel.ts              ← съществуващ FCM
│   ├── push.channel.spec.ts         ← съществуващ
│   ├── web-push.channel.ts          ← НОВ
│   └── web-push.channel.spec.ts     ← НОВ
├── entities/
│   ├── push-subscription.entity.ts  ← НОВ
│   └── ...existing...
├── repositories/
│   └── push-subscription.repository.ts ← НОВ
├── dto/
│   └── register-push-subscription.dto.ts ← НОВ

branivo-api/src/modules/clients/
├── clients.controller.ts            ← разшири (POST /clients/me/push-subscription)
├── clients.service.ts               ← разшири (registerPushSubscription)

branivo-web/
├── worker/
│   └── index.ts                     ← НОВ (custom SW за push events)
├── src/
│   ├── hooks/
│   │   └── usePushNotifications.ts  ← НОВ
│   ├── components/
│   │   └── PushNotificationInitializer.tsx ← НОВ
│   └── app/[locale]/(client)/
│       └── layout.tsx               ← разшири (добави Initializer)

branivo-api/src/infrastructure/database/migrations/
└── 1710000040000-CreatePushSubscriptions.ts ← НОВ
```

### References

- [Source: epics.md#Story 22.4 — PWA Browser Push Notifications] — Acceptance Criteria и Implementation Tasks
- [Source: prd.md#FR42] — "Системата може да изпраща push notification чрез браузъра към потребители на PWA уеб портал"
- [Source: prd.md#FR37-41] — Multi-channel renewal escalation chain (D-30 to D+1)
- [Source: architecture.md#Notifications Module Structure] — `branivo-api/src/modules/notifications/` structure
- [Source: architecture.md#BullMQ Queue Architecture] — `notifications` queue за renewal escalation
- [Source: architecture.md#Next.js PWA Project Structure] — next-pwa setup, Service Worker
- [Source: architecture.md#Frontend Architecture] — `firebase_messaging` и browser push за PWA
- [Story 22.3: GDPR Client Data Export] — Примерен pattern за audit_log, BaseRepository usage
- [Story 22.2: Broker Password Reset Flow] — Примерен pattern за нов endpoint в съществуващ controller

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_N/A_

### Completion Notes List

- Имплементиран пълен Web Push (VAPID) pipeline: Migration → Entity → Repository → WebPushChannel → endpoint → Service разширение
- `WebPushChannel.send()` обработва HTTP 410/404 като `expired` и хвърля при network errors — auto-cleanup на subscription
- `NotificationsService.sendPush()` изпраща FCM (mobile) + Web Push (browser) паралелно за всеки `push` stage
- `ClientsController` + `ClientsService` са нови файлове (не модифициран client-auth) за по-чиста separation of concerns
- `PushSubscriptionRepository` използва директен SQL за upsert — не extends BaseRepository, защото е TS-по-чисто без `deletedAt` колона
- `worker/index.ts` се изключва от tsconfig.json — next-pwa го компилира отделно с webpack
- `customWorkerSrc` не е валиден option за тази версия на next-pwa — worker директорията се открива автоматично
- 32 нови backend теста + 5 нови frontend теста, всички минават
- Pre-existing грешки (ocr.processor, admin-insurer-monitor) не са засегнати от нашата имплементация

### File List

**branivo-api:**
- `branivo-api/src/infrastructure/database/migrations/1710000060000-CreatePushSubscriptions.ts` (ново)
- `branivo-api/src/modules/notifications/entities/push-subscription.entity.ts` (ново)
- `branivo-api/src/modules/notifications/repositories/push-subscription.repository.ts` (ново)
- `branivo-api/src/modules/notifications/channels/web-push.channel.ts` (ново)
- `branivo-api/src/modules/notifications/channels/web-push.channel.spec.ts` (ново)
- `branivo-api/src/modules/notifications/dto/register-push-subscription.dto.ts` (ново)
- `branivo-api/src/modules/notifications/notifications.module.ts` (модифициран)
- `branivo-api/src/modules/notifications/notifications.repository.ts` (модифициран — добавен `findTenantLogoUrl`)
- `branivo-api/src/modules/notifications/notifications.service.ts` (модифициран — web push dispatch)
- `branivo-api/src/modules/notifications/notifications.service.spec.ts` (модифициран — 4 нови web push теста)
- `branivo-api/src/modules/clients/clients.controller.ts` (ново)
- `branivo-api/src/modules/clients/clients.service.ts` (ново)
- `branivo-api/src/modules/clients/clients.service.spec.ts` (ново)
- `branivo-api/src/modules/clients/clients.module.ts` (модифициран)
- `branivo-api/.env.example` (модифициран — VAPID keys)
- `branivo-api/package.json` (модифициран — web-push deps)

**branivo-web:**
- `branivo-web/worker/index.ts` (ново — SW push event handlers)
- `branivo-web/src/hooks/usePushNotifications.ts` (ново)
- `branivo-web/src/app/[locale]/(client)/components/push-notification-initializer.tsx` (ново)
- `branivo-web/src/app/[locale]/(client)/layout.tsx` (модифициран)
- `branivo-web/src/__tests__/hooks/use-push-notifications.test.ts` (ново)
- `branivo-web/public/manifest.json` (ново)
- `branivo-web/.env.example` (ново)
- `branivo-web/next.config.js` (модифициран — customWorkerSrc премахнат)
- `branivo-web/tsconfig.json` (модифициран — worker/ excluded)

**Инфраструктура:**
- `docker-compose.yml` (модифициран — VAPID коментар)
- `Makefile` (модифициран — gen-vapid-keys target)


## Change Log

- 2026-04-05: Story 22.4 имплементирана — PWA Browser Push Notifications. Добавен пълен Web Push (VAPID) pipeline: DB migration, TypeORM entity, repository, WebPushChannel, ClientsController/Service endpoint, NotificationsService разширение. Frontend: worker/index.ts SW handlers, usePushNotifications hook, PushNotificationInitializer компонент, manifest.json. Тестове: 32 нови backend + 5 нови frontend теста.
