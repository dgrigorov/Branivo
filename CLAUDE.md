# Branivo — Claude Code Instructions

## Какво е този проект

**Branivo** е white-label, мулти-тенант B2B2C SaaS платформа за застрахователни брокери.
Stack: **NestJS · Flutter · PostgreSQL · AWS ECS Fargate · Stripe Connect · BullMQ · Redis**

## Задължителни стъпки при всеки нов чат

**Преди да пишеш каквото и да е**, зареди уменията:

1. Зареди skill **`branivo-skill`** — основният наръчник (backend, Flutter, DB, бизнес правила, white-label, DevOps)
2. Ако задачата включва Fleet, Renewal, DKP или API tier → зареди и **`branivo-prd-extensions`**

> Двата skill-а съдържат всичко необходимо. Не измисляй архитектура — следвай reference файловете.

## Git workflow — преди всяка задача

**ПРЕДИ да започнеш каквато и да е имплементация**, задължително изпълни точно тези стъпки:

```bash
git fetch origin
git switch main
git pull origin main
git switch -c <prefix>/<branch-name>
```

Префикси: `feature/`, `bugfix/`, `chore/`, `refactor/`

Пример за story: `git switch -c feature/story-2-2-custom-domain`

> **КРИТИЧНО:** Всеки PR трябва да е базиран на `main` и да съдържа САМО commit-ите за конкретното story.
> Ако не pull-неш `main` преди `switch -c`, branch-ът тръгва от стар commit и PR-ът ще показва чужди commit-и от предишни stories.
> `git fetch origin` първо — за да имаш актуалните merged PR-и в локалното repo.

**Pull Request base е винаги `main`** — никога `feature/story-X-Y-...` или друг branch.

> **КРИТИЧНО:** `gh pr create` **ЗАДЪЛЖИТЕЛНО** се извиква с `--base main`. Без този флаг gh взима repo default branch (което е `feature/story-1-1-monorepo-foundation`), което е грешно. Винаги:
> ```bash
> gh pr create --base main --title "..." --body "..."
> ```

## Pull Request заглавия — задължителен формат

Използвай винаги **Conventional Commits** формат:

```
<type>(story-X.Y): <кратко описание>
```

Типове: `feat`, `fix`, `chore`, `refactor`, `docs`

Примери:
- `feat(story-1.3): Broker Authentication with 2FA`
- `fix(story-2.1): Policy activation webhook race condition`
- `chore(story-1.1): Monorepo Foundation & Dev Infrastructure`

> Никога не ползвай тире (`—`), `Story` с главна буква в скобите, или смесени формати.

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

## Makefile — поддържай го актуален

В root-а на проекта (`/Users/danielgrigorov/Desktop/InsurTech/Makefile`) живее централният developer Makefile.

**ЗАДЪЛЖИТЕЛНО**: При всяка нова npm скрипт, нова инфра команда, нов инструмент или нов workflow добавен в проекта — добави съответния `make` target в Makefile-а. Форматът е:

```makefile
target-name: ## Кратко описание на командата
	<shell команда>
```

Примери за кога се ъпдейтва:
- Нов Docker service в `docker-compose.yml` → нов target
- Нов npm script в `package.json` → нов target
- Нова Flutter команда → нов target
- Нов CI/CD step → нов target

## TypeScript — забранен `any` тип

**НИКОГА** не използвай `any` тип — нито в production код, нито в тестове:

- Вместо `any` ползвай точния тип, `unknown`, или type assertion с конкретен тип (напр. `as MyDto`)
- За `Object.entries/values` добавяй explicit тип анотация: `([k, v]: [string, MyType | undefined]) => ...`
- За supertest `res.body` cast-вай: `const body = res.body as MyResponseDto`
- За `let` променливи с неизвестен тип: `let result: MyType | null | undefined`

Нарушаването на това правило е lint error (`@typescript-eslint/no-unsafe-*`) — CI ще fail-не.

## Тестове — задължително

**ВИНАГИ** пиши тестове заедно с имплементацията — не след, не по-късно:

- **NestJS (branivo-api):** unit тест `.spec.ts` за всеки Service и Repository; интеграционен тест за всеки Controller
- **Next.js (branivo-web):** component тест за всеки нов UI компонент
- **Flutter (branivo_app):** widget тест за всеки нов екран/widget

Тестовете трябва да минават преди да се commit-не код (`npm run test:cov` / `flutter test`).
