---
title: 'GDPR Consent — Inline Registration'
slug: 'gdpr-consent-inline-registration'
created: '2026-03-25'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [NestJS, TypeORM, PostgreSQL, Next.js, Flutter, BLoC, Dio]
files_to_modify:
  - branivo-api/src/infrastructure/database/migrations/1710000037000-AddGdprConsentToEndClients.ts
  - branivo-api/src/infrastructure/database/migrations/1710000038000-AddPrivacyFieldsToTenantConfigs.ts
  - branivo-api/src/modules/clients/entities/end-client.entity.ts
  - branivo-api/src/modules/clients/dto/request-otp.dto.ts
  - branivo-api/src/modules/clients/repositories/end-client.repository.ts
  - branivo-api/src/modules/clients/client-auth.service.ts
  - branivo-api/src/modules/clients/client-auth.service.spec.ts
  - branivo-api/src/modules/tenants/entities/tenant-config.entity.ts
  - branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts
  - branivo-api/src/modules/tenants/tenants.service.ts
  - branivo-web/src/app/[locale]/(client)/quotes/components/inline-registration.tsx
  - branivo_app/lib/features/registration/bloc/registration_event.dart
  - branivo_app/lib/features/registration/bloc/registration_bloc.dart
  - branivo_app/lib/features/registration/data/repositories/client_auth_repository.dart
  - branivo_app/lib/features/registration/screens/registration_screen.dart
code_patterns:
  - TypeORM upsert via configRepo.upsert({ tenantId, ...data }, { conflictPaths })
  - Redis cache invalidation via redis.del(RedisKeyHelper.build(tenantId, config, tenant))
  - Direct class instantiation in unit tests (no TestingModule)
  - BLoC pattern — event carries all data; bloc calls repository
  - BFF routes are raw body passthrough — no changes needed for new JSON fields
test_patterns:
  - NestJS unit: jest.fn() mocks, direct new ServiceClass(...mocks)
  - Flutter: bloc_test library with expect([states])
---

# Tech-Spec: GDPR Consent — Inline Registration

**Created:** 2026-03-25

## Overview

### Problem Statement

Story 3.2 колектира телефонен номер (лични данни) без explicit consent и privacy notice при inline регистрация. Нарушение на GDPR Чл. 13 — изпращането на SMS вече е обработка на лични данни, затова consent трябва да е ПРЕДИ `requestOtp`. Тъй като платформата е white-label, брокерът е действителният администратор — privacy notice трябва да е per-tenant и да съдържа юридическото наименование на брокера.

### Solution

1. Нова migration: `consent_given_at` + `consent_withdrawn_at` в `end_clients`
2. Нова migration: `privacy_policy_url` + `legal_name` в `tenant_configs`
3. `RequestOtpDto` — задължително `consent_given: boolean`; backend хвърля 400 ако false
4. `ClientAuthService.requestOtp()` — записва Redis key `client_otp_consent:{tenantId}:{phone}` = ISO timestamp (TTL 300s)
5. `ClientAuthService.verifyOtp()` — чете Redis consent key и го подава на `findOrCreate`
6. Нов `EndClientRepository.updateConsentTimestamp()` + разширен `findOrCreate(consentGivenAt?)` — пълно покритие за нови и съществуващи клиенти
6. `TenantConfigResponseDto` — ново поле `legal: { legalName, privacyPolicyUrl }`
7. `InlineRegistration.tsx` — checkbox "Съгласявам се с [Политика за поверителност] на [legalName ?? name]"; submit disabled без check; само при initial phone entry
8. `_PhoneEntryForm` (Flutter) — аналогичен checkbox с WCAG semanticsLabel; `RequestOtpEvent` носи `consentGiven: bool`

### Scope

**In Scope:**
- DB migration `1710000037000`: `consent_given_at`, `consent_withdrawn_at` в `end_clients`
- DB migration `1710000038000`: `privacy_policy_url`, `legal_name` в `tenant_configs`
- `EndClient` entity + `TenantConfig` entity update
- `RequestOtpDto` + `ClientAuthService` guard + нов `EndClientRepository.updateConsentTimestamp()`
- `TenantConfigResponseDto` + `TenantsService.getTenantConfig()` update
- `InlineRegistration.tsx` — checkbox UI + privacy policy link + graceful null fallback
- Flutter: `registration_event.dart`, `registration_bloc.dart`, `client_auth_repository.dart`, `registration_screen.dart`
- Нови unit тестове: `consent_given: false → 400`; consent timestamp записан

**Out of Scope:**
- Съдържание/хостинг на privacy policy страница
- GDPR data access/deletion endpoints (consent_withdrawn_at UI)
- Retroactive consent за съществуващи потребители
- Terms of Service checkbox

> ⚠️ **GDPR Compliance Blocker (F6 — GDPR Чл. 7(3)):** Оттеглянето на consent трябва да е също толкова лесно, колкото даването му. `consent_withdrawn_at` колоната е добавена, но без UI/endpoint потребителят не може да оттегли consent — нарушение на Чл. 7(3). **Платформата не може да отиде на production без отделна story за consent withdrawal** (напр. "Изтрий профила ми" / "Оттегли съгласието си" в настройките на клиента). Продукт трябва да track-не тази story преди go-live.

## Context for Development

### Codebase Patterns

**Backend:**
- `TenantConfig` upsert: `configRepo.upsert({ tenantId, ...data }, { conflictPaths: ['tenantId'] })`
- `TenantsService.getTenantConfig()` build DTO от `tenant.config?.field ?? null`; кешира с `RedisKeyHelper.build(tenantId, 'config', 'tenant')` TTL 300s
- При update на `tenant_configs` — `redis.del(RedisKeyHelper.build(tenantId, 'config', 'tenant'))` задължително
- Unit тестове: `new ClientAuthService(mockRedis, mockRepo, mockSms, mockJwt, mockConfig)` — без TestingModule

**Next.js BFF:**
- `request-otp/route.ts` — raw body passthrough (`request.text()` → forward as-is). `consent_given` се forward-ва автоматично. **Без промени.**

**Flutter:**
- BLoC: event носи всички данни → bloc извиква repository
- `ClientAuthRepository.requestOtp()` изпраща POST с `{'phone_number': phoneNumber}` — добавяме `'consent_given': consentGiven`
- `ResendOtpEvent` → repository изпраща `consentGiven: true` имплицитно (consent вече даден)
- Checkbox само в `_PhoneEntryForm`; `_OtpEntryForm` не се засяга

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `branivo-api/src/modules/clients/client-auth.service.ts` | requestOtp() — добавяме consent guard и call към updateConsentTimestamp |
| `branivo-api/src/modules/clients/client-auth.service.spec.ts` | Тест patterns — direct instantiation; добавяме mock + тестове |
| `branivo-api/src/modules/clients/repositories/end-client.repository.ts` | Нов updateConsentTimestamp() метод |
| `branivo-api/src/modules/clients/entities/end-client.entity.ts` | Добавяме consentGivenAt, consentWithdrawnAt |
| `branivo-api/src/modules/clients/dto/request-otp.dto.ts` | Добавяме consent_given: boolean с @Transform |
| `branivo-api/src/modules/tenants/entities/tenant-config.entity.ts` | Добавяме privacyPolicyUrl, legalName |
| `branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts` | Добавяме legal: { legalName, privacyPolicyUrl } |
| `branivo-api/src/modules/tenants/tenants.service.ts` | getTenantConfig() — populate legal fields |
| `branivo-api/src/modules/tenants/tenants.repository.ts` | upsertBranding() pattern — reference |
| `branivo-api/src/infrastructure/database/migrations/1710000006000-AddBrandingToTenantConfigs.ts` | Migration pattern за tenant_configs |
| `branivo-api/src/infrastructure/database/migrations/1710000009000-CreateEndClientsTable.ts` | Reference за end_clients schema |
| `branivo-web/src/app/[locale]/(client)/quotes/components/inline-registration.tsx` | Добавяме consent checkbox |
| `branivo_app/lib/features/registration/bloc/registration_event.dart` | RequestOtpEvent + consentGiven |
| `branivo_app/lib/features/registration/bloc/registration_bloc.dart` | _onRequestOtp + _onResendOtp |
| `branivo_app/lib/features/registration/data/repositories/client_auth_repository.dart` | requestOtp() + consentGiven param |
| `branivo_app/lib/features/registration/screens/registration_screen.dart` | _PhoneEntryForm checkbox |

### Technical Decisions

1. **`consent_given_at` при `requestOtp`** — изпращането на SMS е обработка на лични данни (GDPR)
2. **Always update `consent_given_at`** — пазим последния consent; политиката може да се е сменила
3. **`consent_withdrawn_at` колона без UI** — предвиждаме GDPR Чл. 7(3); NULL default; само колоната
4. **`legal_name` в `tenant_configs`** — consistent с branding pattern; fallback → `tenant.name` (F3 — `legalName` в DTO никога не е null; UI винаги показва юридическо наименование)
5. **Null `privacy_policy_url`** — скрива линка gracefully; текстът остава без него
6. **BFF routes непроменени** — raw passthrough forward-ва `consent_given` автоматично
7. **`ResendOtpEvent` → `consentGiven: true`** — в resend phase consent вече е даден
8. **Redis key `client_otp_consent:{tenantId}:{phone}`** (TTL 300s) — записан **ПРЕДИ** `sendOtp` при `requestOtp`; прочетен при `verifyOtp` → подаден на `findOrCreate`; гарантира `consent_given_at` за нови клиенти. F1: провал при запис = 500, SMS не се изпраща. F5: ако ключът е изтекъл при `verifyOtp` (важдост на OTP прозореца), `consentGivenAt` fallback-ва на `new Date()` — consent е бил даден, просто Redis ключът е изтекъл.
9. **`updateConsentTimestamp(phone, tenantId)`** — update-ва съществуващи клиенти при `requestOtp`; `findOrCreate(phone, tenantId, consentGivenAt?)` записва consent при нови клиенти при `verifyOtp`
10. **`@Transform` за `consent_given`** — `({ value }) => value === true || value === 'true'`
11. **Redis rolling deploy** — `legal` поле може да липсва 5 мин; optional chaining навсякъде
12. **Flutter `_submit()` guard** — `if (phone.isEmpty || !_consentGiven) return;`
13. **Flutter `Checkbox` `semanticsLabel`** — WCAG 2.1 AA

## Implementation Plan

### Tasks

**Backend — Migrations (изпълни първо)**

- [ ] **Task 1: Migration `1710000037000-AddGdprConsentToEndClients.ts`**
  - Файл: `branivo-api/src/infrastructure/database/migrations/1710000037000-AddGdprConsentToEndClients.ts`
  - Действие:
    ```sql
    ALTER TABLE "end_clients"
      ADD COLUMN IF NOT EXISTS "consent_given_at"    TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "consent_withdrawn_at" TIMESTAMPTZ NULL;
    ```
  - `down()`: DROP COLUMN IF EXISTS и двете колони

- [ ] **Task 2: Migration `1710000038000-AddPrivacyFieldsToTenantConfigs.ts`**
  - Файл: `branivo-api/src/infrastructure/database/migrations/1710000038000-AddPrivacyFieldsToTenantConfigs.ts`
  - Действие:
    ```sql
    ALTER TABLE "tenant_configs"
      ADD COLUMN IF NOT EXISTS "privacy_policy_url" VARCHAR(500) NULL,
      ADD COLUMN IF NOT EXISTS "legal_name"         VARCHAR(255) NULL;
    ```
  - `down()`: DROP COLUMN IF EXISTS и двете колони

**Backend — Entities**

- [ ] **Task 3: Обнови `EndClient` entity**
  - Файл: `branivo-api/src/modules/clients/entities/end-client.entity.ts`
  - Добави след `phoneVerified`:
    ```typescript
    @Column({ name: 'consent_given_at', type: 'timestamptz', nullable: true })
    consentGivenAt!: Date | null;

    @Column({ name: 'consent_withdrawn_at', type: 'timestamptz', nullable: true })
    consentWithdrawnAt!: Date | null;
    ```

- [ ] **Task 4: Обнови `TenantConfig` entity**
  - Файл: `branivo-api/src/modules/tenants/entities/tenant-config.entity.ts`
  - Добави след `brandFont`:
    ```typescript
    @Column({ name: 'privacy_policy_url', type: 'varchar', length: 500, nullable: true })
    privacyPolicyUrl!: string | null;

    @Column({ name: 'legal_name', type: 'varchar', length: 255, nullable: true })
    legalName!: string | null;
    ```

**Backend — DTO & Service & Repository**

- [ ] **Task 5: Обнови `RequestOtpDto`**
  - Файл: `branivo-api/src/modules/clients/dto/request-otp.dto.ts`
  - Добави:
    ```typescript
    import { Transform } from 'class-transformer';
    import { IsBoolean } from 'class-validator';

    // F7: handle true / 'true' / 1 / '1' — form-data и JSON boolean variants
    @Transform(({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === 1 || value === '1',
    )
    @IsBoolean({ message: 'Трябва да приемете политиката за поверителност' })
    consent_given!: boolean;
    ```

- [ ] **Task 6: Обнови `EndClientRepository` — нов метод + разширен `findOrCreate`**
  - Файл: `branivo-api/src/modules/clients/repositories/end-client.repository.ts`
  - Добави нов метод след `markPhoneVerified`:
    ```typescript
    async updateConsentTimestamp(phoneNumber: string, tenantId: string): Promise<void> {
      await this.setTenantSession();
      await this.endClientRepo.update(
        { phoneNumber, tenantId, deletedAt: IsNull() },
        { consentGivenAt: new Date(), updatedAt: new Date() },
      );
    }
    ```
  - Разшири `findOrCreate` сигнатурата:
    ```typescript
    async findOrCreate(
      phoneNumber: string,
      tenantId: string,
      consentGivenAt?: Date,
    ): Promise<{ client: EndClient; isNew: boolean }>
    ```
  - F4 — ползвай атомарен upsert вместо SELECT + INSERT-or-skip, за да избегнеш race condition при паралелни заявки:
    ```typescript
    // Atomic upsert — conflict на (phone_number, tenant_id, deleted_at IS NULL)
    const result = await this.endClientRepo
      .createQueryBuilder()
      .insert()
      .into(EndClient)
      .values({
        phoneNumber,
        tenantId,
        consentGivenAt: consentGivenAt ?? null,
        // ... останалите defaults
      })
      .orUpdate(
        ['consent_given_at', 'updated_at'],
        ['phone_number', 'tenant_id'],
        { skipUpdateIfNoValuesChanged: true },
      )
      .returning('*')
      .execute();
    const isNew = result.raw[0].created_at === result.raw[0].updated_at;
    ```
  - Алтернатива (по-проста): `endClientRepo.upsert({ phoneNumber, tenantId, consentGivenAt }, { conflictPaths: ['phoneNumber', 'tenantId'] })` — съвместима с TypeORM upsert pattern вече използван в codebase-а
  - Бележка: `updateConsentTimestamp` засяга съществуващи клиенти при `requestOtp`; `findOrCreate` записва consent при нови клиенти при `verifyOtp` — пълно покритие

- [ ] **Task 7: Обнови `ClientAuthService` — consent guard + Redis consent key**
  - Файл: `branivo-api/src/modules/clients/client-auth.service.ts`
  - Добави константа: `const CONSENT_KEY_TTL = OTP_TTL_SECONDS; // 300s`
  - Промени `requestOtp` сигнатурата: `async requestOtp(phoneNumber, tenantId, consentGiven: boolean)`
  - Добави в началото (преди Redis rate check):
    ```typescript
    if (!consentGiven) {
      throw new BadRequestException('Трябва да приемете политиката за поверителност');
    }
    ```
  - **ПРЕДИ** `this.smsService.sendOtp(...)` добави (F1 — consent recording е задължително; провал = 500, не silent):
    ```typescript
    const consentKey = `client_otp_consent:${tenantId}:${phoneNumber}`;
    const consentIsoStr = new Date().toISOString();
    await this.redis.setex(consentKey, CONSENT_KEY_TTL, consentIsoStr);
    await this.endClientRepository.updateConsentTimestamp(phoneNumber, tenantId);
    ```
  - Ако `redis.setex` или `updateConsentTimestamp` хвърлят — грешката се propagate-ва нагоре като 500 (InternalServerErrorException); SMS не се изпраща. Не слагай try/catch около тези редове.
  - Запазвай `sendOtp` след двата awaits по-горе
  - В `verifyOtp` — след Redis get на OTP, добави (F5 — TTL race guard: consent key може да изтече малко преди OTP key):
    ```typescript
    const consentKey = `client_otp_consent:${tenantId}:${phoneNumber}`;
    const consentIso = await this.redis.get(consentKey);
    // Fallback: ако consent key е изтекъл (край на 300s прозорец) но OTP е валиден,
    // ползваме текущото време — consent е бил даден при requestOtp.
    const consentGivenAt = consentIso ? new Date(consentIso) : new Date();
    ```
  - Промени `findOrCreate` извикването:
    ```typescript
    const { client, isNew } = await this.endClientRepository.findOrCreate(
      phoneNumber, tenantId, consentGivenAt,
    );
    ```
  - Добави `BadRequestException` към imports от `@nestjs/common`

- [ ] **Task 8: Обнови `ClientAuthController.requestOtp()`**
  - Файл: `branivo-api/src/modules/clients/client-auth.controller.ts`
  - Промени извикването:
    ```typescript
    const { expires_in } = await this.clientAuthService.requestOtp(
      dto.phone_number,
      tenantId,
      dto.consent_given,
    );
    ```

- [ ] **Task 9: Обнови `TenantConfigResponseDto`**
  - Файл: `branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts`
  - Добави `legal` поле:
    ```typescript
    legal!: {
      legalName: string | null;
      privacyPolicyUrl: string | null;
    };
    ```

- [ ] **Task 9.5: Добави URL валидация за `privacy_policy_url` (F2)**
  - Файл: `branivo-api/src/modules/tenants/dto/update-tenant-config.dto.ts` (или `update-branding.dto.ts` — провери съществуващия DTO за branding update)
  - Добави в DTO-то за update на tenant config:
    ```typescript
    import { IsUrl, IsOptional } from 'class-validator';

    @IsOptional()
    @IsUrl({ require_protocol: true }, { message: 'privacy_policy_url трябва да е валиден HTTPS URL' })
    privacy_policy_url?: string;

    @IsOptional()
    legal_name?: string;
    ```
  - Без тази валидация произволен string (напр. `javascript:void(0)`) може да се запише и да се рендира като `href` — XSS вектор
  - Ако update DTO вече съществува → добави само двете полета; не създавай нов файл

- [ ] **Task 10: Обнови `TenantsService.getTenantConfig()`**
  - Файл: `branivo-api/src/modules/tenants/tenants.service.ts`
  - Добави `legal` в DTO mapping (F3 — fallback към `tenant.name` за да има винаги видимо юридическо наименование):
    ```typescript
    legal: {
      legalName: tenant.config?.legalName ?? tenant.name,
      privacyPolicyUrl: tenant.config?.privacyPolicyUrl ?? null,
    },
    ```

**Backend — Тестове**

- [ ] **Task 11: Обнови `client-auth.service.spec.ts`**
  - Файл: `branivo-api/src/modules/clients/client-auth.service.spec.ts`
  - Добави mock: `mockEndClientRepo.updateConsentTimestamp = jest.fn().mockResolvedValue(undefined);`
  - Добави `consentGivenAt: null` в `makeClient()` helper
  - Нов тест в `describe('requestOtp')`:
    ```typescript
    it('should throw BadRequestException when consent_given is false', async () => {
      await expect(service.requestOtp(PHONE, TENANT_ID, false))
        .rejects.toThrow(BadRequestException);
      expect(mockSmsService.sendOtp).not.toHaveBeenCalled();
    });
    ```
  - Нов тест:
    ```typescript
    it('should call updateConsentTimestamp after sending OTP', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');
      mockSmsService.sendOtp.mockResolvedValue(undefined);
      mockEndClientRepo.updateConsentTimestamp.mockResolvedValue(undefined);

      await service.requestOtp(PHONE, TENANT_ID, true);

      expect(mockEndClientRepo.updateConsentTimestamp).toHaveBeenCalledWith(PHONE, TENANT_ID);
    });
    ```
  - Обнови съществуващите тестове: `service.requestOtp(PHONE, TENANT_ID)` → `service.requestOtp(PHONE, TENANT_ID, true)`

**Next.js Web**

- [ ] **Task 12: Обнови `InlineRegistration` компонент**
  - Файл: `branivo-web/src/app/[locale]/(client)/quotes/components/inline-registration.tsx`
  - Добави state: `const [consentGiven, setConsentGiven] = useState(false);`
  - Добави props: `privacyPolicyUrl?: string | null; legalName?: string | null;` към `InlineRegistrationProps`
  - В `handlePhoneSubmit` — добави guard:
    ```typescript
    if (!consentGiven) {
      setErrorMsg('Трябва да приемете политиката за поверителност');
      return;
    }
    ```
  - Промени `requestOtp(phone)` → `requestOtp(phone, { consent_given: true })`; обнови `useClientAuth` hook
  - Добави checkbox UI в phone form (над submit бутона):
    ```tsx
    <div className="flex items-start gap-2">
      <input
        id="reg-consent"
        type="checkbox"
        checked={consentGiven}
        onChange={(e) => setConsentGiven(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0"
        required
      />
      <label htmlFor="reg-consent" className="text-sm text-gray-600">
        Съгласявам се с{' '}
        {privacyPolicyUrl ? (
          <a href={privacyPolicyUrl} target="_blank" rel="noopener noreferrer"
             className="text-blue-600 underline">
            политиката за поверителност
          </a>
        ) : (
          'политиката за поверителност'
        )}{' '}
        на {legalName ?? 'брокера'}
      </label>
    </div>
    ```
  - Submit бутонът: `disabled={isLoading || !phone || !consentGiven}`
  - Бележка: Checkbox се показва САМО в phone form фазата — не в OTP entry фазата

- [ ] **Task 13: Обнови `useClientAuth` hook**
  - Файл: `branivo-web/src/lib/hooks/use-client-auth.ts`
  - Промени `requestOtp(phone: string)` → `requestOtp(phone: string, opts: { consent_given: boolean })`
  - Добави `consent_given: opts.consent_given` към POST body

**Flutter**

- [ ] **Task 14: Обнови `registration_event.dart`**
  - Файл: `branivo_app/lib/features/registration/bloc/registration_event.dart`
  - Добави `consentGiven` към `RequestOtpEvent`:
    ```dart
    class RequestOtpEvent extends RegistrationEvent {
      RequestOtpEvent({required this.phoneNumber, required this.consentGiven});
      final String phoneNumber;
      final bool consentGiven;
    }
    ```
  - `ResendOtpEvent` остава непроменен

- [ ] **Task 15: Обнови `registration_bloc.dart`**
  - Файл: `branivo_app/lib/features/registration/bloc/registration_bloc.dart`
  - В `_onRequestOtp`: `_repository.requestOtp(event.phoneNumber)` → `_repository.requestOtp(event.phoneNumber, consentGiven: event.consentGiven)`
  - В `_onResendOtp`: `_repository.requestOtp(event.phoneNumber)` → `_repository.requestOtp(event.phoneNumber, consentGiven: true)`

- [ ] **Task 16: Обнови `client_auth_repository.dart`**
  - Файл: `branivo_app/lib/features/registration/data/repositories/client_auth_repository.dart`
  - Промени сигнатурата: `Future<int> requestOtp(String phoneNumber, {required bool consentGiven})`
  - Добави към POST data: `'consent_given': consentGiven`

- [ ] **Task 17: Обнови `registration_screen.dart`**
  - Файл: `branivo_app/lib/features/registration/screens/registration_screen.dart`
  - В `_PhoneEntryFormState` добави: `bool _consentGiven = false;`
  - В `_submit()`:
    ```dart
    void _submit(BuildContext context) {
      final phone = _phoneController.text.trim();
      if (phone.isEmpty || !_consentGiven) return;
      context.read<RegistrationBloc>().add(
        RequestOtpEvent(phoneNumber: phone, consentGiven: _consentGiven),
      );
    }
    ```
  - Добави checkbox widget в Column преди `ElevatedButton`:
    ```dart
    Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Checkbox(
          value: _consentGiven,
          onChanged: (v) => setState(() => _consentGiven = v ?? false),
          semanticLabel: 'Съгласявам се с политиката за поверителност',
        ),
        Flexible(
          child: Text(
            'Съгласявам се с политиката за поверителност на брокера',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    ),
    const SizedBox(height: 8),
    ```
  - `ElevatedButton.onPressed`: `phone.isNotEmpty && _consentGiven ? () => _submit(context) : null`

### Acceptance Criteria

- [ ] **AC1 — Consent guard backend:**
  **Given** `POST /api/v1/auth/client/request-otp` с `consent_given: false`,
  **When** заявката пристигне,
  **Then** backend връща HTTP 400 с `{ message: 'Трябва да приемете политиката за поверителност' }`; SMS не се изпраща

- [ ] **AC2 — Happy path с consent (съществуващ клиент):**
  **Given** `POST /api/v1/auth/client/request-otp` с `consent_given: true` и телефон на съществуващ клиент,
  **When** заявката пристигне,
  **Then** SMS се изпраща; Redis key `client_otp_consent:{tid}:{phone}` се записва с TTL 300s; `consent_given_at` в `end_clients` се UPDATE-ва с текущото време

- [ ] **AC3 — Нов клиент — `consent_given_at` записан при `verifyOtp`:**
  **Given** нов клиент (без ред в `end_clients`), подал `consent_given: true` при `requestOtp` и верен OTP при `verifyOtp` (в рамките на 5 мин),
  **When** `verifyOtp` изпълни `findOrCreate`,
  **Then** новият ред се създава с `consent_given_at` = timestamp от Redis consent key; `consent_given_at` НЕ е NULL

- [ ] **AC4 — Повторна регистрация обновява consent:**
  **Given** съществуващ клиент с `consent_given_at = '2026-01-01'`,
  **When** извика `requestOtp` с `consent_given: true`,
  **Then** `consent_given_at` се обновява с новото текущо време

- [ ] **AC5 — `TenantConfigResponseDto` съдържа `legal`:**
  **Given** `GET /api/v1/tenants/config` за tenant с попълнен `legal_name` и `privacy_policy_url`,
  **When** заявката пристигне,
  **Then** response съдържа `legal: { legalName: '...', privacyPolicyUrl: 'https://...' }`

- [ ] **AC6 — Graceful fallback за `legal`:**
  **Given** tenant без попълнен `legal_name` и `privacy_policy_url`,
  **When** `GET /api/v1/tenants/config`,
  **Then** response съдържа `legal: { legalName: '<tenant.name стойността>', privacyPolicyUrl: null }` (F3 — `legalName` никога не е null; `privacyPolicyUrl` е null → линкът се крие)

- [ ] **AC7 — Web checkbox блокира submit:**
  **Given** `InlineRegistration` е разгъната,
  **When** потребителят въведе телефон но НЕ е check-нал checkbox,
  **Then** "Изпрати код" бутонът е `disabled`; submit не се изпраща

- [ ] **AC8 — Web privacy policy линк:**
  **Given** tenant с `privacyPolicyUrl = 'https://broker.bg/privacy'`,
  **When** `InlineRegistration` се рендира,
  **Then** checkbox label съдържа `<a href="https://broker.bg/privacy">политиката за поверителност</a>`

- [ ] **AC9 — Web graceful null за `privacyPolicyUrl`:**
  **Given** tenant с `privacyPolicyUrl = null`,
  **When** `InlineRegistration` се рендира,
  **Then** текстът "политиката за поверителност" се рендира без `<a>` таг

- [ ] **AC10 — Resend не показва checkbox:**
  **Given** потребителят е в OTP entry фазата (`phase === 'otp_entry'`),
  **When** натисне "Изпрати нов код",
  **Then** checkbox не се показва; consent се изпраща като `true` имплицитно

- [ ] **AC11 — Flutter submit disabled без consent:**
  **Given** `_PhoneEntryForm` в Flutter,
  **When** потребителят въведе телефон но `_consentGiven = false`,
  **Then** `ElevatedButton.onPressed` е `null` (бутонът е disabled)

- [ ] **AC12 — Flutter WCAG semanticsLabel:**
  **Given** screen reader е активен,
  **When** фокусът е върху Checkbox,
  **Then** screen reader обявява `'Съгласявам се с политиката за поверителност'`

## Additional Context

### Dependencies

- Story 3.2 (implemented) — `InlineRegistration`, `ClientAuthService`, `EndClientRepository`, `RegistrationBloc` са базата
- `TenantsService.getTenantConfig()` + Redis cache — expose-ва `legal` полета към frontend
- `TenantContextService` — вече resolve-ва tenant; непроменен

### Testing Strategy

**Unit тестове (Backend):**
- `client-auth.service.spec.ts` — 2 нови теста: `consent_given: false → 400`; `updateConsentTimestamp` извикан след sendOtp
- Обнови съществуващите 7 теста да подават `consentGiven: true` на `requestOtp`

**Unit тестове (Flutter):**
- `registration_bloc_test.dart` — 1 нов тест: `RequestOtpEvent(consentGiven: false)` — ако backend върне 400, Bloc emit-ва `RegistrationErrorState`
- Обнови съществуващите тестове да подават `consentGiven: true` в `RequestOtpEvent`

**Widget тестове:**
- `inline-registration.test.tsx` — 2 нови теста: submit disabled при unchecked; privacy policy link renders при non-null URL
- Flutter widget тест: `ElevatedButton` disabled при `_consentGiven = false`

**Manual testing:**
1. Submit phone без checkbox → бутон е disabled (web) / не реагира (Flutter)
2. Submit phone с checkbox → OTP се изпраща; DB `consent_given_at` е попълнен
3. `GET /api/v1/tenants/config` → `legal` поле присъства
4. Tenant без `privacy_policy_url` → линк не се показва; checkbox текст е без `<a>`

### Notes

- **F1 — Consent recording е задължително:** Redis setex + updateConsentTimestamp се изпълняват ПРЕДИ sendOtp. Провал → 500, SMS не се изпраща. Без silent swallow на грешки.
- **F2 — URL валидация:** `privacy_policy_url` трябва да минава през `@IsUrl({ require_protocol: true })` в update DTO-то (Task 9.5). Без валидация `javascript:` URI е XSS вектор.
- **F3 — legalName fallback:** `getTenantConfig()` връща `tenant.config?.legalName ?? tenant.name` — никога null. UI никога не показва "undefined брокер".
- **F4 — Атомарен findOrCreate:** Ползвай TypeORM `upsert` с `conflictPaths: ['phoneNumber', 'tenantId']` вместо SELECT + conditional INSERT — елиминира race condition при паралелни `verifyOtp` заявки.
- **F5 — Redis TTL race guard:** Ако consent key е изтекъл при `verifyOtp` (края на 300s прозорец), `consentGivenAt` fallback-ва на `new Date()`. Consent е бил даден при requestOtp — само Redis ключът не е дочакал.
- **F6 — GDPR Чл. 7(3) blocker:** `consent_withdrawn_at` колоната е добавена, но без UI/endpoint е нарушение. Необходима е отделна story за withdrawal преди production.
- **F7 — @Transform boolean variants:** Декораторът handle-ва `true`, `'true'`, `1`, `'1'` — покрива form-data и JSON клиенти.
- Redis rolling deploy: `legal` може да липсва в кеша до 5 мин — frontend ползва `dto.legal?.privacyPolicyUrl` с optional chaining навсякъде.
- `consent_withdrawn_at` е само колона — без endpoints, без UI. При бъдеща story за GDPR deletion — колоната вече е там.
- Branding update endpoint (`updateBranding`) трябва да се разшири с `privacyPolicyUrl` и `legalName` за бъдещата Super Admin/Broker Admin UI — out of scope тук.
