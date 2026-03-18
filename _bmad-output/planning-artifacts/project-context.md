# Project Context — Branivo (AI Agent Rules)

**Project:** Branivo — White-Label Multi-Tenant Branivo SaaS
**Stack:** NestJS 10 · Flutter 3.19 · Next.js 14 · PostgreSQL 16 · Redis 7 · BullMQ · Stripe Connect · AWS ECS Fargate
**Date:** 2026-03-17
**Phase:** Phase 1 MVP (Q1–Q2 2026) — Bulgaria only, GO product only

---

## 1. Tenant Safety — NEVER violate

These rules prevent data leaks between brokers. A violation is a critical security bug.

- **NEVER** hardcode `tenant_id` — always resolve from `TenantContext.getTenantId()`
- **NEVER** query the database without `WHERE tenant_id = $tenantId` scope (except explicit Super Admin context with `tenant_id = '00000000-...'`)
- **NEVER** return `insurer.api_key_enc` in any GET response
- **NEVER** pass `tenant_id` as a function parameter — use `TenantContext` service injection
- **ALWAYS** apply RLS as a secondary safeguard, not a primary one — app-level WHERE clauses are mandatory
- **ALWAYS** check `features.{flag}` before serving feature-gated endpoints (`features.fleet`, `features.api_access`, `features.kasko`, etc.)

---

## 2. Payment & Policy Safety — NEVER violate

These rules prevent financial errors and chargeback liability.

- **NEVER** activate a policy client-side — activation happens ONLY on `payment_intent.succeeded` Stripe webhook
- **ALWAYS** verify Stripe webhook signature with `stripe.webhooks.constructEvent()` — reject 400 without valid signature
- **ALWAYS** use `request_three_d_secure: 'any'` (not `'automatic'`) — transfers chargeback liability to issuing bank
- **ALWAYS** apply idempotency on webhook processing — check `payment.id` before acting, use `stripe-idempotency-key` header
- **ALWAYS** record a `policy_events` row for every issued/renewed/cancelled/refunded policy — this is the billing counter
- **ALWAYS** use `application_fee_amount` (NOT destination charges) for platform fee

---

## 3. Data Integrity — NEVER violate

- `audit_log` is **IMMUTABLE** — no UPDATE or DELETE endpoints, ever
- `policy_events` is **IMMUTABLE** — no UPDATE or DELETE endpoints, ever
- `commission_pct` is snapshotted at policy creation — **NEVER** updated retroactively
- **ALWAYS** check `features.logistics` before creating a shipment BullMQ job — if false, send PDF by email only
- `receipt_s3_key` on shipments is **MANDATORY** — regulatory compliance

---

## 4. Architecture Rules

### Module Structure (Controller → Service → Repository)
- Controllers are **thin**: routing + DTO validation only, zero business logic
- Services contain **all** business logic, call repositories only
- Repositories contain **all** DB queries — never use `EntityManager` directly in services
- Never skip layers (e.g., controller calling repository directly)

### Code Quality
- Max **30 lines** per function — extract helpers if longer
- Max **300 lines** per file — split into multiple files if longer
- If logic appears in **2+ places** → extract to a private helper method
- No inline business logic in BullMQ processors — delegate to service methods

### Database
- UUID primary keys everywhere: `DEFAULT gen_random_uuid()`
- `tenant_id` on **every** table (except `tenants`, `tenant_configs`, `tenant_domains`)
- All timestamps: `TIMESTAMPTZ` (UTC) — never `TIMESTAMP`
- Soft delete: `deleted_at TIMESTAMPTZ NULL` on every table
- Always use `{ name: 'snake_case_column' }` in TypeORM — default camelCase mapping is unreliable
- Always index FK columns and frequently queried columns
- RLS enabled on every table with `tenant_id`
- Migrations: never modify existing — always create a new one; always include `up()` and `down()`

---

## 5. Security Rules

- **JWT**: access token 15 min (contains `jti` for blacklisting); refresh token 30 days (rotated on every use)
- **Passwords**: bcrypt cost 12; min 8 chars, ≥1 uppercase, ≥1 digit, ≥1 special char
- **Encryption**: `two_fa_secret` and `insurer.api_key_enc` → AES-256-GCM
- **2FA secret**: stored encrypted — NEVER returned in plain text
- **Webhook raw body**: webhook endpoint must NOT parse JSON before Stripe signature verification
- **API keys** (for API Consumer role): raw key shown **once** at creation, stored as bcrypt hash — never retrievable again
- **Security headers**: Helmet (HSTS, CSP, X-Frame-Options: DENY, noSniff, XSS filter)
- **Rate limits**: 100 req/min/IP (public), 300 req/min (authenticated), 10 req/min/IP (OCR scan)

---

## 6. External Integrations

All external integrations are **non-blocking** — they must never hold up the main request.

| Integration | Timeout | Fallback |
|-------------|---------|---------|
| Insurer APIs | 5s | Mark offer as `unavailable` — does NOT block other offers |
| Google Vision OCR | 10s | AWS Textract (transparent to user) |
| KAT API | 5s | Manual entry with warning |
| Гаранционен фонд | 5s | Manual check + warning |
| VIN Decoder (NHTSA) | 3s | Local WMI table |
| Speedy / Econt | 10s | ManualAdapter + Broker Admin alert |

**Circuit breaker (opossum):** opens at 50% failure rate, resets after 30 seconds.

**Cache:** ГФ data → Redis 24h per VIN; KAT fines → Redis 1h; tenant config → Redis 5 min.

---

## 7. OCR Rules

- Confidence threshold: **≥ 0.85** → auto-fill; **< 0.85** → empty field + add to `low_confidence_fields[]`
- VIN: exactly 17 characters, NO letters O, I, Q; position 9 (index 8) = ISO 3779 check digit
- Up to 3 images: images[0]+[1] merged (max confidence per field); images[2] processed separately (personal data)
- OCR results stored in `ocr_scans` table for 30 days (audit trail)
- Rate limit: 10 requests/min/IP (public endpoint)

---

## 8. Quote & Policy Rules

- **Anonymous flow**: session token (client-generated UUID) in `X-Session-Token` header; stored in Redis TTL 48h
- **Quote expiry**: 48 hours; hourly cron sets status = `expired`
- **Parallel insurer calls**: `Promise.allSettled()` — timeout 5s per insurer; `offer.status = 'unavailable'` on timeout
- **Scoring formula**: score = (0.40 × price_score) + (0.30 × rating) + (0.20 × claim_speed) + (0.10 × extras)
- **is_recommended**: TRUE only for highest score (max 1 per quote); tie → higher `insurer.rating`
- **Policy status flow**: `pending_payment` → `pending_signature` → `active` → `expired | cancelled | pending_renewal`
- **Auto-cancel**: policy not paid within 30 min → `cancelled`; cron every 5 min
- **Policy number format**: `GO-2025-00123` (atomic DB sequence per product type + year)
- **PDF generation**: async BullMQ job after `payment_intent.succeeded` webhook; retry 3x; timeout 30s
- **S3 presigned URL TTL**: 15 min — generate new URL on every request

---

## 9. Notifications

**Renewal escalation chain (STRICT — no deviations):**
- D-30: **Push only**
- D-7: **Push only**
- D-3: **SMS only**
- D-1: **Email only**
- D+1: **Broker Dashboard (in-app) only**
- **D-14 does NOT exist**

**Cron schedule (EET = Europe/Sofia):**
- Policy expiry reminders: Daily 09:00 EET
- Quote expiry cleanup: Hourly
- Policy auto-cancel (unpaid > 30 min): Every 5 min
- Loyalty points expiry: Daily 00:00 EET
- Billing invoice generation: 1st of month, 06:00 EET
- Fleet go_status refresh: Daily 02:00 UTC

---

## 10. GDPR Rules

- **Erasure**: NOT allowed while active policies exist
- **Anonymization**: `email → deleted_{id}@deleted.invalid`
- **Data retention**: 5 years after last policy expiry
- **Personal data encryption**: AES-256-GCM at-rest; TLS 1.3 in-transit
- **Explicit consent**: `gdpr_consent` + `gdpr_consent_at` at registration
- **DPA**: mandatory with every broker-tenant before activation

---

## 11. Flutter-Specific Rules

- **BLoC only** for state management — no Provider, no Riverpod, no setState for business logic
- **Screens are dumb**: listen to BLoC state and render UI only — zero business logic in `build()`
- Max `build()` method: **50 lines** — extract child widgets if longer
- **Hive** for offline data (`policies`, `tenant_theme`); **flutter_secure_storage** for auth tokens — NEVER store tokens in Hive
- **go_router** for all navigation — Navigator only for short-lived dialogs
- `json_serializable` with `fieldRename: FieldRename.snake` for all API models
- **NEVER** use `print()` in production — use `dart:developer` log
- **NEVER** hardcode URLs — use `lib/core/api/endpoints.dart` constants
- After modifying `@JsonSerializable` models: run `dart run build_runner build --delete-conflicting-outputs`
- OCR flow works **without authentication** — 3-step wizard (full face → zoom → back optional)
- Sync on reconnect with `connectivity_plus`

---

## 12. Next.js-Specific Rules

- **ISR** for tenant branding (changes rarely)
- **Dynamic rendering** for quote results (always fresh — stale prices are unacceptable)
- Tenant theme resolved from `Host` header in middleware → injected into layout
- PWA: Service Worker for offline wallet access (issued documents only); quote flow always requires internet
- Mobile-first: `< 768px` = mobile; `768–1023px` = mobile-friendly; `≥ 1024px` = desktop

---

## 13. Phase 1 Scope Guard

Only `go` product type is active in Phase 1. Architecture supports all from day 1, but:
- Do NOT implement `kasko`, `property`, `health`, `travel` business logic yet
- Do NOT implement Fleet Management (`features.fleet`) — guarded by feature flag
- Do NOT implement API Consumer tier (`features.api_access`) — Phase 2
- Do NOT implement DKP wizard (`features.dkp_wizard`) — Phase 2
- Do NOT implement BI Dashboard — Phase 2
- Renewal: implement D-7 push at launch; full escalation chain within 30 days of launch

---

## 14. Key Numbers (Quick Reference)

| Parameter | Value |
|-----------|-------|
| Access token TTL | 15 min |
| Refresh token TTL | 30 days (rotated on every use) |
| OTP length / TTL | 6 digits / 5 min |
| OTP rate limit | 3 sends / hour / phone |
| Login lockout | 5 failures → locked 15 min |
| bcrypt cost | 12 |
| Quote expiry | 48 hours |
| Insurer API timeout | 5 sec |
| OCR timeout / fallback | 10 sec → AWS Textract |
| OCR confidence threshold | ≥ 0.85 auto-fill; < 0.85 → empty + flag |
| S3 presigned URL TTL | 15 min |
| Redis tenant config TTL | 5 min |
| Max claim photos | 20 (JPEG/PNG/WEBP, ≤ 15MB each, auto-compress 2048px) |
| Policy auto-cancel | 30 min without payment |
| PDF generation retry | 3x, timeout 30s |
| Claim number format | `CLM-2025-00045` |
| Scoring weights | 40% price + 30% rating + 20% claim speed + 10% extras |
| Loyalty: 1 point | = 0.10 BGN, expires after 12 months |
| Circuit breaker | Opens at 50% failure rate, resets after 30 sec |
