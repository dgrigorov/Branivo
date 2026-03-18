import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { UsersRepository } from './users.repository';
import { User, UserRole } from './entities/user.entity';
import { CreateBrokerUserDto } from './dto/create-broker-user.dto';

const BCRYPT_COST = 12;
const ASSIGNABLE_ROLES: UserRole[] = [
  'broker_admin',
  'broker_agent',
  'broker_viewer',
];

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findByEmailAndTenant(
    email: string,
    tenantId: string,
  ): Promise<User | null> {
    return this.usersRepository.findByEmailAndTenant(email, tenantId);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.findAllByTenant();
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    // Service-level guard prevents super_admin assignment even if called outside
    // the HTTP request pipeline (e.g. from a future scheduled job or admin CLI).
    // DTO @IsIn validation is the primary guard for HTTP requests.
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestException(
        `Role '${role}' cannot be assigned. Allowed: ${ASSIGNABLE_ROLES.join(', ')}`,
      );
    }
    await this.usersRepository.updateRole(userId, role);
  }

  async createBrokerUser(dto: CreateBrokerUserDto): Promise<User> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    try {
      return await this.usersRepository.createUser({
        email: dto.email,
        role: dto.role,
        passwordHash,
        twoFaEnabled: false,
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'A user with this email already exists in this tenant',
        );
      }
      throw err;
    }
  }

  async softDeleteUser(userId: string): Promise<void> {
    await this.usersRepository.softDelete(userId);
  }
}
