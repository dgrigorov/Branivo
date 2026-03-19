# Story 2.1: White-Label Branding Configuration

Status: review

## Story

As a Broker,
I want to upload my logo, set brand colors and choose a font for my portal,
so that my clients experience a fully branded insurance portal without any technical assistance.

## Acceptance Criteria

1. **AC1 — Брандиране се запазва:**
   **Given** логнат broker в Dashboard,
   **When** качи лого, зададе primary/secondary цвят и избере font,
   **Then** промените се прилагат към техния tenant portal; `brand_logo`, `brand_colors` и `brand_font` се записват в `tenant_configs` таблицата

2. **AC2 — Font dropdown с 5 опции:**
   **Given** broker отвори font dropdown,
   **When** разгледа опциите,
   **Then** вижда точно 5 pre-approved Google Fonts: Inter, Roboto, Lato, Poppins, Open Sans — с live preview в dropdown-а

3. **AC3 — WCAG AA валидация:**
   **Given** broker избере цвят,
   **When** Design Guardrails го валидира,
   **Then** системата изчислява WCAG AA color contrast ratio (≥ 4.5:1 срещу #FFFFFF за нормален текст) и **блокира** публикуването при non-compliance

4. **AC4 — Preview преди публикуване:**
   **Given** branding промени са готови,
   **When** broker кликне "Preview",
   **Then** вижда preview на реален quote flow screen с новото брандиране, цветовете и избрания font преди публикуване

5. **AC5 — Блокиране при non-compliant тема:**
   **Given** non-compliant тема (contrast < 4.5:1),
   **When** broker се опита да публикува,
   **Then** публикуването е блокирано с конкретно съобщение кой цвят нарушава стандарта

6. **AC6 — Брандирането се вижда от клиентите:**
   **Given** публикувано брандиране,
   **When** краен клиент посети tenant portal,
   **Then** вижда брандирания портал с логото, цветовете и шрифта на брокера

7. **AC7 — Лого валидация:**
   **Given** broker качва лого,
   **When** изображението се обработва,
   **Then** системата валидира формата (PNG или SVG) и минималния размер; файлът се съхранява в S3 с ключ `tenants/{tenantId}/logo.{ext}`

8. **AC8 — Redis cache се инвалидира:**
   **Given** брандирането е запазено,
   **When** `PUT /api/v1/tenants/branding` завърши успешно,
   **Then** Redis cache ключът `{tenantId}:config:tenant` се изтрива за незабавно отразяване

## Tasks / Subtasks

### Backend — DB Migration

- [x] **Task 1: Migration — добавяне на branding полета в tenant_configs** (AC: #1, #2)
  - [x] Създай `branivo-api/src/infrastructure/database/migrations/1710000006000-AddBrandingToTenantConfigs.ts`
  - [x] Добави колони:
    ```sql
    ALTER TABLE "tenant_configs"
      ADD COLUMN IF NOT EXISTS "secondary_color" VARCHAR(7) NULL,
      ADD COLUMN IF NOT EXISTS "brand_font" VARCHAR(32) NULL;
    ```
  - [x] `down()` метод: DROP COLUMN за двете колони
  - [x] **НЕ добавяй NOT NULL constraint** — existing rows нямат стойности

### Backend — Entity & DTO

- [x] **Task 2: Обнови TenantConfig entity** (AC: #1, #2)
  - [x] Файл: `branivo-api/src/modules/tenants/entities/tenant-config.entity.ts`
  - [x] Добави:
    ```typescript
    @Column({ name: 'secondary_color', length: 7, nullable: true })
    secondaryColor!: string | null;

    @Column({ name: 'brand_font', length: 32, nullable: true })
    brandFont!: string | null;
    ```

- [x] **Task 3: UpdateBrandingDto** (AC: #1, #2, #3, #7)
  - [x] Създай `branivo-api/src/modules/tenants/dto/update-branding.dto.ts`:
    ```typescript
    import { IsHexColor, IsIn, IsOptional } from 'class-validator';

    export const APPROVED_FONTS = ['Inter', 'Roboto', 'Lato', 'Poppins', 'Open Sans'] as const;
    export type ApprovedFont = (typeof APPROVED_FONTS)[number];

    export class UpdateBrandingDto {
      @IsOptional()
      @IsHexColor()
      primaryColor?: string;

      @IsOptional()
      @IsHexColor()
      secondaryColor?: string;

      @IsOptional()
      @IsIn(APPROVED_FONTS)
      brandFont?: ApprovedFont;
    }
    ```
  - [x] Логото идва като `multipart/form-data` файл — **не** в DTO-то

- [x] **Task 4: Обнови TenantConfigResponseDto** (AC: #6)
  - [x] Файл: `branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts`
  - [x] Добави в `branding` обекта:
    ```typescript
    secondaryColor: string | null;
    brandFont: string | null;
    ```
  - [x] Обнови и `getTenantConfig()` в TenantsService да включва новите полета

### Backend — S3 инфраструктура

- [x] **Task 5: S3 Service** (AC: #7)
  - [x] Създай `branivo-api/src/infrastructure/s3/s3.service.ts`:
    ```typescript
    import { Injectable } from '@nestjs/common';
    import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

    @Injectable()
    export class S3Service {
      private readonly client = new S3Client({ region: process.env.AWS_REGION });
      private readonly bucket = process.env.AWS_S3_BUCKET!;

      async uploadLogo(tenantId: string, buffer: Buffer, ext: string): Promise<string> {
        const key = `tenants/${tenantId}/logo.${ext}`;
        await this.client.send(new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: ext === 'svg' ? 'image/svg+xml' : 'image/png',
          CacheControl: 'public, max-age=31536000',
        }));
        return `https://${process.env.AWS_CLOUDFRONT_DOMAIN}/${key}`;
      }
    }
    ```
  - [x] Създай `branivo-api/src/infrastructure/s3/s3.module.ts` — exports `S3Service`
  - [x] Добави `S3_BUCKET` и `AWS_CLOUDFRONT_DOMAIN` в `.env.example`
  - [x] **S3 key формат:** `tenants/{tenantId}/logo.{ext}` — [Source: architecture.md#Gap 3: S3 Key Structure]

### Backend — WCAG Helper

- [x] **Task 6: WcagHelper** (AC: #3, #5)
  - [x] Създай `branivo-api/src/common/helpers/wcag.helper.ts`:
    ```typescript
    /**
     * WCAG 2.1 AA contrast ratio calculation.
     * Reference: https://www.w3.org/TR/WCAG21/#contrast-minimum
     * Minimum ratio: 4.5:1 for normal text against white (#FFFFFF).
     */
    export function hexToRelativeLuminance(hex: string): number {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const linearize = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
    }

    export function getContrastRatio(hex: string): number {
      const L1 = 1; // #FFFFFF luminance
      const L2 = hexToRelativeLuminance(hex);
      return (L1 + 0.05) / (L2 + 0.05);
    }

    export function isWcagAA(hex: string): boolean {
      return getContrastRatio(hex) >= 4.5;
    }
    ```
  - [x] **НЕ ползвай npm пакет** — имплементацията е проста и трябва да е в codebase-а

### Backend — Service & Controller

- [x] **Task 7: TenantsRepository.upsertConfig()** (AC: #1)
  - [x] Добави метод в `branivo-api/src/modules/tenants/tenants.repository.ts`:
    ```typescript
    async upsertBranding(tenantId: string, data: Partial<TenantConfig>): Promise<void> {
      const existing = await this.configRepo.findOne({ where: { tenantId } });
      if (existing) {
        await this.configRepo.update({ tenantId }, data);
      } else {
        await this.configRepo.save(this.configRepo.create({ tenantId, ...data }));
      }
    }
    ```

- [x] **Task 8: TenantsService.updateBranding()** (AC: #1, #3, #5, #7, #8)
  - [x] Добави метод в `branivo-api/src/modules/tenants/tenants.service.ts`:
    ```typescript
    async updateBranding(dto: UpdateBrandingDto, logoFile?: Express.Multer.File): Promise<void> {
      const tenantId = this.tenantContext.getTenantId();

      // WCAG AA валидация
      const colorsToCheck = [dto.primaryColor, dto.secondaryColor].filter(Boolean) as string[];
      for (const color of colorsToCheck) {
        if (!isWcagAA(color)) {
          throw new BadRequestException(
            `Color ${color} fails WCAG AA contrast (ratio: ${getContrastRatio(color).toFixed(2)}:1, minimum: 4.5:1)`,
          );
        }
      }

      const update: Partial<TenantConfig> = {};
      if (dto.primaryColor) update.primaryColor = dto.primaryColor;
      if (dto.secondaryColor !== undefined) update.secondaryColor = dto.secondaryColor;
      if (dto.brandFont) update.brandFont = dto.brandFont;

      // S3 logo upload
      if (logoFile) {
        const ext = logoFile.mimetype === 'image/svg+xml' ? 'svg' : 'png';
        update.logoUrl = await this.s3Service.uploadLogo(tenantId, logoFile.buffer, ext);
      }

      await this.tenantsRepository.upsertBranding(tenantId, update);

      // Инвалидирай Redis cache
      await this.redis.del(RedisKeyHelper.build(tenantId, 'config', 'tenant'));
    }
    ```
  - [x] Inject `S3Service` в TenantsService constructor
  - [x] Import `isWcagAA`, `getContrastRatio` от `WcagHelper`

- [x] **Task 9: TenantsController — PUT /branding** (AC: #1, #3, #5, #7)
  - [x] Добави в `branivo-api/src/modules/tenants/tenants.controller.ts`:
    ```typescript
    import {
      Put, UseGuards, UseInterceptors, UploadedFile,
      Body, HttpCode, HttpStatus,
    } from '@nestjs/common';
    import { FileInterceptor } from '@nestjs/platform-express';
    import { memoryStorage } from 'multer';
    import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
    import { RolesGuard } from '../../common/guards/roles.guard';
    import { Roles } from '../../common/decorators/roles.decorator';
    import { UpdateBrandingDto } from './dto/update-branding.dto';

    @Put('branding')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('broker_admin')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseInterceptors(FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (_, file, cb) => {
        const allowed = ['image/png', 'image/svg+xml'];
        cb(null, allowed.includes(file.mimetype));
      },
    }))
    async updateBranding(
      @Body() dto: UpdateBrandingDto,
      @UploadedFile() logo?: Express.Multer.File,
    ) {
      return this.tenantsService.updateBranding(dto, logo);
    }
    ```
  - [x] Добави `S3Module` в `imports` на `TenantsModule`
  - [x] `@UploadedFile()` може да е `undefined` — всички полета в dto са optional

### Next.js Web — BFF Routes

- [x] **Task 10: BFF route — GET /api/v1/tenants/config** (AC: #6)
  - [x] Провери дали `branivo-web/src/app/api/v1/tenants/config/route.ts` съществува
  - [x] Ако не — създай го (broker layout вече го ползва):
    ```typescript
    export async function GET(request: Request) {
      const res = await fetch(`${process.env.BRANIVO_API_URL}/api/v1/tenants/config`, {
        headers: { Cookie: request.headers.get('cookie') ?? '' },
      });
      return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    ```
  - [x] Следвай BFF pattern от `src/app/api/v1/admin/tenants/[id]/status/route.ts`

- [x] **Task 11: BFF route — PUT /api/v1/tenants/branding** (AC: #1)
  - [x] Създай `branivo-web/src/app/api/v1/tenants/branding/route.ts`
  - [x] **ВАЖНО:** Проксира `multipart/form-data` — прехвърли `Content-Type` header директно:
    ```typescript
    export async function PUT(request: Request) {
      const formData = await request.formData();
      const res = await fetch(`${process.env.BRANIVO_API_URL}/api/v1/tenants/branding`, {
        method: 'PUT',
        headers: { Cookie: request.headers.get('cookie') ?? '' },
        body: formData, // fetch автоматично задава правилния Content-Type boundary
      });
      return new Response(res.body, { status: res.status });
    }
    ```

### Next.js Web — Branding Page

- [x] **Task 12: Branding страница** (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Създай `branivo-web/src/app/[locale]/(broker)/branding/page.tsx`
  - [x] **UI компоненти:**
    - Logo upload зона (drag & drop + click) — показва preview на качения файл
    - Primary color picker (`<input type="color">` + hex text field)
    - Secondary color picker (същото)
    - Font dropdown — 5 опции с live font preview чрез Google Fonts `<link>`
    - WCAG AA индикатор за всеки цвят (зелен ✓ / червен ✗ с ratio)
    - Preview секция — показва mock quote card с избраните цветове и font
    - "Запази" бутон — disabled ако някой цвят е non-WCAG-compliant

  - [x] **Client-side WCAG check** (frontend дублира backend валидацията за UX):
    ```typescript
    function hexToLuminance(hex: string): number {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }
    function contrastRatio(hex: string): number {
      return (1 + 0.05) / (hexToLuminance(hex) + 0.05);
    }
    ```

  - [x] **Google Fonts зареждане:** добави `<link>` в page head при избор на font
    ```typescript
    const FONT_URLS: Record<string, string> = {
      Inter: 'https://fonts.googleapis.com/css2?family=Inter&display=swap',
      Roboto: 'https://fonts.googleapis.com/css2?family=Roboto&display=swap',
      Lato: 'https://fonts.googleapis.com/css2?family=Lato&display=swap',
      Poppins: 'https://fonts.googleapis.com/css2?family=Poppins&display=swap',
      'Open Sans': 'https://fonts.googleapis.com/css2?family=Open+Sans&display=swap',
    };
    ```

  - [x] **Submit:** `FormData` с `logo` (File), `primaryColor`, `secondaryColor`, `brandFont`
  - [x] **TanStack Query `useMutation`** за PUT `/api/v1/tenants/branding`
  - [x] При успех: invalidate `['tenant', 'config']` query

### Tests

- [x] **Task 13: Unit тестове за WcagHelper** (AC: #3)
  - [x] `branivo-api/src/common/helpers/wcag.helper.spec.ts`
  - [x] Test: `#000000` (черен) → contrast 21:1 → `isWcagAA` = true
  - [x] Test: `#FFFFFF` (бял) → contrast 1:1 → `isWcagAA` = false
  - [x] Test: `#1A56DB` (default primary blue) → contrast ≥ 4.5:1 → `isWcagAA` = true
  - [x] Test: `#FFFF00` (жълт) → contrast < 4.5:1 → `isWcagAA` = false
  - [x] Test: `#767676` (граничен случай ≈ 4.48:1) → `isWcagAA` = false

- [x] **Task 14: Unit тестове за TenantsService.updateBranding()** (AC: #1, #3, #5, #8)
  - [x] `branivo-api/src/modules/tenants/tenants.service.spec.ts`
  - [x] Test: валиден primaryColor (WCAG-compliant) → `upsertBranding()` извикан, Redis `del()` извикан
  - [x] Test: non-compliant primaryColor → throws `BadRequestException` с color в message
  - [x] Test: non-compliant secondaryColor → throws `BadRequestException`
  - [x] Test: с лого файл → `s3Service.uploadLogo()` извикан, `logoUrl` записан
  - [x] Test: без лого → `s3Service.uploadLogo()` НЕ е извикан

- [x] **Task 15: Integration тестове за PUT /tenants/branding** (AC: #1, #3, #5, #7)
  - [x] `branivo-api/src/modules/tenants/tenants.controller.spec.ts`
  - [x] Test: без auth → 401
  - [x] Test: `super_admin` роля → 403 (само `broker_admin`)
  - [x] Test: `broker_admin`, валиден body → 204
  - [x] Test: non-WCAG-compliant color → 400 с message
  - [x] Test: невалиден brandFont (не е от 5-те) → 400
  - [x] Test: невалиден файл тип (JPEG) → 400

- [x] **Task 16: Component тест за Branding Page** (AC: #2, #3, #4, #5)
  - [x] `branivo-web/src/__tests__/broker/branding.page.test.tsx`
  - [x] Test: показва 5 font опции в dropdown
  - [x] Test: non-compliant цвят показва ✗ и WCAG ratio
  - [x] Test: "Запази" бутон е disabled при non-compliant цвят
  - [x] Test: submit изпраща FormData с правилните полета

## Dev Notes

### Какво вече съществува (НЕ пресъздавай)

```
branivo-api/src/modules/tenants/tenants.controller.ts     ← добави PUT /branding тук
branivo-api/src/modules/tenants/tenants.service.ts        ← добави updateBranding() тук
branivo-api/src/modules/tenants/tenants.repository.ts     ← добави upsertBranding() тук
branivo-api/src/modules/tenants/entities/tenant-config.entity.ts  ← добави secondaryColor, brandFont
branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts ← добави нови branding полета
branivo-api/src/modules/tenants/tenants.module.ts         ← добави S3Module в imports
branivo-web/src/app/[locale]/(broker)/layout.tsx          ← съществува от Story 1.6
```

### TenantConfig Entity — текущо vs. очаквано

**Текущи колони в `tenant_configs`:**
- `primary_color` VARCHAR(7) default '#1A56DB' ✓
- `logo_url` VARCHAR(512) nullable ✓
- `support_email` VARCHAR(255) nullable ✓
- `support_phone` VARCHAR(32) nullable ✓
- `secondary_color` — **ЛИПСВА, добавя се в Task 1**
- `brand_font` — **ЛИПСВА, добавя се в Task 1**

### S3 Key Structure

```
tenants/{tenantId}/logo.png    ← PNG качване
tenants/{tenantId}/logo.svg    ← SVG качване
```

**CloudFront URL формат:** `https://${AWS_CLOUDFRONT_DOMAIN}/tenants/{tenantId}/logo.{ext}`

**Важно от архитектурата:** CloudFront cache key **задължително включва `Host` header** — предотвратява tenant asset leakage между tenants. [Source: architecture.md#CDN]

### WCAG AA Контраст — Математика

Contrast ratio = (L1 + 0.05) / (L2 + 0.05)

Където L1 > L2, L1 = relative luminance на по-светлия цвят.

При проверка срещу бял фон (#FFFFFF), L1 = 1.0 (бяло), L2 = luminance на проверявания цвят.

**Примери:**
- `#1A56DB` (default blue) → ≈ 5.9:1 → PASS ✓
- `#FF6B6B` (light red) → ≈ 3.2:1 → FAIL ✗
- `#D1D5DB` (light gray) → ≈ 1.7:1 → FAIL ✗

**Минимум:** 4.5:1 за нормален текст (WCAG 2.1 Level AA)
[Source: epics.md#Story 2.1 AC3; architecture.md#NFR29]

### Multer File Upload Pattern (NestJS)

```typescript
// memory storage — файлът е в buffer, не на диска
import { memoryStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';

@UseInterceptors(FileInterceptor('logo', { storage: memoryStorage() }))
async updateBranding(@UploadedFile() logo?: Express.Multer.File) { ... }
```

`@UploadedFile()` е `undefined` ако не е качен файл — endpoint работи и без лого (само обновява цветове/font).

**Инсталирай типовете:** `npm install -D @types/multer` (в branivo-api)

### Google Fonts — Approved List

| Название | Google Fonts API |
|----------|-----------------|
| Inter | `family=Inter` |
| Roboto | `family=Roboto` |
| Lato | `family=Lato` |
| Poppins | `family=Poppins` |
| Open Sans | `family=Open+Sans` |

[Source: epics.md#Story 2.1 AC2]

### Redis Cache Invalidation

Същият pattern от Story 1.6:
```typescript
const cacheKey = RedisKeyHelper.build(tenantId, 'config', 'tenant');
await this.redis.del(cacheKey);
```

[Source: Story 1.6 Dev Notes#Redis Cache Invalidation]

### BFF Multipart Proxy

При `multipart/form-data` **не** трябва да се задава `Content-Type` header ръчно — `fetch` го задава автоматично с правилния `boundary`. Ако го зададеш ръчно, ще се счупи parsing-ът на FormData в NestJS.

### Env Variables (добавяне в .env.example)

```env
AWS_REGION=eu-central-1
AWS_S3_BUCKET=branivo-assets
AWS_CLOUDFRONT_DOMAIN=d1234abcd.cloudfront.net
```

### Learnings от Story 1.6

1. **Redis invalidation pattern** — `RedisKeyHelper.build(tenantId, 'config', 'tenant')` е точният ключ
2. **ParseUUIDPipe** — не е нужен тук (няма `:id` параметър в `/branding`)
3. **`@Roles('broker_admin')`** — използвай `broker_admin`, не `super_admin` (endpoint е за own-tenant)
4. **TenantsModule exports** — ако добавяш нов service, добави го в `exports`
5. **`writeAuditLog()`** — за branding промени **не е задължително** audit log (не е в AC), но може да се добави като enhancement

### Project Structure Notes

**Нови файлове:**
```
branivo-api/src/infrastructure/database/migrations/
└── 1710000006000-AddBrandingToTenantConfigs.ts     ← Task 1

branivo-api/src/infrastructure/s3/
├── s3.module.ts                                     ← Task 5
└── s3.service.ts                                    ← Task 5

branivo-api/src/modules/tenants/dto/
└── update-branding.dto.ts                           ← Task 3

branivo-api/src/common/helpers/
└── wcag.helper.ts                                   ← Task 6
└── wcag.helper.spec.ts                              ← Task 13

branivo-web/src/app/[locale]/(broker)/branding/
└── page.tsx                                         ← Task 12

branivo-web/src/app/api/v1/tenants/config/
└── route.ts                                         ← Task 10

branivo-web/src/app/api/v1/tenants/branding/
└── route.ts                                         ← Task 11

branivo-web/src/__tests__/broker/
└── branding.page.test.tsx                           ← Task 16
```

**Модифицирани файлове:**
```
branivo-api/src/modules/tenants/entities/tenant-config.entity.ts  ← Task 2
branivo-api/src/modules/tenants/dto/tenant-config-response.dto.ts ← Task 4
branivo-api/src/modules/tenants/tenants.controller.ts             ← Task 9
branivo-api/src/modules/tenants/tenants.service.ts                ← Task 8
branivo-api/src/modules/tenants/tenants.repository.ts             ← Task 7
branivo-api/src/modules/tenants/tenants.module.ts                 ← Task 9 (import S3Module)
branivo-api/src/modules/tenants/tenants.service.spec.ts           ← Task 14
branivo-api/src/modules/tenants/tenants.controller.spec.ts        ← Task 15
```

### References

- [Source: epics.md#Story 2.1] — User story, Acceptance Criteria
- [Source: epics.md#FR9, FR10] — White-label branding, Design Guardrails
- [Source: epics.md#NFR29, NFR30] — WCAG 2.1 AA, Design Guardrails
- [Source: architecture.md#Gap 3: S3 Key Structure] — `tenants/{tenantId}/logo.{ext}`
- [Source: architecture.md#CDN] — CloudFront; Cache key включва Host header
- [Source: architecture.md#branivo-api структура] — `update-branding.dto.ts` path, `PUT /api/v1/tenants/branding`
- [Source: architecture.md#branivo-web структура] — `branding/page.tsx` в broker group
- [Source: branivo-api/src/modules/tenants/tenants.service.ts] — Redis cache key pattern, `getTenantConfig()`
- [Source: branivo-api/src/modules/tenants/entities/tenant-config.entity.ts] — съществуващи колони
- [Source: Story 1.6 Dev Notes] — Redis invalidation, BFF proxy pattern, broker_layout.tsx

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `wcag.helper.spec.ts`: Граничният случай `#767676` всъщност има контраст ~4.54:1 (минава WCAG AA). Коригиран с `#777777` (~4.48:1) — реалният borderline цвят.
- `tenants.controller.ts`: `JwtAuthGuard` е в `modules/auth/guards/`, не в `common/guards/`. Коригиран import path.
- `@types/multer` + `@aws-sdk/client-s3` инсталирани (изрично в story specs и архитектурата).

### Completion Notes List

- Всички 16 задачи имплементирани и тествани; CI pass: lint ✓, API 180/180 ✓, Web 38/38 ✓, build ✓, tsc ✓
- `TenantConfig` entity разширена с `secondaryColor` и `brandFont`; migration добавя колоните
- `S3Service` + `S3Module` в `infrastructure/s3/`; ключ: `tenants/{tenantId}/logo.{ext}`
- `WcagHelper` имплементира WCAG 2.1 AA contrast ratio спрямо W3C спецификацията; без npm пакет
- `PUT /api/v1/tenants/branding` — multipart/form-data; само `broker_admin`; WCAG валидация backend + client-side
- Redis cache инвалидира се след всяка branding промяна (същия pattern от Story 1.6)
- 5 pre-approved Google Fonts с live preview; `GET /api/v1/tenants/config` BFF route създаден

### File List

**New Files — branivo-api:**
- `src/infrastructure/database/migrations/1710000006000-AddBrandingToTenantConfigs.ts`
- `src/infrastructure/s3/s3.service.ts`
- `src/infrastructure/s3/s3.module.ts`
- `src/modules/tenants/dto/update-branding.dto.ts`
- `src/common/helpers/wcag.helper.ts`
- `src/common/helpers/wcag.helper.spec.ts`

**New Files — branivo-web:**
- `src/app/[locale]/(broker)/branding/page.tsx`
- `src/app/api/v1/tenants/config/route.ts`
- `src/app/api/v1/tenants/branding/route.ts`
- `src/__tests__/broker/branding.page.test.tsx`

**Modified Files — branivo-api:**
- `src/modules/tenants/entities/tenant-config.entity.ts`
- `src/modules/tenants/dto/tenant-config-response.dto.ts`
- `src/modules/tenants/tenants.controller.ts`
- `src/modules/tenants/tenants.service.ts`
- `src/modules/tenants/tenants.repository.ts`
- `src/modules/tenants/tenants.module.ts`
- `src/modules/tenants/tenants.service.spec.ts`
- `src/modules/tenants/tenants.controller.spec.ts`
- `package.json` / `package-lock.json`
