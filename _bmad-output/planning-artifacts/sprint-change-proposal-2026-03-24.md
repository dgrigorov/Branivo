# Sprint Change Proposal — ML Kit замества Google Cloud Vision (OCR)

**Дата:** 2026-03-24
**Автор:** Daniel (Correct Course workflow)
**Тип:** Документална актуализация (имплементацията тече паралелно)
**Статус:** ⏳ Чака одобрение

---

## Секция 1: Обобщение на промяната

### Какво се случи

В хода на имплементация на Epic 3 (Vehicle & OCR) беше взето решение да се замени **Google Cloud Vision API** (cloud-based, server-side) с **Firebase ML Kit** (on-device, Flutter-side) като primary OCR provider.

### Защо

| Причина | Детайл |
|---------|--------|
| **Privacy win** | ML Kit обработва изображенията on-device — никакви снимки не напускат телефона. Cloud Vision изпращаше всяка снимка към Google сървъри. |
| **Скорост** | On-device OCR: ~1–3 сек. Cloud Vision: до 15 сек мрежова латентност. |
| **Разходи** | ML Kit е безплатен. Cloud Vision е $1.50/1000 заявки. |
| **GDPR** | Google Vision отпада от списъка sub-processors в DPA. |
| **Offline resilience** | ML Kit работи и без интернет при добро осветление. |

### Архитектурна промяна (ключово)

**ПРЕДИ:** Flutter изпраща 3 снимки → `POST /api/v1/ocr/scan` → NestJS вика Google Vision API → разбира текст → връща полета

**СЛЕД:** Flutter ML Kit обработва снимките on-device → Flutter изпраща вече **извлечените текстови полета** → `POST /api/v1/ocr/scan` (или нов endpoint) → NestJS валидира confidence → при нужда тригва AWS Textract fallback

> **Критично:** `google-vision.service.ts` вече не е OCR provider — той е или премахнат, или заменен с `ml-kit-result.processor.ts` (server-side валидатор на ML Kit резултатите).

---

## Секция 2: Impact Analysis

### 2.1 Epic Impact

| Epic | Засегнат? | Коментар |
|------|-----------|----------|
| Epic 1 — Auth & Tenants | ❌ Не | |
| Epic 2 — White-label & Onboarding | ❌ Не | |
| **Epic 3 — Vehicle & OCR** | ✅ Да | Story 3.3 е имплементирана; само документация |
| Epic 4 — Quotes & Policies | ❌ Не | |
| Epic 5 — Payments | ❌ Не | |
| Epic 6 — Logistics | ❌ Не | |

Epic 3 е вече имплементиран. Промените са **само документални** — нито едно acceptance criteria не е невалидно по бизнес логика; само provider reference-ите се обновяват.

### 2.2 Story Impact

| Story | Засегнат? | Тип промяна |
|-------|-----------|-------------|
| Story 3.3 Vehicle Document OCR Scanning | ✅ Да | AC2, AC3 текст + Tasks provider references |
| Story 3.6 OCR Analytics Dashboard | ⚠️ Частично | provider enum стойности (`google_vision` → `ml_kit`) |
| Всички останали | ❌ Не | |

### 2.3 Artifact Conflicts

| Артефакт | Брой локации | Тип |
|----------|-------------|-----|
| `prd.md` | 7 | NFRs, External Integrations таблица, GDPR sub-processors |
| `architecture.md` | 9 | Timeouts таблица, OCR pipeline описание, file tree, module table |
| `epics.md` | 4 | NFR1, NFR36, NFR42, Story 3.3 ACs |
| `3-3-vehicle-document-ocr-scanning.md` | 8+ | AC2, AC3, Tasks, provider enums, Dev Notes |
| `project-context.md` | 1 | Timeout reference таблица |
| `implementation-readiness-report-2026-03-18.md` | 3 | Само архивен документ — нисък приоритет |

### 2.4 Technical Impact

- `google-vision.service.ts` в NestJS се премахва / заменя (имплементира се в паралелната сесия)
- Provider enum `OcrProvider.GOOGLE_VISION` → `OcrProvider.ML_KIT`
- DB migration: ако enum е вече в production, ще трябва `ALTER TYPE`
- `GOOGLE_APPLICATION_CREDENTIALS` env var и `@google-cloud/vision` пакет отпадат
- UX flow не се променя — клиентът не вижда разлика

---

## Секция 3: Препоръчан подход

**Option 1: Direct Adjustment** ✅ Избран

- Scope е чисто документален; имплементацията тече в паралелна сесия
- Промените са локализирани и не засягат бизнес логиката
- Epic 3 е done — не се налага rollback
- MVP scope е непроменен

**Effort:** Low | **Risk:** Low | **Timeline impact:** Нула

---

## Секция 4: Детайлни Change Proposals

### 4.1 PRD (`_bmad-output/planning-artifacts/prd.md`)

---

**[PRD-1] Ред 282 — GDPR sub-processors**

```
СТАРО:
покрива sub-processors: AWS, Stripe, Google Vision, SendGrid, Twilio

НОВО:
покрива sub-processors: AWS, Stripe, SendGrid, Twilio
```
*Обосновка: ML Kit е on-device — Google не е sub-processor за OCR данни.*

---

**[PRD-2] Ред 309 — External Integrations таблица**

```
СТАРО:
| Google Vision / AWS Textract | OCR на свидетелство за регистрация | Висока |

НОВО:
| Firebase ML Kit / AWS Textract | OCR на свидетелство за регистрация | Висока |
```

---

**[PRD-3] Ред 345 — Техническа реализация на OCR**

```
СТАРО:
Техническа реализация: Google Vision API (primary) + AWS Textract (fallback),
confidence threshold 0.85, graceful degradation при нисък score.

НОВО:
Техническа реализация: Firebase ML Kit (on-device, primary) + AWS Textract (server-side fallback),
confidence threshold 0.85, graceful degradation при нисък score.
OCR се изпълнява on-device в Flutter приложението — снимките не се изпращат към external cloud services.
При confidence < 0.85, извлечените полета (не снимките) се изпращат към backend за AWS Textract верификация.
```

---

**[PRD-4] Ред 461 — External Dependencies таблица**

```
СТАРО:
| Google Vision API | OCR primary | Висока | AWS Textract fallback |

НОВО:
| Firebase ML Kit   | OCR primary (on-device) | Висока | AWS Textract fallback |
```

---

**[PRD-5] Ред 749 — NFR1**

```
СТАРО:
NFR1: OCR pipeline (3 снимки → попълнени полета) завършва в < 30 секунди при нормални
мрежови условия (sync path: Google Vision < 15 сек; async path: AWS Textract < 30 сек)

НОВО:
NFR1: OCR pipeline (3 снимки → попълнени полета) завършва в < 15 секунди при нормални условия
(sync path: ML Kit on-device < 3 сек; async path: AWS Textract fallback < 30 сек)
```

---

**[PRD-6] Ред 800 — NFR36**

```
СТАРО:
NFR36: Дефинирани timeouts: insurer APIs 5 сек; OCR sync (Google Vision) 15 сек;
OCR async (AWS Textract) 30 сек; КАТ API 3 сек

НОВО:
NFR36: Дефинирани timeouts: insurer APIs 5 сек; OCR sync (ML Kit on-device) 3 сек;
OCR async (AWS Textract fallback) 30 сек; КАТ API 3 сек
```

---

**[PRD-7] Ред 819 — NFR42 GDPR**

```
СТАРО:
NFR42: GDPR: DPA с всеки брокер-тенант задължителен преди активация;
покрива sub-processors (AWS, Stripe, Google Vision, SendGrid, Twilio)

НОВО:
NFR42: GDPR: DPA с всеки брокер-тенант задължителен преди активация;
покрива sub-processors (AWS, Stripe, SendGrid, Twilio)
Забележка: Firebase ML Kit обработва данните on-device — Google не е sub-processor за OCR.
```

---

### 4.2 Architecture (`_bmad-output/planning-artifacts/architecture.md`)

---

**[ARCH-1] Ред 41 — NFR1 таблица**

```
СТАРО:
| NFR1 | OCR < 30 сек end-to-end | Async pipeline; Vision 15s / Textract 30s |

НОВО:
| NFR1 | OCR < 15 сек end-to-end | ML Kit on-device ~3s; Textract fallback 30s |
```

---

**[ARCH-2] Ред 97 — External Dependencies таблица**

```
СТАРО:
| Google Vision API | 15s | — | AWS Textract |

НОВО:
| Firebase ML Kit   | 3s (on-device) | — | AWS Textract |
```

---

**[ARCH-3] Ред 130 — OCR Pipeline описание**

```
СТАРО:
3. OCR Pipeline — 3 images → Google Vision (primary, 15s) → AWS Textract (fallback, 30s)
→ confidence 0.85 threshold → partial fill с visual indicator → graceful manual fallback;
rate limit 10 req/min/IP

НОВО:
3. OCR Pipeline — Flutter ML Kit processes 3 images on-device (~3s) → extracts fields →
sends fields+confidence to POST /api/v1/ocr/scan → if avg confidence < 0.85,
backend enqueues AWS Textract fallback job (BullMQ, async, 30s) → confidence 0.85 threshold →
partial fill с visual indicator → graceful manual fallback; rate limit 10 req/min/IP
Снимките НЕ се изпращат към external cloud OCR service при primary path.
```

---

**[ARCH-4] Ред 394 — NestJS модули списък**

```
СТАРО:
4. NestJS: OCR module (Google Vision + Textract + circuit breaker)

НОВО:
4. NestJS: OCR module (ML Kit result processor + Textract fallback + circuit breaker)
```

---

**[ARCH-5] Ред 834 — File tree**

```
СТАРО:
│   │   │   │   ├── google-vision.provider.ts   # primary; timeout 15s

НОВО:
│   │   │   │   ├── ml-kit-result.processor.ts  # primary; validates on-device ML Kit results
```

---

**[ARCH-6] Ред 1210 — Integration таблица**

```
СТАРО:
| Google Vision | `ocr/` | Primary 15s → Textract fallback 30s → manual entry |

НОВО:
| Firebase ML Kit | Flutter (on-device) | Primary ~3s → Textract fallback 30s → manual entry |
```

---

**[ARCH-7] Ред 1255 — OCR & Vehicle Data row**

```
СТАРО:
| OCR & Vehicle Data | 7 | `ocr/` module; Google Vision → Textract fallback; VIN decoder |

НОВО:
| OCR & Vehicle Data | 7 | `ocr/` module; Flutter ML Kit (on-device) → Textract fallback; VIN decoder |
```

---

**[ARCH-8] Ред 1280 — Reliability таблица**

```
СТАРО:
| Reliability | OCR fallback | Google Vision (10s) → AWS Textract (30s) → partial fill + `low_confidence_fields[]` |

НОВО:
| Reliability | OCR fallback | ML Kit on-device (~3s) → AWS Textract fallback (30s) → partial fill + `low_confidence_fields[]` |
```

---

### 4.3 Epics (`_bmad-output/planning-artifacts/epics.md`)

---

**[EPIC-1] Ред 112 — NFR1**

```
СТАРО:
NFR1: OCR pipeline (3 снимки → попълнени полета) завършва в < 30 секунди при нормални
мрежови условия (sync path: Google Vision < 15 сек; async path: AWS Textract < 30 сек)

НОВО:
NFR1: OCR pipeline (3 снимки → попълнени полета) завършва в < 15 секунди при нормални условия
(sync path: ML Kit on-device < 3 сек; async path: AWS Textract fallback < 30 сек)
```

---

**[EPIC-2] Ред 147 — NFR36**

```
СТАРО:
NFR36: Дефинирани timeouts: insurer APIs 5 сек; OCR sync (Google Vision) 15 сек;
OCR async (AWS Textract) 30 сек; КАТ API 3 сек

НОВО:
NFR36: Дефинирани timeouts: insurer APIs 5 сек; OCR sync (ML Kit on-device) 3 сек;
OCR async (AWS Textract fallback) 30 сек; КАТ API 3 сек
```

---

**[EPIC-3] Ред 153 — NFR42**

```
СТАРО:
NFR42: GDPR: DPA с всеки брокер-тенант задължителен преди активация;
покрива sub-processors (AWS, Stripe, Google Vision, SendGrid, Twilio)

НОВО:
NFR42: GDPR: DPA с всеки брокер-тенант задължителен преди активация;
покрива sub-processors (AWS, Stripe, SendGrid, Twilio)
```

---

**[EPIC-4] Редове 581–586 — Story 3.3 ACs в epics.md**

```
СТАРО:
**When** images are submitted to Google Vision (sync path),
**Then** OCR pipeline завършва в < 15 сек и полетата се попълват автоматично

**Given** Google Vision fails or confidence < 0.85,
**When** fallback към AWS Textract се тригва,
**Then** BullMQ job се queue-ва...

НОВО:
**When** Flutter ML Kit processes images on-device (sync path),
**Then** OCR pipeline завършва в < 3 сек и полетата се попълват автоматично

**Given** ML Kit confidence < 0.85 (средно по всички полета),
**When** fallback към AWS Textract се тригва,
**Then** BullMQ job се queue-ва...
```

---

### 4.4 Story 3.3 (`_bmad-output/implementation-artifacts/3-3-vehicle-document-ocr-scanning.md`)

---

**[STORY-1] AC2 — заглавие и тяло**

```
СТАРО:
2. **AC2 — Google Vision sync path (< 15 сек):**
   **Given** клиент е заснел 3 снимки (Part I + Part II на свидетелство),
   **When** изображенията се изпращат към `POST /api/v1/ocr/scan`,
   **Then** Google Vision API се извиква синхронно; OCR pipeline завършва в < 15 сек;
   полетата се попълват автоматично; response: `{ jobId, status: "completed", fields: {...}, provider: "google_vision" }`

НОВО:
2. **AC2 — ML Kit on-device OCR (< 3 сек):**
   **Given** клиент е заснел 3 снимки (Part I + Part II на свидетелство),
   **When** Flutter ML Kit обработва изображенията on-device,
   **Then** OCR pipeline завършва в < 3 сек; Flutter изпраща извлечените полета към
   `POST /api/v1/ocr/scan`; полетата се попълват автоматично;
   response: `{ jobId, status: "completed", fields: {...}, provider: "ml_kit" }`
   Снимките НЕ се изпращат към external cloud service.
```

---

**[STORY-2] AC3 — fallback trigger условие**

```
СТАРО:
3. **AC3 — AWS Textract fallback (async):**
   **Given** Google Vision не отговаря в 10 сек или confidence < 0.85 (средно по всички полета),

НОВО:
3. **AC3 — AWS Textract fallback (async):**
   **Given** ML Kit confidence < 0.85 (средно по всички полета) или ML Kit пълен failure,
```

---

**[STORY-3] Task 1 — provider enum в DB migration**

```
СТАРО:
Колони: `provider` ENUM(`google_vision`, `aws_textract`)

НОВО:
Колони: `provider` ENUM(`ml_kit`, `aws_textract`)
```

---

**[STORY-4] Task 2 — OcrProvider enum**

```
СТАРО:
Enum: `OcrJobStatus` (`pending`, `processing`, `completed`, `failed`),
`OcrProvider` (`google_vision`, `aws_textract`)

НОВО:
Enum: `OcrJobStatus` (`pending`, `processing`, `completed`, `failed`),
`OcrProvider` (`ml_kit`, `aws_textract`)
```

---

**[STORY-5] Task 4 — замени GoogleVisionService с MlKitResultProcessor**

```
СТАРО:
- [x] **Task 4: GoogleVisionService** (AC: #2, #4, #5)
  - [x] Файл: `branivo-api/src/modules/ocr/providers/google-vision.service.ts`
  - [x] Зависимости: `@google-cloud/vision` — `npm install @google-cloud/vision`
  - [x] `analyzeImages(imageBuffers: Buffer[]): Promise<OcrFieldResult[]>`
  - [x] Timeout: 10 сек; Credentials: `GOOGLE_APPLICATION_CREDENTIALS`

НОВО:
- [x] **Task 4: MlKitResultProcessor** (AC: #2, #4, #5)
  - [x] Файл: `branivo-api/src/modules/ocr/providers/ml-kit-result.processor.ts`
  - [x] Няма external dependency — валидира и нормализира резултатите изпратени от Flutter ML Kit
  - [x] `processResults(mlKitFields: MlKitFieldsDto): Promise<OcrFieldResult[]>`
  - [x] Изчислява aggregate confidence score; маркира полета под 0.85 за Textract fallback
  - [x] Не прави мрежови заявки — чисто business logic
```

---

**[STORY-6] Task 7 — OcrService scan метод**

```
СТАРО:
    3. Try Google Vision (timeout 10s)
    4. If success AND avg confidence ≥ 0.85 → update job status=`completed`, return results
    5. If Google Vision fails (timeout / error) OR avg confidence < 0.85 → enqueue Textract BullMQ job

НОВО:
    3. Валидирай ML Kit резултати чрез MlKitResultProcessor
    4. If avg confidence ≥ 0.85 → update job status=`completed`, return results
    5. If confidence < 0.85 OR ML Kit failure flag → enqueue Textract BullMQ job
```

---

**[STORY-7] Task 11 — OcrModule DI**

```
СТАРО:
Providers: `OcrService`, `GoogleVisionService`, `AwsTextractService`, ...

НОВО:
Providers: `OcrService`, `MlKitResultProcessor`, `AwsTextractService`, ...
```

---

**[STORY-8] Dev Notes секция — Google Vision API Pattern**

```
СТАРО:
### Google Vision API Pattern
[Google Cloud Vision SDK код]

НОВО:
### ML Kit Integration Pattern
ML Kit OCR се изпълнява в Flutter (branivo_app). NestJS получава вече извлечените полета.
Flutter изпраща: `{ fields: { vin, reg_num, ... }, confidence_scores: { vin: 0.92, ... }, provider: "ml_kit" }`
NestJS MlKitResultProcessor валидира структурата и изчислява aggregate confidence.
За Textract fallback — NestJS все още приема optional `images[]` multipart или ползва S3 ключове.
```

---

**[STORY-9] Ред 460 — .env секция**

```
СТАРО:
# Google Vision
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

НОВО:
# ML Kit е on-device (Flutter) — няма server-side credentials
# GOOGLE_APPLICATION_CREDENTIALS — ПРЕМАХНАТ
```

---

### 4.5 Project Context (`_bmad-output/planning-artifacts/project-context.md`)

---

**[CTX-1] Ред 92 — timeout таблица**

```
СТАРО:
| Google Vision OCR | 10s | AWS Textract (transparent to user) |

НОВО:
| ML Kit OCR (on-device) | ~3s | AWS Textract fallback (transparent to user) |
```

---

## Секция 5: Implementation Handoff

### Обхват: Minor

Документалните промени могат да се извършат директно от dev team-а без PM/SM координация.

### Приоритет на файловете

| # | Файл | Причина |
|---|------|---------|
| 1 | `3-3-vehicle-document-ocr-scanning.md` | Story файлът — "truth" за имплементацията |
| 2 | `prd.md` | GDPR/NFR промени са правно значими |
| 3 | `architecture.md` | Архитектурна документация за новите разработчици |
| 4 | `epics.md` | NFR consistency |
| 5 | `project-context.md` | LLM context за бъдещи сесии |
| 6 | `implementation-readiness-report-2026-03-18.md` | Архивен — нисък приоритет |

### Success Criteria

- [ ] Нито едно споменаване на "Google Vision" не остава в `prd.md`, `architecture.md`, `epics.md`, `3-3-...`, `project-context.md`
- [ ] NFR1 timeout: < 15 сек (вместо < 30 сек)
- [ ] NFR36: ML Kit timeout стойност: 3 сек
- [ ] GDPR sub-processors: Google Vision е премахнат
- [ ] Provider enum: `ml_kit` (вместо `google_vision`)
- [ ] `implementation-readiness-report-2026-03-18.md` — по избор (архивен документ)

---

*Sprint Change Proposal генериран от Correct Course workflow — 2026-03-24*
