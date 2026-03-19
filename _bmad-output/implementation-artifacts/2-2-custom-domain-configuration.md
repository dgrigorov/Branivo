# Story 2.2: Custom Domain Configuration

Status: done

## Story

As a Broker,
I want to configure a custom domain for my portal,
so that my clients access the platform through my own brand domain.

## Acceptance Criteria

1. **AC1 — Домейн регистрация:**
   **Given** логнат broker_admin в Dashboard,
   **When** въведе custom domain (напр. `polici.mybrokerage.bg`) и кликне "Добави домейн",
   **Then** системата генерира уникален DNS TXT verification record (`_branivo-verify.{domain}` → `branivo-verify={token}`) и статусът е `pending`; брокерът вижда конкретните инструкции какво DNS запис да добави

2. **AC2 — Статус polling без ръчен refresh:**
   **Given** DNS verification е инициирана,
   **When** broker проверява статуса на домейна,
   **Then** вижда текущия статус: `pending` → `verifying` → `active` | `failed` в реално време (polling на всеки 10 секунди докато статусът е pending/verifying)

3. **AC3 — Активиране при успешна верификация:**
   **Given** DNS TXT записът е добавен правилно,
   **When** cron job верифицира (на всеки 5 минути),
   **Then** домейн статусът → `active`; `tenant_domains.verified_at` се записва; TenantContext middleware резолвира новия домейн правилно; Redis host cache се инвалидира за стария pending запис

4. **AC4 — Порталът работи на custom домейна:**
   **Given** custom domain е active,
   **When** краен клиент посети `polici.mybrokerage.bg`,
   **Then** порталът се зарежда идентично с `{slug}.branivo.bg`

5. **AC5 — Fallback при неуспешна верификация:**
   **Given** DNS верификацията неуспее (status → `failed`),
   **When** broker е уведомен,
   **Then** `{slug}.branivo.bg` subdomain продължава да работи без прекъсване и брокерът вижда конкретен reason за failure и инструкции за корекция

6. **AC6 — Изтриване на custom домейн:**
   **Given** broker иска да премахне custom domain,
   **When** кликне "Изтрий",
   **Then** домейнът се изтрива от `tenant_domains`; Redis host cache се инвалидира; `{slug}.branivo.bg` продължава да работи

7. **AC7 — TenantMiddleware резолвира само active домейни:**
   **Given** custom domain е в статус `pending` или `failed`,
   **When** заявка дойде към него,
   **Then** middleware връща 404 (tenant not found) — само `active` домейни са valid за resolution

8. **AC8 — Един custom домейн на tenant:**
   **Given** broker вече има custom domain (в какъвто и да е статус),
   **When** се опита да добави втори,
   **Then** системата връща 409 Conflict с ясно съобщение

## Tasks / Subtasks

### Backend — DB Migration

- [ ] **Task 1: Migration — добавяне на verification полета в tenant_domains** (AC: #1, #3, #5, #7)
  - [ ] Създай `branivo-api/src/infrastructure/database/migrations/1710000008000-AddDomainVerificationStatus.ts`
  - [ ] `up()` метод:
    ```sql
    -- Добави status като VARCHAR с CHECK constraint (не PostgreSQL ENUM — по-лесно миграции)
    ALTER TABLE "tenant_domains"
      ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK ("status" IN ('pending', 'verifying', 'active', 'failed')),
      ADD COLUMN IF NOT EXISTS "verification_token" VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "failure_reason" VARCHAR(512) NULL,
      ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

    -- Уникален индекс на verification_token (за бързо lookup в cron)
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_domains_verification_token"
      ON "tenant_domains" ("verification_token") WHERE "verification_token" IS NOT NULL;

    -- Индекс за cron job polling
    CREATE INDEX IF NOT EXISTS "idx_tenant_domains_status"
      ON "tenant_domains" ("status") WHERE "status" IN ('pending', 'verifying');
    ```
  - [ ] `down()` метод: DROP INDEX + DROP COLUMN за всички добавени полета
  - [ ] **Важно:** Съществуващите редове (`{slug}.branivo.bg`) вземат `status = 'active'` (DEFAULT) — коректно, са вече верифицирани

### Backend — Entity Update

- [ ] **Task 2: Обнови TenantDomain entity** (AC: #1, #3, #5, #7)
  - [ ] Файл: `branivo-api/src/modules/tenants/entities/tenant-domain.entity.ts`
  - [ ] Добави:
    ```typescript
    import {
      Column, CreateDateColumn, Entity, JoinColumn,
      ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
    } from 'typeorm';
    import { Tenant } from './tenant.entity';

    export type DomainStatus = 'pending' | 'verifying' | 'active' | 'failed';

    @Entity({ name: 'tenant_domains' })
    export class TenantDomain {
      @PrimaryGeneratedColumn('uuid')
      id!: string;

      @Column({ name: 'tenant_id' })
      tenantId!: string;

      @ManyToOne(() => Tenant)
      @JoinColumn({ name: 'tenant_id' })
      tenant!: Tenant;

      @Column({ name: 'domain', length: 255, unique: true })
      domain!: string;

      @Column({ name: 'is_primary', default: false })
      isPrimary!: boolean;

      @Column({ name: 'status', length: 20, default: 'active' })
      status!: DomainStatus;

      @Column({ name: 'verification_token', length: 64, nullable: true, unique: true })
      verificationToken!: string | null;

      @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
      verifiedAt!: Date | null;

      @Column({ name: 'failure_reason', length: 512, nullable: true })
      failureReason!: string | null;

      @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
      createdAt!: Date;

      @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
      updatedAt!: Date;
    }
    ```

### Backend — DTOs

- [ ] **Task 3: RegisterDomainDto** (AC: #1)
  - [ ] Създай `branivo-api/src/modules/tenants/dto/register-domain.dto.ts`:
    ```typescript
    import { IsString, Matches, MaxLength } from 'class-validator';

    export class RegisterDomainDto {
      @IsString()
      @MaxLength(255)
      @Matches(
        /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*\.[a-zA-Z]{2,}$/,
        { message: 'domain must be a valid hostname (e.g. polici.mybrokerage.bg)' },
      )
      domain!: string;
    }
    ```

- [ ] **Task 4: DomainResponseDto** (AC: #1, #2, #3, #5)
  - [ ] Създай `branivo-api/src/modules/tenants/dto/domain-response.dto.ts`:
    ```typescript
    import { DomainStatus } from '../entities/tenant-domain.entity';

    export class DomainResponseDto {
      id!: string;
      domain!: string;
      isPrimary!: boolean;
      status!: DomainStatus;
      verificationRecord!: { name: string; type: 'TXT'; value: string } | null;
      verifiedAt!: Date | null;
      failureReason!: string | null;
      createdAt!: Date;
    }
    ```
  - [ ] `verificationRecord` е null ако статусът е `active`; иначе: `{ name: '_branivo-verify.{domain}', type: 'TXT', value: 'branivo-verify={token}' }`

### Backend — Repository

- [ ] **Task 5: Обнови TenantsRepository** (AC: #1, #3, #5, #6, #7, #8)
  - [ ] Файл: `branivo-api/src/modules/tenants/tenants.repository.ts`
  - [ ] Добави методи:
    ```typescript
    async findDomainsByTenantId(tenantId: string): Promise<TenantDomain[]> {
      return this.domainRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
    }

    async findDomainById(id: string, tenantId: string): Promise<TenantDomain | null> {
      return this.domainRepo.findOne({ where: { id, tenantId } });
    }

    async findCustomDomainByTenantId(tenantId: string): Promise<TenantDomain | null> {
      // Custom domains have isPrimary = false
      return this.domainRepo.findOne({ where: { tenantId, isPrimary: false } });
    }

    async createCustomDomain(tenantId: string, domain: string, verificationToken: string): Promise<TenantDomain> {
      const entity = this.domainRepo.create({
        tenantId,
        domain,
        isPrimary: false,
        status: 'pending',
        verificationToken,
      });
      return this.domainRepo.save(entity);
    }

    async updateDomainStatus(
      id: string,
      status: DomainStatus,
      extra?: { verifiedAt?: Date; failureReason?: string },
    ): Promise<void> {
      await this.domainRepo.update(id, { status, ...extra });
    }

    async deleteDomain(id: string, tenantId: string): Promise<void> {
      await this.domainRepo.delete({ id, tenantId });
    }

    // Super Admin / Cron context — no tenant scope
    async findPendingOrVerifyingDomains(): Promise<TenantDomain[]> {
      return this.domainRepo.find({
        where: [{ status: 'pending' }, { status: 'verifying' }],
      });
    }
    ```
  - [ ] Обнови `findTenantIdByHostname()` да включва `status: 'active'` филтър:
    ```typescript
    async findTenantIdByHostname(hostname: string): Promise<string | null> {
      const domain = await this.domainRepo.findOne({
        where: { domain: hostname, status: 'active' },
        relations: ['tenant'],
      });
      if (!domain || !domain.tenant || domain.tenant.deletedAt) return null;
      return domain.tenantId;
    }
    ```

### Backend — DNS Verification Service

- [ ] **Task 6: DnsVerificationService** (AC: #3, #5)
  - [ ] Създай `branivo-api/src/modules/tenants/dns-verification.service.ts`:
    ```typescript
    import { Injectable, Logger } from '@nestjs/common';
    import { promises as dns } from 'dns';

    @Injectable()
    export class DnsVerificationService {
      private readonly logger = new Logger(DnsVerificationService.name);

      /**
       * Проверява дали TXT record "_branivo-verify.{domain}" съдържа "branivo-verify={token}"
       * Използва Node.js вграден dns.promises — без npm пакет
       */
      async verifyTxtRecord(domain: string, token: string): Promise<boolean> {
        const recordName = `_branivo-verify.${domain}`;
        const expectedValue = `branivo-verify=${token}`;

        try {
          const records = await dns.resolveTxt(recordName);
          // resolveTxt връща string[][] — всеки TXT record е масив от chunks
          return records.some(chunks => chunks.join('') === expectedValue);
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException).code;
          // ENOTFOUND / ENODATA = запис не съществува (очаквана грешка)
          if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'ESERVFAIL') {
            return false;
          }
          this.logger.warn(`DNS lookup failed for ${recordName}: ${(err as Error).message}`);
          return false;
        }
      }
    }
    ```
  - [ ] **НЕ ползвай npm пакет** — Node.js `dns.promises` е достатъчен

### Backend — Service

- [ ] **Task 7: DomainsService** (AC: #1, #2, #3, #5, #6, #8)
  - [ ] Създай `branivo-api/src/modules/tenants/domains.service.ts`:
    ```typescript
    import {
      BadRequestException, ConflictException, ForbiddenException,
      Inject, Injectable, NotFoundException,
    } from '@nestjs/common';
    import { randomBytes } from 'crypto';
    import Redis from 'ioredis';
    import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
    import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';
    import { TenantContext } from '../../common/tenant-context/tenant.context';
    import { TenantsRepository } from './tenants.repository';
    import { RegisterDomainDto } from './dto/register-domain.dto';
    import { DomainResponseDto } from './dto/domain-response.dto';

    @Injectable()
    export class DomainsService {
      constructor(
        private readonly tenantsRepository: TenantsRepository,
        private readonly tenantContext: TenantContext,
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
      ) {}

      async registerDomain(dto: RegisterDomainDto): Promise<DomainResponseDto> {
        const tenantId = this.tenantContext.getTenantId();

        // AC8: само един custom domain на tenant
        const existing = await this.tenantsRepository.findCustomDomainByTenantId(tenantId);
        if (existing) {
          throw new ConflictException(
            'Tenant already has a custom domain. Delete it before adding a new one.',
          );
        }

        const token = randomBytes(32).toString('hex'); // 64-char hex token
        const domain = await this.tenantsRepository.createCustomDomain(tenantId, dto.domain, token);
        return this.toDto(domain);
      }

      async listDomains(): Promise<DomainResponseDto[]> {
        const tenantId = this.tenantContext.getTenantId();
        const domains = await this.tenantsRepository.findDomainsByTenantId(tenantId);
        return domains.map(d => this.toDto(d));
      }

      async deleteDomain(id: string): Promise<void> {
        const tenantId = this.tenantContext.getTenantId();
        const domain = await this.tenantsRepository.findDomainById(id, tenantId);

        if (!domain) throw new NotFoundException('Domain not found');
        if (domain.isPrimary) {
          throw new ForbiddenException('Cannot delete the primary subdomain');
        }

        await this.tenantsRepository.deleteDomain(id, tenantId);

        // Инвалидирай Redis host cache за изтрития домейн
        await this.redis.del(RedisKeyHelper.buildSystem('host', domain.domain));
      }

      private toDto(domain: import('./entities/tenant-domain.entity').TenantDomain): DomainResponseDto {
        const verificationRecord = domain.status !== 'active' && domain.verificationToken
          ? {
              name: `_branivo-verify.${domain.domain}`,
              type: 'TXT' as const,
              value: `branivo-verify=${domain.verificationToken}`,
            }
          : null;

        return {
          id: domain.id,
          domain: domain.domain,
          isPrimary: domain.isPrimary,
          status: domain.status,
          verificationRecord,
          verifiedAt: domain.verifiedAt,
          failureReason: domain.failureReason,
          createdAt: domain.createdAt,
        };
      }
    }
    ```

### Backend — Cron Job (DNS Polling)

- [ ] **Task 8: Инсталирай @nestjs/schedule** (AC: #3)
  - [ ] В `branivo-api/`:
    ```bash
    npm install @nestjs/schedule
    npm install -D @types/cron
    ```
  - [ ] Добави `ScheduleModule.forRoot()` в `AppModule` imports:
    ```typescript
    import { ScheduleModule } from '@nestjs/schedule';
    // в AppModule @Module({ imports: [..., ScheduleModule.forRoot()] })
    ```

- [ ] **Task 9: DomainVerificationJob** (AC: #3, #5)
  - [ ] Създай `branivo-api/src/modules/tenants/domain-verification.job.ts`:
    ```typescript
    import { Injectable, Logger } from '@nestjs/common';
    import { Cron } from '@nestjs/schedule';
    import { Inject } from '@nestjs/common';
    import Redis from 'ioredis';
    import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
    import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';
    import { TenantsRepository } from './tenants.repository';
    import { DnsVerificationService } from './dns-verification.service';

    @Injectable()
    export class DomainVerificationJob {
      private readonly logger = new Logger(DomainVerificationJob.name);

      constructor(
        private readonly tenantsRepository: TenantsRepository,
        private readonly dnsVerification: DnsVerificationService,
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
      ) {}

      @Cron('*/5 * * * *') // всеки 5 минути
      async verifyPendingDomains(): Promise<void> {
        const domains = await this.tenantsRepository.findPendingOrVerifyingDomains();
        if (domains.length === 0) return;

        this.logger.log(`Verifying ${domains.length} pending domain(s)...`);

        for (const domain of domains) {
          if (!domain.verificationToken) continue;

          // Обнови на 'verifying' ако е 'pending'
          if (domain.status === 'pending') {
            await this.tenantsRepository.updateDomainStatus(domain.id, 'verifying');
          }

          const verified = await this.dnsVerification.verifyTxtRecord(
            domain.domain,
            domain.verificationToken,
          );

          if (verified) {
            await this.tenantsRepository.updateDomainStatus(domain.id, 'active', {
              verifiedAt: new Date(),
            });
            // Инвалидирай host cache — middleware ще го рефрешне от DB с status=active
            await this.redis.del(RedisKeyHelper.buildSystem('host', domain.domain));
            this.logger.log(`Domain ${domain.domain} verified successfully`);
          } else {
            // Ако > 24ч в verifying → failed
            const hoursElapsed = (Date.now() - domain.createdAt.getTime()) / (1000 * 60 * 60);
            if (hoursElapsed > 24) {
              await this.tenantsRepository.updateDomainStatus(domain.id, 'failed', {
                failureReason: 'DNS TXT record not found within 24 hours. Check that _branivo-verify.' +
                  domain.domain + ' TXT record is set correctly.',
              });
              this.logger.warn(`Domain ${domain.domain} verification timed out after 24h`);
            }
          }
        }
      }
    }
    ```

### Backend — Controller

- [ ] **Task 10: DomainsController** (AC: #1, #2, #6, #8)
  - [ ] Създай `branivo-api/src/modules/tenants/domains.controller.ts`:
    ```typescript
    import {
      Body, Controller, Delete, Get, HttpCode, HttpStatus,
      Param, ParseUUIDPipe, Post, UseGuards,
    } from '@nestjs/common';
    import { ApiOperation, ApiTags } from '@nestjs/swagger';
    import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
    import { RolesGuard } from '../../common/guards/roles.guard';
    import { Roles } from '../../common/decorators/roles.decorator';
    import { DomainsService } from './domains.service';
    import { RegisterDomainDto } from './dto/register-domain.dto';
    import { DomainResponseDto } from './dto/domain-response.dto';

    @ApiTags('tenants')
    @Controller('tenants/domains')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('broker_admin')
    export class DomainsController {
      constructor(private readonly domainsService: DomainsService) {}

      @Post()
      @HttpCode(HttpStatus.CREATED)
      @ApiOperation({ summary: 'Register a custom domain for the tenant' })
      async registerDomain(@Body() dto: RegisterDomainDto): Promise<{ data: DomainResponseDto }> {
        const data = await this.domainsService.registerDomain(dto);
        return { data };
      }

      @Get()
      @ApiOperation({ summary: 'List all domains for the tenant' })
      async listDomains(): Promise<{ data: DomainResponseDto[] }> {
        const data = await this.domainsService.listDomains();
        return { data };
      }

      @Delete(':id')
      @HttpCode(HttpStatus.NO_CONTENT)
      @ApiOperation({ summary: 'Delete a custom domain' })
      async deleteDomain(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
        return this.domainsService.deleteDomain(id);
      }
    }
    ```

- [ ] **Task 11: Обнови TenantsModule** (AC: #1, #3)
  - [ ] Добави в `branivo-api/src/modules/tenants/tenants.module.ts`:
    ```typescript
    import { ScheduleModule } from '@nestjs/schedule';
    import { DomainsController } from './domains.controller';
    import { DomainsService } from './domains.service';
    import { DnsVerificationService } from './dns-verification.service';
    import { DomainVerificationJob } from './domain-verification.job';

    @Module({
      imports: [
        TypeOrmModule.forFeature([Tenant, TenantConfig, TenantDomain]),
        ScheduleModule.forRoot(), // Или добави в AppModule ако вече е там
      ],
      controllers: [TenantsController, DomainsController],
      providers: [
        TenantsService,
        TenantsRepository,
        DomainsService,
        DnsVerificationService,
        DomainVerificationJob,
        FeatureFlagGuard,
        TenantActiveGuard,
      ],
      exports: [TenantsRepository, FeatureFlagGuard, TenantActiveGuard],
    })
    ```
  - [ ] **Забележка:** `ScheduleModule.forRoot()` трябва да е само в AppModule (не в child module) — провери дали е там; ако не е, добави го там и **не** в TenantsModule

### Next.js Web — BFF Routes

- [ ] **Task 12: BFF route — GET /api/v1/tenants/domains** (AC: #2)
  - [ ] Създай `branivo-web/src/app/api/v1/tenants/domains/route.ts`:
    ```typescript
    import { NextRequest, NextResponse } from 'next/server';

    export async function GET(request: NextRequest) {
      const res = await fetch(`${process.env.BRANIVO_API_URL}/api/v1/tenants/domains`, {
        headers: { Cookie: request.headers.get('cookie') ?? '' },
      });
      const body = await res.json();
      return NextResponse.json(body, { status: res.status });
    }

    export async function POST(request: NextRequest) {
      const body = await request.json();
      const res = await fetch(`${process.env.BRANIVO_API_URL}/api/v1/tenants/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: request.headers.get('cookie') ?? '',
        },
        body: JSON.stringify(body),
      });
      const resBody = await res.json();
      return NextResponse.json(resBody, { status: res.status });
    }
    ```

- [ ] **Task 13: BFF route — DELETE /api/v1/tenants/domains/:id** (AC: #6)
  - [ ] Създай `branivo-web/src/app/api/v1/tenants/domains/[id]/route.ts`:
    ```typescript
    import { NextRequest, NextResponse } from 'next/server';

    export async function DELETE(
      request: NextRequest,
      { params }: { params: { id: string } },
    ) {
      const res = await fetch(
        `${process.env.BRANIVO_API_URL}/api/v1/tenants/domains/${params.id}`,
        {
          method: 'DELETE',
          headers: { Cookie: request.headers.get('cookie') ?? '' },
        },
      );
      if (res.status === 204) return new NextResponse(null, { status: 204 });
      const body = await res.json();
      return NextResponse.json(body, { status: res.status });
    }
    ```

### Next.js Web — Domain Configuration Page

- [ ] **Task 14: Custom Domain страница** (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Създай `branivo-web/src/app/[locale]/(broker)/settings/domain/page.tsx`
  - [ ] **UI компоненти:**
    - Текущ subdomain badge (`{slug}.branivo.bg` — primary, cannot delete)
    - Ако няма custom domain: форма с input за домейн + бутон "Добави домейн"
    - Ако има custom domain:
      - Статус badge (pending=жълт, verifying=синьо, active=зелен, failed=червен)
      - Верификационни инструкции (само ако статус != active):
        ```
        Добавете следния DNS TXT запис при вашия DNS provider:
        Hostname: _branivo-verify.{domain}
        Type: TXT
        Value: branivo-verify={token}
        ```
      - Copy бутон за DNS value
      - Бутон "Изтрий домейн" (с confirm dialog)
  - [ ] **Auto-polling:** TanStack Query с `refetchInterval: (data) => ['pending', 'verifying'].includes(data?.data[0]?.status) ? 10_000 : false`
  - [ ] **TanStack Query hooks:**
    ```typescript
    // useQuery за GET /api/v1/tenants/domains
    // useMutation за POST /api/v1/tenants/domains (с onSuccess: queryClient.invalidateQueries(['domains']))
    // useMutation за DELETE /api/v1/tenants/domains/:id (с onSuccess: queryClient.invalidateQueries(['domains']))
    ```
  - [ ] Страницата е `'use client'` компонент (polling изисква client-side)

### Tests

- [ ] **Task 15: Unit тестове за DnsVerificationService** (AC: #3, #5)
  - [ ] `branivo-api/src/modules/tenants/dns-verification.service.spec.ts`
  - [ ] Test: TXT record съдържа точния token → `verifyTxtRecord` returns true
  - [ ] Test: TXT record не съществува (ENOTFOUND) → returns false
  - [ ] Test: TXT record има грешна стойност → returns false
  - [ ] Test: DNS timeout / ESERVFAIL → returns false (no throw)
  - [ ] Mock: `jest.mock('dns', () => ({ promises: { resolveTxt: jest.fn() } }))`

- [ ] **Task 16: Unit тестове за DomainsService** (AC: #1, #6, #8)
  - [ ] `branivo-api/src/modules/tenants/domains.service.spec.ts`
  - [ ] Test: registerDomain с нов домейн → create извикан, token е 64-char hex
  - [ ] Test: registerDomain когато вече има custom domain → ConflictException
  - [ ] Test: deleteDomain на primary domain → ForbiddenException
  - [ ] Test: deleteDomain на несъществуващ domain → NotFoundException
  - [ ] Test: deleteDomain успешно → delete + Redis DEL извикани

- [ ] **Task 17: Unit тестове за DomainVerificationJob** (AC: #3, #5)
  - [ ] `branivo-api/src/modules/tenants/domain-verification.job.spec.ts`
  - [ ] Test: pending domain, DNS верифицира → status = 'active', verifiedAt записан, Redis DEL
  - [ ] Test: verifying domain, DNS не верифицира, < 24h → status остава 'verifying'
  - [ ] Test: verifying domain, > 24h → status = 'failed', failureReason записан
  - [ ] Test: нямат pending domains → no DB calls

- [ ] **Task 18: Integration тестове за DomainsController** (AC: #1, #6, #7, #8)
  - [ ] `branivo-api/src/modules/tenants/domains.controller.spec.ts`
  - [ ] Test: POST без auth → 401
  - [ ] Test: POST с `super_admin` роля → 403
  - [ ] Test: POST валиден domain, `broker_admin` → 201 с verificationRecord
  - [ ] Test: POST невалиден hostname → 400
  - [ ] Test: POST втори domain → 409
  - [ ] Test: GET → 200 с масив от domains
  - [ ] Test: DELETE primary domain → 403
  - [ ] Test: DELETE несъществуващ → 404
  - [ ] Test: DELETE успешно → 204

- [ ] **Task 19: Component тест за Domain страница** (AC: #1, #2, #5, #6)
  - [ ] `branivo-web/src/__tests__/broker/settings/domain.page.test.tsx`
  - [ ] Test: показва primary subdomain badge
  - [ ] Test: без custom domain — показва форма за добавяне
  - [ ] Test: pending domain — показва DNS инструкции и copy бутон
  - [ ] Test: active domain — скрива DNS инструкции
  - [ ] Test: submit на невалиден hostname → validation error (client-side)

## Dev Notes

### Критично: TenantDomain вече съществува — не пресъздавай

`tenant_domains` таблицата и `TenantDomain` entity **вече съществуват** от Story 1.2 (Tenant Resolution & TenantContext Middleware). Само добавяш нови колони чрез migration и обновяваш entity-то с новите полета.

**Съществуващи файлове (само ги модифицирай):**
```
branivo-api/src/modules/tenants/entities/tenant-domain.entity.ts  ← Task 2 (добави нови полета)
branivo-api/src/modules/tenants/tenants.repository.ts             ← Task 5 (добави нови методи)
branivo-api/src/modules/tenants/tenants.module.ts                 ← Task 11 (добави нови providers)
branivo-api/src/common/tenant-context/tenant.middleware.ts        ← Task 5 (чрез findTenantIdByHostname обновяване)
```

### TenantMiddleware — вече е наред

`TenantMiddleware` ползва `TenantsRepository.findTenantIdByHostname()`. При обновяване на тази функция с `status: 'active'` филтър (Task 5), middleware автоматично започва да резолвира само активни домейни. **Не е нужна промяна в middleware директно.**

### DNS Verification Record Pattern

```
Hostname (name): _branivo-verify.polici.mybrokerage.bg
Type: TXT
Value: branivo-verify=abc123...def456  (64-char hex token)
```

Node.js `dns.promises.resolveTxt('_branivo-verify.polici.mybrokerage.bg')` → `[['branivo-verify=abc123...']]`

TTL propagation: DNS промени може да отнемат 0-48 часа. Именно затова timeout-ът е 24 часа.

### RedisKeyHelper.buildSystem Pattern

```typescript
// От tenant.middleware.ts — съществуващ pattern
RedisKeyHelper.buildSystem('host', hostname) // → 'system:host:{hostname}'
```

Това е **системен** ключ (не е tenant-scoped). Инвалидирай го при: domain активиране, domain изтриване.

### ScheduleModule — Само в AppModule

```typescript
// branivo-api/src/app.module.ts
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    // ...existing...
    ScheduleModule.forRoot(), // Глобален scheduler — само веднъж
  ],
})
export class AppModule {}
```

`DomainVerificationJob` се регистрира като provider в `TenantsModule`. `@Cron` decorator работи ако `ScheduleModule.forRoot()` е в AppModule.

### Migration Numbering

```
1710000000000-CreateTenantsTable.ts         (Story 1.1)
1710000001000-AddRlsPolicies.ts             (Story 1.1)
1710000002000-CreateUsersTable.ts           (Story 1.2)
1710000002500-AddUsersTenantIdForeignKey.ts (Story 1.2)
1710000003000-CreateTenantInvitations.ts    (Story 1.4)
1710000004000-AddTenantOnboardingFields.ts  (Story 1.4)
1710000005000-CreateAuditLogTable.ts        (Story 1.5)
1710000006000-AddBrandingToTenantConfigs.ts (Story 2.1)
1710000007000-AddUniqueConstraintTenantConfigs.ts (Story 2.1)
1710000008000-AddDomainVerificationStatus.ts ← NEXT (Task 1)
```

### Съществуващи tenant_domains записи след миграцията

Всеки tenant, активиран чрез Story 1.4, вече има запис в `tenant_domains`:
- `domain = '{slug}.branivo.bg'`
- `is_primary = true`
- **След migration:** `status = 'active'` (DEFAULT стойност — коректно)

Custom domain на broker:
- `domain = 'polici.mybrokerage.bg'`
- `is_primary = false`
- `status = 'pending'` → ... → `'active'`

### Broker Settings Navigation

Страницата живее в: `branivo-web/src/app/[locale]/(broker)/settings/domain/page.tsx`

Broker layout вече съществува от Story 1.6: `branivo-web/src/app/[locale]/(broker)/layout.tsx`

Добави линк към domain settings в broker navigation ако има nav component — провери `layout.tsx` или `Sidebar` компонент.

### Learnings от Story 2.1

1. **JwtAuthGuard е в `modules/auth/guards/`** — не в `common/guards/`. Провери правилния path.
2. **Redis DEL pattern** — `await this.redis.del(key)` за инвалидиране
3. **ParseUUIDPipe** — задължително за route params `:id`
4. **BFF pattern** — следвай `src/app/api/v1/admin/tenants/[id]/status/route.ts` като пример
5. **TanStack Query** — `useMutation` с `onSuccess: () => queryClient.invalidateQueries(['domains'])`

### Project Structure Notes

**Нови файлове:**
```
branivo-api/src/infrastructure/database/migrations/
└── 1710000008000-AddDomainVerificationStatus.ts    ← Task 1

branivo-api/src/modules/tenants/
├── dto/
│   ├── register-domain.dto.ts                      ← Task 3
│   └── domain-response.dto.ts                      ← Task 4
├── dns-verification.service.ts                     ← Task 6
├── dns-verification.service.spec.ts                ← Task 15
├── domains.service.ts                              ← Task 7
├── domains.service.spec.ts                         ← Task 16
├── domains.controller.ts                           ← Task 10
├── domains.controller.spec.ts                      ← Task 18
├── domain-verification.job.ts                      ← Task 9
└── domain-verification.job.spec.ts                 ← Task 17

branivo-web/src/app/api/v1/tenants/domains/
├── route.ts                                        ← Task 12
└── [id]/route.ts                                   ← Task 13

branivo-web/src/app/[locale]/(broker)/settings/domain/
└── page.tsx                                        ← Task 14

branivo-web/src/__tests__/broker/settings/
└── domain.page.test.tsx                            ← Task 19
```

**Модифицирани файлове:**
```
branivo-api/src/modules/tenants/entities/tenant-domain.entity.ts  ← Task 2
branivo-api/src/modules/tenants/tenants.repository.ts             ← Task 5
branivo-api/src/modules/tenants/tenants.module.ts                 ← Task 11
branivo-api/src/app.module.ts                                     ← Task 8 (ScheduleModule)
```

### References

- [Source: epics.md#Story 2.2] — User story, Acceptance Criteria
- [Source: epics.md#FR11] — Custom домейн е async upgrade; subdomain при активация
- [Source: architecture.md#DNS] — Route 53 + CNAME за custom broker domains
- [Source: architecture.md#CDN] — CloudFront; Host header cache key
- [Source: architecture.md#TenantContext middleware] — Host → Redis → PostgreSQL resolution
- [Source: branivo-api/src/common/tenant-context/tenant.middleware.ts] — Текуща middleware имплементация
- [Source: branivo-api/src/modules/tenants/entities/tenant-domain.entity.ts] — Съществуваща entity структура
- [Source: branivo-api/src/infrastructure/queues/queue.module.ts] — BullMQ setup (reference за queue patterns)
- [Source: Story 2.1 Dev Notes] — JwtAuthGuard path, BFF proxy pattern, Redis DEL pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `domain-response.dto.ts`: `DomainStatus` трябва да се импортира като `import type` поради `isolatedModules` + `emitDecoratorMetadata`. Оправено.
- `dns-verification.service.spec.ts`: `jest.mock('dns', ...)` — лявата страна на arrow function връщаше `any`. Добавен `eslint-disable` за `no-unsafe-return`.
- `domain-verification.job.spec.ts`: `expect.objectContaining(...)` — `any` assignment. Добавен `eslint-disable` за `no-unsafe-assignment`.

### Completion Notes List

- ✅ Migration `1710000008000`: добавени `status`, `verification_token`, `verified_at`, `failure_reason`, `updated_at` колони в `tenant_domains`; съществуващите редове получават `status='active'` по default
- ✅ `TenantDomain` entity обновен с нови полета и `DomainStatus` type
- ✅ `TenantsRepository`: добавени 7 нови метода; `findTenantIdByHostname()` обновен с `status: 'active'` филтър (AC7)
- ✅ `DnsVerificationService`: Node.js `dns.promises.resolveTxt()` без npm пакет; handles ENOTFOUND/ENODATA/ESERVFAIL
- ✅ `DomainsService`: register (AC1, AC8), list (AC2), delete (AC6) с Redis cache инвалидация
- ✅ `DomainVerificationJob`: cron `*/5 * * * *`; pending→verifying→active/failed; 24h timeout
- ✅ `DomainsController`: POST/GET/DELETE endpoints само за `broker_admin`
- ✅ `@nestjs/schedule` инсталиран; `ScheduleModule.forRoot()` добавен в `AppModule`
- ✅ BFF routes: GET+POST `/api/v1/tenants/domains`, DELETE `/api/v1/tenants/domains/[id]`
- ✅ `settings/domain/page.tsx`: auto-polling (10s), DNS инструкции с copy бутон, delete confirm dialog
- ✅ CI резултати: lint 0 errors ✓ | API 206/206 tests ✓ | Web 7/7 tests ✓ | API build ✓ | Web build ✓ | tsc ✓

### File List

**New Files — branivo-api:**
- `src/infrastructure/database/migrations/1710000008000-AddDomainVerificationStatus.ts`
- `src/modules/tenants/dto/register-domain.dto.ts`
- `src/modules/tenants/dto/domain-response.dto.ts`
- `src/modules/tenants/dns-verification.service.ts`
- `src/modules/tenants/dns-verification.service.spec.ts`
- `src/modules/tenants/domains.service.ts`
- `src/modules/tenants/domains.service.spec.ts`
- `src/modules/tenants/domains.controller.ts`
- `src/modules/tenants/domains.controller.spec.ts`
- `src/modules/tenants/domain-verification.job.ts`
- `src/modules/tenants/domain-verification.job.spec.ts`

**New Files — branivo-web:**
- `src/app/api/v1/tenants/domains/route.ts`
- `src/app/api/v1/tenants/domains/[id]/route.ts`
- `src/app/[locale]/(broker)/settings/domain/page.tsx`
- `src/__tests__/broker/settings/domain.page.test.tsx`

**Modified Files — branivo-api:**
- `src/modules/tenants/entities/tenant-domain.entity.ts` (добавени verification полета)
- `src/modules/tenants/tenants.repository.ts` (7 нови метода + status filter)
- `src/modules/tenants/tenants.module.ts` (добавени нови providers/controllers)
- `src/app.module.ts` (ScheduleModule.forRoot())
- `package.json` / `package-lock.json` (@nestjs/schedule)

**Modified Files — Other:**
- `docker-compose.yml` (healthcheck fix: pg_isready -d branivo_dev)
