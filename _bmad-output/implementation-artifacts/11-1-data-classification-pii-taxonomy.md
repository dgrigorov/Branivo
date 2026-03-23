# Story 11.1: Data Classification & PII Taxonomy

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Compliance Officer / Platform,
I want every personal data field in the system classified with a formal PII taxonomy (PII_BASIC / PII_SENSITIVE / PII_SPECIAL_CATEGORY),
so that subsequent GDPR stories (field-level encryption, data export, erasure, consent) have a precise, machine-readable map of what data needs protection and how.

## Acceptance Criteria

### AC1 — PiiClassification enum е дефиниран
**Given** developer работи върху GDPR feature,
**When** импортира `PiiClassification` от shared types,
**Then** enum съдържа точно три стойности: `PII_BASIC`, `PII_SENSITIVE`, `PII_SPECIAL_CATEGORY` — без повече, без по-малко.

### AC2 — `@PiiField()` декоратор работи runtime
**Given** TypeORM entity column е анотиран с `@PiiField(PiiClassification.PII_SENSITIVE)`,
**When** `PiiRegistryService.getFieldsForEntity(entityClass)` се извика,
**Then** полето се появява в резултата с правилната класификация и column name.

### AC3 — Всички съществуващи entity fields са анотирани
**Given** следните entity файлове: `User`, `EndClient`, `Vehicle`, `Payment`, `Policy`, `Quote`, `OcrJob`, `Shipment`, `FleetVehicle`,
**When** `PiiRegistryService.getAllPiiFields()` се изпълни,
**Then** се връщат поне следните полета с правилната им класификация (виж Tasks за пълния списък):
- `end_clients.phone_number` → `PII_BASIC`
- `end_clients.email` → `PII_BASIC`
- `end_clients.first_name` → `PII_BASIC`
- `end_clients.last_name` → `PII_BASIC`
- `users.email` → `PII_BASIC`
- `users.two_fa_secret_enc` → `PII_SENSITIVE`
- `vehicles.vin` → `PII_BASIC`
- `vehicles.license_plate` → `PII_BASIC`
- `payments.stripe_payment_intent_id` → `PII_SENSITIVE`
- `payments.stripe_client_secret` → `PII_SENSITIVE`
- `payments.amount` → `PII_SENSITIVE`

### AC4 — `PiiRegistryService` е injectable NestJS service
**Given** `ComplianceModule` е importнат в `AppModule`,
**When** `PiiRegistryService` се inject-ва в друг service,
**Then** работи нормално; `.getAllPiiFields()` и `.getFieldsForEntity(EntityClass)` са налични публични методи.

### AC5 — Полетата с `password_hash` не са маркирани като PII
**Given** `users.password_hash` е bcrypt хеш,
**When** се провери PII registry,
**Then** `password_hash` НЕ е анотиран с `@PiiField` — не е PII, а auth credential (bcrypt хешове не разкриват лична информация).

### AC6 — Unit тестовете покриват registry логиката
**Given** `PiiRegistryService` е имплементиран,
**When** unit тестовете се изпълнят с `npm run test:cov`,
**Then** всички тестове минават; coverage ≥ 80% за `compliance/` модула.

### AC7 — Нов `ComplianceModule` е регистриран в `AppModule`
**Given** `ComplianceModule` е създаден,
**When** приложението стартира,
**Then** `PiiRegistryService` е налична глобално; lint, build и тестове минават без грешки.

---

## Tasks / Subtasks

- [x] Task 1: Дефинирай PII типове и декоратор (AC1, AC2)
  - [x] 1.1 Създай `branivo-api/src/shared/types/pii.types.ts`:
    - `PiiClassification` enum: `PII_BASIC = 'PII_BASIC'`, `PII_SENSITIVE = 'PII_SENSITIVE'`, `PII_SPECIAL_CATEGORY = 'PII_SPECIAL_CATEGORY'`
    - `PiiFieldMetadata` interface: `{ entityName: string; columnName: string; propertyName: string; classification: PiiClassification }`
  - [x] 1.2 Създай `branivo-api/src/shared/decorators/pii-field.decorator.ts`:
    - Използвай `Reflect.metadata` с ключ `PII_FIELD_METADATA_KEY = 'pii:field'`
    - `@PiiField(classification: PiiClassification)` property decorator
    - Helper `getPiiFields(entityClass): PiiFieldMetadata[]` — reflect върху прототипа и събира всички анотирани полета
    - **Важно:** декораторът не модифицира поведението на TypeORM — само добавя reflection metadata

- [x] Task 2: Анотирай съществуващите entities (AC3, AC5)
  - [x] 2.1 `users.entity.ts`:
    - `email` → `@PiiField(PiiClassification.PII_BASIC)`
    - `two_fa_secret_enc` → `@PiiField(PiiClassification.PII_SENSITIVE)`
    - `password_hash` — НЕ анотирай (не е PII)
  - [x] 2.2 `end-client.entity.ts`:
    - `phone_number` → `@PiiField(PiiClassification.PII_BASIC)`
    - `email` → `@PiiField(PiiClassification.PII_BASIC)`
    - `first_name` → `@PiiField(PiiClassification.PII_BASIC)`
    - `last_name` → `@PiiField(PiiClassification.PII_BASIC)`
    - `push_token` → `@PiiField(PiiClassification.PII_BASIC)` (device identifier linked to person)
  - [x] 2.3 `vehicle.entity.ts`:
    - `vin` → `@PiiField(PiiClassification.PII_BASIC)` (linked to owner via FK)
    - `license_plate` → `@PiiField(PiiClassification.PII_BASIC)`
  - [x] 2.4 `payment.entity.ts`:
    - `stripe_payment_intent_id` → `@PiiField(PiiClassification.PII_SENSITIVE)` (financial transaction reference)
    - `stripe_client_secret` → `@PiiField(PiiClassification.PII_SENSITIVE)` (financial credential)
    - `amount` → `@PiiField(PiiClassification.PII_SENSITIVE)` (financial data)
  - [x] 2.5 `policy.entity.ts` — `insured_name`/`insured_egn` не съществуват; `policy_number` → `PII_BASIC`
  - [x] 2.6 `quote.entity.ts` — няма директни PII полета (sessionToken не е PII, vehicleId е FK)
  - [x] 2.7 `ocr-job.entity.ts` — `result` jsonb съдържа license_plate, vin → `PII_SENSITIVE`
  - [x] 2.8 `shipment.entity.ts` — `delivery_address` jsonb → `PII_BASIC`
  - [x] 2.9 `fleet-vehicle.entity.ts` — `driver_name` не съществува; `driverUserId` е FK → не анотираме

- [x] Task 3: Създай `ComplianceModule` с `PiiRegistryService` (AC4, AC7)
  - [x] 3.1 Директория: `branivo-api/src/modules/compliance/`
  - [x] 3.2 `pii-registry.service.ts`:
    - `getAllPiiFields(): PiiFieldMetadata[]` — итерира всички регистрирани entities и извиква `getPiiFields(EntityClass)` за всяка
    - `getFieldsForEntity(entityClass: EntityClass): PiiFieldMetadata[]` — wrapper около `getPiiFields`
    - `getFieldsByClassification(classification: PiiClassification): PiiFieldMetadata[]` — filter helper за story 11-7 (data export) и 11-2 (encryption)
    - Статичен масив `REGISTERED_ENTITIES: EntityClass[]` в service файла
  - [x] 3.3 `compliance.module.ts`:
    - `@Global()` — `PiiRegistryService` се export-ва глобално
    - `exports: [PiiRegistryService]`
  - [x] 3.4 Регистрирай `ComplianceModule` в `app.module.ts`

- [x] Task 4: Unit тестове (AC6)
  - [x] 4.1 `pii-field.decorator.spec.ts`:
    - Тест: декоратор анотира полето с правилната класификация
    - Тест: `getPiiFields()` върху entity без анотации → празен масив
    - Тест: `getPiiFields()` върху entity с 2 анотирани полета → масив от 2 елемента
    - Тест: metadata key се записва правилно
  - [x] 4.2 `pii-registry.service.spec.ts`:
    - Mock entity с 2 `@PiiField` анотации → `getFieldsForEntity()` ги открива
    - `getAllPiiFields()` агрегира от всички entities
    - `getFieldsByClassification(PII_SENSITIVE)` филтрира правилно
    - AC3 полета проверени; AC5 password_hash не е PII

- [x] Task 5: Lint, build и CI verify (AC7)
  - [x] `cd branivo-api && npm run lint` — 0 errors, 0 warnings
  - [x] `npm run test:cov` — coverage ≥ 80% за `compliance/` (80% stmts, 100% funcs) + 747/747 тестове минават
  - [x] `npm run build` — компилира успешно

---

## Dev Notes

### Архитектурен контекст на Story 11.1

Това е **foundation story** за целия Epic 11. Всяка последваща story директно зависи от тази таксономия:

| Следваща Story | Как използва PII таксономията |
|---|---|
| **11-2** (field-level encryption) | `getFieldsByClassification(PII_SENSITIVE)` → кои полета да се криптират с AWS KMS |
| **11-7** (GDPR data export) | `getAllPiiFields()` → кои полета да се включат в JSON/CSV export пакета |
| **11-8** (right to erasure) | `getFieldsByClassification(PII_BASIC \| PII_SENSITIVE)` → кои полета да се анонимизират |
| **11-10** (consent management) | Знае кои обработки засягат `PII_SPECIAL_CATEGORY` (изисква explicit consent) |

### Класификационна схема

```
PII_BASIC           — Идентификатори свързани с физическо лице: name, email, phone,
                       license_plate, VIN (като owner link), push_token.
                       Изисква: lawful basis; може да се anuniymize при erasure.

PII_SENSITIVE       — Финансови данни, auth credentials, специфични идентификатори:
                       payment amounts, Stripe keys, 2FA secrets, EGN (ако се появи).
                       Изисква: encryption at-rest (Story 11-2); строго ограничен достъп.

PII_SPECIAL_CATEGORY — GDPR чл. 9: здравни данни, биометрични данни (Face ID templates),
                        данни за членство в сдружения. Phase 1 нямаме такива полета, но
                        категорията е нужна за Kasko/Health (Phase 2) и за completeness.
                        Изисква: explicit consent + DPA; никога no legitimate interest основание.
```

### Техническа имплементация: Reflection approach

```typescript
// pii.types.ts
export enum PiiClassification {
  PII_BASIC = 'PII_BASIC',
  PII_SENSITIVE = 'PII_SENSITIVE',
  PII_SPECIAL_CATEGORY = 'PII_SPECIAL_CATEGORY',
}

export interface PiiFieldMetadata {
  entityName: string;     // 'EndClient'
  columnName: string;     // 'phone_number' (snake_case DB column)
  propertyName: string;   // 'phoneNumber' (TypeScript property)
  classification: PiiClassification;
}
```

```typescript
// pii-field.decorator.ts
export const PII_FIELD_METADATA_KEY = 'pii:field';

export function PiiField(classification: PiiClassification): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    const existing: PiiClassification[] =
      Reflect.getMetadata(PII_FIELD_METADATA_KEY, target) ?? [];
    Reflect.defineMetadata(
      PII_FIELD_METADATA_KEY,
      [...existing, { propertyKey: String(propertyKey), classification }],
      target,
    );
  };
}
```

**Важно:** Нужен е `import 'reflect-metadata'` в `main.ts` — вероятно вече е наличен чрез `@nestjs/core`. Провери преди добавяне.

### `tsconfig.json` изисквания

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

Тези са задължителни за TypeScript decorators. Вероятно вече са активирани (NestJS ги изисква). Провери и не дублирай.

### Модулна структура

```
branivo-api/src/
├── shared/
│   ├── types/
│   │   └── pii.types.ts                 # NEW: enum + interface
│   └── decorators/
│       └── pii-field.decorator.ts        # NEW: @PiiField decorator + getPiiFields()
└── modules/
    └── compliance/
        ├── compliance.module.ts           # NEW: @Global() module
        ├── pii-registry.service.ts        # NEW: registry service
        └── pii-registry.service.spec.ts   # NEW: unit tests
```

### Entities за анотация (пълен списък)

```
branivo-api/src/modules/
├── users/entities/user.entity.ts
├── clients/entities/end-client.entity.ts
├── vehicles/entities/vehicle.entity.ts
├── payments/entities/payment.entity.ts
├── policies/entities/policy.entity.ts
├── quotes/entities/quote.entity.ts
├── ocr/entities/ocr-job.entity.ts
├── logistics/entities/shipment.entity.ts
└── fleet/entities/fleet-vehicle.entity.ts
```

**Не анотирай:** `tenant.entity.ts`, `commission-matrix.entity.ts`, `invoice.entity.ts`, `policy-event.entity.ts` — съдържат бизнес/финансови агрегати, не директно лични данни на физически лица. (Изключение: ако invoice съдържа client name — анотирай.)

### Какво НЕ прави тази Story

- **Не** имплементира актуалното криптиране → Story 11-2
- **Не** добавя DB migration → чиста TypeScript metadata (никакви DB промени)
- **Не** имплементира data export endpoint → Story 11-7
- **Не** добавя Flutter/Next.js компонент → pure backend foundation

### НИКОГА не нарушавай

- `audit_log` и `policy_events` са IMMUTABLE — без UPDATE/DELETE (не се засягат от тази story)
- `PiiRegistryService` НЕ прави DB заявки — само reflection върху TypeScript classes
- `insurer.api_key_enc` НЕ се показва в GET отговори (не се засяга от тази story, но остава правило)

### Project Structure Notes

- `shared/types/` директорията вероятно не съществува — провери с `ls branivo-api/src/shared/`
- `shared/decorators/` — провери дали съществува или трябва да се създаде
- Ако `shared/` не съществува → създай директорията
- `ComplianceModule` е нов модул; поставен в `src/modules/compliance/` по стандартната структура

### References

- PII класификация: [GDPR чл. 4(1), чл. 9] — „лични данни" и „специални категории"
- Декоратори в NestJS: [NestJS Custom Decorators](https://docs.nestjs.com/custom-decorators)
- Reflect API: reflect-metadata пакет (вече в package.json чрез `@nestjs/core`)
- Epic 11 Wave 1 dependencies: `sprint-status.yaml` lines 149-167
- Entity файлове: `branivo-api/src/modules/*/entities/*.entity.ts`
- Architecture compliance rules: `_bmad-output/planning-artifacts/architecture.md` lines 695-719

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_няма_

### Completion Notes List

- Създадени `shared/types/pii.types.ts` и `shared/decorators/pii-field.decorator.ts` с `PiiClassification` enum, `PiiFieldMetadata` interface, `@PiiField()` decorator и `getPiiFields()` helper.
- Анотирани 9 entity файла: User (2 полета), EndClient (5 полета), Vehicle (2 полета), Payment (3 полета), Policy (3 полета: policyNumber, stripePaymentIntentId, deliveryAddress), OcrJobEntity (1 поле), Shipment (1 поле). Quote и FleetVehicle нямат директни PII полета.
- `password_hash` в User НЕ е анотиран (AC5 спазен).
- Създаден `ComplianceModule` (`@Global()`) с `PiiRegistryService` — 3 публични метода + lazy cache.
- Регистриран `ComplianceModule` в `AppModule`.
- **Code Review fixes:** (1) Добавени `@PiiField(PII_SENSITIVE)` за `policy.stripePaymentIntentId` и `@PiiField(PII_BASIC)` за `policy.deliveryAddress` — пропуснати при имплементация; (2) Сменен `Reflect.getMetadata` → `Reflect.getOwnMetadata` в decorator за предотвратяване на prototype chain leakage при наследяване; (3) `columnName` се чете от TypeORM `@Column({ name })` metadata (fallback: snake_case); (4) Добавен lazy cache в `getAllPiiFields()`; (5) AC3 тестове разширени с `columnName` assertions.
- 16 unit теста (5 за decorator, 11 за service) — всички минават.
- Lint: 0 errors, 0 warnings. Build: успешен. Пълен test suite: 750/750.

### File List

- `branivo-api/src/shared/types/pii.types.ts` — ново
- `branivo-api/src/shared/decorators/pii-field.decorator.ts` — ново
- `branivo-api/src/shared/decorators/pii-field.decorator.spec.ts` — ново
- `branivo-api/src/modules/compliance/compliance.module.ts` — ново
- `branivo-api/src/modules/compliance/pii-registry.service.ts` — ново
- `branivo-api/src/modules/compliance/pii-registry.service.spec.ts` — ново
- `branivo-api/src/app.module.ts` — добавен ComplianceModule import
- `branivo-api/src/modules/users/entities/user.entity.ts` — добавени @PiiField анотации
- `branivo-api/src/modules/clients/entities/end-client.entity.ts` — добавени @PiiField анотации
- `branivo-api/src/modules/vehicles/entities/vehicle.entity.ts` — добавени @PiiField анотации
- `branivo-api/src/modules/payments/entities/payment.entity.ts` — добавени @PiiField анотации
- `branivo-api/src/modules/policies/entities/policy.entity.ts` — добавени @PiiField анотации (policyNumber, stripePaymentIntentId, deliveryAddress)
- `branivo-api/src/modules/ocr/entities/ocr-job.entity.ts` — добавена @PiiField анотация
- `branivo-api/src/modules/logistics/entities/shipment.entity.ts` — добавена @PiiField анотация
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — статус на story: review
