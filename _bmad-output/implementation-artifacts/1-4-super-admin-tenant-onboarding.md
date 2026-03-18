# Story 1.4: Super Admin Tenant Onboarding

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin,
I want to invite a broker by email and guide them through Stripe Connect and КФН verification,
So that new tenants can activate and start selling without technical assistance.

## Acceptance Criteria

1. **AC1 — Broker invite by email:**
   **Given** a valid broker email и tenant slug,
   **When** Super Admin изпраща `POST /api/v1/admin/tenants/invite`,
   **Then** брокерът получава имейл с уникален onboarding link (JWT token, TTL 48h); tenant се създава с status `invited`

2. **AC2 — Stripe Connect onboarding:**
   **Given** брокерът отваря onboarding link и завършва Stripe Connect Express,
   **When** Stripe изпраща webhook `account.updated` с `charges_enabled: true`,
   **Then** tenant status → `stripe_connected`; `stripe_account_id` се записва в `tenants`

3. **AC3 — КФН верификация и активация:**
   **Given** tenant е в статус `stripe_connected` и брокерът подава валиден КФН лиценз номер,
   **When** верификацията успее,
   **Then** tenant status → `active`; Redis ключ `_system:host:{slug}.branivo.bg` → `tenantId` се записва (subdomain provisioning)

4. **AC4 — TenantContext резолвиране за нов тенант:**
   **Given** активиран tenant с subdomain `{slug}.branivo.bg`,
   **When** HTTP заявка пристига с `Host: {slug}.branivo.bg`,
   **Then** `TenantContext.getTenantId()` връща правилния `tenant_id` (Story 1.2 middleware работи коректно)

5. **AC5 — Изтекъл или невалиден onboarding link:**
   **Given** изтекъл (> 48h) или вече използван onboarding token,
   **When** брокерът опита да го използва,
   **Then** се показва ясна грешка с опция Super Admin да изпрати нова покана

6. **AC6 — Broker admin user се създава при активация:**
   **Given** tenant е активиран,
   **When** брокерът завърши onboarding flow,
   **Then** се създава `users` запис с `role = 'broker_admin'`; брокерът е подканен да зададе парола и да настрои 2FA (TOTP)

7. **AC7 — Audit log:**
   **Given** всяка промяна на tenant status,
   **When** status промяна се случи,
   **Then** се записва `audit_log` entry с `action`, `tenantId`, `userId` (super_admin), `timestamp` — immutable

8. **AC8 — Super Admin вижда всички тенанти и статуси:**
   **Given** Super Admin е логнат,
   **When** прави `GET /api/v1/admin/tenants`,
   **Then** вижда списък с тенанти + статуси (`invited`, `stripe_connected`, `active`, `suspended`) с пагинация

## Tasks / Subtasks

### Backend — Database Migrations

- [ ] **Task 1: Migration за `tenant_invitations` таблица** (AC: #1, #5)
  - [ ] Създай `branivo-api/src/infrastructure/database/migrations/1710000003000-CreateTenantInvitations.ts`
  - [ ] Колони:
    ```sql
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
    tenant_id       UUID NOT NULL REFERENCES tenants(id)
    email           VARCHAR(255) NOT NULL
    token           VARCHAR(512) NOT NULL UNIQUE    -- signed JWT token
    status          VARCHAR(50) NOT NULL DEFAULT 'pending'  -- pending | used | expired
    expires_at      TIMESTAMPTZ NOT NULL
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    deleted_at      TIMESTAMPTZ NULL
    ```
  - [ ] Индекси: `idx_tenant_invitations_token`, `idx_tenant_invitations_tenant_id`
  - [ ] **НЕ добавяй `tenant_id` RLS** — тази таблица е за Super Admin context; заявките са без tenant scope
  - [ ] Включи `down()` метод

- [ ] **Task 2: Migration за разширение на `tenants` таблица** (AC: #2, #3)
  - [ ] Създай `branivo-api/src/infrastructure/database/migrations/1710000004000-AddTenantOnboardingFields.ts`
  - [ ] Добави колони:
    ```sql
    status              VARCHAR(50) NOT NULL DEFAULT 'invited'  -- invited | stripe_connected | active | suspended
    stripe_account_id   VARCHAR(255) NULL      -- Stripe Connect Express account ID
    kfn_license         VARCHAR(100) NULL      -- КФН лиценз номер
    slug                VARCHAR(100) NOT NULL UNIQUE
    ```
  - [ ] Индекс: `idx_tenants_slug`, `idx_tenants_status`
  - [ ] Включи `down()` метод
  - [ ] **Провери дали тези полета вече съществуват** от Story 1.2 migration — ако да, пропусни дублирането

### Backend — Entities & Modules

- [ ] **Task 3: TenantInvitation entity** (AC: #1, #5)
  - [ ] Създай `branivo-api/src/modules/admin/entities/tenant-invitation.entity.ts`
  - [ ] Всички колони с `{ name: 'snake_case' }` notation
  - [ ] `status` като `string` enum стойности: `pending | used | expired`
  - [ ] Relation: `@ManyToOne(() => Tenant) @JoinColumn({ name: 'tenant_id' })`

- [ ] **Task 4: Разшири Tenant entity** (AC: #2, #3)
  - [ ] В `branivo-api/src/modules/tenants/entities/tenant.entity.ts` добави полета:
    - `status: string` — `invited | stripe_connected | active | suspended`
    - `stripeAccountId: string | null` — `@Column({ name: 'stripe_account_id', nullable: true })`
    - `kfnLicense: string | null` — `@Column({ name: 'kfn_license', nullable: true })`
    - `slug: string` — `@Column({ name: 'slug' })`
  - [ ] TypeScript strict: `!` definite assignment assertion за задължителните полета

- [ ] **Task 5: AdminModule setup** (AC: #1–#8)
  - [ ] Създай `branivo-api/src/modules/admin/admin.module.ts`
    - imports: `TenantsModule`, `TypeOrmModule.forFeature([TenantInvitation])`, `UsersModule`, `EmailModule`
    - providers: `AdminTenantsService`, `AdminTenantsRepository`, `TenantInvitationsRepository`
    - controllers: `AdminTenantsController`
  - [ ] Регистрирай в `AppModule`

### Backend — Repository Layer

- [ ] **Task 6: TenantInvitationsRepository** (AC: #1, #5)
  - [ ] Създай `branivo-api/src/modules/admin/repositories/tenant-invitations.repository.ts`
  - [ ] Extends `BaseRepository<TenantInvitation>`
  - [ ] Методи:
    - `findByToken(token: string): Promise<TenantInvitation | null>` — включи `status = 'pending'` AND `expires_at > NOW()`
    - `findPendingByEmail(email: string): Promise<TenantInvitation | null>`
    - `markAsUsed(id: string): Promise<void>` — `status = 'used'`
  - [ ] **ВАЖНО:** Тази repository **не scope-ва по tenant_id** — Super Admin контекст

- [ ] **Task 7: Разшири TenantsRepository** (AC: #2, #3, #8)
  - [ ] В `branivo-api/src/modules/tenants/tenants.repository.ts` добави:
    - `findBySlug(slug: string): Promise<Tenant | null>`
    - `findAllForAdmin(page: number, limit: number): Promise<[Tenant[], number]>` — **без tenant_id scope** (Super Admin)
    - `updateStatus(id: string, status: string): Promise<void>`
    - `updateStripeAccount(id: string, stripeAccountId: string): Promise<void>`
    - `activateTenant(id: string, kfnLicense: string): Promise<void>`

### Backend — Service Layer

- [ ] **Task 8: AdminTenantsService — Invite Flow** (AC: #1, #5)
  - [ ] Създай `branivo-api/src/modules/admin/admin-tenants.service.ts`
  - [ ] **`inviteTenant(dto: InviteTenantDto, superAdminId: string)`:**
    1. Валидирай: `slug` уникален (нов `findBySlug` заявка)
    2. Създай `tenant` запис: `{ name: dto.name, slug: dto.slug, status: 'invited' }`
    3. Генерирай JWT token: `{ sub: tenantId, email: dto.email, type: 'onboarding', exp: +48h }`; подпиши с `ONBOARDING_JWT_SECRET`
    4. Запиши `tenant_invitation`: `{ tenantId, email, token, status: 'pending', expiresAt: now+48h }`
    5. Изпрати email с `EmailService.sendOnboardingInvite(dto.email, token, dto.name)`
    6. Запиши `audit_log`: `{ tenantId, userId: superAdminId, action: 'tenant.invited', entityType: 'tenant', entityId: tenantId }`
    7. Return `{ tenantId, message: 'Invitation sent' }`
  - [ ] **`getOnboardingStatus(token: string)`:**
    1. Verify JWT signature + `type === 'onboarding'`; ако fail или expired → throw 404/400
    2. Намери invitation: `invitationsRepo.findByToken(token)` → ако `null` → 404 ("Invitation not found or expired")
    3. Return `{ tenantId, email, tenantName, tenantStatus }`
  - [ ] **`initiateStripeConnect(tenantId: string)`:**
    1. Намери tenant; ако `status !== 'invited'` → 400
    2. Създай Stripe Express account: `stripe.accounts.create({ type: 'express', country: 'BG', email: ... })`
    3. Създай account link: `stripe.accountLinks.create({ account: accountId, type: 'account_onboarding', ... })`
    4. Return `{ onboardingUrl }`

- [ ] **Task 9: AdminTenantsService — Stripe Webhook & КФН Activation** (AC: #2, #3, #7)
  - [ ] **`handleStripeAccountUpdated(event: Stripe.Event)`:**
    1. Extract account: `event.data.object as Stripe.Account`
    2. Ако `account.charges_enabled !== true` → return без промяна (Stripe изпраща множество `account.updated` events)
    3. Намери tenant по `stripe_account_id` ИЛИ по `tenants.slug` от Stripe metadata
    4. Провери idempotency: ако `tenant.status === 'stripe_connected'` → return (вече обработен)
    5. Update: `tenantsRepo.updateStripeAccount(tenantId, accountId)` + `updateStatus(tenantId, 'stripe_connected')`
    6. Запиши `audit_log`: `{ action: 'tenant.stripe_connected', ... }`
  - [ ] **`verifyKfnAndActivate(tenantId: string, kfnLicense: string, superAdminId: string)`:**
    1. Намери tenant; ако `status !== 'stripe_connected'` → 400 ("Stripe Connect not completed")
    2. Валидирай КФН формат (regex: `/^[0-9]{3,10}$/` или специфичен формат)
    3. Запиши `kfn_license` + update `status = 'active'`
    4. Provision subdomain: `redisClient.set(RedisKeyHelper.buildSystem('host', `${slug}.branivo.bg`), tenantId)`
    5. Намери invitation → `markAsUsed(invitationId)`
    6. Запиши `audit_log`: `{ action: 'tenant.activated', ... }`
    7. Emit event: `'tenant.activated'` с `{ tenantId, timestamp }` (за future NotificationsModule)

- [ ] **Task 10: AdminTenantsService — Broker User Creation** (AC: #6)
  - [ ] **`createBrokerAdminUser(tenantId: string, dto: SetupBrokerDto)`:**
    1. Хешира парола: `bcrypt.hash(dto.password, 12)` (bcrypt cost 12 — project-context #5)
    2. Валидира password policy: min 8 chars, ≥1 uppercase, ≥1 digit, ≥1 special char (class-validator @Matches)
    3. Генерира TOTP secret: `authenticator.generateSecret()` от `otplib`
    4. Криптира: `CryptoService.encrypt(secret)` → AES-256-GCM (вижте CryptoService от Story 1.3)
    5. Създава `users` запис: `{ tenantId, email, passwordHash, role: 'broker_admin', twoFaEnabled: true, twoFaSecretEnc: encryptedSecret }`
    6. Return: `{ userId, otpauthUrl }` — otpauthUrl за QR код: `authenticator.keyuri(email, 'Branivo', plainSecret)`
    7. **КРИТИЧНО:** Никога не връщай `plainSecret` след тази стъпка — само otpauthUrl за QR генериране

- [ ] **Task 11: EmailService** (AC: #1)
  - [ ] Създай `branivo-api/src/common/email/email.service.ts`
  - [ ] Имплементирай с `@nestjs-modules/mailer` или директно `nodemailer` + SendGrid транспорт
  - [ ] **`sendOnboardingInvite(email: string, token: string, tenantName: string)`:**
    - Link формат: `https://onboarding.branivo.bg/invite?token={token}`
    - Subject: "Поканен сте да се регистрирате в Branivo"
    - Fallback: ако SendGrid fail → log error + retry 3x (BullMQ `notifications` queue)
  - [ ] Конфигурация от `ConfigService.getOrThrow('SENDGRID_API_KEY')`
  - [ ] Регистрирай в `CommonModule`

### Backend — Controller Layer

- [ ] **Task 12: AdminTenantsController** (AC: #1, #3, #6, #8)
  - [ ] Създай `branivo-api/src/modules/admin/admin-tenants.controller.ts`
  - [ ] **Всички endpoints са `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('super_admin')`**
  - [ ] `POST /api/v1/admin/tenants/invite` → `AdminTenantsService.inviteTenant(dto, req.user.userId)`
    - DTO: `InviteTenantDto { name: string (IsNotEmpty); slug: string (IsNotEmpty, Matches(/^[a-z0-9-]+$/)); email: string (IsEmail) }`
  - [ ] `GET /api/v1/admin/tenants` → `AdminTenantsService.findAll(page, limit)` — пагинация
  - [ ] `GET /api/v1/admin/tenants/:id` → детайли за тенант
  - [ ] `POST /api/v1/admin/tenants/:id/stripe-connect` → `initiateStripeConnect(tenantId)`
  - [ ] `POST /api/v1/admin/tenants/:id/verify-kfn` → `verifyKfnAndActivate(tenantId, dto.kfn_license, req.user.userId)`
    - DTO: `VerifyKfnDto { kfn_license: string (IsNotEmpty) }`
  - [ ] `GET /api/v1/admin/tenants/onboarding/:token` → `getOnboardingStatus(token)` — **без auth guard** (broker access)
  - [ ] `POST /api/v1/admin/tenants/onboarding/:token/setup` → `createBrokerAdminUser(tenantId, dto)` — **без auth guard**

- [ ] **Task 13: Stripe Webhook Handler разширение** (AC: #2)
  - [ ] В `branivo-api/src/modules/payments/payments.controller.ts` (ако съществува) или нов `webhooks.controller.ts`:
  - [ ] `POST /api/v1/webhooks/stripe` — **КРИТИЧНО: raw body parsing** (вижте main.ts rawBody config)
  - [ ] Verify signature: `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`
  - [ ] Route `account.updated` event → `AdminTenantsService.handleStripeAccountUpdated(event)`
  - [ ] Idempotency: вземи `event.id` и провери Redis — ако вече обработен → return 200 (без повторна обработка)
  - [ ] **НЕ добавяй `TenantMiddleware`** за webhook endpoint — excluded в AppModule

### Backend — Guards & Decorators

- [ ] **Task 14: RolesGuard и @Roles decorator** (AC: #1, за Super Admin protection)
  - [ ] Създай `branivo-api/src/common/guards/roles.guard.ts`
    ```typescript
    @Injectable()
    export class RolesGuard implements CanActivate {
      constructor(private reflector: Reflector) {}
      canActivate(ctx: ExecutionContext): boolean {
        const roles = this.reflector.getAllAndOverride<string[]>('roles', [
          ctx.getHandler(), ctx.getClass()
        ]);
        if (!roles) return true;
        const { role } = ctx.switchToHttp().getRequest().user;
        return roles.includes(role);
      }
    }
    ```
  - [ ] Ако вече съществува от предишни stories → пропусни (проверявай!)
  - [ ] Регистрирай `RolesGuard` като global guard в `AppModule` или само в `AdminModule`
  - [ ] Създай `branivo-api/src/common/decorators/roles.decorator.ts`:
    ```typescript
    export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
    ```

### Backend — AppModule Exclusions

- [ ] **Task 15: TenantMiddleware exclusions за onboarding endpoints** (AC: #4)
  - [ ] В `branivo-api/src/app.module.ts` добави:
    ```typescript
    { path: 'api/v1/admin/tenants/onboarding/*', method: RequestMethod.GET },
    { path: 'api/v1/admin/tenants/onboarding/*', method: RequestMethod.POST },
    { path: 'api/v1/webhooks/stripe', method: RequestMethod.POST },
    ```
  - [ ] **Причина:** Onboarding endpoints се достъпват преди тенантът да е в Redis; Stripe webhooks нямат tenant context

### Next.js Web — Super Admin & Onboarding UI

- [ ] **Task 16: Super Admin Tenants Dashboard** (AC: #8)
  - [ ] Създай `branivo-web/src/app/[locale]/(admin)/tenants/page.tsx`
    - TanStack Query: `['admin', 'tenants', page]` — standard staleTime (не 0, тъй като не са quote данни)
    - Показвай: tenant name, slug, status badge (цветово кодиран), created_at, action buttons
    - Status badges: `invited` → жълто; `stripe_connected` → синьо; `active` → зелено; `suspended` → червено
    - Invite button → открива modal с форма

- [ ] **Task 17: Invite Tenant Modal** (AC: #1)
  - [ ] Създай `branivo-web/src/components/admin/invite-tenant-modal.tsx`
    - React Hook Form + Zod validation
    - Fields: `name`, `slug` (auto-generated от name, editable), `email`
    - Slug preview: `{slug}.branivo.bg`
    - Submit → `POST /api/v1/admin/tenants/invite` → success message

- [ ] **Task 18: Broker Onboarding Page** (AC: #1–#6)
  - [ ] Създай `branivo-web/src/app/[locale]/onboarding/page.tsx`
    - Query param: `?token=...`
    - Step 1: Validate token → `GET /api/v1/admin/tenants/onboarding/{token}` → показвай tenant name + status
    - Step 2 (ако `status === 'invited'`): Stripe Connect Express button → `POST .../stripe-connect` → redirect към Stripe URL
    - Step 3 (ако `status === 'stripe_connected'`): КФН лиценз форма → `POST .../verify-kfn`
    - Step 4 (ако `status === 'active'`): Set password + 2FA setup → показвай QR код за TOTP app
    - Error state: изтекъл токен с "Свържете се с вашия акаунт мениджър за нова покана"

### Tests

- [ ] **Task 19: Unit тестове за AdminTenantsService** (AC: #1–#8)
  - [ ] `branivo-api/src/modules/admin/admin-tenants.service.spec.ts`
  - [ ] Test: `inviteTenant` → tenant created + invitation saved + email sent
  - [ ] Test: `inviteTenant` с duplicate slug → 400 Conflict
  - [ ] Test: `getOnboardingStatus` с валиден token → returns tenant info
  - [ ] Test: `getOnboardingStatus` с изтекъл token → 404
  - [ ] Test: `getOnboardingStatus` с използван token (status='used') → 404
  - [ ] Test: `handleStripeAccountUpdated` с `charges_enabled: true` → status `stripe_connected`
  - [ ] Test: `handleStripeAccountUpdated` с `charges_enabled: false` → no status change
  - [ ] Test: `handleStripeAccountUpdated` idempotency → second call → no duplicate update
  - [ ] Test: `verifyKfnAndActivate` с `status !== 'stripe_connected'` → 400
  - [ ] Test: `verifyKfnAndActivate` успешно → `status = 'active'` + Redis key записан
  - [ ] Test: `createBrokerAdminUser` → user created с bcrypt hash + TOTP secret encrypted
  - [ ] Test: audit_log записан при всяка status промяна

- [ ] **Task 20: Unit тестове за TenantInvitationsRepository** (AC: #1, #5)
  - [ ] `branivo-api/src/modules/admin/repositories/tenant-invitations.repository.spec.ts`
  - [ ] Test: `findByToken` с валиден pending token → returns invitation
  - [ ] Test: `findByToken` с expired token (expiresAt в миналото) → returns null
  - [ ] Test: `findByToken` с used token → returns null
  - [ ] Test: `markAsUsed` → status = 'used'

- [ ] **Task 21: Integration тест за AdminTenantsController** (AC: #1, #8)
  - [ ] `branivo-api/src/modules/admin/admin-tenants.controller.spec.ts`
  - [ ] Test: `POST /admin/tenants/invite` без auth → 401
  - [ ] Test: `POST /admin/tenants/invite` с broker_admin role → 403
  - [ ] Test: `POST /admin/tenants/invite` с super_admin role → 201
  - [ ] Test: `GET /admin/tenants` с super_admin → 200 + paginated list
  - [ ] Test: `GET /admin/tenants/onboarding/:token` без auth → 200 (public endpoint)
  - [ ] Test: `POST /api/v1/webhooks/stripe` без valid signature → 400
  - [ ] Test: response НИКОГА не съдържа `stripe_webhook_secret` или sensitive data

- [ ] **Task 22: Component тест за Broker Onboarding Page** (AC: #1–#6)
  - [ ] `branivo-web/src/__tests__/onboarding/page.test.tsx`
  - [ ] Test: renders tenant name при валиден token
  - [ ] Test: показва Stripe Connect button при `status === 'invited'`
  - [ ] Test: показва КФН форма при `status === 'stripe_connected'`
  - [ ] Test: показва error message при невалиден/изтекъл токен

## Dev Notes

### Tenant Status State Machine

```
invited → stripe_connected → active → suspended
              ↑                          ↓
         (Stripe webhook)          (Super Admin)
```

- `invited`: Tenant record created; invitation email sent
- `stripe_connected`: Stripe webhook `account.updated` с `charges_enabled: true` получен
- `active`: КФН verified + subdomain provisioned
- `suspended`: Super Admin деактивира (Story 1.6 scope)

**КРИТИЧНО:** Проверявай текущия статус преди всяка status промяна. Stripe изпраща множество `account.updated` events — само `charges_enabled: true` ни интересува.

### Subdomain Provisioning — Redis Key

При активация (AC3), запиши Redis ключа ИДентично с TenantMiddleware конвенцията от Story 1.2:

```typescript
// От Story 1.2 Dev Notes — RedisKeyHelper.buildSystem('host', hostname)
// = `_system:host:{hostname}` → tenantId
await redisClient.set(
  `_system:host:${tenant.slug}.branivo.bg`,
  tenantId,
  'EX', 300  // TTL 5 минути — идентично с tenant config cache
);
// ВАЖНО: При middleware miss, той прави DB lookup и re-кешира
// Затова не е нужно permanent key — 5 min TTL е достатъчен
```

**DNS:** В dev среда, `{slug}.branivo.bg` DNS записи НЕ са реални — используваме `/etc/hosts` или `Host` header директно при тестване. Реалното DNS provisioning (Route 53) е инфраструктурна задача извън scope на тази story.

### Onboarding JWT vs Auth JWT

| | Auth JWT (Story 1.3) | Onboarding JWT (Story 1.4) |
|--|--|--|
| Secret | `JWT_SECRET` | `ONBOARDING_JWT_SECRET` (отделен!) |
| TTL | 15 min (access) / 30 days (refresh) | 48 hours |
| Purpose | API access | One-time onboarding flow |
| Payload | `{ sub: userId, tid: tenantId, role, jti }` | `{ sub: tenantId, email, type: 'onboarding' }` |
| Stored in Redis? | Yes (refresh + blacklist) | No (check `tenant_invitations` table) |

**Защо отделен secret:** Ако `JWT_SECRET` изтече, onboarding links остават безопасни и обратното.

### Stripe Connect Express — Ключови детайли

```typescript
// Създаване на Stripe account (в initiateStripeConnect)
const account = await stripe.accounts.create({
  type: 'express',
  country: 'BG',
  email: tenantEmail,
  metadata: { tenant_id: tenantId, slug: tenant.slug },
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
});

// Account Link за onboarding redirect
const accountLink = await stripe.accountLinks.create({
  account: account.id,
  refresh_url: `${FRONTEND_URL}/onboarding?token=${invitationToken}&stripe_retry=true`,
  return_url: `${FRONTEND_URL}/onboarding?token=${invitationToken}&stripe_complete=true`,
  type: 'account_onboarding',
});
// return accountLink.url — redirect broker към това URL
```

**Idempotency при Stripe webhook:**
```typescript
async handleStripeAccountUpdated(event: Stripe.Event) {
  // Idempotency check в Redis
  const processedKey = `_system:stripe:processed:${event.id}`;
  const alreadyProcessed = await redis.exists(processedKey);
  if (alreadyProcessed) return; // duplicate webhook — skip
  await redis.set(processedKey, '1', 'EX', 86400); // TTL 24h
  // ... process event
}
```

### Broker User Creation — 2FA Setup Flow

Story 1.3 имплементира 2FA **verify** flow. Story 1.4 имплементира 2FA **setup** flow:

```typescript
// При createBrokerAdminUser:
import { authenticator } from 'otplib'; // вече инсталиран от Story 1.3

const secret = authenticator.generateSecret(); // 20 bytes base32
const otpauthUrl = authenticator.keyuri(email, 'Branivo', secret);
const encryptedSecret = cryptoService.encrypt(secret); // AES-256-GCM

// Запис в users:
await usersRepo.save({
  tenantId,
  email,
  passwordHash: await bcrypt.hash(password, 12),
  role: 'broker_admin',
  twoFaEnabled: true,           // задължително active от старт
  twoFaSecretEnc: encryptedSecret,
});

// КРИТИЧНО: Върни otpauthUrl САМО веднъж при setup
// Клиентът показва QR код → Broker сканира с Google Authenticator
// След това plain secret се изтрива от паметта
return { userId, otpauthUrl };
```

### Redis Key Conventions за Admin/Onboarding

```
_system:host:{slug}.branivo.bg       → tenantId (provisioned при activation, TTL 5 min)
_system:stripe:processed:{event.id}  → '1' (webhook idempotency, TTL 24h)
```

Тези ключове използват `_system:` prefix (Super Admin context, без tenant_id scope) — идентично с конвенцията от Story 1.2.

### Tenant таблица — Статус на миграциите

Story 1.2 вероятно е създала `tenants` таблицата с базови полета (`id`, `name`, `created_at`, и т.н.). **Преди Task 2**, прочети внимателно `1710000001000-*` migration файловете и провери кои колони вече съществуват. Добавяй само липсващите.

**Очакван резултат след тази story:**
```sql
tenants: id, name, slug, status, stripe_account_id, kfn_license, created_at, updated_at, deleted_at
```

### Project Structure Notes

**Нови файлове:**
```
branivo-api/src/modules/admin/
├── admin.module.ts
├── admin-tenants.controller.ts
├── admin-tenants.service.ts
├── repositories/
│   └── tenant-invitations.repository.ts
├── entities/
│   └── tenant-invitation.entity.ts
└── dto/
    ├── invite-tenant.dto.ts
    ├── verify-kfn.dto.ts
    ├── setup-broker.dto.ts
    └── onboarding-status-response.dto.ts

branivo-api/src/common/email/
└── email.service.ts

branivo-api/src/common/guards/
└── roles.guard.ts               (ако не съществува от Story 1.3)

branivo-api/src/common/decorators/
└── roles.decorator.ts           (ако не съществува от Story 1.3)

branivo-api/src/infrastructure/database/migrations/
├── 1710000003000-CreateTenantInvitations.ts
└── 1710000004000-AddTenantOnboardingFields.ts

branivo-web/src/app/[locale]/(admin)/tenants/
└── page.tsx

branivo-web/src/app/[locale]/onboarding/
└── page.tsx

branivo-web/src/components/admin/
└── invite-tenant-modal.tsx
```

**Модифицирани файлове:**
```
branivo-api/src/app.module.ts              # добави TenantMiddleware exclusions + AdminModule
branivo-api/src/modules/tenants/entities/tenant.entity.ts  # добави нови полета
branivo-api/src/modules/tenants/tenants.repository.ts       # добави нови методи
branivo-api/.env.example                   # добави ONBOARDING_JWT_SECRET, SENDGRID_API_KEY, STRIPE_WEBHOOK_SECRET
```

### Архитектурни ограничения

1. **AdminModule НЕ инжектира `TenantContext`** — Super Admin работи извън tenant scope. Всички репозитории в `AdminModule` правят заявки **без** `tenant_id` WHERE clause. Това е единственото легитимно изключение.

2. **Stripe webhook endpoint** трябва да бъде excluded от `TenantMiddleware` (Task 15) и да ползва `express.raw()` за raw body parsing — задължително за Stripe signature verification (от architecture.md#Stripe webhook).

3. **`RolesGuard` зависи от `JwtAuthGuard`** — трябва да е след него в guards chain. Ред: `@UseGuards(JwtAuthGuard, RolesGuard)`.

4. **Slug валидация:** само `[a-z0-9-]` — предотвратява DNS injection и XSS в subdomain. Enforce в DTO + DB unique constraint.

### References

- [Source: epics.md#Story 1.4] — Acceptance Criteria и user story statement
- [Source: architecture.md#Authentication & Security] — JWT TTL, bcrypt cost 12, otplib 2FA setup
- [Source: architecture.md#API & Communication Patterns] — Stripe webhook raw body, idempotency
- [Source: architecture.md#Project Structure] — admin/ module path, naming conventions
- [Source: project-context.md#1. Tenant Safety] — Super Admin е единственият контекст без tenant scope
- [Source: project-context.md#5. Security Rules] — bcrypt cost 12, password policy, AES-256-GCM
- [Source: project-context.md#2. Payment Safety] — Stripe webhook sig verify
- [Source: story-1-3.md#Dev Notes#TOTP с otplib] — `authenticator.generateSecret()`, `keyuri()` usage
- [Source: story-1-3.md#Dev Notes#AES-256-GCM] — CryptoService.encrypt/decrypt patterns
- [Source: story-1-2.md#Dev Notes#Redis Key Conventions] — `_system:host:{hostname}` format
- [Source: story-1-3.md#Dev Notes#Redis Key Conventions] — RedisKeyHelper.buildSystem pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
