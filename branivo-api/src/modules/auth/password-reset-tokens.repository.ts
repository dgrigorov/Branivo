import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PasswordResetToken } from './entities/password-reset-token.entity';

@Injectable()
export class PasswordResetTokensRepository {
  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly repo: Repository<PasswordResetToken>,
  ) {}

  async create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.repo.insert({ userId, tokenHash, expiresAt });
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  async markUsed(tokenId: string): Promise<void> {
    await this.repo.update({ id: tokenId }, { usedAt: new Date() });
  }

  async markAllUsedForUser(userId: string): Promise<void> {
    await this.repo.update(
      { userId, usedAt: IsNull() },
      { usedAt: new Date() },
    );
  }

  async deleteExpiredForUser(userId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId AND expires_at < NOW()', { userId })
      .execute();
  }
}
