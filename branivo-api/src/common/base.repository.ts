import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { TenantContext } from './tenant-context/tenant.context';

export abstract class BaseRepository<T extends { deletedAt: Date | null }> {
  constructor(
    protected readonly repo: Repository<T>,
    protected readonly tenantContext: TenantContext,
  ) {}

  protected async setTenantSession(): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();
    await this.repo.query(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      [tenantId],
    );
  }

  async findAll(where: FindOptionsWhere<T>): Promise<T[]> {
    await this.setTenantSession();
    return this.repo.find({
      where: { ...where, deletedAt: IsNull() } as FindOptionsWhere<T>,
    });
  }

  async findOne(where: FindOptionsWhere<T>): Promise<T | null> {
    await this.setTenantSession();
    return this.repo.findOne({
      where: { ...where, deletedAt: IsNull() } as FindOptionsWhere<T>,
    });
  }

  async save(entity: Partial<T>): Promise<T> {
    await this.setTenantSession();
    return this.repo.save(entity as T);
  }

  async softDelete(id: string): Promise<void> {
    await this.setTenantSession();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await this.repo.update(id, { deletedAt: new Date() } as any);
  }
}
