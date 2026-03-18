import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { TenantInvitation } from '../entities/tenant-invitation.entity';

/**
 * Super Admin context — no tenant_id scope intentionally.
 * This is the legitimate exception documented in project-context.md #1.
 */
@Injectable()
export class TenantInvitationsRepository {
  constructor(
    @InjectRepository(TenantInvitation)
    private readonly repo: Repository<TenantInvitation>,
  ) {}

  async create(data: {
    tenantId: string;
    email: string;
    token: string;
    expiresAt: Date;
  }): Promise<TenantInvitation> {
    const invitation = this.repo.create({
      ...data,
      status: 'pending',
    });
    return this.repo.save(invitation);
  }

  async findByToken(token: string): Promise<TenantInvitation | null> {
    return this.repo.findOne({
      where: {
        token,
        status: 'pending',
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  async findPendingByEmail(email: string): Promise<TenantInvitation | null> {
    return this.repo.findOne({
      where: {
        email,
        status: 'pending',
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  async findByTenantId(tenantId: string): Promise<TenantInvitation | null> {
    return this.repo.findOne({
      where: { tenantId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  async markAsUsed(id: string): Promise<void> {
    await this.repo.update(id, { status: 'used' });
  }
}
