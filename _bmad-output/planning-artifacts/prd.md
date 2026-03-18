---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete', 'step-e-01-discovery', 'step-e-02-review', 'step-e-03-edit']
status: complete
completedAt: '2026-03-16'
lastEdited: '2026-03-17'
editHistory:
  - date: '2026-03-17'
    changes: 'Removed DB schema terms from NFRs (NFR19/39/41); fixed implementation leakage in FRs (FR12/26/29/34/35) and NFR52; clarified administrative FRs (FR5/41/52)'
inputDocuments: ['docs/BizModel_EN.docx', 'docs/Insurance_Platform_PRD_EN.docx']
workflowType: 'prd'
briefCount: 0
researchCount: 0
brainstormingCount: 0
projectDocsCount: 2
classification:
  projectType: saas_b2b
  domain: insuretech
  complexity: high
  projectContext: brownfield
---

# Product Requirements Document - Branivo

**Author:** Daniel
**Date:** 2026-03-16

## Executive Summary

Branivo е white-label, мулти-тенант B2B2C SaaS платформа, която дава на всеки застрахователен брокер — независимо от размера му — собствен дигитален канал: брандирано мобилно приложение (Flutter), уеб портал (Next.js) и Broker Dashboard, активни в рамките на час след регистрация. Платформата работи на принципа broker-as-tenant: всеки брокер получава изолиран тенант с собствен домейн, брандиране и Stripe акаунт. Приходите се генерират чрез SaaS абонамент (€149–€399+/месец) и автоматично удържан platform fee % на всяка транзакция чрез Stripe Connect. Платформата не носи застрахователен риск.

Целевият пазар е ~2,500 застрахователни брокера в България (Phase 1, 2026), с последващо разширение в Румъния, Северна Македония и Гърция (Phase 2–3, 2027–2029). Приоритетен сегмент: средни брокери с 5–20 агента, притежаващи legacy системи и активно губещи клиенти към директните дигитални канали на застрахователите.

Задействащият пазарен катализатор е очакваното отпадане на физическия стикер за задължителна застраховка "Гражданска отговорност" — последното физическо триене в застрахователния процес. Когато това се случи, брокерите без дигитален канал ще бъдат функционално неспособни да обслужват клиенти. Платформата е изградена да работи пълноценно и при действащата регулация — талонът е ускорител, не предпоставка.

### Какво я прави специална

**Три едновременни "wow момента"** при всяка продажба: брокерът вижда собствения си бранд; клиентът сканира свидетелството за регистрация (3 снимки, Part I + Part II) и получава оферти от всички застрахователи без ръчно въвеждане; Stripe автоматично разпределя комисионата — без ръчна фактура. Нулеви IT разходи за брокера.

**Demand pull в обратна посока:** Дигитализацията не се продава на брокерите — тя се изисква от техните клиенти. Платформата не предлага "модернизация", а инструмент за оцеляване в пазар, който вече се е преместил към дигиталните канали. Брокерите без собствен канал губят клиентите си към директните приложения на застрахователите.

**Изключителни unit economics:** CAC ~€410, payback период под 1 месец (Professional план €399/месец). LTV:CAC > 57:1 за PLG канала. Broker-ът, преминал от ГО към Каско, генерира 2.7x повече приходи без допълнителни разходи за придобиване. Breakeven при 45–55 активни Professional/Enterprise брокера — очаквано Q2–Q3 2027.

**Нулев застрахователен риск:** За разлика от Lemonade (загуби $26.5M от CA пожари 2025), платформата е инфраструктура. 100% от риска остава при застрахователя.

**Класификация:** SaaS B2B мулти-тенант · Домейн: Branivo · Сложност: Висока (КФН, GDPR, RLS, Stripe Connect, insurer APIs, OCR) · Контекст: Brownfield · Стек: NestJS · Flutter · PostgreSQL · AWS ECS Fargate · Phase 1: България 2026 / Phase 2: Балкани 2027–2028

## Success Criteria

### User Success

**Брокерът (tenant) успява когато:**
- Активира собствен брандиран канал в рамките на **< 1 час** след регистрация
- Onboarding на Stripe Connect Express приключва без съдействие от платформата
- Първата полица е издадена в рамките на **< 24 часа** след активация
- **< 5% от крайните клиенти разпознават underlying платформата** — брандът на брокера е водещ

**Крайният клиент успява когато:**
- Сканира свидетелство за регистрация (3 снимки) и вижда попълнени оферти в **< 30 секунди**
- Преминава от сканиране до платена полица без да напуска брандирания канал
- Получава PDF + Green Card на имейл в рамките на **< 5 минути** след плащане
- Може да намери полицата offline в дигиталния портфейл

### Business Success

| Метрика | Q4 2026 (Phase 1) | Q4 2027 (Phase 2) | Q4 2028 (Phase 3) |
|---------|-------------------|-------------------|-------------------|
| Активни брокери | 25 | 65 | 140 |
| MRR (€) | €11,750 | €45,500 | €107,400 |
| ARPU (€/брокер/месец) | ~€470 | ~€700 | ~€767 |
| Месечен churn | < 3% | < 2% | < 1.5% |
| NPS (брокери) | > 40 | > 50 | > 60 |
| Полици/месец | 2,000 | 8,000 | 22,000 |
| API клиенти | 2 | 8 | 20 |
| LTV:CAC | > 5:1 | > 8:1 | > 12:1 |
| Payback период | < 6 мес. | < 4 мес. | < 3 мес. |
| Starter → Pro upgrade rate | — | ≥ 30% в 6 мес. | ≥ 40% |
| Net Revenue Retention (NRR) | — | > 110% | > 120% |

**Breakeven:** ~45–55 активни Professional/Enterprise брокера → очаквано Q2–Q3 2027.

### Technical Success

Прецизните measurable критерии са дефинирани в **Non-Functional Requirements** секцията. Ключови цели:

- Uptime: 99.9% (Enterprise) / 99.5% (Starter/Professional)
- OCR fallback rate: < 10% от сканиранията (confidence threshold ≥ 0.85)
- Quote API latency: < 5 сек (всички застрахователи, Promise.allSettled)
- Tenant isolation: нулеви кръстосвания на данни; MTTR < 15 мин
- Payment reliability: 0 загубени транзакции
- Compliance: GDPR + КФН + PSD2 от ден 1

### Measurable Outcomes

- **Adoption funnel:** Trial → платен конверсия ≥ 15% (PLG канал)
- **Expansion revenue:** Starter → Professional upgrade ≥ 30% в рамките на 6 месеца от активация
- **NRR:** > 110% до Q4 2027
- **Claims automation rate:** 20% до Q4 2027; 35% до Q4 2028
- **Renewal automation:** ≥ 70% от изтичащите полици получават автоматично напомняне
- **Logistics:** стикер доставен в срок в ≥ 95% от случаите

## Product Scope

### MVP — Minimum Viable Product (Phase 1, Q1–Q2 2026)

- Мулти-тенант архитектура с white-label брандиране (домейн, лого, цветове)
- OCR на свидетелство за регистрация (3 снимки, Part I + Part II)
- Real-time ГО оферти от активни застрахователи (паралелни заявки)
- Анонимен quote flow — регистрация само при "Купи"
- Stripe Connect Express — автоматично удържане на platform fee
- PDF + Green Card генериране и изпращане
- Логистика за стикер (Speedy + Econt, feature flag per tenant)
- Broker Dashboard (комисиони, клиенти, полици)
- KFN-съвместима документация и GDPR baseline

### Growth Features (Phase 2, Q3–Q4 2026)

- Каско модул с OCR Part II
- Собствен DKP wizard (офлайн двустранен констативен протокол)
- Fleet Management
- BI Dashboard за брокери
- Renewal automation (push/email/SMS)
- Referral програма
- API Sandbox + Growth tier

### Vision (Phase 3–4, 2027–2029)

- Балкански пазари: Румъния, Северна Македония, Гърция
- Property, Travel, Health (партньорски модел)
- Giveback Edition (Enterprise)
- AI-assisted claims processing
- Embedded insurance API за автокъщи и лизинг
- Пълна автоматизация при отпадане на физическия стикер

## User Journeys

### Journey 1: Стоян подновява ГО (Връщащ се клиент — основен път)

Стоян е на 34 години, работи в IT. ГО-то на колата му изтича след 3 дни. Получава push notification от приложението на брокер "Застраховки Димитров". Стоян познава само "приложението на Димитров" — не знае кой е застрахователят, не знае коя е платформата.

**Отваря приложението** → влиза с Face ID → системата зарежда данните на вече регистрирания му автомобил от `vehicles` таблицата. Без ново сканиране.

**Вижда 6 оферти** → избира втората → натиска "Купи" → плаща с Apple Pay → потвърждение за 12 секунди.

**Получава PDF + Зелена карта** на имейл за 3 минути. Полицата е в дигиталния портфейл offline. SMS: "Стикерът ви ще бъде доставен от Speedy до 2 работни дни."

**Разкрити изисквания:** Push ремайндъри при изтичаща полица, зареждане на съществуващи vehicle данни при подновяване, Stripe 3DS + Apple Pay, async PDF генериране, offline wallet, Speedy/Econt интеграция.

---

### Journey 1b: Николай купува ГО за пръв път (Нов клиент — анонимен flow)

Николай е нов клиент. Приятел му е споделил линк към "Застраховки Димитров".

**Отваря приложението** → без регистрация натиска "Сравни оферти".

**Сканира талона** (3 снимки) → OCR разчита данните за 8 секунди → полетата са попълнени. Системата показва банер: **"Офертите важат 48 часа. Отворете от същото устройство за да продължите по-късно."**

**Вижда 6 оферти анонимно** — данните са в session token (Redis, TTL 48h). При смяна на устройство session-ът е недостъпен — UX информира потребителя.

**Натиска "Купи"** → само сега системата иска регистрация (телефон + SMS OTP). OCR данните от сесията се мигрират към новия акаунт — Николай не въвежда нищо отново. Плаща, получава полица. Автомобилът е записан в профила за бъдещи подновявания по Journey 1.

**Разкрити изисквания:** Анонимен OCR flow, session token (Redis TTL 48h) + UX warning, cross-device limitation, seamless anonymous→auth transition, first-time vehicle save в `vehicles`.

---

### Journey 1c: Стоян игнорира подновяването (Failed renewal escalation)

Стоян е зает. Игнорира три push notifications. ГО-то изтича.

**Ескалационна верига:**
- D-30: Push notification "ГО изтича след 30 дни"
- D-7: Push notification "ГО изтича след 7 дни — виж оферти"
- D-3: SMS "⚠️ ГО изтича след 3 дни. Купете сега: [link]" — линкът отваря брандирания канал на брокера (`{slug}.branivo.bg`), не generic платформена страница
- D-1: Имейл от брокера (от broker домейн) "Последно напомняне"
- D+1: Broker notification в Dashboard — "Клиент Стоян Иванов има изтекла ГО"

Брокерът вижда алерта и се обажда лично на Стоян. Стоян купува. Брокерът е запазил клиента.

**Разкрити изисквания:** Multi-channel renewal scheduler (push/SMS/email), broker alert при изтекла полица на клиент, configurable escalation rules per tenant.

---

### Journey 2: Радка не може да сканира талона (OCR failure)

Радка е на 62 години, нов клиент. Таблетът й прави размазани снимки. OCR confidence = 0.61 — под прага 0.85.

**Системата не crash-ва** → показва частично попълнени полета с жълти икони "Моля, проверете". Попълва ръчно 3 полета → VIN validation срещу Traffic Police API → продължава нормалния flow.

**Разкрити изисквания:** Graceful OCR degradation, partial pre-fill с визуална индикация, ръчен fallback, VIN validation срещу Traffic Police API.

---

### Journey 3: Мариян активира своя брандиран канал (Broker onboarding)

Мариян е собственик на "Мариян Асюрънс" — 4 агента, 180 клиента, всичко в Excel.

**Получава имейл с покана** от Super Admin → Stripe Express onboarding (18 мин) → webhook `account.updated` → тенантът е активиран.

**Broker Dashboard → Брандиране:** качва лого, избира цветове, въвежда домейн → DNS инструкции → домейнът е live за 20 мин.

**Тества:** сканира талона → вижда офертите под своя бранд → жена му купува ГО → Мариян вижда комисионата в реално време. При webhook delay: Dashboard показва очакваната комисиона с икона "обработва се" — **никога не показва €0 за продадена полица**.

**Разкрити изисквания:** Broker invitation flow, Stripe Connect Express onboarding, DNS verification, white-label theme UI, commission dashboard с optimistic UI при webhook delay.

---

### Journey 4: Петя управлява платформата (Super Admin операции)

**Мониторинг:** Алерт — Tenant "Застраховки Петров" с 0 полици за 7 дни. Drill-down: Армеец API връща 502 от събота. Петя активира manual fallback (feature flag), изпраща dev алерт, свързва се с Петров.

**Billing цикъл:** Cron на 1-ви в 06:00 EET → фактури за всички тенанти. При cron failure → Super Admin алерт в 15 мин + ръчен trigger наличен. При Stripe account revocation на брокер → нови продажби блокирани, достъп до съществуващи полици запазен.

**Разкрити изисквания:** Tenant health dashboard, insurer API monitoring + feature flags, billing cron + failure alerts в 15 мин, ръчен billing trigger, Stripe revocation handling.

---

### Journey 5: AutoMax — embedded insurance (API Consumer)

AutoMax иска ГО при покупка на кола в шоурума. API Sandbox → интеграция за 2 дни. Production: VIN в AutoMax POS → Quote API → клиентът избира → полицата е издадена. AutoMax плаща Growth API (€153/мес) + €0.15/заявка над лимита.

**Разкрити изисквания:** API key management, rate limiting, sandbox, Quote + Policy API, usage billing, webhook за policy confirmation.

---

### Journey 6: Красимир управлява флот (Fleet мениджър)

Красимир управлява 23 камиона. Fleet Dashboard показва цветни индикатори: зелено/жълто/червено по статус на ГО.

**Bulk подновяване:** маркира 12 жълти МПС → "Получи оферти за всички" → паралелни API заявки → сравнителна таблица → "Приеми препоръчаните за всички" → **individual Stripe charge per полица** с bulk UX отгоре → 12 PDF-а на имейл.

**Суб-роли:** шофьор Митко с роля `driver` вижда само собствената си полица.

**Разкрити изисквания:** Fleet dashboard с status indicators, bulk quote flow, individual per-policy Stripe charges с bulk UX, driver sub-role с ограничен view, batch PDF export.

---

### Journey 7: Мариян напуска платформата (Broker offboarding)

Мариян решава да смени платформа. **Заявява offboarding** → системата генерира пълен data export (клиенти, полици, документи) в GDPR-съвместим формат → Мариян изтегля архива.

Издадените полици остават валидни до изтичането им — клиентите на Мариян не усещат промяна. След изтичане на всички активни полици тенантът се деактивира напълно.

**Разкрити изисквания:** Data export (GDPR), graceful tenant deactivation, активни полици валидни след offboarding, offboarding confirmation flow.

---

### Бизнес правила открити от journeys

- OCR сканиране се изисква само при първо добавяне на МПС; при подновяване системата зарежда съществуващи данни
- Анонимен quote flow без регистрация; session token (Redis TTL 48h); UX показва "Офертите важат 48 часа"
- Commission display използва optimistic UI — никога не показва €0 за продадена полица
- Failed renewal ескалация: push (D-30) → push (D-7) → SMS (D-3) → имейл (D-1) → broker notification (D+1)
- Bulk fleet payment = individual Stripe charge per полица с bulk UX — без saga complexity
- Ако billing cron fail-не — Super Admin алерт в 15 мин; наличен е ръчен trigger
- При Stripe account revocation — нови продажби блокирани; съществуващи полици достъпни
- Broker offboarding: пълен GDPR data export; издадените полици остават валидни до изтичане
- Всички renewal SMS/имейл линкове са tenant-scoped — отварят брандирания канал на брокера, не generic платформена страница

## Domain-Specific Requirements

### Compliance & Регулаторни изисквания

**КФН (Комисия за финансов надзор):**
- Платформата е инфраструктура, не застраховател — не изисква застрахователен лиценз
- Всяка продажба минава през лицензиран брокер-тенант с валиден КФН лиценз (`kfn_license` задължително при onboarding)
- Платформата деактивира тенант при отнет КФН лиценз
- **Penetration test задължителен преди всеки major phase launch** (Phase 1, Phase 2, Балкани) от акредитирана фирма

**GDPR (Регламент ЕС 2016/679):**
- DPA с всеки брокер-тенант задължителен преди активация; покрива sub-processors: AWS, Stripe, Google Vision, SendGrid, Twilio
- Лични данни криптирани at-rest (AES-256-GCM) и in-transit (TLS 1.3)
- Право на изтриване: soft delete (`deleted_at`) + пълно изтриване след retention период
- Explicit consent при регистрация (`gdpr_consent` + `gdpr_consent_at`)
- Data export при offboarding в GDPR-съвместим формат

**Застрахователно законодателство (КЗ):**
- Зелената карта е задължителен документ при ГО — генерирана преди физическо управление на МПС
- Полицата съдържа задължителни реквизити по КЗ
- Accident Declaration отговаря на нормативния формат
- **Scoring audit trail:** входните данни, weights и резултатът на `is_recommended` алгоритъма се логват за КФН одитируемост

**Балкански пазари — multi-regulatory framework:**
- `regulatory_framework` per tenant — архитектурата поддържа различни регулатори от Phase 1
- Румъния: регулатор ASF, валута RON; Гърция: DAEEAD; Северна Македония: ISA
- `currency` поле (CHAR(3)) DEFAULT BGN, extensible per tenant
- Задължителните реквизити на полицата са конфигурируеми per regulatory_framework


### Интеграционни изисквания

| Система | Цел | Критичност |
|---------|-----|-----------|
| КАТ / Traffic Police API | VIN валидация, собственик верификация | Критична |
| Гаранционен фонд API | Проверка за нерегламентирано МПС | Критична |
| Insurer APIs | Real-time оферти | Критична |
| Speedy / Econt | Доставка на стикер (feature flag) | Средна |
| Google Vision / AWS Textract | OCR на свидетелство за регистрация | Висока |

> Пълен Integration List с fallback стратегии → виж **SaaS B2B изисквания → Integration List**.

**Circuit Breaker параметри** (задължителни за всички external API):
- Failure threshold: 5 грешки за 60 сек → circuit отваря
- Half-open timeout: 30 сек → тества се с 1 заявка
- Fallback: manual entry с user warning

### Commission Matrix

- `commission_matrix` таблица: per insurer × per product type (ГО, Каско, Property...)
- Editable от Super Admin без code deploy
- Guardrail: `total_discounts` не може да надвишава `commission_amount × max_discount_pct` → 422 Unprocessable Entity
- Всяка промяна в commission matrix се логва в audit_log


### Рискове и митигации

| Риск | Вероятност | Въздействие | Митигация |
|------|-----------|-------------|-----------|
| КФН регулаторна промяна | Средна | Висока | Правен консултант; платформата е инфраструктура |
| Insurer API нестабилност | Средна | Висока | Circuit breaker (5/60s) + manual fallback |
| Data breach / GDPR | Ниска | Много висока | AES-256-GCM, penetration test per phase, DPA |
| Stripe revocation | Ниска | Висока | Блокиране на нови продажби; съществуващи полици достъпни |
| Scoring непрозрачност | Средна | Средна | Scoring audit trail за КФН одитируемост |
| KAT API недостъпност | Средна | Висока | Manual VIN entry fallback с предупреждение |
| Балкански регулаторна несъвместимост | Средна | Висока | `regulatory_framework` per tenant от Phase 1 |

## Innovation & Novel Patterns

### Открити иновационни области

**1. Full-cycle OCR от 3 снимки (уникално за Балканския пазар)**
Part I (технически данни за ГО) + Part II (лични данни за Каско) → 100% auto-fill за ГО, ~80% за Каско. Никой конкурент в BG/Balkans не е автоматизирал и двете страни.

Техническа реализация: Google Vision API (primary) + AWS Textract (fallback), confidence threshold 0.85, graceful degradation при нисък score.

**OCR Analytics Dashboard** (Super Admin, от Phase 1 launch): per-field confidence score, fallback rate per field и per-device type. При field fallback rate > 20% — автоматичен алерт за model retraining.

**2. Anonymous-first quote flow с inline micro-registration**
Анонимно сравнение → при "Купи": **inline micro-registration** (само телефонен номер + SMS OTP, без форма, без пренасочване, 20 секунди) → OCR данните от сесията вече са в акаунта. Елиминира психологическото прекъсване на стандартния registration modal.

Валидация: A/B тест inline micro-registration vs. стандартна регистрационна форма. Хипотеза: ≥ 2x по-висока конверсия при inline flow.

**3. White-label multi-tenant за малкия брокер с Design Guardrails**
Нова пазарна категория: SaaS инфраструктура достъпна за 1-агентен брокер на €149/месец, live за < 1 час. Design Guardrails защитават качеството на brand experience: минимален размер на лого, автоматична проверка на color contrast (WCAG AA), preview преди публикуване.

**4. Data Flywheel — конкурентен ров**
Повече брокер-тенанти → повече агрегирани анонимизирани данни → по-точен `is_recommended` scoring алгоритъм → по-висока конверсия за всички тенанти. Scoring моделът е tenant-agnostic при обучение: централно подобрение, нулеви маргинални разходи per тенант. Данните се анонимизират преди агрегация — GDPR compliant.

### Пазарен контекст и конкурентна среда

| Аспект | Нас | Legacy BG системи | Lemonade (USA) |
|--------|-----|-------------------|----------------|
| White-label за брокери | ✅ Core | ❌/Частично | ❌ (D2C) |
| OCR 3 снимки (Part I+II) | ✅ Уникално | ❌ Manual | ✅ (US пазар) |
| Anonymous-first flow | ✅ Inline micro-reg | ❌ | ✅ |
| Data flywheel (cross-tenant) | ✅ | ❌ | ✅ |
| Застрахователен риск | ❌ Нулев | ❌ Нулев | ✅ Носят ($26.5M загуба 2025) |
| Балкански пазар | ✅ Roadmap | ❌ BG only | ❌ US+EU |

### Подход за валидация

| Иновация | Хипотеза | Метрика | Timeline |
|----------|----------|---------|---------|
| OCR 3 снимки | < 10% fallback rate | OCR Analytics Dashboard | Phase 1 Beta (M1–M3) |
| Inline micro-registration | ≥ 2x конверсия | A/B тест Trial→paid | M1–M2 |
| White-label < 1 час | Брокер активен за < 1 час | Time-to-first-policy | Phase 1 onboarding |
| Data flywheel | Scoring accuracy подобрение | is_recommended CTR | Phase 2 |

### Рискове и fallback стратегии

| Иновация | Риск | Fallback |
|----------|------|---------|
| OCR 3 снимки | Качество на снимките варира | Graceful degradation → partial pre-fill → ръчно въвеждане |
| Inline micro-registration | SMS OTP delivery failure | Retry + email OTP fallback |
| White-label < 1 час | DNS propagation извън контрола ни | Subdomain на платформата като interim |
| Data flywheel | GDPR при cross-tenant агрегация | Анонимизация преди агрегация; DPA покрива |

## SaaS B2B изисквания

### Project-Type Overview

Branivo е мулти-тенант SaaS B2B платформа с broker-as-tenant модел. Всеки брокер е изолиран тенант с собствен домейн, брандиране, Stripe акаунт и данни. Платформата обслужва три нива: Platform Owner (Super Admin), Broker (tenant admin/agents), End Customer (краен клиент на брокера).

### Tenant Model

**Архитектурно решение:** Shared infrastructure, isolated data.

- `tenant_id` UUID колона в **всяка** таблица — без изключения
- PostgreSQL Row-Level Security на всяка таблица с `tenant_id`
- Tenant резолюция: HTTP `Host` header → Redis lookup (TTL 5 мин) → PostgreSQL fallback
- Tenant config кешира се в Redis; при промяна на `tenant_configs` → кешът се инвалидира автоматично
- `features` JSONB поле per tenant: `{"logistics": true, "kasko": false, "fleet": true, "api_access": false}`
- Нов тенант се активира само след: валиден КФН лиценз + завършен Stripe Connect Express onboarding

**Tenant lifecycle:**
1. Super Admin създава покана → брокерът получава имейл
2. Stripe Connect Express onboarding → webhook `account.updated` → тенантът е активиран
3. Брокерът конфигурира брандиране и домейн
4. Offboarding: data export → деактивация → активните полици остават валидни

### RBAC Matrix

| Роля | Описание | Ключови права |
|------|----------|---------------|
| `super_admin` | Platform Owner | Пълен достъп до всички тенанти, billing, insurer matrix, feature flags |
| `admin` | Platform оператор | Мониторинг, support, без финансови операции |
| `broker_admin` | Собственик на тенант | Пълен достъп в своя тенант: агенти, клиенти, брандиране, комисиони |
| `fleet_admin` | Fleet мениджър | Fleet управление, bulk полици, суб-роли за шофьори |
| `fleet_viewer` | Само четене на fleet данни | Без право на покупка |
| `driver` | Шофьор в fleet | Вижда само собствените си полици и МПС |
| `client` | Краен клиент | Собствените си полици, МПС, плащания, claims |

**Принципи:**
- Всяка роля е scoped към `tenant_id` — `broker_admin` на Тенант A няма достъп до данни на Тенант B
- `super_admin` и `admin` са tenant-agnostic (platform-level роли)
- JWT token съдържа `role` + `tenant_id` — валидира се при всяка заявка

### Subscription Tiers

| Feature | Starter (€149/мес) | Professional (€399/мес) | Enterprise (custom, min €1,020/мес) |
|---------|-------------------|------------------------|-------------------------------------|
| Брокер агенти | до 3 | до 15 | неограничен |
| Продукти | ГО | ГО + Каско | Всички + custom |
| White-label | Базов | Пълен | Пълен + custom домейн |
| API достъп | ❌ | ⚠️ Read-only | ✅ Пълен |
| OCR снимки | **3x (предна + задна)** | **3x (предна + задна)** | **3x + batch upload (Fleet)** |
| Fleet Management | ❌ | ✅ | ✅ |
| BI Dashboard | ❌ | ✅ | ✅ |
| Giveback Edition | ❌ | ❌ | ✅ |
| Web portal | ✅ Mobile-friendly PWA | ✅ | ✅ |
| Offline wallet | ✅ | ✅ | ✅ |
| Platform fee (ГО) | 2.5% | 2.0% | 1.5% |
| Platform fee (Каско) | N/A | 1.8% | 1.3% |
| SLA | 99.5% | 99.5% | 99.9% |
| Support | Email 72h | Priority 24h | Dedicated AM |

**Billing механизъм:**
- SaaS абонамент: Stripe Subscription, автоматично таксуване
- Platform fee: Stripe Connect `application_fee_amount` = premium × platform_fee_pct — удържа се автоматично при всяко плащане
- Success fee (disabled по подразбиране): `success_fee` колона в `tenants`, NULL = disabled; активира се без deploy
- Monthly invoice: cron job на 1-ви в 06:00 EET → агрегира `policy_events` → PDF → Stripe Invoice

### Integration List

| Интеграция | Тип | Критичност | Fallback |
|-----------|-----|-----------|---------|
| Insurer APIs | REST/SOAP adapter | Критична | Circuit breaker (5/60s) → skip insurer |
| Stripe Connect Express | Payments | Критична | Няма fallback |
| КАТ / Traffic Police API | VIN валидация | Висока | Manual VIN entry с предупреждение |
| Google Vision API | OCR primary | Висока | AWS Textract fallback |
| AWS Textract | OCR fallback | Средна | Manual entry |
| Гаранционен фонд API | МПС проверка | Висока | Manual check + warning |
| SendGrid | Transactional email | Средна | Queue + retry; SMTP fallback |
| Twilio / Neterra | SMS OTP | Висока | Email OTP fallback |
| Firebase FCM | Push notifications | Средна | Email fallback |
| Speedy / Econt | Логистика за стикер | Средна | Feature flag per tenant |
| DKP Wizard (собствен) | Offline Accident Declaration (FR59/FR60) | Средна | — |
| Amazon S3 | Document storage | Критична | Multi-region redundancy |

**Adapter Pattern:** Всеки застраховател е отделен adapter зад общ `InsurerAdapter` интерфейс.

### UX & Responsive Design

**Mobile-first принцип** за всички канали (Flutter + Next.js уеб):

| Breakpoint | Range | Третира се като | Примери |
|-----------|-------|----------------|---------|
| Mobile | < 768px | Mobile | iPhone, Android phones |
| Small tablet | 768px – 1023px | Mobile-friendly | iPad Mini portrait, малки Android таблети |
| Large tablet + Desktop | ≥ 1024px | Desktop | iPad Air, iPad Pro (portrait + landscape), laptop, desktop |

**PWA capabilities (Next.js уеб):**
- Service Worker за offline достъп до wallet (само вече издадени документи)
- Add to Home Screen — алтернатива на app install за потребители като Радка
- Push notifications през браузъра
- Quote flow = винаги online (изисква insurer API — не може да е offline)

**Next.js caching strategy:**
- ISR (Incremental Static Regeneration) за tenant брандиране (рядко се сменя)
- Dynamic rendering за quote results (винаги fresh — стари цени са недопустими)

**White-label Design Guardrails:**
- Минимален размер на лого
- Автоматична проверка на color contrast (WCAG AA)
- Preview преди публикуване на брандиращи промени

### Technical Architecture Considerations

| Решение | Избор | Защо |
|---------|-------|------|
| Backend | NestJS 10 (Modular Monolith) | Модулна структура; future microservices extraction |
| Mobile | Flutter 3.19 (BLoC) | Single codebase iOS+Android; offline-first с Hive |
| Web | Next.js 14 (App Router) + PWA | SSR за SEO; mobile-first responsive; tenant theme от middleware |
| Database | PostgreSQL 16 + RLS | Native RLS за tenant isolation; UUID PKs |
| Cache/Queue | Redis 7 + BullMQ | Tenant config cache; async jobs |
| Hosting | AWS ECS Fargate + Terraform | IaC; dev/staging/prod |


## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Подход:** Revenue MVP — минималният набор, при който брокерът продава първата ГО полица под собствен бранд и получава комисионата автоматично. Валидира core value proposition и генерира реален приход от ден 1.

**Ресурсни изисквания:** 1 Backend Dev (NestJS) · 1 Frontend Dev (Flutter + Next.js) · 1 DevOps · 1 CEO/Product (insurer contracts, sales, КФН compliance)

### MVP Feature Set (Phase 1 — Q1–Q2 2026)

**Core Journeys в MVP:** Journey 1 (подновяване), Journey 1b (нов клиент), Journey 1c (renewal ескалация — пълна верига до 30 дни след launch), Journey 2 (OCR failure), Journey 3 (broker onboarding), Journey 4 (Super Admin)

**Must-Have Capabilities:**

| Capability | Защо е Must-Have |
|-----------|-----------------|
| Мулти-тенант white-label (домейн, лого, цветове) | Без бранд — няма продукт |
| Platform subdomain по подразбиране (`{slug}.branivo.bg`) | Брокерът продава от минута 0; custom домейн = async upgrade |
| OCR 3 снимки (Part I + Part II) — всички тиери | Core differentiator |
| Anonymous quote flow + inline micro-registration | Премахва конверсионната бариера |
| ≥ 3 застрахователя при public launch (beta = 1–2) | < 3 оферти = невъзможно "сравнение" |
| Stripe Connect Express + platform fee | Core бизнес модел |
| PDF + Green Card генериране | Законово задължително (КЗ) |
| Speedy/Econt логистика (feature flag) | Задължително докато стикерът съществува |
| Broker Dashboard (комисиони, клиенти, полици) | Оперативна необходимост |
| Renewal: D-7 push при launch → пълна ескалация в 30 дни | Retention без ръчен труд |
| Super Admin (tenant management, billing cron) | Оперативна необходимост от ден 1 |
| KFN compliance + GDPR baseline | Законово задължително |
| PWA уеб портал (mobile-first, ≥ 1024px = desktop) | Двоен канал |
| A/B тест inline micro-registration (старт M2) | Валидира core innovation от Phase 1 |

**Съзнателно извадени от MVP:**
- Каско модул → Phase 2
- Fleet Management → Phase 2
- BI Dashboard → Phase 2
- API Tier (embedded insurance) → Phase 2
- Giveback Edition → Phase 3
- DKP wizard + Accident Report → Phase 2
- Referral програма → Phase 2
- Broker offboarding flow → Phase 2

### Post-MVP Features

**Phase 2 — Growth (Q3–Q4 2026, 25→65 брокера):**
- Каско модул + OCR Part II
- Собствен DKP wizard (FR59/FR60) + Accident Report
- Fleet Management (Journey 6)
- BI Dashboard за брокери
- API Sandbox + Growth tier (Journey 5)
- Referral програма
- Broker offboarding flow (Journey 7)

**Phase 3 — Балкански пазари (2027–2028, 65→140 брокера):**
- Румъния (ASF, RON), Северна Македония, Гърция
- Property Insurance, Travel (партньорски модел)
- Giveback Edition (Enterprise)
- AI-assisted claims processing
- Scale API tier

**Phase 4 — Platform Leader (2029–2030, 140→400+ брокера):**
- Health Insurance (партньорски модел)
- Пълна автоматизация при отпадане на физическия стикер
- M&A / licensing opportunities

### Risk Mitigation Strategy

**Технически рискове:**

| Риск | Митигация |
|------|-----------|
| Insurer API интеграция бавна | Beta с 1–2 застрахователя; public launch само с ≥ 3 |
| OCR качество под очакванията | Beta M1–M3 с 3–5 пилотни брокера; OCR Analytics Dashboard от ден 1 |
| DNS propagation забавяне | Platform subdomain активен веднага; custom домейн = async |

**Пазарни рискове:**

| Риск | Митигация |
|------|-----------|
| Брокерите не конвертират от trial | 30-дневен trial без CC; персонализирано демо |
| Конкурент с по-голям бюджет | Speed of execution; Балкански фокус; OCR differentiator |
| Талонът не отпада | Платформата работи пълноценно и без тази промяна |

**Ресурсни рискове:**

| Риск | Митигация |
|------|-----------|
| По-малък екип | MVP scope е дефиниран за 3-членен екип; Каско и Fleet са Phase 2 |
| Insurer договори закъсняват | Паралелни преговори с ≥ 5 застрахователя |
| Регулаторно одобрение закъснява | КФН консултант от M1; платформата е инфраструктура |

## Functional Requirements

### 1. Идентичност и Достъп (IAM)

- **FR1:** Краен клиент може да се регистрира само с телефонен номер чрез SMS OTP (inline micro-registration, без redirect, ~20 секунди)
- **FR2:** Краен клиент може да разглежда и сравнява оферти анонимно без регистрация
- **FR3:** Системата запазва анонимната сесия с OCR данни за 48 часа и мигрира данните в акаунта при регистрация без повторно въвеждане
- **FR4:** Брокер може да влиза в Dashboard с имейл + парола + 2FA
- **FR5:** Super Admin може да създава, редактира и изтрива роли и да назначава/отнема права per role на платформено ниво
- **FR6:** Системата ограничава достъпа на всяка роля до нейния tenant_id — роля в Тенант A няма достъп до данни на Тенант B

### 2. Мулти-тенант и White-Label

- **FR7:** Super Admin може да създава нов тенант чрез имейл покана към брокера
- **FR8:** Тенант се активира автоматично след завършен Stripe Connect Express onboarding и верифициран КФН лиценз
- **FR9:** Брокер може да конфигурира white-label брандиране (лого, цветова схема, домейн) без техническа помощ
- **FR10:** Системата прилага Design Guardrails при брандиране — WCAG AA color contrast, минимален размер на лого, preview преди публикуване
- **FR11:** Брокерът получава работещ subdomain (`{slug}.branivo.bg`) веднага след активация; custom домейн е асинхронен upgrade
- **FR12:** Системата резолвира тенант по HTTP Host header при всяка заявка (с tenant config cache)
- **FR13:** Super Admin може да деактивира тенант при отнет КФН лиценз (нови продажби блокирани; съществуващи полици достъпни)
- **FR14:** Брокерът може да управлява feature flags за своя тенант (логистика, Каско, Fleet, API достъп) без deploy

### 3. OCR и Управление на МПС

- **FR15:** Краен клиент може да сканира свидетелство за регистрация (3 снимки — Part I + Part II) за автоматично попълване на данни при първо добавяне на МПС
- **FR16:** Системата използва fallback OCR provider при confidence под прага (0.85)
- **FR17:** Системата показва частично попълнени полета с визуална индикация при непълен OCR резултат
- **FR18:** Краен клиент може да въведе данни ръчно при OCR failure (graceful degradation)
- **FR19:** Системата валидира VIN срещу КАТ Traffic Police API (с ръчен fallback при недостъпност)
- **FR20:** Системата проверява МПС срещу Гаранционен фонд API за нерегламентирани МПС
- **FR21:** Системата запазва данните на МПС след първа регистрация; при подновяване данните се зареждат автоматично без ново сканиране
- **FR22:** Super Admin може да вижда OCR Analytics Dashboard с per-field confidence score и fallback rate; автоматичен алерт при fallback rate > 20% за поле

### 4. Quote и Покупка

- **FR23:** Краен клиент може да получи паралелни ГО оферти от всички активни застрахователи едновременно
- **FR24:** Системата прилага circuit breaker при insurer API failures (5 грешки за 60 сек → отваря; 30 сек half-open)
- **FR25:** Краен клиент може да купи полица с карта, Apple Pay или Google Pay
- **FR26:** Системата прилага 3DS 2.0 автентикация за всяко плащане (PSD2)
- **FR27:** Системата генерира PDF полица и Зелена карта асинхронно след потвърдено плащане
- **FR28:** Краен клиент получава PDF + Зелена карта на имейл след издаване на полица
- **FR29:** Краен клиент може да достъпи полицата offline в дигитален портфейл (offline storage capability)
- **FR30:** Системата инициира доставка на стикер чрез Speedy/Econt след издаване на ГО полица (feature flag per tenant)

### 5. Комисиони и Абонамент

- **FR31:** Stripe автоматично удържа platform fee при всяко плащане чрез `application_fee_amount`
- **FR32:** Брокер може да вижда комисиони и приходи в реално време в Dashboard (optimistic UI при webhook delay — никога не показва €0 за продадена полица)
- **FR33:** Super Admin може да конфигурира commission matrix (per insurer × per product type) без code deploy
- **FR34:** Системата генерира месечна фактура за всеки тенант чрез scheduled job на 1-ви в месеца в 06:00 EET
- **FR35:** Super Admin получава алерт при billing job failure в 15 минути и може да стартира ръчен billing run
- **FR36:** При Stripe account revocation нови продажби се блокират автоматично; съществуващите полици остават достъпни

### 6. Renewal и Нотификации

- **FR37:** Системата изпраща push notification при изтичаща полица (D-30, D-7)
- **FR38:** Системата изпраща SMS при изтичаща полица (D-3)
- **FR39:** Системата изпраща имейл при изтичаща полица (D-1)
- **FR40:** Брокерът получава notification в Dashboard при клиент с изтекла полица (D+1)
- **FR41:** Super Admin може да конфигурира timing (D-X), канали (push/SMS/имейл/dashboard) и ред на renewal escalation per tenant
- **FR42:** Системата може да изпраща push notification чрез браузъра към потребители на PWA уеб портал

### 7. Fleet Management

- **FR43:** Fleet Admin може да управлява група от МПС с визуален статус на ГО (зелено/жълто/червено)
- **FR44:** Fleet Admin може да получи оферти и закупи полици за множество МПС едновременно (bulk UX)
- **FR45:** Системата обработва individual Stripe charge per полица при bulk fleet операция (без saga complexity)
- **FR46:** Fleet Admin може да генерира batch PDF export на множество полици
- **FR47:** Driver може да вижда само собствените си полици и МПС (role-scoped view)

### 8. Претенции и Accident Declaration (DKP)

- **FR48:** Краен клиент може да подава застрахователна претенция с прикачени документи и снимки *(Phase 2)*
- **FR49:** Брокерът може да проследява статуса на претенциите на своите клиенти в Dashboard *(Phase 2)*
- **FR59:** Краен клиент може да попълни Двустранен Констативен Протокол (DKP) изцяло офлайн на едно устройство — само едната страна въвежда всички данни ръчно, след което двамата участника се подписват последователно на едно и също устройство; без нужда от второ устройство или QR код
- **FR60:** Системата изпраща SMS и имейл с потвърдителен линк към втория участник след подписването; финалният DKP PDF се генерира само след потвърждение от втория участник и се изпраща автоматично на двамата участника и на застрахователя

### 9. Super Admin и Платформена Операция

- **FR50:** Super Admin може да мониторира здравето на всички тенанти (активност, 0 полици за 7+ дни алерт)
- **FR51:** Super Admin може да мониторира статуса на insurer APIs и да активира manual fallback чрез feature flag
- **FR52:** Super Admin може да upgrade/downgrade абонаментния тиер на тенант и да активира/деактивира plan-specific feature flags без code deploy
- **FR53:** Super Admin може да изпраща системни известия към отделни тенанти или всички

### 10. API и Embedded Insurance

- **FR54:** API Consumer може да получи ГО оферти чрез REST API с API key
- **FR55:** API Consumer може да издаде полица чрез API и да получи webhook потвърждение
- **FR56:** Платформата предоставя API Sandbox среда за тестване без реален трафик
- **FR57:** Системата прилага rate limiting per API consumer и per tenant (предотвратява price scraping)
- **FR58:** Системата таксува API usage над плановия лимит (per-request billing)

### 11. Compliance и GDPR

- **FR61:** Системата криптира всички лични данни at-rest (AES-256-GCM) и in-transit (TLS 1.3)
- **FR62:** Системата поддържа audit log за всяка write операция (100% coverage) — изискване за КФН одити
- **FR63:** Краен клиент може да поиска пълен data export на личните си данни (GDPR right of access)
- **FR64:** Брокерът може да поиска offboarding с пълен GDPR-съвместим data export; издадените полици остават валидни до изтичането им
- **FR65:** Системата прилага soft delete с configurable retention period и автоматично физическо изтриване

## Non-Functional Requirements

### Performance

- **NFR1:** OCR pipeline (3 снимки → попълнени полета) завършва в **< 30 секунди** при нормални мрежови условия (sync path: Google Vision < 15 сек; async path: AWS Textract < 30 сек)
- **NFR2:** Quote API резултати (паралелни заявки към всички застрахователи) се показват в **< 5 секунди** (Promise.allSettled с timeout per insurer)
- **NFR3:** Страниците на уеб портала се зареждат в **< 2 секунди** (First Contentful Paint) на 4G мрежа
- **NFR4:** PDF полица + Зелена карта се генерират и изпращат на имейл в **< 5 минути** след потвърдено плащане
- **NFR5:** Плащането (Stripe 3DS → потвърждение) приключва в **< 15 секунди** при успешна автентикация
- **NFR6:** Broker Dashboard зарежда комисиони и статистики в **< 3 секунди** за последните 30 дни
- **NFR7:** Tenant резолюция (Host header → конфигурация) завършва в **< 50 ms** (Redis кеш hit)

### Reliability

- **NFR8:** Target uptime **99.9%** за Enterprise тиер; **99.5%** за Starter/Professional — измерено месечно, изключвайки planned maintenance; SLA breach → pro-rata credit по договор
- **NFR9:** Нулеви загубени транзакции — Stripe webhook retry при failure; idempotency key за всяко плащане
- **NFR10:** MTTR при tenant isolation инцидент **< 15 минути**
- **NFR11:** Billing cron failure се детектира и алертира в **< 15 минути**
- **NFR12:** При insurer API failure — circuit breaker активира се автоматично (5 грешки / 60 сек); системата продължава да работи с останалите застрахователи
- **NFR13:** BullMQ job queue — failed jobs се retry-ват с exponential backoff; dead letter queue за jobs неуспешни след 3 опита → Super Admin алерт + broker notification ако засяга издадена полица
- **NFR14:** Redis session за анонимен flow (TTL 48h) — при Redis failure системата деградира gracefully (изисква login вместо анонимен flow)
- **NFR50:** PWA Service Worker кешира PDF документи от **последните 12 месеца**; общ кеш лимит **50 MB per device** за PDF документи; DKP wizard снимки се съхраняват отделно (max **10 MB per protocol**) и се изчистват автоматично след успешен sync

### Security

- **NFR15:** Всички лични данни криптирани **at-rest с AES-256-GCM** и **in-transit с TLS 1.3**
- **NFR16:** PostgreSQL RLS на всяка таблица с `tenant_id` — нарушението е регулаторен инцидент; нулеви кръстосвания на данни между тенанти
- **NFR17:** JWT токени с **< 15 минути** expiry за access token; refresh token rotation с Redis blacklist (TTL = refresh token lifetime); при Redis failure → force re-login
- **NFR18:** SMS OTP: 6 цифри, TTL 5 минути, **максимум 3 опита/час** per телефонен номер
- **NFR19:** Системата генерира уникален, непредвидим идентификатор за всяка entity — предотвратява enumeration attacks
- **NFR20:** Signed URL за S3 документи с **TTL 15 минути** — документите не са публично достъпни
- **NFR21:** Платформата не съхранява карта данни — Stripe обработва всичко; **PCI DSS SAQ A** compliant
- **NFR22:** Penetration test от акредитирана фирма задължителен преди всеки major phase launch; критерий за успех: **No Critical или High severity unresolved findings**; Medium findings с документиран mitigation plan
- **NFR23:** Rate limiting per-tenant и per-user за quote API — предотвратява price scraping
- **NFR24:** Audit log за **100% от write операциите** — обхваща: издаване на полица, плащане, промяна на tenant config, commission matrix edit, user role change, генериране на Signed URL за документ *(реалният S3 достъп е технически недостъпен за логване)*

### Scalability

- **NFR25:** Архитектурата поддържа **10x ръст на тенанти** (25 → 250+) без промяна на application layer; database partitioning по `tenant_id` е подготвена от Phase 1 за активиране при > 100 активни тенанта
- **NFR26:** Database connection pooling (PgBouncer) — поддържа **1,000+ едновременни connections** при peak
- **NFR27:** BullMQ workers могат да се скалират хоризонтално за PDF генериране и нотификации при fleet bulk операции
- **NFR28:** Multi-tenant архитектурата поддържа добавяне на нов regulatory framework (нова държава) без промяна на core schema

### Accessibility

- **NFR29:** Уеб порталът съответства на **WCAG 2.1 Level AA** — color contrast ratio ≥ 4.5:1 за нормален текст
- **NFR30:** Design Guardrails валидират color contrast при white-label брандиране; брокерът вижда **preview върху реален quote flow screen** преди публикуване — не може да публикува нон-compliant тема
- **NFR31:** Всички форми имат ясни error messages и field labels — достъпни за screen readers
- **NFR32:** Quote flow е функционален на ≥ 1024px (desktop/iPad), 768–1023px (small tablet) и < 768px (mobile); **минимален font size 16px за body text** в Flutter и уеб портал

### Integration

- **NFR33:** Всеки insurer adapter е изолиран зад `InsurerAdapter` интерфейс — нов застраховател се добавя без промяна на core логика
- **NFR34:** Circuit breaker параметри за всички external APIs: **5 грешки / 60 сек → отваря; 30 сек half-open; 1 probe заявка**
- **NFR35:** Stripe webhook обработва се **idempotently** — дублирани webhook events не създават дублирани записи
- **NFR36:** Дефинирани timeouts: insurer APIs **5 сек**; OCR sync (Google Vision) **15 сек**; OCR async (AWS Textract) **30 сек**; КАТ API **3 сек**
- **NFR37:** SendGrid failure → автоматично fallback към SMTP; Twilio SMS failure → email OTP fallback

### Maintainability

- **NFR38:** Цялата инфраструктура е дефинирана като **IaC с Terraform** — dev, staging и prod environments са functionally identical: same Postgres version, same Redis config, same BullMQ workers
- **NFR39:** Системата поддържа per-tenant feature configuration — активиране/деактивиране на функционалност без code deploy
- **NFR40:** Commission matrix се конфигурира от Super Admin без code deploy — промените влизат в сила веднага и се логват в audit_log
- **NFR41:** Системата поддържа soft delete на всички entities; лични данни се изтриват физически **24 месеца след soft delete**, освен ако активна полица изисква запазване за одитни цели
- **NFR47:** Платформата генерира **structured logs** (JSON) за всяка заявка с `tenant_id`, `user_id`, `trace_id` — агрегирани в централизирана logging система
- **NFR48:** **Distributed tracing** за quote pipeline — latency per insurer visible в Super Admin; автоматичен алерт при error rate > 1% за 5 минути per tenant
- **NFR51:** Всяко production deployment минава CI pipeline с **unit + integration tests**; deployment в production само след успешна staging validation

### Offline & Sync

- **NFR52:** DKP wizard данни (FR59) се съхраняват в **локално хранилище** при offline попълване; при възстановяване на мрежа — **автоматичен sync и изпращане на потвърдителен SMS/имейл** към втория участник (FR60)

### Compliance

- **NFR42:** **GDPR:** DPA с всеки брокер-тенант задължителен преди активация; покрива sub-processors (AWS, Stripe, Google Vision, SendGrid, Twilio)
- **NFR43:** **КФН:** Всяка продажба минава през лицензиран брокер-тенант; платформата деактивира тенант при отнет лиценз
- **NFR44:** **КЗ:** Scoring алгоритъм (`is_recommended`) — входни данни, weights и резултат се логват за одитируемост
- **NFR45:** **PSD2:** Stripe 3DS 2.0 задължителен за всяко картово плащане в ЕС
- **NFR46:** **Документи:** PDF полици и Зелени карти са immutable след издаване — не могат да се редактират или изтриват

### Support SLA

- **NFR53:** Support response time по тиер: Starter **72 часа** (имейл); Professional **24 часа** (priority); Enterprise **Dedicated Account Manager** с дефиниран response time по договор


