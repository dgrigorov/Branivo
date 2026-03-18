import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findByEmailAndTenant(
    email: string,
    tenantId: string,
  ): Promise<User | null> {
    return this.usersRepository.findByEmailAndTenant(email, tenantId);
  }
}
