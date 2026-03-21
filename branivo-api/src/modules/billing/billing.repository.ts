import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';

export interface CreateInvoiceData {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  policiesCount: number;
  totalPremium: number;
  platformFee: number;
  subscriptionFee: number;
  amountDue: number;
  isProRata: boolean;
  daysActive: number | null;
}

@Injectable()
export class BillingRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly repo: Repository<Invoice>,
  ) {}

  async createInvoice(data: CreateInvoiceData): Promise<Invoice> {
    const invoice = this.repo.create({
      tenantId: data.tenantId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      policiesCount: data.policiesCount,
      totalPremium: data.totalPremium,
      platformFee: data.platformFee,
      subscriptionFee: data.subscriptionFee,
      amountDue: data.amountDue,
      isProRata: data.isProRata,
      daysActive: data.daysActive,
      status: 'pending',
    });
    return this.repo.save(invoice);
  }

  async findByTenantAndPeriod(
    tenantId: string,
    periodStart: Date,
  ): Promise<Invoice | null> {
    return this.repo.findOne({
      where: { tenantId, periodStart, deletedAt: IsNull() },
    });
  }

  async findByTenant(tenantId: string): Promise<Invoice[]> {
    return this.repo.find({
      where: { tenantId },
      order: { periodStart: 'DESC' },
    });
  }

  async updateStatus(
    invoiceId: string,
    status: Extract<InvoiceStatus, 'paid' | 'failed'>,
  ): Promise<void> {
    await this.repo.update(invoiceId, { status });
  }

  async updatePdfUrl(invoiceId: string, pdfUrl: string): Promise<void> {
    await this.repo.update(invoiceId, { pdfUrl });
  }
}
