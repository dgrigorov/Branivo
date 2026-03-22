# Sprint Change Proposal — Branivo Phase 2 Scope Completion

**Дата:** 2026-03-22
**Изготвил:** Correct Course Workflow (BMAD)
**Одобрен от:** Daniel
**Тип на промяната:** Scope Extension — добавяне на липсващи Phase 2 функционалности

---

## Section 1: Issue Summary

### Описание на проблема

При стратегически анализ на търговската оферта (`docs/Branivo-Targovska-Oferta.docx`) спрямо текущия sprint plan (`sprint-status.yaml`) беше установено, че **9 функционални групи от Фаза 2 на офертата изцяло липсват** в оригиналния epic breakdown.

Оригиналният sprint plan (Epics 1–12) покрива правилно Фаза 1 (MVP) и частично Фаза 2 — имплементирани са Fleet (Epic 7), Renewal (Epic 6), Billing (Epic 5). Но следните Фаза 2 функционалности от офертата не са попаднали в нито един epic.

### Контекст на откриването

Анализът беше извършен на 2026-03-22 чрез:
1. Четене на пълния текст на `Branivo-Targovska-Oferta.docx` (раздел 6а)
2. Сравнение с `sprint-status.yaml` и `epics.md`
3. Идентифициране на gap-овете по функционалност

### Доказателства

| Функционалност | В офертата (раздел 6а) | В sprint plan (преди) |
|----------------|------------------------|----------------------|
| Каско застраховка | ✅ Фаза 2 | ❌ липсваше |
| Apple Pay / Google Pay / Borica | ✅ Фаза 2 | ❌ липсваше |
| Биометричен + социален вход | ✅ Фаза 2 | ❌ липсваше |
| Физическа доставка на Зелена карта | ✅ Фаза 2 | ❌ липсваше |
| Електронно подписване | ✅ Фаза 2 | ❌ липсваше |
| ГТП напомняния + КАТ глоби | ✅ Фаза 2 | ❌ липсваше |
| BI Analytics Dashboard | ✅ Фаза 2 + PRD | ❌ липсваше |
| After-Service / ПТП wizard | ✅ PRD | ❌ липсваше |
| Affiliate & Referral програма | ✅ PRD | ❌ липсваше |

---

## Section 2: Impact Analysis

### Epic Impact

| Статус | Епики |
|--------|-------|
| Не се засягат (done) | Epics 1–7 |
| Не се засягат (backlog) | Epics 8–12 |
| **Новодобавени** | **Epics 13–21** |

**Зависимости — всички нови епики зависят от вече завършени:**

| Нов Epic | Зависи от | Статус |
|----------|-----------|--------|
| Epic 13 (Каско) | Epic 4 (quote/policy flow) | ✅ done |
| Epic 14 (Payments) | Epic 4 (Stripe) | ✅ done |
| Epic 15 (Biometric/OAuth) | Epic 1 (JWT auth, SMS OTP) | ✅ done |
| Epic 16 (Delivery) | Epic 4, Story 4-5 (Speedy/Econt) | ✅ done |
| Epic 17 (E-sign) | Epic 1 (SMS OTP infra) | ✅ done |
| Epic 18 (GTP/Fines) | Epic 6 (BullMQ notification engine) | ✅ done |
| Epic 19 (BI) | Epic 5 (billing/commissions data) | ✅ done |
| Epic 20 (After-Service) | Epic 4 (active policies) | ✅ done |
| Epic 21 (Affiliate) | Epic 4 (purchase flow) | ✅ done |

### Artifact Impact

| Артефакт | Статус преди | Действие | Статус след |
|----------|-------------|----------|-------------|
| `sprint-status.yaml` | Epics 1–12 | ✅ Обновен | Epics 1–21 |
| `epics.md` | FR1–FR65, Epics 1–12 | ✅ Обновен | FR1–FR90, Epics 1–21 + пълни story breakdowns |
| `prd.md` | Growth section непълен; FR1–FR65 | ✅ Обновен | Growth section пълен; FR66–FR90 добавени |
| `architecture.md` | 65 FR covered | ✅ Обновен | Phase 2 extensions (8 нови домейна + DB schema + checklist) |
| `ux-design-specification.md` | MVP flows само | ✅ Обновен | Phase 2 flows (6 нови UX flows + accessibility extensions) |

### Technical Impact

- **Нулев риск за Phase 1 код** — всички промени са additive
- `InsurerAdapter` интерфейс е extensible by design (NFR33) — Каско добавя optional method
- Архитектурата поддържа нови `product_type` стойности без schema redesign
- Всички нови DB таблици следват съществуващите конвенции (UUID PK, tenant_id, RLS, soft delete)
- BullMQ worker scaling е horizontal-ready (NFR27) — нови job types не изискват инфраструктурни промени

---

## Section 3: Recommended Approach

**Избран подход: Option 1 — Direct Adjustment**

Всички промени са чисто адитивни — добавяме нови епики, stories и FRs без да засягаме съществуващия код или планиране.

**Обосновка:**
- Архитектурата е проектирана за extensibility от ден 1 (NFR33, NFR28)
- Нито един от новите епики не противоречи на съществуващ
- Всички зависимости са вече завършени
- Rollback не е нужен — нищо не се премахва
- MVP (Phase 1 / ГО / България) е 100% завършен и незасегнат

**Effort estimate:** Low — документация вече обновена; имплементацията следва стандартния story workflow
**Risk level:** Low

---

## Section 4: Detailed Change Proposals

### 4.1 sprint-status.yaml

**Действие:** Добавени Epics 13–21 в `backlog` статус

```yaml
# Новодобавени:
epic-13: backlog  # Каско — 5 stories
epic-14: backlog  # Payments — 2 stories
epic-15: backlog  # Biometric/OAuth — 3 stories
epic-16: backlog  # Green Card Delivery — 3 stories
epic-17: backlog  # E-signature — 2 stories
epic-18: backlog  # GTP/Fines — 2 stories
epic-19: backlog  # BI Dashboard — 4 stories
epic-20: backlog  # After-Service — 2 stories
epic-21: backlog  # Affiliate/Referral — 3 stories
# Общо: 26 нови stories
```

### 4.2 epics.md

**Действие:** Добавени FR66–FR90 (25 нови FRs), FR Coverage Map entries и пълни story breakdowns за всичките 9 нови епика (72 stories total, бяха 47).

### 4.3 prd.md

**Действие 1 — Product Scope / Growth Features section:**
- OLD: 7 bullet points, непълен списък
- NEW: Структуриран по ✅ done / 🔄 backlog с epic references

**Действие 2 — Functional Requirements:**
- Добавена нова секция "Phase 2 Growth (FR66–FR90)" с 25 нови FRs групирани по Epic

### 4.4 architecture.md

**Действие:** Нов раздел "Phase 2 Architectural Extensions" (~317 реда):
- Epic 13: `InsurerAdapter.getCascoQuote?()`, `product_type` enum, `casco_risk_data` JSONB
- Epic 14: `payment_provider` enum, `BoricaGatewayService`, Apple Pay domain verification
- Epic 15: `auth_provider` enum, OAuth token exchange flow, Keychain/Keystore storage
- Epic 16: `delivery_type` enum extension, `customer_addresses` table
- Epic 17: `policy_signatures` append-only table, SHA-256 document hash
- Epic 18: `gtp_expiry_date`, `vehicle_fines` table, KAT circuit breaker
- Epic 19: PostgreSQL materialized views, CONCURRENTLY refresh strategy
- Epic 20: Static JSON config + Hive/Service Worker offline cache
- Epic 21: 5 нови таблици (`promo_codes`, `promo_code_uses`, `referral_links`, `referral_conversions`, `loyalty_transactions`)
- 8 нови enforcement checklist items

### 4.5 ux-design-specification.md

**Действие:** Нов раздел "Phase 2 UX Flows" (~313 реда):
- Flow 1: Каско Questionnaire (slider, checkboxes, auto-fill МПС)
- Flow 2: Apple/Google Pay sheet + Borica redirect
- Flow 3: Биометричен вход + социален вход (Google/Apple)
- Flow 4: ПТП Wizard (offline-first, step-by-step, tap-to-call)
- Flow 5: BI Analytics Dashboard (period picker, charts, export)
- Flow 6: Referral + Loyalty points в checkout
- Accessibility checklist extensions (7 нови items)

---

## Section 5: Implementation Handoff

### Класификация на промяната: **Moderate**

Документацията е обновена и готова. Следващата стъпка е backlog организация и story creation.

### Handoff план

| Роля | Отговорност | Следваща стъпка |
|------|-------------|-----------------|
| **Scrum Master** | Приоритизиране на новите епики; определяне на sprint порядък | `/bmad-bmm-create-story` за Epic 13 Story 13.1 |
| **Product Owner** | Валидация на Epic 13 (Каско) business rules с реални insurer APIs | Confirm Casco insurer adapter requirements |
| **Developer** | Имплементация по стандартния story cycle (CS → VS → DS → CR) | Старт с Epic 8 (довършване) → Epic 13 |

### Препоръчан приоритетен ред за имплементация

```
1. Epic 8 (довършване) — Super Admin ops — 3 backlog stories
2. Epic 13 (Каско)     — най-висока бизнес стойност (2.7x ARPU)
3. Epic 14 (Payments)  — conversion rate improvement
4. Epic 15 (Biometric) — retention + UX polish
5. Epic 19 (BI)        — broker retention / churn prevention
6. Epic 18 (GTP/Fines) — DAU/MAU improvement
7. Epic 16 (Delivery)  — fulfillment completeness
8. Epic 17 (E-sign)    — regulatory completeness
9. Epic 20 (After-Service) — engagement
10. Epic 21 (Affiliate) — growth / PLG
```

### Success Criteria

- [ ] Epic 13 (Каско) имплементиран → ARPU метриката нараства с ≥ 30%
- [ ] Epic 14 (Apple/Google Pay) → mobile checkout conversion rate +15%
- [ ] Epic 19 (BI) → broker churn намалява; NPS > 50 (Q4 2027 target)
- [ ] Epic 18 (GTP) → DAU/MAU ratio извън purchase moments +20%
- [ ] Всички нови stories преминават CI pipeline (`npm run test:cov` ≥ 80% coverage)

---

## Статус на артефактите

| Артефакт | Обновен | Верифициран |
|----------|---------|-------------|
| `sprint-status.yaml` | ✅ 2026-03-22 | ✅ |
| `epics.md` | ✅ 2026-03-22 | ✅ |
| `prd.md` | ✅ 2026-03-22 | ✅ |
| `architecture.md` | ✅ 2026-03-22 | ✅ |
| `ux-design-specification.md` | ✅ 2026-03-22 | ✅ |

---

*Sprint Change Proposal генериран от BMAD Correct Course workflow — 2026-03-22*
