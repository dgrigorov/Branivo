# Story 24.1: OCR Camera Quality Pipeline, Fallback Chain, Enrichment Pipeline & ocr_scans Logging

Status: ready-for-dev

## Story

As an end-client scanning a vehicle registration document (талон на МПС),
I want the camera to intelligently guide me, auto-capture when ready, and enrich the result with external data,
so that I get the most accurate vehicle data with minimal manual effort.

## Acceptance Criteria

### AC1 — Camera Quality Real-Time Feedback
**Given** клиентът е в camera preview режим,
**When** камерата анализира кадъра (5fps, center crop 320×240),
**Then** показва се цветна рамка:
- 🔴 Червена + `blur_on` икона → "Задръжте неподвижно" (Laplacian variance < 80)
- 🟡 Жълта + `wb_sunny` икона → "Намерете по-добро осветление" (luminance < 40 или > 210)
- 🔵 Синя пунктирана рамка → "Приближете талона" (frame fill < 65%)
- 🟢 Зелена рамка → "Отлично — сканиране..." (всички условия ОК)
Никога не се показват числа на потребителя.

### AC2 — VIN-First Auto-Capture
**Given** камерата е в preview и quality проверките минават (3 consecutive стабилни кадъра),
**When** ML Kit открие валиден VIN pattern (`[A-HJ-NPR-Z0-9]{17}`) с confidence ≥ 0.82,
**Then** се извършва silent auto-capture (без бутон), зелен pulse анимация 200ms + haptic medium impact.

### AC3 — Manual Assist Timeout
**Given** 5 секунди са минали без успешен quality-OK кадър (нито blur, нито brightness, нито fill не минават),
**When** таймерът изтече,
**Then** се появява floating бутон "Снимай сега" (assisted mode) — не се натрапва преди 5s.

### AC4 — State Machine
**Given** клиентът влиза в OCR wizard,
**Then** системата следва state machine:
```
IDLE → SCANNING → VIN_FOUND (auto-capture при VIN hit)
                → QUALITY_OK (3 consecutive stable frames) → AUTO_CAPTURE
                → MANUAL_ASSIST (5s timeout) → MANUAL_CAPTURE
AUTO_CAPTURE / MANUAL_CAPTURE → PROCESSING
```

### AC5 — Per-Field Max-Confidence Merge (2 снимки)
**Given** потребителят е направил 2 снимки (Part I + Part II на талона),
**When** ML Kit обработи двете снимки,
**Then** за всяко поле се взима стойността с по-висок confidence score (per-field max-confidence merge).

### AC6 — OCR Fallback Chain
**Given** ML Kit score < 60% ИЛИ критичните полета `make` + `reg_number` са null след merge ИЛИ ML Kit timeout > 8s,
**When** fallback се тригва,
**Then**:
- Ако offline → директно Manual entry (skip Google Vision)
- Ако online → Google Vision (сървърна страна), spinner "Проверяваме данните..." (max 10s)
- Google Vision merge per-field max-confidence с ML Kit резултатите
- Ако Google Vision score < 60% ИЛИ timeout > 10s ИЛИ HTTP error (1 retry с 2s backoff) → Manual entry pre-filled
- Manual entry: pre-fill от best available fields — **никога** празна форма
- UX messaging: "Не успяхме да разчетем напълно. Моля проверете данните:" — никога думата "грешка"

### AC7 — Score Thresholds & UX
**Given** OCR pipeline завърши (ML Kit или post-Vision merge),
**Then**:
- score ≥ 85% → auto-select (директно попълване без избор)
- score 60–84% → показват се top 3 предложения за избор от потребителя
- score < 60% → Manual entry (виж AC6)

### AC8 — Enrichment Pipeline (Blocking Group)
**Given** OCR резултатите са готови,
**When** enrichment pipeline стартира,
**Then** се изпълнява в следния ред:
1. **Instant, blocking** (~50ms): проверка за existing active policy в нашата DB — ако има → hard block (не продаваме дубликат)
2. **Parallel blocking group** (max 5s total, `Future.allSettled`):
   - NHTSA/VPIC decode от VIN (timeout 3s) → fallback към ML Kit make/model при провал
   - КАТ lookup по рег. номер (timeout 4s) → продължаваме без него при провал
   - ГФ check (timeout 5s) → warning при провал, **не блокираме**
3. **Background, non-blocking**: NHTSA safety ratings + Autodata24 modification details (lazy load)

### AC9 — ГФ Hit UI
**Given** ГФ check връща активна полица,
**When** резултатът се показва,
**Then** се показва prominent banner: "Открита активна ГО полица: [застраховател], валидна до [дата]" с бутони "Виж детайли" и "Продължи с нова".

### AC10 — ГФ Timeout Warning
**Given** ГФ API не отговори в 5s,
**When** enrichment резултатите се показват,
**Then** се показва недискретно warning: "Не можем да проверим активни полици в момента" — quote flow **не** се блокира.

### AC11 — Backend Enrichment Endpoint
**Given** Flutter изпраща enrichment заявка,
**When** `GET /api/v1/vehicles/enrich?fields=kat,gf,nhtsa&reg_number=...&vin=...`,
**Then** backend изпълнява само заявените `fields` паралелно, връща `Promise.allSettled` резултат за всяко поле с `{ status: 'ok'|'timeout'|'error', data?: {...} }`.

### AC12 — ocr_scans Logging (fire-and-forget)
**Given** OCR pipeline завърши (успешно или с fallback),
**When** Flutter изпраща `POST /api/v1/ocr/log`,
**Then**:
- Логват се: quality metrics, ML Kit field confidences, Vision field confidences (ако е използван), scoring breakdown, enrichment статус, outcome полета
- **Никога** не се логва `raw_text` (PII) — само structured fields
- Заявката е fire-and-forget (`unawaited`) — не блокира UX
- Backend DTO rejects `raw_text` поле (TypeScript validation)

### AC13 — User-Corrected Fields Tracking
**Given** потребителят редактира поле на confirmation screen,
**When** submit се изпрати,
**Then** `user_corrected_fields: ['make', 'model']` (масив от редактираните полета) се включва в `/ocr/log` payload — ground truth за бъдеща calibration на scoring weights.

### AC14 — Debug Panel
**Given** приложението е в `kDebugMode`,
**When** потребителят е на camera screen,
**Then** debug панел показва live: blur variance, brightness avg, frame fill %, VIN detected, current state.
В production: triple-tap за активиране на debug overlay (за QA тестване).

---

## Tasks / Subtasks

### Flutter — Camera Quality Analyzer

- [ ] **Task 1: CameraQualityAnalyzer** (AC: #1, #2, #3, #4)
  - [ ] Нов файл: `branivo_app/lib/features/ocr/services/camera_quality_analyzer.dart`
  - [ ] Метод `analyzeFrame(CameraImage frame) → QualityResult`
  - [ ] Blur: Laplacian variance на center crop 320×240 (НЕ full frame — 3× по-бързо); reject < 80, stable ≥ 150
  - [ ] Brightness: средна luminance на same crop; range 40–210
  - [ ] Frame fill: aspect ratio на document overlay vs frame; threshold ≥ 65%
  - [ ] Preview throttle: 1 frame на 200ms (5fps) чрез `Timer.periodic`
  - [ ] VIN scan: `InputImage.fromBytes` директно от camera stream (НЕ `processImageFile`); VIN pattern `[A-HJ-NPR-Z0-9]{17}`; confidence threshold 0.82
  - [ ] `QualityResult`: enum `QualityStatus { blur, dark, overexposed, tooFar, ok, vinFound }` + `double blurVariance, brightnessAvg, frameFill, vinConfidence`

- [ ] **Task 2: OcrCameraState Machine** (AC: #4)
  - [ ] Нов файл: `branivo_app/lib/features/ocr/bloc/camera_state.dart`
  - [ ] Sealed class: `CameraIdle | CameraScanning | CameraVinFound | CameraQualityOk | CameraManualAssist | CameraAutoCapture | CameraManualCapture | CameraProcessing`
  - [ ] `CameraScanning` tracking: `consecutiveStableFrames: int`, `secondsElapsed: double`
  - [ ] 5s timeout: `Timer` в `CameraScanningCubit` → emit `CameraManualAssist` при изтичане

- [ ] **Task 3: Camera Screen Refactor** (AC: #1, #2, #3, #14)
  - [ ] Модифицирай: `branivo_app/lib/features/ocr/screens/ocr_wizard_screen.dart`
  - [ ] Добави `CameraPreview` widget с `CameraController` (резолюция `ResolutionPreset.high`, **НЕ** max — ML Kit perf)
  - [ ] Overlay widget: `QualityFrameOverlay` — цветна рамка + икона базирана на `QualityStatus` (без числа)
  - [ ] Зелена frame transition: 200ms animation, при `vinFound` → green pulse + `HapticFeedback.mediumImpact()`
  - [ ] 5s timeout → floating `ElevatedButton("Снимай сега")` с fade-in анимация
  - [ ] Debug overlay: `kDebugMode ? DebugQualityPanel(...) : GestureDetector(onTripleTap: showDebug)`
  - [ ] Reduced motion: `MediaQuery.disableAnimations` → color change instead of animations

### Flutter — OCR Scoring Engine

- [ ] **Task 4: OcrScoringEngine** (AC: #5, #7)
  - [ ] Нов файл: `branivo_app/lib/features/ocr/services/ocr_scoring_engine.dart`
  - [ ] Formula: `score = cc×0.25 + kw×0.15 + make×0.25 + model×0.25 + year×0.10`
  - [ ] Per-field max-confidence merge: `Map<String, OcrField> merge(Map<String, OcrField> scan1, Map<String, OcrField> scan2)` → за всяко поле взима по-високия `confidence`
  - [ ] `ScoreResult`: `double finalScore, ScoreBucket bucket, Map<String, double> fieldScores`
  - [ ] `ScoreBucket`: enum `{ auto, top3, manual }` (≥0.85, 0.60-0.84, <0.60)
  - [ ] Keyword scoring (`kw`): проверява дали make/model съвпадат с `vehicle_makes`/`vehicle_models` таблица (нормализиран Bulgarian Cyrillic → Latin lookup)
  - [ ] Cyrillic нормализация за топ 20 марки (BMW→BMW, Фолксваген→Volkswagen, и т.н.)

### Flutter — Fallback Chain

- [ ] **Task 5: GoogleVisionOcrRepository** (AC: #6)
  - [ ] Нов файл: `branivo_app/lib/features/ocr/data/repositories/google_vision_ocr_repository.dart`
  - [ ] Implements `OcrRepository`
  - [ ] `scanImages(images, sessionToken)`: upload full-res JPEG (НЕ preview crop) → `POST /api/v1/ocr/vision-scan`
  - [ ] Backend приема images, извиква Google Vision API, връща `OcrScanResponse`
  - [ ] 1 retry с `exponential backoff 2s` при HTTP error; след 1 retry → throws `OcrVisionException`
  - [ ] Timeout: 10s чрез `dio.options.receiveTimeout`
  - [ ] Offline detection: `connectivity_plus` → `ConnectivityResult.none` → throws `OcrOfflineException`

- [ ] **Task 6: OcrFallbackOrchestrator** (AC: #6, #7)
  - [ ] Нов файл: `branivo_app/lib/features/ocr/services/ocr_fallback_orchestrator.dart`
  - [ ] `orchestrate(mlKitResult, sessionToken) → Future<OcrFallbackResult>`
  - [ ] Fallback logic:
    ```
    if offline → return ManualEntry(prefilled: mlKitResult)
    if mlKitScore < 0.60 OR (make == null AND regNumber == null) OR mlKitTimeout →
      try Google Vision (timeout 10s, 1 retry)
        visionResult = merge(mlKitResult, visionResult)  // per-field max-confidence
        if visionScore >= 0.60 → return VisionResult(merged)
        else → return ManualEntry(prefilled: merged)
      catch OcrVisionException → return ManualEntry(prefilled: mlKitResult)
    else → return MlKitResult(mlKitResult)
    ```
  - [ ] UX messaging: score < 60% после Vision → "Не успяхме да разчетем напълно. Моля проверете данните:" (без "грешка")

- [ ] **Task 7: Актуализирай OcrWizardBloc** (AC: #4, #5, #6, #7)
  - [ ] Файл: `branivo_app/lib/features/ocr/bloc/ocr_wizard_bloc.dart`
  - [ ] Интегрирай `CameraQualityAnalyzer` в preview stream
  - [ ] Интегрирай `OcrScoringEngine` след ML Kit завърши
  - [ ] Интегрирай `OcrFallbackOrchestrator` при score < 0.60
  - [ ] Нови events: `OcrFrameAnalyzedEvent`, `OcrVinDetectedEvent`, `OcrQualityOkEvent`, `OcrManualAssistEvent`
  - [ ] Нови states: `OcrCameraQualityState(status: QualityStatus)`, `OcrVinDetectedState`, `OcrManualAssistState`

- [ ] **Task 8: Актуализирай OcrModels** (AC: #5, #6, #12, #13)
  - [ ] Файл: `branivo_app/lib/features/ocr/data/repositories/ocr_models.dart`
  - [ ] Добави: `OcrLogPayload` DTO за `/ocr/log` endpoint
  - [ ] Добави: `OcrEnrichmentResult` (kat, gf, nhtsa статуси)
  - [ ] Добави: `GfPolicyResult` (застраховател, валидност)
  - [ ] Добави: `ScoreBucket` enum (ако не е в scoring engine)

### Flutter — Enrichment Pipeline

- [ ] **Task 9: OcrEnrichmentService** (AC: #8, #9, #10, #11)
  - [ ] Нов файл: `branivo_app/lib/features/ocr/services/ocr_enrichment_service.dart`
  - [ ] `enrich(regNumber, vin, sessionToken) → Future<EnrichmentResult>`
  - [ ] Стъпка 1: `GET /api/v1/vehicles/enrich?fields=kat,gf,nhtsa&reg_number=...&vin=...`
    - Dart: `Future.wait([katFuture, gfFuture, nhtsa Future], eagerError: false)` — НЕ, всъщност един HTTP call с `?fields=` param
    - Timeout 5s за целия request
  - [ ] `EnrichmentResult`: `{ ExistingPolicyBlock? policyBlock, KatResult? kat, GfResult? gf, NhtsaResult? nhtsa, int durationMs }`
  - [ ] При `policyBlock != null` → emit `OcrDuplicatePolicyState` → **hard block** (не продаваме дубликат)
  - [ ] При `gf.policyFound == true` → emit `OcrGfHitState(insurer, validUntil)`
  - [ ] При `gf.timedOut == true` → emit `OcrGfWarningState`
  - [ ] Background enrichment (NHTSA safety + Autodata24): `unawaited(Future)` след показване на основния резултат

### Backend — Enrichment Endpoint

- [ ] **Task 10: VehicleEnrichmentController** (AC: #11)
  - [ ] Нов файл: `branivo-api/src/modules/vehicles/vehicle-enrichment.controller.ts`
  - [ ] `GET /api/v1/vehicles/enrich` — query params: `fields` (comma-separated), `reg_number`, `vin`
  - [ ] Thin controller: само routing + DTO validation
  - [ ] DTO: `EnrichVehicleQueryDto` с `@IsIn(['kat','gf','nhtsa'])` validation за всеки field

- [ ] **Task 11: VehicleEnrichmentService** (AC: #11)
  - [ ] Нов файл: `branivo-api/src/modules/vehicles/vehicle-enrichment.service.ts`
  - [ ] Метод: `enrich(dto: EnrichVehicleQueryDto) → Promise<EnrichmentResponse>`
  - [ ] Стъпка 1: existing policy check в нашата DB (tenant-scoped) — `~50ms`, blocking
  - [ ] Стъпка 2: `Promise.allSettled([katPromise, gfPromise, nhtsaPromise])` базирано на `dto.fields`
    - КАТ: `IntegrationsModule.katLookup(regNumber)` с timeout 4s → `Promise.race([katLookup, timeout(4000)])`
    - ГФ: `IntegrationsModule.gfCheck(regNumber, vin)` с timeout 5s
    - NHTSA: `IntegrationsModule.nhtsaDecode(vin)` с timeout 3s
  - [ ] Всяко поле в response: `{ status: 'ok'|'timeout'|'error', data?: {...} }`
  - [ ] **НИКОГА** без tenant_id scope при existing policy check

### Backend — Google Vision Scan Endpoint

- [ ] **Task 12: Google Vision Endpoint** (AC: #6)
  - [ ] Нов endpoint: `POST /api/v1/ocr/vision-scan` в `OcrController`
  - [ ] Приема multipart/form-data с images (full-res JPEG)
  - [ ] Извиква Google Vision API (вече конфигуриран в `AwsTextractService` equivalent)
  - [ ] Merge резултатите per-field с ML Kit данните (изпратени в request body)
  - [ ] Не съхранява raw_text в DB — само structured fields

### Backend — ocr_scans Migration & Entity

- [ ] **Task 13: Migration CreateOcrScansTable** (AC: #12, #13)
  - [ ] Нов файл: `branivo-api/src/infrastructure/database/migrations/[timestamp]-CreateOcrScansTable.ts`
  - [ ] Таблица: `ocr_scans` с UUID PK + tenant_id FK + user_id nullable FK
  - [ ] Quality columns: `blur_variance FLOAT, brightness_avg FLOAT, frame_fill_pct FLOAT, photo_count INT DEFAULT 1`
  - [ ] ML Kit columns: `mlkit_confidence FLOAT, mlkit_field_confidences JSONB`
  - [ ] Vision columns: `vision_used BOOLEAN DEFAULT FALSE, vision_confidence FLOAT, vision_field_confidences JSONB`
  - [ ] Scoring columns: `score_cc FLOAT, score_kw FLOAT, score_make FLOAT, score_model FLOAT, score_year FLOAT, final_score FLOAT, score_bucket VARCHAR(10)` → CHECK `score_bucket IN ('auto', 'top3', 'manual')`
  - [ ] Enrichment columns: `vin_found BOOLEAN DEFAULT FALSE, kat_hit BOOLEAN, gf_hit BOOLEAN, gf_policy_found BOOLEAN, enrichment_duration_ms INT`
  - [ ] Outcome columns: `user_corrected_fields JSONB, user_selected_rank INT, final_vehicle_id UUID, quote_initiated BOOLEAN DEFAULT FALSE`
  - [ ] Timestamps: `created_at TIMESTAMPTZ DEFAULT NOW()` — **без** updated_at (immutable analytics)
  - [ ] Indexes:
    ```sql
    CREATE INDEX idx_ocr_scans_tenant_created ON ocr_scans(tenant_id, created_at DESC);
    CREATE INDEX idx_ocr_scans_score_bucket ON ocr_scans(score_bucket, final_score);
    CREATE INDEX idx_ocr_scans_vin_found ON ocr_scans(vin_found) WHERE vin_found = true;
    ```
  - [ ] RLS: `ocr_scans_tenant_isolation` с `current_setting('app.current_tenant_id')`
  - [ ] Retention note: 12 месеца — добави партициониране по `created_at` (monthly) ако очакван обем > 1M/month

- [ ] **Task 14: OcrScanEntity** (AC: #12)
  - [ ] Нов файл: `branivo-api/src/modules/ocr/entities/ocr-scan.entity.ts`
  - [ ] TypeORM entity с всички колони от миграцията
  - [ ] `@Column('jsonb')` за `mlkit_field_confidences`, `vision_field_confidences`, `user_corrected_fields`
  - [ ] **Без** `@UpdateDateColumn()` — таблицата е immutable (analytics данни)

- [ ] **Task 15: OcrScanRepository** (AC: #12)
  - [ ] Нов файл: `branivo-api/src/modules/ocr/ocr-scan.repository.ts`
  - [ ] `createScan(dto: CreateOcrScanDto): Promise<OcrScanEntity>` — само INSERT, без UPDATE/DELETE
  - [ ] Ползва `TenantContext.getTenantId()` — **НЕ** параметър

### Backend — ocr/log Endpoint

- [ ] **Task 16: OcrLogEndpoint** (AC: #12, #13)
  - [ ] Добави в `OcrController`: `POST /api/v1/ocr/log`
  - [ ] DTO: `CreateOcrLogDto`
    - `blur_variance?: number`, `brightness_avg?: number`, `frame_fill_pct?: number`, `photo_count?: number`
    - `mlkit_confidence?: number`, `mlkit_field_confidences?: Record<string, number>`
    - `vision_used?: boolean`, `vision_confidence?: number`, `vision_field_confidences?: Record<string, number>`
    - `score_cc?: number`, `score_kw?: number`, `score_make?: number`, `score_model?: number`, `score_year?: number`
    - `final_score?: number`, `score_bucket?: 'auto' | 'top3' | 'manual'`
    - `vin_found?: boolean`, `kat_hit?: boolean`, `gf_hit?: boolean`, `gf_policy_found?: boolean`, `enrichment_duration_ms?: number`
    - `user_corrected_fields?: string[]`, `user_selected_rank?: number`, `final_vehicle_id?: string`, `quote_initiated?: boolean`
    - ⚠️ **`raw_text` поле е ЗАБРАНЕНО** — DTO не го съдържа; ако backend го получи → 400 Bad Request
  - [ ] Response: `201 Created` без body — fire-and-forget семантика
  - [ ] Извиква `OcrService.logScan(dto)` → `OcrScanRepository.createScan(...)`

### Tests

- [ ] **Task 17: Flutter Widget Tests** (AC: #1, #2, #3, #7, #14)
  - [ ] `test/features/ocr/camera_quality_analyzer_test.dart` — unit tests за blur/brightness/fill thresholds
  - [ ] `test/features/ocr/ocr_scoring_engine_test.dart` — unit tests за per-field merge и score buckets
  - [ ] `test/features/ocr/ocr_fallback_orchestrator_test.dart` — unit tests за всяка branch от fallback chain
  - [ ] `test/features/ocr/ocr_wizard_bloc_test.dart` — bloc tests за state transitions

- [ ] **Task 18: NestJS Unit Tests** (AC: #11, #12, #16)
  - [ ] `branivo-api/src/modules/vehicles/vehicle-enrichment.service.spec.ts` — mock КАТ/ГФ/NHTSA; test timeout behavior; test existing policy block
  - [ ] `branivo-api/src/modules/ocr/ocr-scan.repository.spec.ts` — test createScan; test tenant isolation
  - [ ] `branivo-api/src/modules/ocr/ocr.controller.spec.ts` — integration test за `/ocr/log`; test raw_text rejection; test 400 при непознати полета

---

## Dev Notes

### Съществуваща структура (не пипай без причина)

```
branivo_app/lib/features/ocr/
  bloc/
    ocr_wizard_bloc.dart      ← РАЗШИРЯВАНЕ (нови events/states)
    ocr_wizard_event.dart     ← РАЗШИРЯВАНЕ
    ocr_wizard_state.dart     ← РАЗШИРЯВАНЕ
  data/repositories/
    mlkit_ocr_repository.dart ← РАЗШИРЯВАНЕ (add camera stream support)
    ocr_api_repository.dart   ← НЕ пипай
    ocr_repository.dart       ← НЕ пипай (interface)
    ocr_models.dart           ← РАЗШИРЯВАНЕ (нови DTOs)
  screens/
    ocr_wizard_screen.dart    ← РАЗШИРЯВАНЕ (camera preview + overlay)
  services/                   ← НОВА директория (създай я)
    camera_quality_analyzer.dart  ← НОВ
    ocr_scoring_engine.dart       ← НОВ
    ocr_fallback_orchestrator.dart ← НОВ
    ocr_enrichment_service.dart   ← НОВ
```

```
branivo-api/src/modules/
  ocr/
    entities/
      ocr-job.entity.ts       ← съществуващ, НЕ пипай
      ocr-scan.entity.ts      ← НОВ (отделна таблица)
    ocr-job.repository.ts     ← съществуващ, НЕ пипай
    ocr-scan.repository.ts    ← НОВ
    ocr.service.ts            ← РАЗШИРЯВАНЕ (add logScan method)
    ocr.controller.ts         ← РАЗШИРЯВАНЕ (add /log + /vision-scan endpoints)
  vehicles/
    vehicle-enrichment.controller.ts ← НОВ
    vehicle-enrichment.service.ts    ← НОВ
```

### Критични архитектурни правила

1. **Blur computation**: ВИНАГИ на center crop 320×240 — full frame 4K убива UI thread. Ползвай `image` пакет или native Dart computation.
2. **ML Kit preview scan**: `InputImage.fromBytes(bytes, metadata)` директно от `CameraImage` — НЕ `InputImage.fromFilePath`. Latency ~80-120ms на mid-range Android.
3. **Camera resolution**: `ResolutionPreset.high` за preview, full resolution JPEG само за final capture + Google Vision upload.
4. **VIN auto-capture**: 3 consecutive stable frames преди auto-capture — предотвратява false positive от случаен стабилен кадър.
5. **Google Vision upload**: изпраща се оригиналния full-res JPEG, НЕ обработения preview frame.
6. **fire-and-forget в Dart**: `unawaited(ocrEnrichmentService.logScan(...))` — Dart `unawaited` от `package:flutter/foundation.dart`. НЕ `Future.ignore()` (изтрива exceptions).
7. **Tenant isolation**: `OcrScanRepository.createScan()` ползва `TenantContext.getTenantId()` — НЕ параметър.
8. **ocr_scans е immutable**: само INSERT операции — без UPDATE/DELETE endpoints. Аналог на `audit_log` и `policy_events`.

### Scoring Formula (от party mode дискусия 2026-03-29)

```
score = cc×0.25 + kw×0.15 + make×0.25 + model×0.25 + year×0.10
```

- `cc` = character confidence (ML Kit average per recognized character)
- `kw` = keyword match rate (полета намерени в vehicle_makes/vehicle_models таблицата)
- `make`, `model`, `year` = per-field confidence от ML Kit/Vision

Calibration данните ще се събират чрез `user_corrected_fields` в `ocr_scans` таблицата.

### Fallback Chain (пълна логика)

```
ML Kit on-device
  ↓ score ≥ 0.85 → auto-select ✓
  ↓ score 0.60-0.84 → top 3 choice ✓
  ↓ score < 0.60 OR (make=null AND reg=null) OR timeout > 8s
    → offline? → Manual (pre-filled от ML Kit)
    → online → Google Vision (timeout 10s, 1 retry 2s backoff)
        merge per-field max-confidence с ML Kit
        ↓ merged score ≥ 0.60 → top 3 или auto ✓
        ↓ merged score < 0.60 OR timeout OR HTTP error
            → Manual (pre-filled от merged best fields) ✓
```

### Enrichment Timeline (max 5s blocking, потребителят вижда spinner)

```
t=0ms:   existing policy check (наша DB, tenant-scoped)
t=~50ms: start parallel group → NHTSA(3s) + КАТ(4s) + ГФ(5s)
t=≤5000ms: показваме резултата с каквото е дошло
t=async:  NHTSA safety + Autodata24 details (background update)
```

### Google Vision vs AWS Textract

**В тази story**: fallback е **Google Vision** (server-side) — НЕ AWS Textract. Решението е взето в party mode дискусия защото:
- Google Vision работи с inline base64 (по-лесна интеграция)
- AWS Textract изисква S3 upload + BullMQ async polling (по-бавно за UX)
- Scoring системата позволява per-field merge (Google Vision е по-подходящ за синхронен fallback)

Съществуващият `AwsTextractService` (от story 3-3) остава непроменен — използва се за batch/async обработка (OCR Analytics Dashboard).

### Пакети за добавяне в pubspec.yaml

```yaml
camera: ^0.10.5+9          # Camera preview stream (НЕ image_picker за live preview)
connectivity_plus: ^5.0.2  # Offline detection за fallback chain
```

`google_mlkit_text_recognition` вече е инсталиран от story 3-3.

### Seed данни

Няма нужда от нови seed данни — `ocr_scans` е analytics таблица, не master data. `vehicle_makes` и `vehicle_models` вече имат seed данни от story 3-3/3-4.

---

### Project Structure Notes

- Новата директория `branivo_app/lib/features/ocr/services/` е нова — трябва да се създаде
- `ocr_scans` е **отделна таблица** от `ocr_jobs` (story 3-3) — различни цели: `ocr_jobs` е за async job tracking, `ocr_scans` е за analytics/calibration
- `vehicle-enrichment.controller.ts` е в `vehicles` модул (не `ocr`) — enrichment е vehicle domain concern
- Backend `/ocr/log` приема само structured JSON body (не multipart) — fire-and-forget семантика

### Edge Cases — от Edge Case Hunter Review (2026-03-29)

Следните edge cases трябва да бъдат покрити в имплементацията:

**Flutter — Camera Quality Analyzer**
- **Множество failing quality условия едновременно**: дефинирай приоритет blur > overexposed > dark > tooFar (first failing wins) — иначе иконата е недефинирана
- **Кадър по-малък от 320×240** (front camera ниска резолюция): `cropW = min(320, frame.width); cropH = min(240, frame.height)` — иначе crash при crop
- **Laplacian variance 80–149** (не rejected < 80, не stable ≥ 150): добави `QualityStatus.unstable`; само ≥ 150 брои към `consecutiveStableFrames` — иначе premature auto-capture
- **`analyzeFrame` хвърля exception** mid-sequence: catch → reset `consecutiveStableFrames = 0` — иначе стал брояч води до false 3-frame trigger
- **ML Kit връща VIN с малки букви** (model-dependent): `vinText = rawVin.toUpperCase()` преди pattern validation
- **Множество VIN-like patterns** с различни confidence: sort по confidence DESC, вземи първия
- **`analyzeFrame` извикан след `dispose()`**: guard check преди processing

**Flutter — State Machine / Camera Screen**
- **App goes to background преди timer**: `_timer?.cancel()` в `cubit.close()`; check `isClosed` преди `emit` — иначе crash
- **PROCESSING fails** (network/server error): добави `CameraProcessingError` state — иначе app заседва в PROCESSING
- **VIN_FOUND и QUALITY_OK trigger едновременно**: VIN_FOUND взима приоритет; skip QUALITY_OK path при `vinConfidence ≥ 0.82`
- **Reduced motion + haptic**: `if (!MediaQuery.of(context).disableAnimations) HapticFeedback.mediumImpact()` — accessibility contract

**Flutter — OCR Scoring Engine**
- **Merge: field confidence=0.0 vs null**: null = confidence -1; 0.0 beats null — иначе null може да "спечели" merge
- **Само 1 снимка** (scan2 е empty map): `if (scan2.isEmpty) return scan1` — иначе scan1 fields могат да се загубят
- **Score boundary при 0.60**: `score >= 0.60` → top3 (inclusive) — 0.60 не трябва да пада в manual

**Flutter — Fallback Chain**
- **ML Kit timeout detection**: wrap в `Future.timeout(Duration(seconds: 8))`; catch `TimeoutException` as `mlKitTimeout = true` — иначе timeout condition never detected
- **Retry + 10s timeout**: ползвай shared deadline `startTime + 10s`; retry само ако `deadline > 2s remaining` — иначе spinner 12+ секунди
- **`ConnectivityResult.other/bluetooth`**: `isOnline = result == wifi || mobile || ethernet` — иначе Google Vision се извиква без реален интернет
- **make=null AND reg=null след Vision merge при score ≥ 0.60**: повтори null-critical-fields check върху merged result преди bucket assignment
- **Background `unawaited` enrichment завършва след navigation**: не подавай `BuildContext` в fire-and-forget; само service-layer calls — иначе `FlutterError: setState called after dispose`

**Backend — Enrichment Endpoint**
- **`fields` param липсва или е empty string**: `@IsNotEmpty()` validation; default към всички fields ако omitted
- **Дублирани стойности в fields** (напр. `fields=kat,kat,gf`): `fields = [...new Set(dto.fields)]` — иначе duplicate external API calls
- **NHTSA заявен но `vin` е null**: върни `{ status: 'error', data: null }` без да извикваш external API
- **КАТ/ГФ заявени но `reg_number` е null**: същото — guard per-field преди external call
- **Promise.race resource leak**: ползвай `AbortController`/`axios cancelToken`; cancel pending request при timeout
- **DB timeout в Step 1** (existing policy check): добави `.timeout(500ms)`; при timeout — continue без block

**Backend — ocr/log Endpoint**
- **`raw_text` rejection**: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` задължително — иначе `raw_text` PII влиза в DB без грешка
- **`TenantContext.getTenantId()` връща null**: `if (!tenantId) throw new UnauthorizedException()` преди INSERT — иначе scan с null tenant_id, RLS пропуск

**Backend — Migration / RLS**
- **`current_setting('app.current_tenant_id')` не е set**: ползвай `current_setting('app.current_tenant_id', true)` (missing_ok=true); ако null → deny-all — иначе empty string cast към UUID хвърля грешка
- **`user_id` FK**: явно декларирай `REFERENCES users(id) ON DELETE SET NULL` — без explicit reference миграцията може да fail

**Flutter — ocr_scans logging**
- **`user_corrected_fields` дублиращи се стойности**: `user_corrected_fields = [...{...correctedFields}]` (deduplicate) — иначе duplicate entries изкривяват calibration

---

### References

- [Source: Party Mode Discussion 2026-03-29] — Camera Quality Pipeline decisions
- [Source: Party Mode Discussion 2026-03-29] — Fallback Chain decisions
- [Source: Party Mode Discussion 2026-03-29] — Enrichment Pipeline decisions (Winston/John/Amelia/Mary/Sally)
- [Source: _bmad-output/implementation-artifacts/3-3-vehicle-document-ocr-scanning.md] — Existing OCR structure
- [Source: branivo_app/lib/features/ocr/data/repositories/mlkit_ocr_repository.dart] — Existing ML Kit integration
- [Source: branivo_app/lib/features/ocr/screens/ocr_wizard_screen.dart] — Existing camera screen
- [Source: branivo_app/lib/features/ocr/bloc/ocr_wizard_bloc.dart] — Existing BLoC structure

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
