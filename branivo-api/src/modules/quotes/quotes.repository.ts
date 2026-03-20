import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Quote } from './entities/quote.entity';
import { Insurer } from './entities/insurer.entity';

@Injectable()
export class QuotesRepository extends BaseRepository<Quote> {
  constructor(
    @InjectRepository(Quote)
    private readonly quoteRepo: Repository<Quote>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    tenantContext: TenantContext,
  ) {
    super(quoteRepo, tenantContext);
  }

  async findBySessionToken(sessionToken: string): Promise<Quote[]> {
    const tenantId = this.tenantContext.getTenantId();
    await this.setTenantSession();
    return this.quoteRepo.find({
      where: { sessionToken, tenantId, deletedAt: IsNull() },
      relations: ['insurer'],
    });
  }

  async findActiveInsurers(): Promise<Insurer[]> {
    return this.dataSource
      .getRepository(Insurer)
      .find({ where: { isActive: true, deletedAt: IsNull() } });
  }

  async findOneById(id: string): Promise<Quote | null> {
    const tenantId = this.tenantContext.getTenantId();
    await this.setTenantSession();
    return this.quoteRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: ['insurer'],
    });
  }

  async bulkCreate(quotes: Partial<Quote>[]): Promise<Quote[]> {
    await this.setTenantSession();
    const entities = this.quoteRepo.create(quotes);
    return this.quoteRepo.save(entities);
  }

  async updateQuoteStatus(
    id: string,
    updates: QueryDeepPartialEntity<Quote>,
  ): Promise<void> {
    await this.setTenantSession();
    await this.quoteRepo.update(id, updates);
  }
}
