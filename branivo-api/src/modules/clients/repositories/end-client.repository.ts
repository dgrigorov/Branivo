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

  async findByGoogleSub(
    tenantId: string,
    googleSub: string,
  ): Promise<EndClient | null> {
    await this.setTenantSession();
    return this.endClientRepo.findOne({
      where: { tenantId, googleSub, deletedAt: IsNull() },
    });
  }

  async findByEmail(
    tenantId: string,
    email: string,
  ): Promise<EndClient | null> {
    await this.setTenantSession();
    return this.endClientRepo.findOne({
      where: { tenantId, email, deletedAt: IsNull() },
    });
  }

  async mergeGoogleAccount(clientId: string, googleSub: string): Promise<void> {
    await this.setTenantSession();
    await this.endClientRepo.update(clientId, {
      googleSub,
      authProvider: 'google',
      updatedAt: new Date(),
    });
  }

  async createGoogleClient(params: {
    tenantId: string;
    googleSub: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  }): Promise<EndClient> {
    await this.setTenantSession();
    const newClient = this.endClientRepo.create({
      tenantId: params.tenantId,
      googleSub: params.googleSub,
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      authProvider: 'google',
      phoneNumber: null,
      phoneVerified: false,
    });
    return this.endClientRepo.save(newClient);
  }

  async findOrCreate(
    phoneNumber: string,
    tenantId: string,
  ): Promise<{ client: EndClient; isNew: boolean }> {
    await this.setTenantSession();
    const existing = await this.endClientRepo.findOne({
      where: { phoneNumber, tenantId, deletedAt: IsNull() },
    });
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

  async findById(id: string): Promise<EndClient | null> {
    await this.setTenantSession();
    return this.endClientRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
  }

  async markPhoneVerified(clientId: string): Promise<void> {
    await this.setTenantSession();
    await this.endClientRepo.update(clientId, {
      phoneVerified: true,
      updatedAt: new Date(),
    });
  }

  async updatePhone(clientId: string, phoneNumber: string): Promise<void> {
    await this.setTenantSession();
    await this.endClientRepo.update(clientId, {
      phoneNumber,
      phoneVerified: true,
      updatedAt: new Date(),
    });
  }
}
