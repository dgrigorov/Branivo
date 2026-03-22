# Story 8.4: System Notifications Broadcast

Status: done

## Story

As a Super Admin,
I want to send system notifications to individual tenants or all tenants at once,
So that I can communicate platform updates, incidents or important information effectively.

## Acceptance Criteria

1. **AC1 — Compose & Target:**
   Given Super Admin opens Notifications,
   When composing a message,
   Then могат да изберат: конкретен тенант или "всички тенанти"; тип: info/warning/critical

2. **AC2 — Broker In-App Banner:**
   Given notification is sent,
   When broker logs in to Dashboard,
   Then вижда system notification banner с тип индикатор (info/warning/critical)

3. **AC3 — Critical = Email + Non-Dismissible:**
   Given critical notification is sent,
   When broker receives it,
   Then получава и имейл notification освен in-app banner; notification е non-dismissible — само Super Admin може да го деактивира

4. **AC4 — Dismissible Notifications:**
   Given info или warning notification,
   When broker dismisses it,
   Then не се показва отново при следващ login (dismissed state persisted in DB)

5. **AC5 — Audit Trail:**
   Given notification is sent,
   When saved,
   Then се записва в `system_notifications` с `admin_id`, `target` (tenant_id или 'all'), `type`, `dismissible`, `message`, `sent_at`

## Tasks / Subtasks

### Backend (branivo-api)

- [x] Task 1 — DB Migration за `system_notifications` и `system_notification_dismissals` (AC: 1, 5)
  - [x] 1.1 Създай `branivo-api/src/infrastructure/database/migrations/1710000031000-CreateSystemNotifications.ts`
    ```sql
    CREATE TABLE system_notifications (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id       UUID        NOT NULL,
      target         TEXT        NOT NULL,  -- tenant_id UUID string or 'all'
      type           VARCHAR(20) NOT NULL,  -- 'info' | 'warning' | 'critical'
      message        TEXT        NOT NULL,
      dismissible    BOOLEAN     NOT NULL,
      is_active      BOOLEAN     NOT NULL DEFAULT true,
      sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_system_notifications_target ON system_notifications(target);
    CREATE INDEX idx_system_notifications_active  ON system_notifications(is_active);

    CREATE TABLE system_notification_dismissals (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id UUID        NOT NULL REFERENCES system_notifications(id) ON DELETE CASCADE,
      tenant_id       UUID        NOT NULL,
      dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(notification_id, tenant_id)
    );
    ```
  - [x] 1.2 `DOWN`: `DROP TABLE IF EXISTS system_notification_dismissals; DROP TABLE IF EXISTS system_notifications;`
  - [x] 1.3 Без ORM entity файл — всичко е raw SQL (следва паттерна на admin модула)

- [x] Task 2 — DTOs (AC: 1, 2)
  - [x] 2.1 Създай `branivo-api/src/modules/admin/dto/create-system-notification.dto.ts`
  - [x] 2.2 Създай `branivo-api/src/modules/admin/dto/system-notification-response.dto.ts`

- [x] Task 3 — `AdminNotificationRepository` (AC: 1, 2, 3, 4, 5)
  - [x] 3.1 Създай `branivo-api/src/modules/admin/repositories/admin-notification.repository.ts`
  - [x] 3.2 Constructor: `@InjectDataSource() private readonly dataSource: DataSource`
  - [x] 3.3 Метод `create(params: { adminId, target, type, message, dismissible }): Promise<SystemNotificationResponseDto>`
  - [x] 3.4 Метод `findAll(): Promise<SystemNotificationResponseDto[]>`
  - [x] 3.5 Метод `deactivate(notificationId: string): Promise<boolean>`
  - [x] 3.6 Метод `findActiveForTenant(tenantId: string): Promise<SystemNotificationResponseDto[]>`
  - [x] 3.7 Метод `dismiss(notificationId: string, tenantId: string): Promise<void>`
  - [x] 3.8 Метод `findBrokerAdminEmails(target: string): Promise<string[]>`
  - [x] 3.9 Напиши unit тест `admin-notification.repository.spec.ts` — mock `DataSource`, тестирай всеки метод

- [x] Task 4 — `sendSystemNotification` в `EmailService` (AC: 3)
  - [x] 4.1 Обнови `branivo-api/src/common/email/email.service.ts` — добави метод `sendSystemNotification`

- [x] Task 5 — `AdminNotificationService` (AC: 1, 2, 3, 4, 5)
  - [x] 5.1 Създай `branivo-api/src/modules/admin/admin-notification.service.ts`
  - [x] 5.2 Constructor инжектира: `AdminNotificationRepository`, `EmailService`
  - [x] 5.3 Метод `broadcast(dto: CreateSystemNotificationDto, adminId: string): Promise<SystemNotificationResponseDto>`
  - [x] 5.4 Метод `listAll(): Promise<SystemNotificationResponseDto[]>`
  - [x] 5.5 Метод `deactivate(notificationId: string): Promise<void>`
  - [x] 5.6 Метод `getActiveForTenant(tenantId: string): Promise<SystemNotificationResponseDto[]>`
  - [x] 5.7 Метод `dismiss(notificationId: string, tenantId: string): Promise<void>`
  - [x] 5.8 Напиши unit тест `admin-notification.service.spec.ts`

- [x] Task 6 — `AdminNotificationController` (AC: 1, 2, 3, 4)
  - [x] 6.1 Създай `branivo-api/src/modules/admin/admin-notification.controller.ts`
  - [x] 6.2 Endpoint `POST /admin/notifications` — `@Roles('super_admin')`
  - [x] 6.3 Endpoint `GET /admin/notifications` — `@Roles('super_admin')`
  - [x] 6.4 Endpoint `PATCH /admin/notifications/:id/deactivate` — `@Roles('super_admin')`
  - [x] 6.5 Endpoint `GET /admin/notifications/active` — `@Roles('broker_admin')`
  - [x] 6.6 Endpoint `POST /admin/notifications/:id/dismiss` — `@Roles('broker_admin')`
  - [x] 6.7 Разшири `AuthenticatedRequest` интерфейс с `tenantId: string`
  - [x] 6.8 Напиши интеграционен тест `admin-notification.controller.spec.ts`

- [x] Task 7 — Регистрирай в `AdminModule` (AC: 1)
  - [x] 7.1 Обнови `branivo-api/src/modules/admin/admin.module.ts`

- [x] Task 8 — Seeder за demo notification (за dev среда)
  - [x] 8.1 Обнови `branivo-api/src/infrastructure/database/seed.service.ts` — добави `seedSystemNotifications()`

### Web (branivo-web)

- [x] Task 9 — `SystemNotificationBanner` компонент в broker layout (AC: 2, 3, 4)
  - [x] 9.1 Създай `branivo-web/src/app/[locale]/(broker)/components/system-notification-banner.tsx`
  - [x] 9.2 Обнови `branivo-web/src/app/[locale]/(broker)/layout.tsx` — добави `<SystemNotificationBanner />`
  - [x] 9.3 Напиши component тест `branivo-web/src/__tests__/broker/SystemNotificationBanner.test.tsx`

- [x] Task 10 — Super Admin Notifications Page (AC: 1)
  - [x] 10.1 Създай `branivo-web/src/app/[locale]/(admin)/notifications/page.tsx`
  - [x] 10.2 Tenant selector: UUID text input с hint (MVP)
  - [x] 10.3 Напиши component тест `branivo-web/src/__tests__/admin/SystemNotificationsPage.test.tsx`

## Dev Notes

### Super Admin Context — ЗАДЪЛЖИТЕЛНО

В `AdminNotificationRepository` **няма** `tenant_id` scope на system_notifications — таблицата е cross-tenant по дизайн. Документирай с коментар (паттерн от `admin-insurer-monitor.repository.ts`):

```typescript
/**
 * Super Admin context — intentionally NO tenant_id scope.
 * system_notifications is a cross-tenant platform table.
 * This is a legitimate exception documented in project-context.md.
 */
```

### req.user.tenantId за Broker Endpoints

Broker_admin endpoints в AdminNotificationController НЕ използват `TenantContext` — четат `req.user.tenantId` от JWT payload. JWT-то за broker_admin включва `tenantId` (вижда се в `users.controller.ts:53`).

Interface pattern:
```typescript
interface AuthenticatedRequest {
  user: { userId: string; role: string; tenantId: string };
}
```

### Dismissible Logic

- `type === 'critical'` → `dismissible = false` (логиката е в Service, не в DTO)
- `type === 'info' || type === 'warning'` → `dismissible = true`
- Не се приема `dismissible` в DTO — изчислява се server-side

### Email Pattern (от EmailService)

Следвай `sendDowngradeNotification` паттерна:
- `escapeHtml()` функцията вече е в `email.service.ts` — използвай я
- `sendWithRetry()` е private метод — извиква се само от публичните методи

### Controller Route Order — КРИТИЧНО

`GET /admin/notifications/active` **ТРЯБВА** да е дефиниран преди `GET /admin/notifications/:id` (ако такъв съществува), иначе NestJS ще опита да match-не 'active' като UUID и ще хвърли грешка. В текущия дизайн нямаме `:id` GET, но все пак постави `@Get('active')` преди всички `:id` routes.

### AdminModule Registration Pattern

```typescript
// В admin.module.ts добавяй в providers array (не imports) — следва Setup на 8.3:
AdminNotificationRepository,
AdminNotificationService,
// В controllers array:
AdminNotificationController,
```
`EmailService` вече е registrиран като provider в AdminModule — не го дублирай.

### Previous Story Patterns (Story 8.3)

- Repository: raw SQL с `DataSource`, без TypeORM entity за нови admin таблици
- Service: `Logger`, try/catch за email failures (non-critical paths), `NotFoundException` / `BadRequestException` за validation failures
- Controller: `@Roles()` на ниво handler (не на ниво class) когато различните endpoints имат различни roles
- Tests: `supertest` + `NestJS TestingModule`, mock repository с `jest.fn()`, проверявай HTTP status codes

### Project Structure Notes

Нови файлове следват съществуващия admin module паттерн:
```
admin/
  admin-notification.controller.ts
  admin-notification.controller.spec.ts
  admin-notification.service.ts
  admin-notification.service.spec.ts
  dto/
    create-system-notification.dto.ts
    system-notification-response.dto.ts
  repositories/
    admin-notification.repository.ts
    admin-notification.repository.spec.ts
```

Web нови файлове:
```
(broker)/components/system-notification-banner.tsx
(admin)/notifications/page.tsx
__tests__/broker/SystemNotificationBanner.test.tsx
__tests__/admin/SystemNotificationsPage.test.tsx
```

### References

- Insurer monitor repository (super admin no-tenant pattern): `branivo-api/src/modules/admin/repositories/admin-insurer-monitor.repository.ts`
- Insurer monitor controller (role guards pattern): `branivo-api/src/modules/admin/admin-insurer-monitor.controller.ts`
- AdminModule registration: `branivo-api/src/modules/admin/admin.module.ts`
- EmailService (sendWithRetry, escapeHtml): `branivo-api/src/common/email/email.service.ts`
- Broker layout (banner placement): `branivo-web/src/app/[locale]/(broker)/layout.tsx`
- req.user.tenantId pattern: `branivo-api/src/modules/users/users.controller.ts:53`
- Story 8.3 (subscription tier — same module patterns): `_bmad-output/implementation-artifacts/8-3-subscription-tier-management.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A — implementation completed without issues.

### Completion Notes List

- Имплементирани всички 10 task-а от story спецификацията
- DB migration: `system_notifications` + `system_notification_dismissals` таблици с правилни индекси
- DTOs: `CreateSystemNotificationDto` с class-validator + `SystemNotificationResponseDto`
- Repository: raw SQL, 7 метода, Super Admin no-tenant-scope паттерн с JSDoc коментар
- Service: `broadcast()` изчислява `dismissible` server-side; critical type изпраща имейл до всички broker_admin-и с individual try/catch
- Controller: 5 endpoints, `@Roles()` на handler-ниво (mixed roles), `GET /active` преди `:id` routes
- EmailService: нов `sendSystemNotification()` метод, следва `sendDowngradeNotification` паттерна
- AdminModule: регистрирани Repository, Service, Controller
- Seeder: demo info notification за dev среда
- Web: `SystemNotificationBanner` с useQuery + useMutation + оптимистично скриване
- Web: `SystemNotificationsPage` с form, list, deactivate button, UUID tenant input
- Тестове: 34 NestJS + 9 Web = 43 общо; всички зелени
- Lint: 0 warnings, 0 errors (API + Web)

### File List

**branivo-api:**
- `src/infrastructure/database/migrations/1710000031000-CreateSystemNotifications.ts` (new)
- `src/modules/admin/dto/create-system-notification.dto.ts` (new)
- `src/modules/admin/dto/system-notification-response.dto.ts` (new)
- `src/modules/admin/repositories/admin-notification.repository.ts` (new)
- `src/modules/admin/repositories/admin-notification.repository.spec.ts` (new)
- `src/modules/admin/admin-notification.service.ts` (new)
- `src/modules/admin/admin-notification.service.spec.ts` (new)
- `src/modules/admin/admin-notification.controller.ts` (new)
- `src/modules/admin/admin-notification.controller.spec.ts` (new)
- `src/modules/admin/admin.module.ts` (modified)
- `src/common/email/email.service.ts` (modified)
- `src/infrastructure/database/seed.service.ts` (modified)

**branivo-web:**
- `src/app/[locale]/(broker)/components/system-notification-banner.tsx` (new)
- `src/app/[locale]/(broker)/layout.tsx` (modified)
- `src/app/[locale]/(admin)/notifications/page.tsx` (new)
- `src/__tests__/broker/SystemNotificationBanner.test.tsx` (new)
- `src/__tests__/admin/SystemNotificationsPage.test.tsx` (new)

**Sprint status:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
