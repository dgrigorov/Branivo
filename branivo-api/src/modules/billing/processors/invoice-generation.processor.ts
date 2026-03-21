import { Logger } from '@nestjs/common';
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import {
  BillingService,
  BILLING_JOB_GENERATE_INVOICE,
  BILLING_JOB_RUN_ALL_TENANTS,
} from '../billing.service';
import { QUEUE_BILLING } from '../../../infrastructure/queues/queue.module';

interface GenerateInvoiceJobData {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
}

interface RunAllTenantsJobData {
  periodStart?: string;
  periodEnd?: string;
}

function getPreviousMonthPeriod(now: Date): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return { periodStart, periodEnd };
}

@Processor(QUEUE_BILLING)
export class InvoiceGenerationProcessor {
  private readonly logger = new Logger(InvoiceGenerationProcessor.name);

  constructor(private readonly billingService: BillingService) {}

  @Process(BILLING_JOB_GENERATE_INVOICE)
  async handleGenerateInvoice(job: Job<GenerateInvoiceJobData>): Promise<void> {
    const { tenantId, periodStart, periodEnd } = job.data;
    this.logger.log(
      `Processing invoice generation for tenant ${tenantId}, period ${periodStart}`,
    );

    await this.billingService.generateInvoiceForTenant(
      tenantId,
      new Date(periodStart),
      new Date(periodEnd),
    );

    this.logger.log(`Invoice generation complete for tenant ${tenantId}`);
  }

  @Process(BILLING_JOB_RUN_ALL_TENANTS)
  async handleRunAllTenants(job: Job<RunAllTenantsJobData>): Promise<void> {
    // Cron fires with empty data — compute previous month period at runtime
    const now = new Date();
    const defaultPeriod = getPreviousMonthPeriod(now);
    const periodStart = job.data.periodStart
      ? new Date(job.data.periodStart)
      : defaultPeriod.periodStart;
    const periodEnd = job.data.periodEnd
      ? new Date(job.data.periodEnd)
      : defaultPeriod.periodEnd;

    this.logger.log(
      `Processing billing run for all tenants, period ${periodStart.toISOString()}`,
    );

    const tenants = await this.billingService.getActiveTenants();
    this.logger.log(`Found ${tenants.length} active tenants to invoice`);

    let successCount = 0;
    let failCount = 0;

    for (const tenant of tenants) {
      try {
        await this.billingService.generateInvoiceForTenant(
          tenant.id,
          periodStart,
          periodEnd,
        );
        successCount++;
      } catch (err) {
        failCount++;
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error(
          `Failed to generate invoice for tenant ${tenant.id}: ${error.message}`,
          error.stack,
        );
        await this.billingService.notifySuperAdminOnFailure(tenant.id, error);
      }
    }

    this.logger.log(
      `Billing run complete: ${successCount} succeeded, ${failCount} failed`,
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error): Promise<void> {
    this.logger.error(
      `Billing job ${job.name} (id=${job.id}) failed (attempt ${job.attemptsMade}): ${error.message}`,
      error.stack,
    );

    // Only alert super admin on the final failed attempt to avoid duplicate alerts
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    if (job.name === BILLING_JOB_GENERATE_INVOICE) {
      const data = job.data as GenerateInvoiceJobData;
      await this.billingService.notifySuperAdminOnFailure(data.tenantId, error);
    }
    // run-all-tenants failures are handled per-tenant in handleRunAllTenants
  }
}
