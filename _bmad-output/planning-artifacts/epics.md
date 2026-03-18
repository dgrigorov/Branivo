---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# Branivo - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Branivo, decomposing the requirements from the PRD, UX Design and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Краен клиент може да се регистрира само с телефонен номер чрез SMS OTP (inline micro-registration, без redirect, ~20 секунди)
FR2: Краен клиент може да разглежда и сравнява оферти анонимно без регистрация
FR3: Системата запазва анонимната сесия с OCR данни за 48 часа и мигрира данните в акаунта при регистрация без повторно въвеждане
FR4: Брокер може да влиза в Dashboard с имейл + парола + 2FA
FR5: Super Admin може да създава, редактира и изтрива роли и да назначава/отнема права per role на платформено ниво
FR6: Системата ограничава достъпа на всяка роля до нейния tenant_id — роля в Тенант A няма достъп до данни на Тенант B
FR7: Super Admin може да създава нов тенант чрез имейл покана към брокера
FR8: Тенант се активира автоматично след завършен Stripe Connect Express onboarding и верифициран КФН лиценз
FR9: Брокер може да конфигурира white-label брандиране (лого, цветова схема, домейн) без техническа помощ
FR10: Системата прилага Design Guardrails при брандиране — WCAG AA color contrast, минимален размер на лого, preview преди публикуване
FR11: Брокерът получава работещ subdomain (`{slug}.branivo.bg`) веднага след активация; custom домейн е асинхронен upgrade
FR12: Системата резолвира тенант по HTTP Host header при всяка заявка (с tenant config cache)
FR13: Super Admin може да деактивира тенант при отнет КФН лиценз (нови продажби блокирани; съществуващите полици достъпни)
FR14: Брокерът може да управлява feature flags за своя тенант (логистика, Каско, Fleet, API достъп) без deploy
FR15: Краен клиент може да сканира свидетелство за регистрация (3 снимки — Part I + Part II) за автоматично попълване на данни при първо добавяне на МПС
FR16: Системата използва fallback OCR provider при confidence под прага (0.85)
FR17: Системата показва частично попълнени полета с визуална индикация при непълен OCR резултат
FR18: Краен клиент може да въведе данни ръчно при OCR failure (graceful degradation)
FR19: Системата валидира VIN срещу КАТ Traffic Police API (с ръчен fallback при недостъпност)
FR20: Системата проверява МПС срещу Гаранционен фонд API за нерегламентирани МПС
FR21: Системата запазва данните на МПС след първа регистрация; при подновяване данните се зареждат автоматично без ново сканиране
FR22: Super Admin може да вижда OCR Analytics Dashboard с per-field confidence score и fallback rate; автоматичен алерт при fallback rate > 20% за поле
FR23: Краен клиент може да получи паралелни ГО оферти от всички активни застрахователи едновременно
FR24: Системата прилага circuit breaker при insurer API failures (5 грешки за 60 сек → отваря; 30 сек half-open)
FR25: Краен клиент може да купи полица с карта, Apple Pay или Google Pay
FR26: Системата прилага 3DS 2.0 автентикация за всяко плащане (PSD2)
FR27: Системата генерира PDF полица и Зелена карта асинхронно след потвърдено плащане
FR28: Краен клиент получава PDF + Зелена карта на имейл след издаване на полица
FR29: Краен клиент може да достъпи полицата offline в дигитален портфейл (offline storage capability)
FR30: Системата инициира доставка на стикер чрез Speedy/Econt след издаване на ГО полица (feature flag per tenant)
FR31: Stripe автоматично удържа platform fee при всяко плащане чрез `application_fee_amount`
FR32: Брокер може да вижда комисиони и приходи в реално време в Dashboard (optimistic UI при webhook delay — никога не показва €0 за продадена полица)
FR33: Super Admin може да конфигурира commission matrix (per insurer × per product type) без code deploy
FR34: Системата генерира месечна фактура за всеки тенант чрез scheduled job на 1-ви в месеца в 06:00 EET
FR35: Super Admin получава алерт при billing job failure в 15 минути и може да стартира ръчен billing run
FR36: При Stripe account revocation нови продажби се блокират автоматично; съществуващите полици остават достъпни
FR37: Системата изпраща push notification при изтичаща полица (D-30, D-7)
FR38: Системата изпраща SMS при изтичаща полица (D-3)
FR39: Системата изпраща имейл при изтичаща полица (D-1)
FR40: Брокерът получава notification в Dashboard при клиент с изтекла полица (D+1)
FR41: Super Admin може да конфигурира timing (D-X), канали (push/SMS/имейл/dashboard) и ред на renewal escalation per tenant
FR42: Системата може да изпраща push notification чрез браузъра към потребители на PWA уеб портал
FR43: Fleet Admin може да управлява група от МПС с визуален статус на ГО (зелено/жълто/червено)
FR44: Fleet Admin може да получи оферти и закупи полици за множество МПС едновременно (bulk UX)
FR45: Системата обработва individual Stripe charge per полица при bulk fleet операция (без saga complexity)
FR46: Fleet Admin може да генерира batch PDF export на множество полици
FR47: Driver може да вижда само собствените си полици и МПС (role-scoped view)
FR48: Краен клиент може да подава застрахователна претенция с прикачени документи и снимки (Phase 2)
FR49: Брокерът може да проследява статуса на претенциите на своите клиенти в Dashboard (Phase 2)
FR50: Super Admin може да мониторира здравето на всички тенанти (активност, 0 полици за 7+ дни алерт)
FR51: Super Admin може да мониторира статуса на insurer APIs и да активира manual fallback чрез feature flag
FR52: Super Admin може да upgrade/downgrade абонаментния тиер на тенант и да активира/деактивира plan-specific feature flags без code deploy
FR53: Super Admin може да изпраща системни известия към отделни тенанти или всички
FR54: API Consumer може да получи ГО оферти чрез REST API с API key
FR55: API Consumer може да издаде полица чрез API и да получи webhook потвърждение
FR56: Платформата предоставя API Sandbox среда за тестване без реален трафик
FR57: Системата прилага rate limiting per API consumer и per tenant (предотвратява price scraping)
FR58: Системата таксува API usage над плановия лимит (per-request billing)
FR59: Краен клиент може да попълни Двустранен Констативен Протокол (DKP) изцяло офлайн на едно устройство — само едната страна въвежда всички данни ръчно, след което двамата участника се подписват последователно на едно и също устройство; без нужда от второ устройство или QR код
FR60: Системата изпраща SMS и имейл с потвърдителен линк към втория участник след подписването; финалният DKP PDF се генерира само след потвърждение от втория участник и се изпраща автоматично на двамата участника и на застрахователя
FR61: Системата криптира всички лични данни at-rest (AES-256-GCM) и in-transit (TLS 1.3)
FR62: Системата поддържа audit log за всяка write операция (100% coverage) — изискване за КФН одити
FR63: Краен клиент може да поиска пълен data export на личните си данни (GDPR right of access)
FR64: Брокерът може да поиска offboarding с пълен GDPR-съвместим data export; издадените полици остават валидни до изтичането им
FR65: Системата прилага soft delete с configurable retention period и автоматично физическо изтриване

### NonFunctional Requirements

NFR1: OCR pipeline (3 снимки → попълнени полета) завършва в < 30 секунди при нормални мрежови условия (sync path: Google Vision < 15 сек; async path: AWS Textract < 30 сек)
NFR2: Quote API резултати (паралелни заявки към всички застрахователи) се показват в < 5 секунди (Promise.allSettled с timeout per insurer)
NFR3: Страниците на уеб портала се зареждат в < 2 секунди (First Contentful Paint) на 4G мрежа
NFR4: PDF полица + Зелена карта се генерират и изпращат на имейл в < 5 минути след потвърдено плащане
NFR5: Плащането (Stripe 3DS → потвърждение) приключва в < 15 секунди при успешна автентикация
NFR6: Broker Dashboard зарежда комисиони и статистики в < 3 секунди за последните 30 дни
NFR7: Tenant резолюция (Host header → конфигурация) завършва в < 50 ms (Redis кеш hit)
NFR8: Target uptime 99.9% за Enterprise тиер; 99.5% за Starter/Professional — измерено месечно, изключвайки planned maintenance; SLA breach → pro-rata credit по договор
NFR9: Нулеви загубени транзакции — Stripe webhook retry при failure; idempotency key за всяко плащане
NFR10: MTTR при tenant isolation инцидент < 15 минути
NFR11: Billing cron failure се детектира и алертира в < 15 минути
NFR12: При insurer API failure — circuit breaker активира се автоматично (5 грешки / 60 сек); системата продължава да работи с останалите застрахователи
NFR13: BullMQ job queue — failed jobs се retry-ват с exponential backoff; dead letter queue за jobs неуспешни след 3 опита → Super Admin алерт + broker notification ако засяга издадена полица
NFR14: Redis session за анонимен flow (TTL 48h) — при Redis failure системата деградира gracefully (изисква login вместо анонимен flow)
NFR15: Всички лични данни криптирани at-rest с AES-256-GCM и in-transit с TLS 1.3
NFR16: PostgreSQL RLS на всяка таблица с tenant_id — нарушението е регулаторен инцидент; нулеви кръстосвания на данни между тенанти
NFR17: JWT токени с < 15 минути expiry за access token; refresh token rotation с Redis blacklist (TTL = refresh token lifetime); при Redis failure → force re-login
NFR18: SMS OTP: 6 цифри, TTL 5 минути, максимум 3 опита/час per телефонен номер
NFR19: Системата генерира уникален, непредвидим идентификатор за всяка entity — предотвратява enumeration attacks
NFR20: Signed URL за S3 документи с TTL 15 минути — документите не са публично достъпни
NFR21: Платформата не съхранява карта данни — Stripe обработва всичко; PCI DSS SAQ A compliant
NFR22: Penetration test от акредитирана фирма задължителен преди всеки major phase launch; критерий за успех: No Critical или High severity unresolved findings; Medium findings с документиран mitigation plan
NFR23: Rate limiting per-tenant и per-user за quote API — предотвратява price scraping
NFR24: Audit log за 100% от write операциите — обхваща: издаване на полица, плащане, промяна на tenant config, commission matrix edit, user role change, генериране на Signed URL за документ
NFR25: Архитектурата поддържа 10x ръст на тенанти (25 → 250+) без промяна на application layer; database partitioning по tenant_id е подготвена от Phase 1 за активиране при > 100 активни тенанта
NFR26: Database connection pooling (PgBouncer) — поддържа 1 000+ едновременни connections при peak
NFR27: BullMQ workers могат да се скалират хоризонтално за PDF генериране и нотификации при fleet bulk операции
NFR28: Multi-tenant архитектурата поддържа добавяне на нов regulatory framework (нова държава) без промяна на core schema
NFR29: Уеб порталът съответства на WCAG 2.1 Level AA — color contrast ratio ≥ 4.5:1 за нормален текст
NFR30: Design Guardrails валидират color contrast при white-label брандиране; брокерът вижда preview върху реален quote flow screen преди публикуване — не може да публикува нон-compliant тема
NFR31: Всички форми имат ясни error messages и field labels — достъпни за screen readers
NFR32: Quote flow е функционален на ≥ 1024px (desktop/iPad), 768–1023px (small tablet) и < 768px (mobile); минимален font size 16px за body text в Flutter и уеб портал
NFR33: Всеки insurer adapter е изолиран зад `InsurerAdapter` интерфейс — нов застраховател се добавя без промяна на core логика
NFR34: Circuit breaker параметри за всички external APIs: 5 грешки / 60 сек → отваря; 30 сек half-open; 1 probe заявка
NFR35: Stripe webhook обработва се idempotently — дублирани webhook events не създават дублирани записи
NFR36: Дефинирани timeouts: insurer APIs 5 сек; OCR sync (Google Vision) 15 сек; OCR async (AWS Textract) 30 сек; КАТ API 3 сек
NFR37: SendGrid failure → автоматично fallback към SMTP; Twilio SMS failure → email OTP fallback
NFR38: Цялата инфраструктура е дефинирана като IaC с Terraform — dev, staging и prod environments са functionally identical: same Postgres version, same Redis config, same BullMQ workers
NFR39: Системата поддържа per-tenant feature configuration — активиране/деактивиране на функционалност без code deploy
NFR40: Commission matrix се конфигурира от Super Admin без code deploy — промените влизат в сила веднага и се логват в audit_log
NFR41: Системата поддържа soft delete на всички entities; лични данни се изтриват физически 24 месеца след soft delete, освен ако активна полица изисква запазване за одитни цели
NFR42: GDPR: DPA с всеки брокер-тенант задължителен преди активация; покрива sub-processors (AWS, Stripe, Google Vision, SendGrid, Twilio)
NFR43: КФН: Всяка продажба минава през лицензиран брокер-тенант; платформата деактивира тенант при отнет лиценз
NFR44: КЗ: Scoring алгоритъм (`is_recommended`) — входни данни, weights и резултат се логват за одитируемост
NFR45: PSD2: Stripe 3DS 2.0 задължителен за всяко картово плащане в ЕС
NFR46: Документи: PDF полици и Зелени карти са immutable след издаване — не могат да се редактират или изтриват
NFR47: Платформата генерира structured logs (JSON) за всяка заявка с tenant_id, user_id, trace_id — агрегирани в централизирана logging система
NFR48: Distributed tracing за quote pipeline — latency per insurer visible в Super Admin; автоматичен алерт при error rate > 1% за 5 минути per tenant
NFR50: PWA Service Worker кешира PDF документи от последните 12 месеца; общ кеш лимит 50 MB per device; DKP wizard снимки се съхраняват отделно (max 10 MB per protocol) и се изчистват автоматично след успешен sync
NFR51: Всяко production deployment минава CI pipeline с unit + integration tests; deployment в production само след успешна staging validation
NFR52: DKP wizard данни (FR59) се съхраняват в локално хранилище при offline попълване; при възстановяване на мрежа — автоматичен sync и изпращане на потвърдителен SMS/имейл към втория участник (FR60)
NFR53: Support response time по тиер: Starter 72 часа (имейл); Professional 24 часа (priority); Enterprise — Dedicated Account Manager с дефиниран response time по договор

### Additional Requirements

**От Architecture:**

- Няма starter template — проектът е greenfield; Epic 1 Story 1 трябва да инициализира monorepo структурата ръчно: `nest new branivo-api`, `flutter create branivo-app`, `npx create-next-app branivo-web`
- Terraform IaC задължителен от Ден 1 — dev environment (RDS + ElastiCache + ECS) е Story 1 на инфраструктурния epic
- TypeORM migrations — never modify existing, само нови файлове; всяка DB таблица изисква UUID PK, tenant_id, created_at, updated_at, deleted_at
- TenantContext middleware — задължително за всяка заявка преди business logic; имплементира се в Epic 1
- PostgreSQL RLS policies — имплементират се заедно с всяка нова таблица, не като отделна стъпка
- Redis key naming convention: `{tenant_id}:{domain}:{key}` — задължителна от Epic 1
- JWT payload задължително съдържа: `sub` (userId), `tid` (tenantId), `role`, `exp`
- S3 key structure: `{tenantId}/{year}/{month}/{documentType}/{uuid}.pdf`
- Signed URLs за S3 с TTL 15 мин — никога директен S3 достъп
- Circuit breaker имплементация с `opossum` library за всички external APIs
- BullMQ queues: `pdf-generation`, `notifications`, `renewal-checks`, `billing`
- Stripe Connect Express onboarding — задължителен за tenant activation flow
- CloudWatch structured logging с tenant_id и trace_id от първия ден

**От UX Design:**

- App-first дизайн философия: Flutter native е reference implementation; PWA (Next.js) е parity channel
- Responsive breakpoints: < 768px (mobile), 768–1023px (tablet), ≥ 1024px (desktop)
- WCAG 2.1 Level AA задължителен за уеб портала и white-label брандирането
- OCR flow: voice feedback при capture; high-contrast frame guide; accessibility screen reader labels
- Inline micro-registration (не modal, не redirect); OTP auto-paste от SMS; smooth expand animation
- Quote cards: screen reader announce winner; keyboard navigable
- Offline DKP: single-device flow; двете страни подписват последователно; no QR код необходим
- Reduced motion поддръжка: `MediaQuery.disableAnimations` → заменя Lottie анимации с color change

### FR Coverage Map

FR1: Epic 3 — SMS OTP inline micro-registration
FR2: Epic 3 — Анонимно разглеждане на оферти без регистрация
FR3: Epic 3 — Мигриране на анонимна сесия при регистрация (48h TTL)
FR4: Epic 1 — Broker login с email + парола + 2FA
FR5: Epic 1 — Super Admin управлява роли и права
FR6: Epic 1 — Tenant isolation — достъп само до собствен tenant_id
FR7: Epic 1 — Super Admin създава тенант с имейл покана
FR8: Epic 1 — Тенант активация след Stripe Connect + КФН лиценз
FR9: Epic 2 — Брокер конфигурира white-label брандиране
FR10: Epic 2 — Design Guardrails при брандиране (WCAG AA, preview)
FR11: Epic 1 (subdomain) / Epic 2 (custom domain upgrade) — Subdomain при активация; custom домейн е async upgrade
FR12: Epic 1 — Tenant резолюция по HTTP Host header с Redis кеш
FR13: Epic 1 — Super Admin деактивира тенант при отнет КФН лиценз
FR14: Epic 2 — Брокер управлява feature flags за тенанта
FR15: Epic 3 — OCR сканиране на свидетелство за регистрация (3 снимки)
FR16: Epic 3 — Fallback OCR provider при confidence < 0.85
FR17: Epic 3 — Визуална индикация при непълен OCR резултат
FR18: Epic 3 — Ръчно въвеждане при OCR failure (graceful degradation)
FR19: Epic 3 — VIN валидация срещу КАТ Traffic Police API
FR20: Epic 3 — МПС проверка срещу Гаранционен фонд API
FR21: Epic 3 — Авто-зареждане на МПС данни при подновяване
FR22: Epic 3 — Super Admin OCR Analytics Dashboard с fallback rate алерти
FR23: Epic 4 — Паралелни ГО оферти от всички активни застрахователи
FR24: Epic 4 — Circuit breaker при insurer API failures
FR25: Epic 4 — Плащане с карта, Apple Pay, Google Pay
FR26: Epic 4 — 3DS 2.0 автентикация (PSD2)
FR27: Epic 4 — Асинхронно генериране на PDF полица и Зелена карта
FR28: Epic 4 — Имейл доставка на PDF + Зелена карта
FR29: Epic 4 — Offline достъп до полицата в дигитален портфейл
FR30: Epic 4 — Стикер доставка чрез Speedy/Econt (feature flag)
FR31: Epic 5 — Stripe platform fee при всяко плащане
FR32: Epic 5 — Broker Dashboard комисиони в реално време
FR33: Epic 5 — Commission matrix конфигурация от Super Admin
FR34: Epic 5 — Месечна фактура на 1-ви в месеца (06:00 EET)
FR35: Epic 5 — Алерт при billing job failure в 15 минути
FR36: Epic 5 — Блокиране на нови продажби при Stripe revocation
FR37: Epic 6 — Push notification при изтичаща полица (D-30, D-7)
FR38: Epic 6 — SMS notification (D-3)
FR39: Epic 6 — Имейл notification (D-1)
FR40: Epic 6 — Broker Dashboard notification (D+1)
FR41: Epic 6 — Super Admin конфигурира renewal escalation per tenant
FR42: Epic 6 — PWA браузър push notifications
FR43: Epic 7 — Fleet Admin визуален статус на ГО за МПС портфолио
FR44: Epic 7 — Bulk quote & purchase за множество МПС
FR45: Epic 7 — Individual Stripe charge per полица при bulk операция
FR46: Epic 7 — Batch PDF export на множество полици
FR47: Epic 7 — Driver role-scoped view (само собствени полици и МПС)
FR48: Epic 12 — Краен клиент подава застрахователна претенция (Phase 2)
FR49: Epic 12 — Брокер проследява статуса на претенции (Phase 2)
FR50: Epic 8 — Super Admin мониторира здравето на всички тенанти
FR51: Epic 8 — Super Admin мониторира insurer APIs и активира fallback
FR52: Epic 8 — Super Admin upgrade/downgrade абонаментен тиер
FR53: Epic 8 — Super Admin изпраща системни известия
FR54: Epic 9 — REST API за ГО оферти с API key
FR55: Epic 9 — Издаване на полица чрез API + webhook потвърждение
FR56: Epic 9 — API Sandbox среда за тестване
FR57: Epic 9 — Rate limiting per API consumer и per tenant
FR58: Epic 9 — API usage billing над плановия лимит
FR59: Epic 10 — Офлайн DKP на едно устройство (single-device flow)
FR60: Epic 10 — SMS/имейл потвърждение + PDF генериране след двойно подписване
FR61: Epic 11 — Encryption at-rest (AES-256-GCM) и in-transit (TLS 1.3)
FR62: Epic 11 — Audit log за 100% write операции (КФН compliance)
FR63: Epic 11 — GDPR data export за краен клиент
FR64: Epic 11 — Broker offboarding с GDPR-съвместим data export
FR65: Epic 11 — Soft delete с configurable retention и авто физическо изтриване

## Epic List

### Epic 1: Platform Foundation & Multi-Tenant Core
Брокерите и Super Admin могат да управляват тенанти с пълна изолация на данните; всяка заявка се резолвира по Host header към правилния тенант. Greenfield monorepo инициализация, Terraform dev environment, TenantContext middleware, RLS policies, JWT auth, Redis naming convention и CloudWatch structured logging са имплементирани от Story 1.
**FRs покрити:** FR4, FR5, FR6, FR7, FR8, FR11 (subdomain), FR12, FR13
**Техническа бележка:** RLS, audit_log таблица и AES-256-GCM encryption infrastructure са cross-cutting concerns — имплементират се тук, не в Epic 11.

### Epic 2: White-Label Broker Portal & Tenant Configuration
Брокерът може да конфигурира собствено брандиране (лого, цветова схема, домейн) и feature flags без техническа помощ — платформата автоматично гарантира WCAG AA compliance чрез Design Guardrails с preview преди публикуване.
**FRs покрити:** FR9, FR10, FR14, FR11 (custom domain async upgrade)

### Epic 3: End Customer Registration & Vehicle Management
Краен клиент може да сканира свидетелство за регистрация, да регистрира МПС автоматично чрез OCR и да създаде акаунт с SMS OTP за под 20 секунди — анонимната сесия се запазва 48h и мигрира при регистрация без повторно въвеждане.
**FRs покрити:** FR1, FR2, FR3, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22
**UX бележка:** Анонимната сесия трябва да работи end-to-end до момента на payment в Epic 4 — UX continuity е задължителна между двата епика.

### Epic 4: Insurance Quote & Policy Purchase
Краен клиент може да сравни паралелни ГО оферти от всички активни застрахователи и да закупи полица с карта/Apple Pay/Google Pay — PDF и Зелена карта се генерират асинхронно и се доставят на имейл за под 5 минути след потвърдено плащане.
**FRs покрити:** FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR30

### Epic 5: Billing & Commission Management
Брокерът вижда комисиони и приходи в реално време; платформата автоматично удържа platform fee, генерира месечни фактури и блокира нови продажби при Stripe account revocation — съществуващите полици остават достъпни.
**FRs покрити:** FR31, FR32, FR33, FR34, FR35, FR36

### Epic 6: Renewal & Notification Engine
Системата автоматично уведомява крайни клиенти за изтичащи полици по push/SMS/имейл по конфигурируем escalation график; брокерът получава dashboard известие при неподновена полица (D+1).
**FRs покрити:** FR37, FR38, FR39, FR40, FR41, FR42

### Epic 7: Fleet Management
Fleet Admin може да управлява портфолио от МПС с визуален ГО статус, да купува полици за множество превозни средства едновременно и да генерира batch PDF exports; Driver вижда само собствените си полици.
**FRs покрити:** FR43, FR44, FR45, FR46, FR47

### Epic 8: Super Admin Platform Operations
Super Admin може да мониторира здравето на всички тенанти и insurer APIs, да управлява абонаментни тиери с feature flags и да изпраща системни известия към отделни тенанти или всички.
**FRs покрити:** FR50, FR51, FR52, FR53

### Epic 9: API Tier & External Integration
API Consumers могат програматично да получават ГО оферти и да издават полици чрез REST API с API key, sandbox среда за тестване и per-request usage billing над плановия лимит.
**FRs покрити:** FR54, FR55, FR56, FR57, FR58

### Epic 10: Digital Claims Protocol (DKP)
Двама участници в ПТП могат да попълнят Двустранен Констативен Протокол изцяло офлайн на едно устройство — финалният PDF се генерира само след потвърждение от втория участник и се изпраща автоматично и на двамата.
**FRs покрити:** FR59, FR60

### Epic 11: GDPR Self-Service & Compliance Portal
Крайни клиенти и брокери могат да упражнят GDPR права (data export, offboarding); платформата прилага soft delete с configurable retention и автоматично физическо изтриване — audit log и encryption са вградени от Epic 1.
**FRs покрити:** FR61, FR62, FR63, FR64, FR65
**Бележка:** FR61 (encryption) и FR62 (audit_log) са имплементирани като инфраструктура в Epic 1; Epic 11 добавя user-facing compliance функционалности.

### Epic 12: Claims Management *(Phase 2)*
Краен клиент може да подава застрахователна претенция с прикачени документи и снимки; брокерът проследява статуса на претенциите на своите клиенти в Dashboard.
**FRs покрити:** FR48, FR49

---

## Epic 2: White-Label Broker Portal & Tenant Configuration

Брокерът може да конфигурира собствено брандиране (лого, цветове, font, домейн) и feature flags без техническа помощ — платформата автоматично гарантира WCAG AA compliance чрез Design Guardrails с preview преди публикуване.

### Story 2.1: White-Label Branding Configuration

As a Broker,
I want to upload my logo, set brand colors and choose a font for my portal,
So that my clients experience a fully branded insurance portal without any technical assistance.

**Acceptance Criteria:**

**Given** a logged-in broker in the Dashboard,
**When** they upload a logo, set primary/secondary colors and select a font,
**Then** промените се прилагат към техния tenant portal в реално време

**Given** a font is selected,
**When** broker opens the font dropdown,
**Then** виждат 5 pre-approved Google Fonts (Inter, Roboto, Lato, Poppins, Open Sans) с live preview

**Given** a color is selected,
**When** Design Guardrails validate it,
**Then** системата изчислява WCAG AA color contrast ratio (≥ 4.5:1 за нормален текст) и блокира публикуването при non-compliance

**Given** branding changes are ready,
**When** broker clicks "Preview",
**Then** вижда preview на реален quote flow screen с новото брандиране, цветовете и избрания font преди публикуване

**Given** non-compliant theme (contrast < 4.5:1),
**When** broker attempts to publish,
**Then** публикуването е блокирано с конкретно съобщение кой цвят нарушава стандарта

**Given** published branding,
**When** any end-client visits the tenant portal,
**Then** вижда брандирания портал с логото, цветовете и шрифта на брокера

**Given** logo upload,
**When** image is processed,
**Then** системата валидира минималния размер и форматите (PNG/SVG)

**Given** tenant config is updated,
**When** branding is saved,
**Then** `brand_logo`, `brand_colors` и `brand_font` се записват в tenant config JSON колоната

### Story 2.2: Custom Domain Configuration

As a Broker,
I want to configure a custom domain for my portal,
So that my clients access the platform through my own brand domain.

**Acceptance Criteria:**

**Given** broker submits a custom domain (e.g. `polici.mybrokerage.bg`),
**When** the request is processed,
**Then** системата генерира DNS verification record (CNAME/TXT) и статусът е `pending`

**Given** DNS verification is initiated,
**When** broker checks domain status,
**Then** виждат текущия статус: `pending` → `verifying` → `active` | `failed` без ръчен refresh

**Given** DNS verification passes,
**When** the domain is confirmed (status → `active`),
**Then** tenant config се обновява и TenantContext middleware резолвира новия домейн правилно

**Given** custom domain is active,
**When** end-client visits `polici.mybrokerage.bg`,
**Then** порталът се зарежда идентично с `{slug}.branivo.bg`

**Given** DNS verification fails (status → `failed`),
**When** broker is notified,
**Then** `{slug}.branivo.bg` subdomain продължава да работи без прекъсване и брокерът вижда инструкции за корекция

### Story 2.3: Feature Flags Management

As a Broker,
I want to enable or disable platform features for my tenant,
So that I can control which functionality my clients see without requiring a code deployment.

**Acceptance Criteria:**

**Given** a logged-in broker in the Dashboard,
**When** they open Feature Management,
**Then** виждат следните 7 toggles с human-readable labels и кратко описание:
- **Fleet Management** (`features.fleet`)
- **Каско Застраховка** (`features.kasko`)
- **API Достъп** (`features.api_access`)
- **Стикер Доставка** (`features.sticker_delivery`)
- **Цифров Констативен Протокол** (`features.dkp`)
- **SMS Известия за Подновяване** (`features.renewal_sms`)
- **Push Известия за Подновяване** (`features.renewal_push`)

**Given** broker toggles a feature flag,
**When** change is saved,
**Then** влиза в сила незабавно за всички заявки към техния tenant (без deploy)

**Given** a feature is disabled,
**When** end-client attempts to access it,
**Then** feature е скрит от UI — без грешки в конзолата

**Given** any feature flag change,
**When** it is applied,
**Then** се логва в `audit_log` с `tenant_id`, `user_id`, `changed_flag`, `old_value`, `new_value`

**Given** a flag is restricted by tenant's plan tier,
**When** broker tries to enable it,
**Then** toggle е disabled с ясно съобщение за изискван абонаментен тиер

---

## Epic 3: End Customer Registration & Vehicle Management

Краен клиент може да сканира свидетелство за регистрация, да регистрира МПС автоматично чрез OCR и да създаде акаунт с SMS OTP за под 20 секунди — анонимната сесия е device-only, запазва се 48h и мигрира при регистрация без повторно въвеждане.

### Story 3.1: Anonymous Session & Quote Browsing

As an anonymous end-client,
I want to browse and compare insurance quotes without registering,
So that I can evaluate options before committing to creating an account.

**Acceptance Criteria:**

**Given** an end-client visits the portal for the first time,
**When** the page loads,
**Then** генерира се уникален анонимен UUID и се запазва в localStorage на устройството

**Given** an anonymous session exists,
**When** client enters vehicle data or OCR scans a document,
**Then** данните се запазват в Redis с ключ `anon:{uuid}:session` (TTL 48h)

**Given** anonymous session is active,
**When** client registers with SMS OTP (Story 3.2),
**Then** всички OCR данни и въведена информация мигрират автоматично в новия акаунт без повторно въвеждане

**Given** 48 hours have passed without registration,
**When** client returns,
**Then** анонимната сесия е изтекла и Redis ключът е изтрит; клиентът започва наново

**Given** Redis is unavailable,
**When** anonymous client attempts to browse,
**Then** системата деградира gracefully — изисква login вместо анонимен flow (NFR14)

**Given** client switches to a different device or browser,
**When** they visit the portal,
**Then** получават нова анонимна сесия — cross-device не е поддържан

### Story 3.2: SMS OTP Inline Registration

As an anonymous end-client,
I want to register with my phone number via SMS OTP without leaving the current page,
So that I can create an account in under 20 seconds and continue where I left off.

**Acceptance Criteria:**

**Given** client clicks "Register" while browsing quotes,
**When** the registration UI appears,
**Then** то се разгъва inline на същата страница (не modal, не redirect) с smooth expand animation

**Given** inline registration form expands,
**When** screen reader is active,
**Then** announce-ва "Регистрационен формуляр се разгъна" (WCAG 2.1 AA accessibility)

**Given** client enters phone number,
**When** they submit,
**Then** SMS с 6-цифрен OTP се изпраща (TTL 5 мин, максимум 3 опита/час per номер)

**Given** correct OTP is entered,
**When** submitted,
**Then** акаунтът е създаден, анонимната сесия е мигрирана и клиентът е автентициран — целият процес < 20 сек

**Given** OTP is received via SMS,
**When** client is on supported device,
**Then** OTP се auto-paste от SMS (SMS auto-fill API)

**Given** 3 failed OTP attempts in 1 hour,
**When** client tries again,
**Then** получава съобщение да опита след 1 час (rate limiting per phone number)

**Given** OTP expires (> 5 минути),
**When** client submits it,
**Then** получава ясна грешка с опция за нов OTP

### Story 3.3: Vehicle Document OCR Scanning

As an end-client,
I want to scan my vehicle registration document with my camera,
So that my vehicle data is filled automatically without manual typing.

**Acceptance Criteria:**

**Given** client initiates vehicle registration,
**When** camera is activated,
**Then** показва се high-contrast frame guide с voice feedback ("Насочете камерата към документа")

**Given** client captures 3 photos (Part I + Part II на свидетелство),
**When** images are submitted to Google Vision (sync path),
**Then** OCR pipeline завършва в < 15 сек и полетата се попълват автоматично

**Given** Google Vision fails or confidence < 0.85,
**When** fallback to AWS Textract (async path) is triggered,
**Then** BullMQ job се queue-ва и клиентът вижда loading state с progress indicator; frontend polls `/ocr/status/{jobId}` на всеки 2 сек до завършване (< 30 сек)

**Given** OCR returns results,
**When** confidence score ≥ 0.85 per field,
**Then** полетата се попълват автоматично

**Given** OCR confidence < 0.85 за дадено поле,
**When** results are displayed,
**Then** полето е визуално маркирано (жълт border/икона) като "непотвърдено" — клиентът може да коригира

**Given** OCR fails completely,
**When** client is notified,
**Then** може да въведе данните ръчно (graceful degradation) — всички полета са достъпни

**Given** reduced motion is enabled on device,
**When** OCR scanning screen loads,
**Then** Lottie анимации са заменени с color change (`MediaQuery.disableAnimations`)

### Story 3.4: Vehicle Data Validation

As an end-client,
I want my vehicle data validated against official registries,
So that I receive accurate quotes and my vehicle is confirmed as legitimate.

**Acceptance Criteria:**

**Given** VIN is entered or OCR-extracted,
**When** validation runs,
**Then** VIN се верифицира срещу КАТ Traffic Police API в < 3 сек

**Given** КАТ API is unavailable,
**When** validation runs,
**Then** системата продължава с ръчен fallback — клиентът може да потвърди VIN сам

**Given** vehicle data is submitted,
**When** Гаранционен фонд API is called,
**Then** МПС се проверява за нерегламентиран статус

**Given** vehicle is flagged by Гаранционен фонд,
**When** check returns positive,
**Then** клиентът е информиран и не може да продължи към quote

**Given** all validations pass,
**When** vehicle is confirmed,
**Then** данните са готови за quote заявка в Epic 4

### Story 3.5: Vehicle Data Persistence & Auto-Load

As a registered end-client,
I want my vehicle data saved after first registration,
So that I never have to scan or enter the same information again.

**Acceptance Criteria:**

**Given** vehicle data is confirmed (OCR + validation),
**When** saved to account,
**Then** всички полета се съхраняват в `vehicles` таблица с `tenant_id`, UUID PK и `owner_id`

**Given** client returns for policy renewal,
**When** they select an existing vehicle,
**Then** всички данни се зареждат автоматично без ново сканиране

**Given** client has registered vehicles,
**When** they initiate a new quote,
**Then** МПС списъкът се показва с един клик избор

**Given** client has no registered vehicles,
**When** they view the vehicle list,
**Then** виждат empty state с CTA "Добави МПС" — без празен списък без контекст

**Given** client has multiple vehicles,
**When** they view their profile,
**Then** виждат всички регистрирани МПС с модел, рег. номер и статус на последната полица

### Story 3.6: OCR Analytics Dashboard

As a Super Admin,
I want to monitor OCR performance per field across all tenants,
So that I can detect quality degradation and take action before clients are impacted.

**Acceptance Criteria:**

**Given** Super Admin opens OCR Analytics,
**When** dashboard loads,
**Then** вижда per-field confidence score и fallback rate за всички тенанти

**Given** fallback rate for a field exceeds 20%,
**When** threshold is crossed,
**Then** Super Admin получава автоматичен алерт (email/dashboard notification)

**Given** OCR analytics data,
**When** Super Admin filters by tenant or date range,
**Then** виждат drill-down до конкретен тенант и времеви период

**Given** a specific field has consistently low confidence,
**When** Super Admin views the data,
**Then** виждат trend graph (последните 7/30 дни) за идентифициране на деградация

---

## Epic 4: Insurance Quote & Policy Purchase

Краен клиент може да сравни паралелни ГО оферти от всички активни застрахователи и да закупи полица с карта/Apple Pay/Google Pay — PDF и Зелена карта се генерират асинхронно и се доставят на имейл за под 5 минути след потвърдено плащане. Полицата се активира САМО след `payment_intent.succeeded` Stripe webhook.

### Story 4.1: Parallel Quote Aggregation

As an end-client,
I want to see insurance quotes from all available insurers simultaneously,
So that I can compare options and choose the best offer in under 5 seconds.

**Acceptance Criteria:**

**Given** client submits vehicle data,
**When** quote request is initiated,
**Then** паралелни заявки се изпращат към всички активни застрахователи едновременно (`Promise.allSettled` с 5 сек timeout per insurer)

**Given** all insurer responses are received (or timed out),
**When** results are displayed,
**Then** клиентът вижда всички оферти в < 5 сек от подаване на заявката

**Given** quote results are displayed,
**When** scoring algorithm runs,
**Then** препоръчаната оферта (`is_recommended: true`) е маркирана визуално; входните данни, weights и резултатът се логват в `audit_log` (КЗ compliance, NFR44)

**Given** an insurer API fails 5 times within 60 seconds,
**When** circuit breaker opens,
**Then** заявките към него спират за 30 сек; останалите застрахователи продължават нормално

**Given** circuit breaker is in half-open state,
**When** 30 seconds have passed,
**Then** изпраща се 1 probe заявка; при успех circuit breaker се затваря

**Given** quote cards are rendered,
**When** screen reader is active,
**Then** announce-ва препоръчаната оферта и всяка карта е keyboard navigable (Tab + Enter)

**Given** an insurer returns an error,
**When** results are displayed,
**Then** клиентът вижда останалите оферти; недостъпният застраховател е маркиран като "временно недостъпен"

### Story 4.2: Policy Purchase with Stripe 3DS

As an end-client,
I want to pay for my chosen policy with card, Apple Pay or Google Pay,
So that I can complete my purchase securely in under 15 seconds.

**Acceptance Criteria:**

**Given** client selects a quote,
**When** they proceed to payment,
**Then** Stripe Payment Intent се създава с уникален `idempotency_key`

**Given** Payment Intent is created,
**When** `application_fee_amount` is calculated,
**Then** fee се взима от commission matrix конфигурацията на тенанта; при липса на конфигурация се използва default platform fee

**Given** payment form loads,
**When** client chooses payment method,
**Then** поддържат се: карта, Apple Pay, Google Pay

**Given** card payment is submitted,
**When** 3DS 2.0 authentication is required (PSD2),
**Then** 3DS challenge се показва и завършва в рамките на Stripe flow; целият процес < 15 сек

**Given** 3DS authentication succeeds,
**When** payment is confirmed client-side,
**Then** UI показва "Плащането е прието — полицата се обработва" (optimistic state — НЕ активира полицата)

**Given** payment fails or 3DS is declined,
**When** client is notified,
**Then** получава ясно съобщение с опция за retry; Payment Intent НЕ се дублира

### Story 4.3: Policy Activation via Stripe Webhook

As the Platform,
I want to activate policies exclusively upon receiving Stripe's payment confirmation webhook,
So that no policy is ever issued without verified payment.

**Acceptance Criteria:**

**Given** `payment_intent.succeeded` webhook is received from Stripe,
**When** webhook is processed,
**Then** полицата се активира и статусът се обновява в DB — **това е единственият начин за активация; client-side активация е ЗАБРАНЕНА**

**Given** the same webhook is received twice (Stripe retry),
**When** second webhook is processed,
**Then** idempotency key (`payment_intent_id`) предотвратява дублирана активация — операцията е no-op

**Given** webhook processing fails,
**When** BullMQ retry logic runs,
**Then** job се retry-ва с exponential backoff; след 3 неуспешни опита → dead letter queue + Super Admin алерт

**Given** `payment_intent.payment_failed` webhook is received,
**When** processed,
**Then** полицата НЕ се активира и клиентът получава notification за неуспешно плащане

**Given** policy is activated,
**When** activation completes,
**Then** `policy_events` запис се създава (immutable — без UPDATE или DELETE) и PDF generation job се queue-ва в `pdf-generation` BullMQ queue

### Story 4.4: Policy Document Delivery

As an end-client,
I want to receive my policy PDF and Green Card by email and access them offline,
So that I always have proof of insurance available even without internet.

**Acceptance Criteria:**

**Given** policy activation triggers PDF generation job,
**When** job is processed,
**Then** PDF полица и Зелена карта се генерират асинхронно и се изпращат на имейл в < 5 мин след плащане

**Given** PDF is generated,
**When** stored in S3,
**Then** ключът следва структурата `{tenantId}/{year}/{month}/policy/{uuid}.pdf`; документът не е публично достъпен

**Given** client requests document access,
**When** URL is generated,
**Then** Signed URL с TTL 15 мин се генерира — директен S3 достъп е забранен; `insurer.api_key_enc` никога не се връща в GET отговор

**Given** PDF generation job fails,
**When** BullMQ retry runs,
**Then** retry с exponential backoff; след 3 неуспешни опита → dead letter queue + broker notification

**Given** client is on PWA,
**When** policy document is received,
**Then** Service Worker кешира PDF локално за offline достъп (последните 12 месеца, лимит 50 MB)

### Story 4.5: Sticker Delivery Integration

As an end-client,
I want to receive my ГО sticker by courier after purchasing a policy,
So that I can display it on my vehicle as legally required.

**Acceptance Criteria:**

**Given** `features.sticker_delivery` is enabled for tenant,
**When** policy is activated,
**Then** доставка заявка се изпраща автоматично към Speedy/Econt API

**Given** `features.sticker_delivery` is disabled,
**When** policy is activated,
**Then** доставка НЕ се инициира — feature flag се проверява преди всяка заявка

**Given** sticker delivery is initiated,
**When** client checks order status,
**Then** виждат tracking номер и очаквана дата на доставка

**Given** Speedy/Econt API fails,
**When** delivery request errors,
**Then** job се retry-ва; при окончателен failure → broker получава notification за ръчна обработка

---

## Epic 5: Billing & Commission Management

Брокерът вижда комисиони в реално време; платформата автоматично удържа fees, генерира месечни фактури с pro-rata за частични периоди и управлява Stripe account revocation.

### Story 5.1: Commission Matrix Configuration

As a Super Admin,
I want to configure commission rates per insurer and product type,
So that platform fees are automatically calculated correctly without code deployments.

**Acceptance Criteria:**

**Given** Super Admin opens Commission Matrix,
**When** they set a rate per insurer × product type combination,
**Then** промяната влиза в сила незабавно за всички нови полици

**Given** commission matrix is updated,
**When** change is saved,
**Then** се логва в `audit_log` с `tenant_id`, `user_id`, `insurer_id`, `product_type`, `old_rate`, `new_rate` (NFR40)

**Given** a new insurer is added,
**When** no commission rate is configured,
**Then** системата използва default platform fee до конфигуриране на специфична ставка

**Given** commission matrix exists,
**When** policy is activated (Story 4.3),
**Then** комисионата се изчислява и записва в DB незабавно — независимо от Stripe webhook timing

### Story 5.2: Broker Commission Dashboard

As a Broker,
I want to see my commissions and revenue in real time,
So that I always have an accurate picture of my earnings without waiting for webhooks.

**Acceptance Criteria:**

**Given** a policy is activated,
**When** commission record is created at activation time,
**Then** Broker Dashboard показва комисионата незабавно — никога не показва €0 за продадена полица

**Given** broker opens Dashboard,
**When** commission data loads,
**Then** зарежда се в < 3 сек за последните 30 дни

**Given** broker views earnings,
**When** they filter by date range or insurer,
**Then** виждат breakdown: брой полици, обща премия, комисиона per insurer

**Given** Stripe webhook arrives later to confirm payment,
**When** it is processed,
**Then** commission record се обновява до confirmed статус — UI не мига или се нулира

**Given** broker views a specific policy commission,
**When** they click on it,
**Then** виждат: застраховател, продукт, премия, комисиона %, комисиона сума, статус

### Story 5.3: Monthly Invoicing Job

As the Platform,
I want to automatically generate monthly invoices for each tenant,
So that billing is consistent, timely and auditable without manual intervention.

**Acceptance Criteria:**

**Given** it is the 1st day of the month,
**When** 06:00 `Europe/Sofia` time is reached,
**Then** BullMQ scheduled job (`{ pattern: '0 6 1 * *', tz: 'Europe/Sofia' }`) генерира фактура за всеки активен тенант

**Given** invoice is generated,
**When** saved,
**Then** съдържа: период, брой полици, обща премия, platform fee, дължима сума; записва се в `invoices` таблица

**Given** tenant was activated mid-month,
**When** first invoice is generated on the 1st of the following month,
**Then** фактурата покрива partial period от датата на активация до края на месеца; subscription fee се изчислява pro-rata (`days_active / days_in_month × monthly_fee`); policy commissions са по реален брой полици без pro-rata

**Given** billing job fails for any tenant,
**When** failure is detected,
**Then** Super Admin получава алерт в < 15 мин (NFR11)

**Given** Super Admin receives failure alert,
**When** they trigger manual billing run,
**Then** job се изпълнява незабавно само за засегнатия тенант без дублиране

**Given** invoice is generated,
**When** tenant is notified,
**Then** брокерът получава имейл с прикачена фактура в PDF формат

### Story 5.4: Stripe Account Revocation Handling

As the Platform,
I want to automatically block new sales when a tenant's Stripe account is revoked,
So that compliance is maintained while existing policies remain accessible.

**Acceptance Criteria:**

**Given** Stripe sends `account.updated` webhook (charges_enabled: false),
**When** webhook is processed,
**Then** tenant статусът се обновява до `stripe_revoked` и нови quote заявки връщат 403

**Given** tenant is in `stripe_revoked` state,
**When** client attempts to purchase a policy,
**Then** покупката е блокирана с ясно съобщение

**Given** tenant is in `stripe_revoked` state,
**When** existing client views their policies,
**Then** всички издадени полици са достъпни (read-only)

**Given** Stripe account is reinstated (charges_enabled: true),
**When** webhook is received,
**Then** tenant статусът се възстановява и нови продажби се възобновяват автоматично

**Given** revocation event occurs,
**When** processed,
**Then** се логва в `audit_log` и брокерът получава имейл notification

---

## Epic 6: Renewal & Notification Engine

Системата автоматично уведомява крайни клиенти за изтичащи полици по push/SMS/имейл по конфигурируем escalation график; escalation спира при подновяване; брокерът получава dashboard известие при неподновена полица (D+1).

### Story 6.1: Renewal Check Scheduled Job

As the Platform,
I want to daily check for expiring policies and trigger the appropriate notification stage,
So that clients are reminded at the right time through the configured escalation schedule.

**Acceptance Criteria:**

**Given** it is 08:00 `Europe/Sofia` time,
**When** daily scheduled job runs (`{ pattern: '0 8 * * *', tz: 'Europe/Sofia' }`),
**Then** проверява всички активни полици и идентифицира тези с изтичане на D-30, D-7, D-3, D-1 и D+1

**Given** an expiring policy is detected at the correct stage,
**When** job runs,
**Then** notification job се queue-ва в `notifications` BullMQ queue с `policy_id`, `stage`, `tenant_id`

**Given** a policy is renewed after D-30 notification,
**When** renewal check job runs for subsequent stages (D-7, D-3, D-1),
**Then** escalation се спира автоматично — клиентът не получава notifications за вече подновена полица

**Given** notification job fails,
**When** BullMQ retry runs,
**Then** retry с exponential backoff; след 3 неуспешни опита → dead letter queue + Super Admin алерт (NFR13)

**Given** D+1 stage is reached,
**When** policy is still not renewed,
**Then** broker получава notification в Dashboard за клиент с изтекла полица

### Story 6.2: Multi-Channel Notification Delivery

As the Platform,
I want to deliver renewal notifications via push, SMS and email with automatic fallbacks,
So that clients reliably receive reminders even when one channel is unavailable.

**Acceptance Criteria:**

**Given** a notification job is queued,
**When** processed,
**Then** каналите се изпълняват по конфигурирания escalation ред за тенанта

**Given** push notification is the configured channel,
**When** client has granted browser permissions,
**Then** push notification се изпраща чрез PWA Service Worker (FR42)

**Given** push notification is the configured channel,
**When** client has denied browser permissions,
**Then** push се маркира като `push_skipped` в `notification_log` и системата преминава към следващия канал

**Given** SMS channel is triggered (D-3),
**When** Twilio is unavailable,
**Then** автоматично fallback към email notification (NFR37)

**Given** email channel is triggered (D-1),
**When** SendGrid fails,
**Then** автоматично fallback към SMTP (NFR37)

**Given** notification is delivered,
**When** content is composed,
**Then** съдържа конкретна дата на изтичане и директен renewal link: "Вашата ГО полица изтича на {date}. Поднови сега → {renewal_link}"

**Given** notification is delivered,
**When** saved,
**Then** `notification_log` запис съдържа: `policy_id`, `stage`, `channel`, `status` (`sent`/`skipped`/`failed`), `delivered_at`

### Story 6.3: Renewal Escalation Configuration

As a Super Admin,
I want to configure renewal notification timing and channels per tenant,
So that each broker can customize the escalation schedule to their clients' needs.

**Acceptance Criteria:**

**Given** Super Admin opens Renewal Configuration,
**When** they configure escalation for a tenant,
**Then** могат да задават: дни преди изтичане (D-X), активни канали (push/SMS/имейл/dashboard) и ред на изпълнение

**Given** escalation config is saved,
**When** renewal check job runs,
**Then** използва tenant-специфичната конфигурация — не global default

**Given** no custom config exists for a tenant,
**When** renewal check job runs,
**Then** използва platform default: D-30 push, D-7 push, D-3 SMS, D-1 email, D+1 dashboard

**Given** escalation config is updated,
**When** change is saved,
**Then** се логва в `audit_log` с `tenant_id`, `user_id`, `old_config`, `new_config`

**Given** Super Admin disables a channel for a tenant,
**When** notification job runs,
**Then** disabled каналът се пропуска без грешка

---

## Epic 7: Fleet Management

Fleet Admin може да управлява портфолио от МПС с визуален ГО статус, да купува полици за множество превозни средства едновременно и да генерира batch PDF exports; Driver вижда само собствените си полици. Изисква `features.fleet` активиран.

### Story 7.1: Fleet Vehicle Status Dashboard

As a Fleet Admin,
I want to see all fleet vehicles with their insurance status at a glance,
So that I can immediately identify which vehicles need policy renewal.

**Acceptance Criteria:**

**Given** `features.fleet` is enabled for tenant,
**When** Fleet Admin opens Fleet Dashboard,
**Then** виждат всички МПС с цветови статус индикатор + икона (colorblind-friendly):
- 🟢 ✓ Зелено: > 30 дни до изтичане
- 🟡 ⚠ Жълто: 1–30 дни до изтичане
- 🔴 ✕ Червено: изтекла полица

**Given** Fleet Dashboard loads,
**When** data is fetched,
**Then** показва за всяко МПС: рег. номер, модел, застраховател, дата на изтичане, статус

**Given** Fleet Admin views the dashboard,
**When** they filter by status,
**Then** могат да филтрират по зелено/жълто/червено за приоритизиране

**Given** `features.fleet` is disabled,
**When** Fleet Admin attempts to access Fleet Dashboard,
**Then** получава 404 — feature не е достъпен

### Story 7.2: Bulk Quote & Policy Purchase

As a Fleet Admin,
I want to get quotes and purchase policies for multiple vehicles simultaneously,
So that I can insure my entire fleet efficiently without processing each vehicle individually.

**Acceptance Criteria:**

**Given** Fleet Admin selects multiple vehicles,
**When** they request bulk quotes,
**Then** паралелни quote заявки се изпращат за всички избрани МПС едновременно

**Given** bulk quotes are returned,
**When** Fleet Admin proceeds to purchase,
**Then** individual Stripe Payment Intent се създава per полица — без saga complexity

**Given** bulk purchase is processed,
**When** some policies succeed and others fail,
**Then** partial success е допустим — Fleet Admin вижда "X/Y успешни" breakdown с retry бутон за failed полиците

**Given** failed policies exist after bulk purchase,
**When** Fleet Admin clicks retry,
**Then** само failed полиците се retry-ват — успешните не се дублират (idempotency key per policy)

**Given** each policy is activated,
**When** `payment_intent.succeeded` webhook is received per policy,
**Then** всяка полица се активира независимо (Story 4.3 webhook flow)

### Story 7.3: Batch PDF Export

As a Fleet Admin,
I want to export policy documents for multiple vehicles in a single archive,
So that I can efficiently manage and distribute fleet insurance documentation.

**Acceptance Criteria:**

**Given** Fleet Admin selects multiple policies,
**When** they request batch PDF export,
**Then** BullMQ jobs се queue-ват в `pdf-generation` queue per полица; progress indicator показва "X/Y документа генерирани"

**Given** all PDF jobs complete,
**When** archive is ready,
**Then** ZIP архив се качва в S3; S3 key се запазва в DB с TTL 24h; Fleet Admin получава in-app notification + имейл

**Given** Fleet Admin clicks the download link,
**When** request is made,
**Then** Signed URL с TTL 15 мин се генерира on-demand от S3 key-а — директен S3 достъп е забранен

**Given** batch contains many vehicles,
**When** BullMQ workers process jobs,
**Then** workers се скалират хоризонтално при нужда (NFR27)

**Given** individual PDF job fails,
**When** batch is otherwise complete,
**Then** архивът се генерира с наличните документи; failed документите са изброени с retry опция

### Story 7.4: Driver Role-Scoped View

As a Driver,
I want to see only my own policies and vehicles,
So that fleet policy data from other drivers remains private.

**Acceptance Criteria:**

**Given** user has Driver role,
**When** they log in,
**Then** виждат само полиците и МПС, назначени на тях — без достъп до fleet-wide данни

**Given** Driver attempts to access another driver's policy,
**When** request is made,
**Then** получава 403 Forbidden — RLS enforces row-level isolation

**Given** Driver views their policies,
**When** dashboard loads,
**Then** виждат: МПС, застраховател, дата на изтичане, статус на полицата

**Given** Fleet Admin assigns a vehicle to a driver,
**When** assignment is saved,
**Then** Driver може да вижда само назначените им МПС

---

## Epic 8: Super Admin Platform Operations

Super Admin може да мониторира здравето на всички тенанти и insurer APIs, да управлява абонаментни тиери с автоматично enforcement и 7-дневен grace period при downgrade, и да изпраща системни известия.

### Story 8.1: Tenant Health Monitoring

As a Super Admin,
I want to monitor the health and activity of all tenants on the platform,
So that I can proactively identify inactive or struggling tenants before issues escalate.

**Acceptance Criteria:**

**Given** Super Admin opens Platform Health Dashboard,
**When** dashboard loads,
**Then** виждат всички тенанти с: статус, брой полици last 30 дни, last activity timestamp, абонаментен тиер

**Given** a tenant has sold 0 policies for 7+ consecutive days,
**When** daily health check runs,
**Then** Super Admin получава алерт с tenant name и брой дни без активност

**Given** Super Admin views a specific tenant,
**When** they drill down,
**Then** виждат: активни потребители, revenue, брой МПС, последна полица, активни feature flags

**Given** a tenant isolation incident occurs,
**When** detected,
**Then** Super Admin получава алерт в < 15 мин (NFR10 MTTR target)

### Story 8.2: Insurer API Monitoring & Manual Fallback

As a Super Admin,
I want to monitor insurer API health and manually disable failing insurers,
So that platform reliability is maintained when an insurer integration degrades.

**Acceptance Criteria:**

**Given** Super Admin opens Insurer API Dashboard,
**When** dashboard loads,
**Then** виждат за всеки застраховател: статус на circuit breaker (open/closed/half-open), error rate % за последните 5 мин, средна latency

**Given** error rate > 1% for 5 minutes for any insurer,
**When** threshold is crossed,
**Then** Super Admin получава автоматичен алерт (NFR48)

**Given** an insurer API is degraded,
**When** Super Admin activates manual fallback via feature flag,
**Then** заявките към застрахователя спират незабавно; останалите застрахователи продължават нормално

**Given** manual fallback is activated,
**When** saved,
**Then** се логва в `audit_log` с `admin_id`, `insurer_id`, `reason`, `timestamp`

**Given** insurer API recovers,
**When** Super Admin deactivates manual fallback,
**Then** circuit breaker се нулира и заявките се възобновяват

### Story 8.3: Subscription Tier Management

As a Super Admin,
I want to upgrade or downgrade tenant subscription tiers with automatic feature enforcement,
So that tenants always have access to exactly the features included in their plan.

**Acceptance Criteria:**

**Given** Super Admin initiates a tier downgrade,
**When** new tier is selected,
**Then** системата изчислява diff между allowed flags на новия и стария план и показва preview на features, които ще бъдат деактивирани

**Given** downgrade is confirmed,
**When** processed,
**Then** брокерът получава actionable notification: "Вашият план се downgrade-ва на {date+7}. Features за деактивиране: {list}. Upgrade обратно →"

**Given** 7-day grace period expires,
**When** enforcement runs,
**Then** plan-gated features се деактивират автоматично без допълнително действие от Super Admin

**Given** tier change is applied,
**When** saved,
**Then** се логва в `audit_log` с `admin_id`, `tenant_id`, `old_tier`, `new_tier`, `affected_flags`

**Given** Super Admin upgrades a tenant,
**When** upgrade is applied immediately,
**Then** новите feature flags са достъпни веднага — без grace period за upgrade

### Story 8.4: System Notifications Broadcast

As a Super Admin,
I want to send system notifications to individual tenants or all tenants at once,
So that I can communicate platform updates, incidents or important information effectively.

**Acceptance Criteria:**

**Given** Super Admin opens Notifications,
**When** composing a message,
**Then** могат да изберат: конкретен тенант или "всички тенанти"; тип: info/warning/critical

**Given** notification is sent,
**When** broker logs in to Dashboard,
**Then** вижда system notification banner с тип индикатор (info/warning/critical)

**Given** critical notification is sent,
**When** broker receives it,
**Then** получава и имейл notification освен in-app banner; notification е non-dismissible — само Super Admin може да го деактивира

**Given** info или warning notification,
**When** broker dismisses it,
**Then** не се показва отново при следващ login (`dismissible: true`)

**Given** notification is sent,
**When** saved,
**Then** се логва с `admin_id`, `target` (tenant_id или 'all'), `type`, `dismissible`, `message`, `sent_at`

---

## Epic 9: API Tier & External Integration

API Consumers могат програматично да получават ГО оферти и да издават полици чрез REST API с scoped API keys, sandbox среда и per-request usage billing. Изисква `features.api_access` активиран.

### Story 9.1: API Key Management & Authentication

As a Broker,
I want to generate and manage API keys for external integrations,
So that third-party systems can access the platform programmatically with appropriate permissions.

**Acceptance Criteria:**

**Given** `features.api_access` is enabled for tenant,
**When** broker generates an API key,
**Then** избират scopes: `quotes:read`, `policies:write` или и двата; въвеждат webhook URL (optional за `quotes:read`, задължителен за `policies:write`); ключът се показва **само веднъж** при генериране

**Given** API key is generated,
**When** broker views key list,
**Then** вижда само masked версия (`sk_...xxxx`) — пълният ключ никога не се показва отново

**Given** API request is made with valid key,
**When** middleware validates it,
**Then** проверява: key validity, tenant_id scope, requested scope (`quotes:read` или `policies:write`)

**Given** API key has only `quotes:read` scope,
**When** consumer attempts policy issuance,
**Then** получава 403 Forbidden — scope enforcement

**Given** broker rotates an API key,
**When** new key is generated,
**Then** старият ключ се инвалидира незабавно; новият се показва само веднъж

**Given** `features.api_access` is disabled,
**When** any API key request is made,
**Then** получава 403 с ясно съобщение за изискван план

### Story 9.2: Quote & Policy Issuance API

As an API Consumer,
I want to get insurance quotes and issue policies via REST API,
So that I can integrate insurance functionality into my own systems programmatically.

**Acceptance Criteria:**

**Given** valid API key with `quotes:read` scope,
**When** `GET /api/v1/quotes?vin={vin}&...`,
**Then** връща паралелни ГО оферти от всички активни застрахователи в < 5 сек

**Given** valid API key with `policies:write` scope,
**When** `POST /api/v1/policies`,
**Then** инициира policy issuance и връща `{ policy_id, status: 'pending', webhook_url }`

**Given** policy issuance is initiated via API,
**When** `payment_intent.succeeded` webhook is received,
**Then** платформата изпраща webhook към регистрирания consumer endpoint с `{ policy_id, status: 'active', pdf_url }`

**Given** webhook delivery fails,
**When** retry logic runs,
**Then** retry с exponential backoff до 3 опита; след failure → dead letter queue

**Given** API endpoints are implemented,
**When** NestJS Swagger decorators are applied,
**Then** OpenAPI документация е auto-generated и достъпна на `/api/docs` за интеграторите

**Given** API response,
**When** any endpoint is called,
**Then** `insurer.api_key_enc` НИКОГА не се включва в отговора

### Story 9.3: API Sandbox Environment

As an API Consumer,
I want to test my integration in a sandbox environment,
So that I can validate my implementation without creating real policies or charges.

**Acceptance Criteria:**

**Given** API key is generated with sandbox flag,
**When** requests are made to sandbox endpoints (`/api/sandbox/v1/...`),
**Then** не се създават реални полици или Stripe charges

**Given** sandbox quote request is made,
**When** response is returned,
**Then** връща realistic mock data с реалистични цени, застрахователи и структура — не просто `{ success: true }`

**Given** sandbox policy issuance is requested,
**When** processed,
**Then** връща mock `policy_id` и симулиран webhook след 2-3 сек закъснение (реалистичен async flow)

**Given** sandbox environment,
**When** rate limits are applied,
**Then** sandbox има отделни, по-либерални лимити от production за удобство на разработчиците

### Story 9.4: Rate Limiting & Usage Billing

As the Platform,
I want to enforce rate limits and bill API consumers for usage above their plan limit,
So that price scraping is prevented and heavy API usage is fairly monetized.

**Acceptance Criteria:**

**Given** API consumer makes requests,
**When** rate limit is checked,
**Then** лимитът се прилага per API key и per tenant (NFR23); при exceed → 429 Too Many Requests с `Retry-After` header

**Given** plan limit is configured in subscription tier (Epic 8 Story 8.3),
**When** consumer exceeds monthly request limit,
**Then** per-request billing се активира автоматично за всяка заявка над лимита

**Given** over-plan usage occurs,
**When** billing period ends,
**Then** usage charges се включват в месечната фактура (Story 5.3)

**Given** API consumer approaches plan limit (80%),
**When** threshold is crossed,
**Then** брокерът получава warning notification за предстоящо over-plan billing

**Given** rate limit is hit,
**When** logged,
**Then** `rate_limit_log` запис с `api_key_id`, `tenant_id`, `endpoint`, `timestamp` за abuse detection

---

## Epic 10: Digital Claims Protocol (DKP)

Двама участници в ПТП могат да попълнят Двустранен Констативен Протокол изцяло офлайн на едно устройство с canvas touch подписи — финалният PDF се генерира само след потвърждение от втория участник; 72h timeout с reminders. Изисква `features.dkp` активиран.

### Story 10.1: Offline DKP Single-Device Wizard

As an end-client involved in a traffic accident,
I want to fill out a claims protocol entirely offline on one device,
So that both parties can document the incident and sign without needing internet or a second device.

**Acceptance Criteria:**

**Given** `features.dkp` is enabled for tenant,
**When** client initiates a new DKP,
**Then** wizard стартира с уникален session ID запазен в localStorage; стъпките са: МПС 1 данни → МПС 2 данни → Участник 1 данни → Участник 2 данни → Снимки на щети → Подпис 1 → [Предай устройство] → Подпис 2

**Given** wizard reaches signature step 1,
**When** Подпис 1 е попълнен,
**Then** показва се ясна инструкция: "Предайте телефона на другия участник за подпис" преди преминаване към Подпис 2

**Given** wizard reaches signature step 2,
**When** Подпис 2 е попълнен чрез canvas touch (Flutter `signature` package),
**Then** Submit бутонът се активира — Submit е disabled докато Подпис 2 не е попълнен

**Given** client completes any wizard step,
**When** step is saved,
**Then** данните се записват в localStorage незабавно — без нужда от мрежа

**Given** device loses power or browser is closed mid-wizard,
**When** client reopens the app,
**Then** вижда "Имате незавършен протокол. Продължи →" и wizard resume-ва от последната запазена стъпка

**Given** photos of damages are captured,
**When** stored,
**Then** снимките се пазят в отделно localStorage partition (max 10 MB per протокол, NFR50)

**Given** reduced motion is enabled,
**When** wizard animations play,
**Then** Lottie анимации са заменени с color transitions

### Story 10.2: DKP Confirmation & PDF Generation

As an end-client,
I want the second party to confirm the protocol before the final PDF is generated,
So that both participants have a verified, mutually agreed record of the incident.

**Acceptance Criteria:**

**Given** both signatures are collected,
**When** first participant submits the wizard,
**Then** данните се sync-ват към сървъра; SMS и имейл с потвърдителен линк се изпращат към втория участник (TTL 72h)

**Given** network is unavailable at submission,
**When** connectivity is restored,
**Then** автоматичен sync се изпълнява и confirmation SMS/имейл се изпраща (NFR52)

**Given** second participant receives confirmation link,
**When** they open it and confirm,
**Then** PDF на DKP се генерира и се изпраща автоматично и на двамата участника и на застрахователя

**Given** second participant has not confirmed after 24 hours,
**When** reminder job runs,
**Then** изпраща се reminder SMS/имейл: "Протоколът изтича след 48 часа. Потвърди сега →"

**Given** second participant has not confirmed after 48 hours,
**When** second reminder job runs,
**Then** изпраща се финален reminder: "Протоколът изтича след 24 часа. Потвърди сега →"

**Given** 72 hours pass without confirmation,
**When** expiry job runs,
**Then** DKP session статусът → `expired`; всички данни и снимки се изтриват (GDPR); първият участник получава notification за изтекъл протокол

**Given** PDF is generated,
**When** stored,
**Then** S3 ключ: `{tenantId}/{year}/{month}/dkp/{uuid}.pdf`; Signed URL TTL 15 мин при достъп

---

## Epic 11: GDPR Self-Service & Compliance Portal

Крайни клиенти и брокери могат да упражнят GDPR права (data export, offboarding с 30-дневен notice period); платформата прилага soft delete с configurable retention и автоматично физическо изтриване в 02:00 Europe/Sofia. Encryption и audit_log са вградени от Epic 1.

### Story 11.1: End-Client Data Export (GDPR Right of Access)

As an end-client,
I want to request and download all my personal data,
So that I can exercise my GDPR right of access at any time.

**Acceptance Criteria:**

**Given** end-client requests data export,
**When** request is submitted,
**Then** BullMQ job се queue-ва за генериране на export пакет

**Given** export job completes,
**When** package is ready,
**Then** ZIP архив се генерира с: `data.json` (machine-readable, всички лични данни) + `data.pdf` (human-readable версия); клиентът получава имейл с download link

**Given** download link is generated,
**When** client clicks it,
**Then** Signed URL с TTL 15 мин се генерира on-demand — директен S3 достъп е забранен

**Given** export request is submitted,
**When** logged,
**Then** се записва в `audit_log` с `user_id`, `tenant_id`, `request_type: 'gdpr_export'`, `timestamp`

**Given** export is completed,
**When** delivered,
**Then** съдържа: профилни данни, МПС данни, полици, плащания, notification history — всичко свързано с потребителя

### Story 11.2: Broker Offboarding & GDPR Export

As a Broker,
I want to offboard from the platform with a complete GDPR data export,
So that I can leave the platform with all my data while my clients' active policies remain accessible.

**Acceptance Criteria:**

**Given** broker initiates offboarding,
**When** request is submitted,
**Then** `offboarding_requested_at` се записва; offboarding се планира след 30 дни; брокерът вижда countdown: "Offboarding ще се изпълни на {date}. Можете да отмените до тогава."

**Given** Super Admin receives offboarding notification,
**When** reviewing,
**Then** може да блокира offboarding само при доказана измама в 30-дневния период

**Given** 30-day notice period expires,
**When** daily job runs at 02:00 `Europe/Sofia`,
**Then** offboarding се изпълнява автоматично; broker получава GDPR data export ZIP (JSON + PDF)

**Given** broker cancels offboarding before 30 days,
**When** cancellation is submitted,
**Then** `offboarding_requested_at` се нулира и tenant продължава нормално

**Given** offboarding is complete,
**When** tenant is deactivated,
**Then** нови продажби са блокирани; всички издадени полици остават валидни до изтичането им

**Given** tenant clients have active policies after offboarding,
**When** offboarding is processed,
**Then** всеки клиент получава имейл с линк към read-only policy viewer достъпен до изтичане на последната им полица

**Given** client accesses read-only policy viewer,
**When** they log in,
**Then** виждат и могат да изтеглят само своите полици — без broker dashboard функционалности

**Given** offboarding event occurs,
**When** logged,
**Then** се записва в `audit_log` с `tenant_id`, `admin_id`, `timestamp`, `policies_count`

### Story 11.3: Soft Delete & Data Retention

As the Platform,
I want to apply soft delete with configurable retention and automatic physical deletion,
So that data lifecycle is compliant with GDPR while audit requirements are preserved.

**Acceptance Criteria:**

**Given** any entity is deleted (user, vehicle, policy),
**When** delete is triggered,
**Then** `deleted_at` timestamp се записва — физическото изтриване НЕ се случва веднага (soft delete)

**Given** entity has been soft deleted for 24 months,
**When** retention cleanup job runs at 02:00 `Europe/Sofia`,
**Then** физическото изтриване се изпълнява автоматично — освен ако активна полица изисква запазване за одитни цели

**Given** Super Admin wants to preview deletions,
**When** they run dry-run mode,
**Then** виждат списък с entities, които ще бъдат изтрити без реално изтриване

**Given** active policy requires audit data,
**When** retention job evaluates deletion,
**Then** свързаните данни се запазват до изтичане на полицата + 24 месеца

**Given** physical deletion occurs,
**When** logged,
**Then** се записва в `audit_log` с `entity_type`, `entity_id`, `tenant_id`, `deletion_reason`, `timestamp`

**Given** retention period is configurable,
**When** Super Admin updates retention config,
**Then** новият период се прилага за бъдещи deletions; съществуващите следват оригиналния период

---

## Epic 12: Claims Management *(Phase 2)*

Краен клиент може да подава застрахователна претенция директно към застрахователя с прикачени документи; брокерът проследява статуса на претенциите на своите клиенти в Dashboard.

### Story 12.1: Claim Submission with Documents

As an end-client,
I want to submit an insurance claim with supporting documents and photos,
So that my claim is sent directly to the insurer without manual broker intervention.

**Acceptance Criteria:**

**Given** end-client initiates a claim,
**When** they select an active policy,
**Then** застрахователят се определя автоматично от полицата — без ръчен избор

**Given** claim wizard loads,
**When** client progresses through steps,
**Then** wizard guide-ва: описание на инцидента → задължителни документи (снимки на щети, документ за самоличност) → опционални документи (DKP, свидетелски показания)

**Given** documents are attached,
**When** uploaded,
**Then** файловете се качват в S3 с ключ `{tenantId}/{year}/{month}/claims/{claim_id}/{uuid}.{ext}`; Signed URL TTL 15 мин при достъп

**Given** claim is submitted,
**When** processed,
**Then** претенцията се изпраща директно към застрахователя; статусът е `submitted`; клиентът получава confirmation имейл с claim reference number

**Given** claim is submitted,
**When** logged,
**Then** се записва в `audit_log` с `user_id`, `tenant_id`, `policy_id`, `insurer_id`, `timestamp`

### Story 12.2: Broker Claims Tracking Dashboard

As a Broker,
I want to track the status of my clients' insurance claims,
So that I can proactively support clients and monitor claim resolution rates.

**Acceptance Criteria:**

**Given** broker opens Claims Dashboard,
**When** dashboard loads,
**Then** виждат всички претенции на техните клиенти с: client name, policy number, insurer, submission date, current status

**Given** claim status updates,
**When** insurer sends status update,
**Then** статусът се обновява: `submitted` → `under_review` → `resolved` (`resolution_type: approved/rejected/paid`)

**Given** claim status changes to `additional_info_required`,
**When** insurer requests more documents,
**Then** клиентът получава notification с конкретно описание на исканите документи

**Given** broker views a specific claim,
**When** they click on it,
**Then** виждат пълната история на статусите с timestamps и всички прикачени документи

**Given** claim is resolved,
**When** `resolution_type` is set,
**Then** клиентът получава notification с резултата: одобрена/отказана/изплатена

---

## Epic 1: Platform Foundation & Multi-Tenant Core

Брокерите и Super Admin могат да управляват тенанти с пълна изолация на данните; всяка заявка се резолвира по Host header към правилния тенант. Greenfield monorepo, Terraform dev environment, TenantContext middleware, RLS, JWT auth, Redis naming convention и CloudWatch structured logging са оперативни от Story 1.

### Story 1.1: Monorepo Foundation & Dev Infrastructure

As a Developer,
I want the project monorepo and dev infrastructure initialized with Terraform,
So that the team builds on a consistent, reproducible foundation from day one.

**Acceptance Criteria:**

**Given** the monorepo doesn't exist,
**When** initialization scripts are run,
**Then** the following structure is created: `branivo-api` (NestJS), `branivo-app` (Flutter), `branivo-web` (Next.js) в един monorepo

**Given** the Terraform dev config exists,
**When** `terraform apply` is run,
**Then** RDS (PostgreSQL), ElastiCache (Redis) и ECS (Fargate) са provisioned в dev environment

**Given** the app starts,
**When** any HTTP request is processed,
**Then** CloudWatch structured logs съдържат `tenant_id`, `user_id` и `trace_id` за всяка заявка

**Given** BullMQ is configured,
**When** the app starts,
**Then** следните queues са инициализирани: `pdf-generation`, `notifications`, `renewal-checks`, `billing`

**Given** a new DB migration is needed,
**When** a migration file is created,
**Then** всички таблици имат: UUID PK, `tenant_id`, `created_at`, `updated_at`, `deleted_at`

**Given** Redis key naming is needed,
**When** any key is written to Redis,
**Then** форматът е `{tenant_id}:{domain}:{key}` без изключения

### Story 1.2: Tenant Resolution & TenantContext Middleware

As the Platform,
I want every HTTP request resolved to the correct tenant via the Host header,
So that all business logic operates in the correct tenant context automatically without manual tenant_id passing.

**Acceptance Criteria:**

**Given** a request with `Host: broker1.branivo.bg`,
**When** the middleware processes it,
**Then** `TenantContext.getTenantId()` връща правилния `tenant_id` в < 50ms (Redis cache hit)

**Given** the tenant config is absent from Redis,
**When** the middleware processes a request,
**Then** то прави DB lookup и кешира резултата с ключ `{tenant_id}:config:tenant`

**Given** an unknown Host header,
**When** the middleware processes the request,
**Then** се връща 404 Not Found

**Given** Redis is unavailable,
**When** the middleware processes a request,
**Then** то прави DB fallback и продължава (graceful degradation без crash)

**Given** any protected endpoint is called,
**When** `TenantContext.getTenantId()` is called inside service,
**Then** връща правилния `tenant_id` — `tenant_id` НИКОГА не се предава като функционален параметър

### Story 1.3: Broker Authentication with 2FA

As a Broker,
I want to log in with email, password and 2FA,
So that my dashboard and tenant data are accessible only to me securely.

**Acceptance Criteria:**

**Given** valid email + password,
**When** `POST /auth/login`,
**Then** се връща access token (JWT, exp < 15 мин) и refresh token

**Given** successful login,
**When** JWT is decoded,
**Then** съдържа: `sub` (userId), `tid` (tenantId), `role`, `exp`

**Given** 2FA is enabled,
**When** credentials are submitted,
**Then** broker е подканен за TOTP/SMS OTP преди получаване на tokens

**Given** valid refresh token,
**When** `POST /auth/refresh`,
**Then** се издава нов access token и старият refresh token се ротира (Redis blacklist)

**Given** Redis is unavailable,
**When** refresh token is used,
**Then** broker е принуден да се логне отново (fail-secure)

**Given** invalid credentials,
**When** `POST /auth/login`,
**Then** се връща 401 без информация коя конкретна стойност е грешна

### Story 1.4: Super Admin Tenant Onboarding

As a Super Admin,
I want to invite a broker by email and guide them through Stripe Connect and КФН verification,
So that new tenants can activate and start selling without technical assistance.

**Acceptance Criteria:**

**Given** a valid broker email,
**When** Super Admin изпраща покана,
**Then** брокерът получава имейл с уникален onboarding link (TTL 48h)

**Given** the broker completes Stripe Connect Express,
**When** webhook `account.updated` (charges_enabled=true) е получен,
**Then** tenant status → `stripe_connected`

**Given** `stripe_connected` status и валиден КФН лиценз номер,
**When** верификацията успее,
**Then** tenant status → `active` и subdomain `{slug}.branivo.bg` е provisioned

**Given** activated tenant,
**When** request arrives at `{slug}.branivo.bg`,
**Then** TenantContext middleware (Story 1.2) резолвира правилно

**Given** expired or invalid onboarding link,
**When** broker attempts to use it,
**Then** се показва ясна грешка с опция за нова покана

### Story 1.5: Role-Based Access Control (RBAC)

As a Super Admin,
I want to create and manage roles with granular permissions assigned to users per tenant,
So that access is strictly scoped and users see only what their role permits.

**Acceptance Criteria:**

**Given** Super Admin creates a role,
**When** role is assigned to a user in Tenant A,
**Then** потребителят може да достъпва само данни с `tenant_id` = собствения (RLS на DB ниво)

**Given** user in Tenant A with Broker role,
**When** they attempt to access Tenant B data,
**Then** получава 403 Forbidden — RLS блокира на ниво PostgreSQL

**Given** a role change is applied,
**When** existing JWT tokens are used until expiry,
**Then** следващият refresh отразява новата роля

**Given** any protected endpoint,
**When** accessed without valid JWT,
**Then** се връща 401 Unauthorized

**Given** RLS policy on any table with `tenant_id`,
**When** any DB query is executed,
**Then** автоматично се филтрира по текущия `tenant_id` от TenantContext — без ръчен WHERE clause

### Story 1.6: Tenant Lifecycle Management

As a Super Admin,
I want to deactivate a tenant upon КФН license revocation,
So that new sales are immediately blocked while existing policies remain accessible.

**Acceptance Criteria:**

**Given** active tenant,
**When** Super Admin деактивира го,
**Then** всички нови quote заявки връщат 403 с ясно съобщение

**Given** deactivated tenant,
**When** client attempts to purchase a policy,
**Then** покупката е блокирана с ясно потребителско съобщение

**Given** deactivated tenant,
**When** client views existing policies,
**Then** всички издадени полици са достъпни (read-only)

**Given** deactivated tenant,
**When** broker logs in,
**Then** Dashboard е достъпен в read-only режим за историческа справка

**Given** reinstated КФН license,
**When** Super Admin реактивира тенанта,
**Then** новите продажби се възобновяват веднага без техническа интервенция
