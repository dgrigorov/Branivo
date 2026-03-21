import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { Queue } from 'bull';
import { BillingRepository } from './billing.repository';
import { Invoice } from './entities/invoice.entity';
import { EmailService } from '../../infrastructure/email/email.service';
import { QUEUE_BILLING } from '../../infrastructure/queues/queue.module';

export const BILLING_JOB_GENERATE_INVOICE = 'generate-invoice';
export const BILLING_JOB_RUN_ALL_TENANTS = 'run-all-tenants';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getPreviousMonthPeriod(now: Date): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return { periodStart, periodEnd };
}

interface ActiveTenantRow {
  id: string;
  name: string;
  monthly_fee: string;
  activated_at: Date | null;
}

interface PolicySummaryRow {
  policies_count: string;
  total_premium: string;
  platform_fee: string;
}

interface BrokerEmailRow {
  email: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectQueue(QUEUE_BILLING) private readonly billingQueue: Queue,
  ) {}

  async runManualBilling(tenantId?: string): Promise<void> {
    const now = new Date();
    const { periodStart, periodEnd } = getPreviousMonthPeriod(now);

    if (tenantId) {
      await this.billingQueue.add(
        BILLING_JOB_GENERATE_INVOICE,
        {
          tenantId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
      this.logger.log(`Manual billing run queued for tenant ${tenantId}`);
    } else {
      await this.billingQueue.add(
        BILLING_JOB_RUN_ALL_TENANTS,
        {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
      this.logger.log('Manual billing run queued for all active tenants');
    }
  }

  async generateInvoiceForTenant(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Invoice> {
    // Idempotency check
    const existing = await this.billingRepo.findByTenantAndPeriod(
      tenantId,
      periodStart,
    );
    if (existing) {
      this.logger.log(
        `Invoice already exists for tenant ${tenantId} period ${periodStart.toISOString()} — skipping`,
      );
      return existing;
    }

    // Load tenant
    const tenants = await this.dataSource.query<ActiveTenantRow[]>(
      `SELECT id, name, monthly_fee, activated_at
       FROM tenants
       WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
      [tenantId],
    );
    if (tenants.length === 0) {
      throw new Error(`Tenant ${tenantId} not found or not active`);
    }
    const tenant = tenants[0];
    const monthlyFee = Number(tenant.monthly_fee);

    // Pro-rata calculation
    let subscriptionFee = monthlyFee;
    let daysActive: number | null = null;
    let isProRata = false;

    if (tenant.activated_at !== null) {
      const activationDate = new Date(tenant.activated_at);
      if (activationDate > periodStart) {
        isProRata = true;
        const daysInMonth = getDaysInMonth(periodStart);
        daysActive =
          Math.ceil(
            (periodEnd.getTime() - activationDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;
        subscriptionFee = round2((monthlyFee * daysActive) / daysInMonth);
      }
    }

    // Policy summary for period
    const summary = await this.dataSource.query<PolicySummaryRow[]>(
      `SELECT
         COUNT(*)::text AS policies_count,
         COALESCE(SUM(premium_amount), 0)::text AS total_premium,
         COALESCE(SUM(commission_amount), 0)::text AS platform_fee
       FROM policies
       WHERE tenant_id = $1
         AND status = 'active'
         AND deleted_at IS NULL
         AND created_at >= $2
         AND created_at <= $3`,
      [tenantId, periodStart, periodEnd],
    );

    const policiesCount = parseInt(summary[0]?.policies_count ?? '0', 10);
    const totalPremium = round2(Number(summary[0]?.total_premium ?? '0'));
    const platformFee = round2(Number(summary[0]?.platform_fee ?? '0'));
    const amountDue = round2(platformFee + subscriptionFee);

    const invoice = await this.billingRepo.createInvoice({
      tenantId,
      periodStart,
      periodEnd,
      policiesCount,
      totalPremium,
      platformFee,
      subscriptionFee,
      amountDue,
      isProRata,
      daysActive,
    });

    this.logger.log(
      `Invoice ${invoice.id} generated for tenant ${tenantId} — amountDue: ${amountDue} BGN`,
    );

    // AC6: Send invoice email to broker admin
    await this.sendInvoiceEmailToBroker({
      tenantId,
      tenantName: tenant.name,
      periodStart,
      periodEnd,
      policiesCount,
      totalPremium,
      platformFee,
      subscriptionFee,
      amountDue,
      isProRata,
    });

    return invoice;
  }

  private async sendInvoiceEmailToBroker(params: {
    tenantId: string;
    tenantName: string;
    periodStart: Date;
    periodEnd: Date;
    policiesCount: number;
    totalPremium: number;
    platformFee: number;
    subscriptionFee: number;
    amountDue: number;
    isProRata: boolean;
  }): Promise<void> {
    const brokerEmails = await this.dataSource.query<BrokerEmailRow[]>(
      `SELECT email FROM users
       WHERE tenant_id = $1 AND role = 'broker_admin' AND deleted_at IS NULL
       LIMIT 1`,
      [params.tenantId],
    );

    if (brokerEmails.length === 0) {
      this.logger.warn(
        `No broker_admin email found for tenant ${params.tenantId} — skipping invoice email`,
      );
      return;
    }

    const periodLabel = `${params.periodStart.getFullYear()}-${String(params.periodStart.getMonth() + 1).padStart(2, '0')}`;

    try {
      await this.emailService.sendInvoiceEmail({
        to: brokerEmails[0].email,
        tenantName: params.tenantName,
        periodLabel,
        policiesCount: params.policiesCount,
        totalPremium: params.totalPremium,
        platformFee: params.platformFee,
        subscriptionFee: params.subscriptionFee,
        amountDue: params.amountDue,
        isProRata: params.isProRata,
      });
    } catch (emailErr) {
      this.logger.error(
        `Failed to send invoice email for tenant ${params.tenantId}`,
        emailErr instanceof Error ? emailErr.stack : String(emailErr),
      );
      // Do not re-throw — email failure should not roll back the invoice
    }
  }

  async getActiveTenants(): Promise<ActiveTenantRow[]> {
    return this.dataSource.query<ActiveTenantRow[]>(
      `SELECT id, name, monthly_fee, activated_at
       FROM tenants
       WHERE status = 'active' AND deleted_at IS NULL`,
    );
  }

  async notifySuperAdminOnFailure(
    tenantId: string,
    error: Error,
  ): Promise<void> {
    const superAdminEmail =
      this.config.get<string>('SUPER_ADMIN_EMAIL') ?? 'admin@branivo.com';

    try {
      await this.emailService.sendBillingFailureAlert({
        to: superAdminEmail,
        tenantId,
        errorMessage: error.message,
      });
    } catch (emailErr) {
      this.logger.error(
        `Failed to send super admin alert email for tenant ${tenantId}`,
        emailErr instanceof Error ? emailErr.stack : String(emailErr),
      );
      return;
    }

    this.logger.warn(
      `Super admin alert sent for billing failure — tenant=${tenantId} error="${error.message}"`,
    );
  }
}
