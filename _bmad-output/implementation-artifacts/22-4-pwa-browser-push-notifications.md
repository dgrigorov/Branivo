# Story 22.4: PWA Browser Push Notifications

Status: ready-for-dev

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

- [ ] **Task 1: DB Migration — `push_subscriptions` таблица** (AC: #2, #4)
  - [ ] Създай migration файл с timestamp (напр. `1710000040000-CreatePushSubscriptions.ts`)
  - [ ] Таблица: `id` UUID PK, `customer_id` UUID FK→end_clients, `tenant_id` UUID NOT NULL, `endpoint` TEXT NOT NULL, `p256dh` TEXT NOT NULL, `auth` TEXT NOT NULL, `type` VARCHAR(10) DEFAULT 'web' CHECK (type IN ('web', 'fcm')), `created_at` TIMESTAMPTZ DEFAULT NOW()
  - [ ] UNIQUE constraint на `(customer_id, endpoint)` — предотвратява дублиране
  - [ ] INDEX на `(customer_id, tenant_id)`
  - [ ] Таблицата е tenant-scoped (RLS pattern: `tenant_id IS NOT NULL`)

- [ ] **Task 2: TypeORM Entity — `PushSubscription`** (AC: #2)
  - [ ] Файл: `branivo-api/src/modules/notifications/entities/push-subscription.entity.ts`
  - [ ] Полета: `id`, `customerId`, `tenantId`, `endpoint`, `p256dh`, `auth`, `type`, `createdAt`
  - [ ] Релация `@ManyToOne(() => EndClient)` по `customerId`

- [ ] **Task 3: Repository — `PushSubscriptionRepository`** (AC: #2, #4)
  - [ ] Файл: `branivo-api/src/modules/notifications/repositories/push-subscription.repository.ts`
  - [ ] Extends `BaseRepository` с `TenantContext` за автоматичен `tenant_id` scope
  - [ ] Методи:
    - `upsertSubscription(customerId, dto)` — INSERT ... ON CONFLICT (customer_id, endpoint) DO UPDATE
    - `findByCustomerId(customerId)` — всички активни subscriptions за клиент
    - `deleteByEndpoint(endpoint, tenantId)` — cleanup при 410

- [ ] **Task 4: install `web-push` npm пакет** (AC: #3)
  - [ ] `cd branivo-api && npm install web-push`
  - [ ] `cd branivo-api && npm install --save-dev @types/web-push`
  - [ ] Добави в `branivo-api/package.json`

- [ ] **Task 5: Web Push Channel** (AC: #3, #4, #5)
  - [ ] Файл: `branivo-api/src/modules/notifications/channels/web-push.channel.ts`
  - [ ] VAPID keys: четат се от env (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
  - [ ] Метод `send(subscription: PushSubscriptionDto, payload: WebPushPayload): Promise<WebPushResult>`
  - [ ] При HTTP 410/404 response → return `{ status: 'expired', endpoint: subscription.endpoint }`
  - [ ] При успех → return `{ status: 'sent' }`
  - [ ] Payload structure: `{ title: string, body: string, icon?: string, url?: string }`
  - [ ] `icon` = tenant logo URL (от TenantContext → tenant.logo_url)
  - [ ] Добави тест: `web-push.channel.spec.ts`

- [ ] **Task 6: `POST /clients/me/push-subscription` endpoint** (AC: #2)
  - [ ] Файл: `branivo-api/src/modules/clients/clients.controller.ts` — добави нов endpoint
  - [ ] Route: `POST /clients/me/push-subscription`
  - [ ] Guard: `@UseGuards(ClientAuthGuard)` (JWT за end clients)
  - [ ] Body DTO: `RegisterPushSubscriptionDto` с `endpoint: string`, `p256dh: string`, `auth: string`, `type?: 'web' | 'fcm'`
  - [ ] Извиква `ClientsService.registerPushSubscription(clientId, tenantId, dto)`
  - [ ] Response: `{ success: true }`

- [ ] **Task 7: `ClientsService.registerPushSubscription()`** (AC: #2)
  - [ ] Файл: `branivo-api/src/modules/clients/clients.service.ts`
  - [ ] Валидира `endpoint` е валиден URL
  - [ ] Делегира към `PushSubscriptionRepository.upsertSubscription()`
  - [ ] Логва в `audit_log` (action: `client.push_subscription.registered`)

- [ ] **Task 8: Extend `NotificationService` за web push** (AC: #3, #4)
  - [ ] Файл: `branivo-api/src/modules/notifications/notifications.service.ts`
  - [ ] В метода за изпращане на push notifications (D-30, D-7 stage) — след FCM канал, добави web push
  - [ ] Зареди всички `push_subscriptions` за `customer_id` с `type = 'web'`
  - [ ] За всяка subscription: изпрати чрез `WebPushChannel.send()`
  - [ ] При `status === 'expired'`: извикай `PushSubscriptionRepository.deleteByEndpoint()` и логни `push_skipped`
  - [ ] При успех: логни в `notification_log` (`channel: 'web_push'`)

- [ ] **Task 9: Notifications Module — регистрирай новите компоненти** (AC: #3)
  - [ ] Добави `WebPushChannel` в `notifications.module.ts` providers
  - [ ] Добави `PushSubscriptionRepository` в `notifications.module.ts` providers
  - [ ] Добави `PushSubscription` entity в `TypeOrmModule.forFeature([...])`
  - [ ] Добави `ClientsModule` в imports (за достъп до `ClientsService` от notifications)

- [ ] **Task 10: VAPID Key Generation — документация** (AC: #3)
  - [ ] Добави в `branivo-api/src/config/env.validation.ts` validation за `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - [ ] Добави в `.env.example`: инструкции как се генерират VAPID keys (`npx web-push generate-vapid-keys`)
  - [ ] Добави в `docker-compose.yml` env vars за API service

- [ ] **Task 11: Unit тестове** (AC: #5)
  - [ ] `web-push.channel.spec.ts` — тест за `send()`: success path, 410 cleanup path, network error handling
  - [ ] `notifications.service.spec.ts` — добави тест cases за web push dispatch в renewal flow
  - [ ] `clients.service.spec.ts` — тест за `registerPushSubscription()`

### Frontend Tasks (branivo-web)

- [ ] **Task 12: VAPID Public Key env** (AC: #1)
  - [ ] Добави `NEXT_PUBLIC_VAPID_PUBLIC_KEY` в `branivo-web/.env.example`
  - [ ] Добави в `branivo-web/.env.local` (dev)

- [ ] **Task 13: Service Worker — push event handler** (AC: #1, #3)
  - [ ] Файл: `branivo-web/public/push-sw.js` (отделен SW файл за push — next-pwa генерира sw.js за cache, push handler трябва да е в custom SW или да се extends)
  - [ ] **Алтернатива (препоръчана):** Използвай `next-pwa` custom worker feature — `branivo-web/worker/index.ts`
  - [ ] Push event listener:
    ```typescript
    self.addEventListener('push', (event) => {
      const data = event.data?.json() as { title: string; body: string; icon?: string; url?: string };
      event.waitUntil(
        self.registration.showNotification(data.title, {
          body: data.body,
          icon: data.icon ?? '/icon-192x192.png',
          data: { url: data.url },
        })
      );
    });
    self.addEventListener('notificationclick', (event) => {
      event.notification.close();
      const url = event.notification.data?.url ?? '/';
      event.waitUntil(clients.openWindow(url));
    });
    ```

- [ ] **Task 14: `usePushNotifications` React hook** (AC: #1, #2)
  - [ ] Файл: `branivo-web/src/hooks/usePushNotifications.ts`
  - [ ] Логика:
    1. Проверява `'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window`
    2. При първо зареждане (след login): ако `Notification.permission === 'default'` → `requestPermission()`
    3. При 'granted': `navigator.serviceWorker.ready` → `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })`
    4. Конвертира subscription → JSON → POST `/api/v1/clients/me/push-subscription`
    5. При 'denied': не прави нищо, не пита повторно
  - [ ] Хукът е **idempotent** — може да се вика многократно без дублиране
  - [ ] Helper `urlBase64ToUint8Array(base64String: string): Uint8Array` за VAPID key конвертиране

- [ ] **Task 15: Интеграция на hook в клиентски layout** (AC: #1)
  - [ ] Файл: `branivo-web/src/app/[locale]/(client)/layout.tsx`
  - [ ] Добави `<PushNotificationInitializer />` компонент (client component, рендерира null, вика `usePushNotifications()`)
  - [ ] Монтира се само след successful authentication

- [ ] **Task 16: manifest.json — добави icons** (AC: #3)
  - [ ] Файл: `branivo-web/public/manifest.json` (ако не съществува — създай)
  - [ ] Добави `notification` в `permissions` масива (ако има такъв)
  - [ ] Добави `icon-192x192.png` fallback в `public/` (placeholder ако няма)

- [ ] **Task 17: Widget/Component тест** (AC: #6)
  - [ ] Тест за `usePushNotifications` hook — mock `Notification.requestPermission`, `serviceWorker.ready`, `pushManager.subscribe`, API fetch
  - [ ] Тест scenarios: granted → subscription sent, denied → no API call, already subscribed → no duplicate call

- [ ] **Task 18: Makefile target**
  - [ ] Добави в `/Users/danielgrigorov/Desktop/InsurTech/Makefile`:
    ```makefile
    gen-vapid-keys: ## Генерира VAPID keys за web push (web-push library)
    	cd branivo-api && npx web-push generate-vapid-keys
    ```

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

### Completion Notes List

### File List
