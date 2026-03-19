import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/base.repository';
import { TenantContext } from '../../../common/tenant-context/tenant.context';
import { EndClient } from '../entities/end-client.entity';

@Injectable()
export class EndClientRepository extends BaseRepository<EndClient> {
  constructor(
    @InjectRepository(EndClient)
    private readonly endClientRepo: Repository<EndClient>,
    tenantContext: TenantContext,
  ) {
    super(endClientRepo, tenantContext);
  }

  async findByPhone(
    phoneNumber: string,
    tenantId: string,
  ): Promise<EndClient | null> {
    await this.setTenantSession();
    return this.endClientRepo.findOne({
      where: { phoneNumber, tenantId, deletedAt: IsNull() },
    });
  }

  async findOrCreate(
    phoneNumber: string,
    tenantId: string,
  ): Promise<{ client: EndClient; isNew: boolean }> {
    await this.setTenantSession();
    const existing = await this.findByPhone(phoneNumber, tenantId);
    if (existing) {
      return { client: existing, isNew: false };
    }

    const newClient = this.endClientRepo.create({
      phoneNumber,
      tenantId,
      phoneVerified: false,
    });
    const saved = await this.endClientRepo.save(newClient);
    return { client: saved, isNew: true };
  }

  async markPhoneVerified(clientId: string): Promise<void> {
    await this.setTenantSession();
    await this.endClientRepo.update(clientId, {
      phoneVerified: true,
      updatedAt: new Date(),
    });
  }
}
