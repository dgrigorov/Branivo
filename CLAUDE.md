# Branivo — Claude Code Instructions

## Какво е този проект

**Branivo** е white-label, мулти-тенант B2B2C SaaS платформа за застрахователни брокери.
Stack: **NestJS · Flutter · PostgreSQL · AWS ECS Fargate · Stripe Connect · BullMQ · Redis**

## Задължителни стъпки при всеки нов чат

**Преди да пишеш каквото и да е**, зареди уменията:

1. Зареди skill **`branivo-skill`** — основният наръчник (backend, Flutter, DB, бизнес правила, white-label, DevOps)
2. Ако задачата включва Fleet, Renewal, DKP или API tier → зареди и **`branivo-prd-extensions`**

> Двата skill-а съдържат всичко необходимо. Не измисляй архитектура — следвай reference файловете.

## Структура на проекта

```
.claude/skills/branivo-skill/          Основен наръчник (backend, flutter, db, бизнес правила)
.claude/skills/branivo-prd-extensions/ Разширения от PRD (fleet, renewal, dkp, api-tier)
_bmad-output/planning-artifacts/prd.md Финален PRD — source of truth за всички изисквания
docs/                                  Оригинални входни документи
```

## Абсолютни правила (никога не нарушавай)

- **НИКОГА** не правиш DB заявка без `tenant_id` scope (освен Super Admin контекст)
- **НИКОГА** не активираш полица client-side — само след `payment_intent.succeeded` Stripe webhook
- **НИКОГА** не връщаш `insurer.api_key_enc` в GET отговор
- **ВИНАГИ** използвай `TenantContext.getTenantId()` — не го предавай като функционален параметър
- **ВИНАГИ** проверявай feature flag преди feature-gated функционалност (`features.fleet`, `features.api_access` и т.н.)
- `audit_log` и `policy_events` са **IMMUTABLE** — без UPDATE или DELETE

## Задължителни проверки преди Pull Request

**ПРЕДИ `gh pr create`** изпълни локално всички CI проверки и оправи грешките:

```bash
# API
cd branivo-api && npm run lint && npm run test:cov && npm run build

# Web
cd branivo-web && npm run lint && npx tsc --noEmit && npm run build

# Flutter
cd branivo_app && flutter analyze --no-fatal-infos && flutter test
```

PR се създава само ако всички команди завършват без грешки.

## При имплементация

1. Прочети reference файла за домейна (виж routing таблицата в `branivo-skill/SKILL.md`)
2. Провери PRD-а за точните business rules на фийчъра
3. Следвай модулната структура: Controller → Service → Repository (без прескачане)
4. Всяка нова DB таблица: UUID PK, `tenant_id`, `created_at`, `updated_at`, `deleted_at`, RLS

## Тестове — задължително

**ВИНАГИ** пиши тестове заедно с имплементацията — не след, не по-късно:

- **NestJS (branivo-api):** unit тест `.spec.ts` за всеки Service и Repository; интеграционен тест за всеки Controller
- **Next.js (branivo-web):** component тест за всеки нов UI компонент
- **Flutter (branivo_app):** widget тест за всеки нов екран/widget

Тестовете трябва да минават преди да се commit-не код (`npm run test:cov` / `flutter test`).
