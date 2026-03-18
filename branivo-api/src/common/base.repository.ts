import { FindOptionsWhere, IsNull, Repository } from 'typeorm';

export abstract class BaseRepository<T extends { deletedAt: Date | null }> {
  constructor(protected readonly repo: Repository<T>) {}

  async findAll(where: FindOptionsWhere<T>): Promise<T[]> {
    return this.repo.find({
      where: { ...where, deletedAt: IsNull() } as FindOptionsWhere<T>,
    });
  }

  async findOne(where: FindOptionsWhere<T>): Promise<T | null> {
    return this.repo.findOne({
      where: { ...where, deletedAt: IsNull() } as FindOptionsWhere<T>,
    });
  }

  async softDelete(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await this.repo.update(id, { deletedAt: new Date() } as any);
  }
}
