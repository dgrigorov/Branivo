import {
  Inject,
  Injectable,
  Logger,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';
import { IsNull, Repository } from 'typeorm';
import { TenantDomain } from '../../modules/tenants/entities/tenant-domain.entity';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RedisKeyHelper } from '../helpers/redis-key.helper';
import { TenantContext } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    @InjectRepository(TenantDomain)
    private readonly tenantDomainRepo: Repository<TenantDomain>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tenantContext: TenantContext,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const host = req.hostname;

    const tenantId = await this.resolveTenantId(host);
    if (!tenantId) {
      throw new NotFoundException('Tenant not found');
    }

    this.tenantContext.setTenantId(tenantId);
    next();
  }

  private async resolveTenantId(host: string): Promise<string | null> {
    const cached = await this.getFromCache(host);
    if (cached) return cached;

    const tenantId = await this.getFromDatabase(host);
    if (!tenantId) return null;

    await this.setCache(host, tenantId);
    return tenantId;
  }

  private async getFromCache(host: string): Promise<string | null> {
    try {
      return await this.redis.get(RedisKeyHelper.buildSystem('host', host));
    } catch (err) {
      this.logger.warn(
        `Redis unavailable during tenant resolution for host "${host}": ${(err as Error).message}. Falling back to DB.`,
      );
      return null;
    }
  }

  private async getFromDatabase(host: string): Promise<string | null> {
    const domain = await this.tenantDomainRepo.findOne({
      where: { domain: host, tenant: { deletedAt: IsNull() } },
      relations: ['tenant'],
    });

    if (!domain) return null;
    return domain.tenantId;
  }

  private async setCache(host: string, tenantId: string): Promise<void> {
    try {
      // TTL: 3600s (1 hour) for host→tenantId mapping
      await this.redis.set(
        RedisKeyHelper.buildSystem('host', host),
        tenantId,
        'EX',
        3600,
      );
    } catch (err) {
      this.logger.warn(
        `Redis cache write failed for host "${host}": ${(err as Error).message}. Continuing without cache.`,
      );
    }
  }
}
