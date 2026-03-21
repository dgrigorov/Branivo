import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommissionMatrix } from './entities/commission-matrix.entity';
import {
  CommissionProductType,
  PendingCommissionEvent,
} from './entities/pending-commission-event.entity';

export interface CreatePendingEventData {
  tenantId: string;
  paymentId: string;
  insurerId: string;
  productType: CommissionProductType;
  premiumAmount: number;
  commissionPct: number;
  commissionAmount: number;
}

export interface DashboardFilters {
  dateFrom?: string;
  dateTo?: string;
  insurerId?: string;
}

export interface DashboardRawRow {
  id: string;
  insurer_id: string;
  insurer_name: string;
  premium_amount: string;
  commission_pct: string;
  commission_amount: string;
  created_at: Date;
  commission_status: 'confirmed' | 'pending';
  product_type: string;
}

@Injectable()
export class CommissionsRepository {
  constructor(
    @InjectRepository(CommissionMatrix)
    private readonly repo: Repository<CommissionMatrix>,
    @InjectRepository(PendingCommissionEvent)
    private readonly pendingRepo: Repository<PendingCommissionEvent>,
    private readonly dataSource: DataSource,
  ) {}

  async findByInsurerAndProduct(
    insurerId: string,
    productType: string,
  ): Promise<CommissionMatrix | null> {
    return this.repo.findOne({
      where: {
        insurerId,
        productType: productType as CommissionMatrix['productType'],
      },
      relations: ['insurer'],
    });
  }

  async findAll(): Promise<CommissionMatrix[]> {
    return this.repo.find({
      relations: ['insurer'],
      order: { createdAt: 'ASC' },
    });
  }

  async upsert(data: {
    insurerId: string;
    productType: string;
    ratePct: number;
    createdBy: string | null;
  }): Promise<CommissionMatrix> {
    await this.dataSource.query(
      `INSERT INTO commission_matrix (insurer_id, product_type, rate_pct, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (insurer_id, product_type)
       DO UPDATE SET rate_pct = EXCLUDED.rate_pct,
                     created_by = EXCLUDED.created_by,
                     updated_at = NOW()`,
      [data.insurerId, data.productType, data.ratePct, data.createdBy],
    );

    const entry = await this.findByInsurerAndProduct(
      data.insurerId,
      data.productType,
    );
    if (!entry) {
      throw new InternalServerErrorException(
        'Commission matrix entry not found after upsert',
      );
    }
    return entry;
  }

  async createPendingEvent(
    data: CreatePendingEventData,
  ): Promise<PendingCommissionEvent> {
    const event = this.pendingRepo.create({
      tenantId: data.tenantId,
      paymentId: data.paymentId,
      insurerId: data.insurerId,
      productType: data.productType,
      premiumAmount: data.premiumAmount,
      commissionPct: data.commissionPct,
      commissionAmount: data.commissionAmount,
      status: 'pending',
    });
    return this.pendingRepo.save(event);
  }

  async confirmPendingEvent(paymentId: string, tenantId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE pending_commission_events
       SET status = 'confirmed', updated_at = NOW()
       WHERE payment_id = $1 AND tenant_id = $2`,
      [paymentId, tenantId],
    );
  }

  async failPendingEvent(paymentId: string, tenantId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE pending_commission_events
       SET status = 'failed', updated_at = NOW()
       WHERE payment_id = $1 AND tenant_id = $2`,
      [paymentId, tenantId],
    );
  }

  async getDashboardData(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<DashboardRawRow[]> {
    const dateFrom = filters.dateFrom ?? null;
    const dateTo = filters.dateTo ?? null;
    const insurerId = filters.insurerId ?? null;

    return this.dataSource.query<DashboardRawRow[]>(
      `
      SELECT p.id, p.insurer_id, i.name AS insurer_name, p.premium_amount,
             p.commission_pct, p.commission_amount, p.created_at,
             'confirmed' AS commission_status,
             COALESCE(p.metadata->>'productType', 'GO') AS product_type
      FROM policies p
      JOIN insurers i ON i.id = p.insurer_id
      WHERE p.tenant_id = $1
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND ($2::date IS NULL OR p.created_at >= $2)
        AND ($3::date IS NULL OR p.created_at < ($3::date + interval '1 day'))
        AND ($4::uuid IS NULL OR p.insurer_id = $4)

      UNION ALL

      SELECT pce.id, pce.insurer_id, i.name AS insurer_name, pce.premium_amount,
             pce.commission_pct, pce.commission_amount, pce.created_at,
             'pending' AS commission_status,
             pce.product_type
      FROM pending_commission_events pce
      JOIN insurers i ON i.id = pce.insurer_id
      WHERE pce.tenant_id = $1
        AND pce.status = 'pending'
        AND ($2::date IS NULL OR pce.created_at >= $2)
        AND ($3::date IS NULL OR pce.created_at < ($3::date + interval '1 day'))
        AND ($4::uuid IS NULL OR pce.insurer_id = $4)

      ORDER BY created_at DESC
      `,
      [tenantId, dateFrom, dateTo, insurerId],
    );
  }
}
