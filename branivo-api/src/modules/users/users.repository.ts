import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    tenantContext: TenantContext,
  ) {
    super(userRepo, tenantContext);
  }

  async findByEmailAndTenant(
    email: string,
    tenantId: string,
  ): Promise<User | null> {
    return this.userRepo.findOne({
      where: { email, tenantId, deletedAt: IsNull() },
    });
  }

  async findAllByTenant(): Promise<User[]> {
    return this.findAll({});
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    await this.setTenantSession();
    const tenantId = this.tenantContext.getTenantId();
    await this.userRepo.update(
      { id: userId, tenantId, deletedAt: IsNull() },
      { role },
    );
  }

  async softDelete(userId: string): Promise<void> {
    await this.setTenantSession();
    const tenantId = this.tenantContext.getTenantId();
    await this.userRepo.update(
      { id: userId, tenantId, deletedAt: IsNull() },
      { deletedAt: new Date() },
    );
  }

  async createUser(data: Partial<User>): Promise<User> {
    return this.save(data);
  }

  async incrementFailedLoginCount(userId: string): Promise<void> {
    await this.userRepo.increment({ id: userId }, 'failedLoginCount', 1);
  }

  async resetFailedLoginCount(userId: string): Promise<void> {
    await this.userRepo.update(userId, {
      failedLoginCount: 0,
      lockedUntil: null,
    });
  }

  async lockUser(userId: string, until: Date): Promise<void> {
    await this.userRepo.update(userId, { lockedUntil: until });
  }

  async findByIdAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id: userId, tenantId, deletedAt: IsNull() },
    });
  }

  /**
   * Atomically increments failed_login_count and conditionally sets locked_until
   * in a single SQL statement to prevent race conditions under concurrent requests.
   */
  async incrementAndMaybeLock(
    userId: string,
    maxAttempts: number,
    lockoutSeconds: number,
  ): Promise<{ failedLoginCount: number; lockedUntil: Date | null }> {
    const result = await this.userRepo.manager.query<
      Array<{ failed_login_count: number; locked_until: string | null }>
    >(
      `UPDATE users
         SET failed_login_count = failed_login_count + 1,
             locked_until = CASE
               WHEN failed_login_count + 1 >= $1
               THEN NOW() + ($2 * INTERVAL '1 second')
               ELSE locked_until
             END
       WHERE id = $3
       RETURNING failed_login_count, locked_until`,
      [maxAttempts, lockoutSeconds, userId],
    );
    const row = result[0];
    return {
      failedLoginCount: row.failed_login_count,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    };
  }
}
