import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommissionMatrix } from './entities/commission-matrix.entity';

@Injectable()
export class CommissionsRepository {
  constructor(
    @InjectRepository(CommissionMatrix)
    private readonly repo: Repository<CommissionMatrix>,
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
}
