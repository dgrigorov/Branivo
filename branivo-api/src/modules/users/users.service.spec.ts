/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QueryFailedError } from 'typeorm';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

const mockUser: User = {
  id: 'user-uuid',
  tenantId: 'tenant-uuid',
  email: 'agent@example.com',
  passwordHash: 'hashed',
  role: 'broker_agent',
  twoFaEnabled: false,
  twoFaSecretEnc: null,
  failedLoginCount: 0,
  lockedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: jest.Mocked<UsersRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UsersRepository,
          useValue: {
            findAllByTenant: jest.fn(),
            updateRole: jest.fn(),
            createUser: jest.fn(),
            softDelete: jest.fn(),
            findByEmailAndTenant: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    usersRepo = module.get(UsersRepository);
  });

  describe('findAll', () => {
    it('delegates to usersRepository.findAllByTenant', async () => {
      usersRepo.findAllByTenant.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(usersRepo.findAllByTenant).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockUser]);
    });
  });

  describe('updateRole', () => {
    it('calls usersRepository.updateRole with valid assignable role', async () => {
      usersRepo.updateRole.mockResolvedValue(undefined);

      await service.updateRole('user-uuid', 'broker_viewer');

      expect(usersRepo.updateRole).toHaveBeenCalledWith(
        'user-uuid',
        'broker_viewer',
      );
    });

    it('calls usersRepository.updateRole with broker_agent role', async () => {
      usersRepo.updateRole.mockResolvedValue(undefined);

      await service.updateRole('user-uuid', 'broker_agent');

      expect(usersRepo.updateRole).toHaveBeenCalledWith(
        'user-uuid',
        'broker_agent',
      );
    });

    it('calls usersRepository.updateRole with broker_admin role', async () => {
      usersRepo.updateRole.mockResolvedValue(undefined);

      await service.updateRole('user-uuid', 'broker_admin');

      expect(usersRepo.updateRole).toHaveBeenCalledWith(
        'user-uuid',
        'broker_admin',
      );
    });

    it('throws BadRequestException when role is super_admin', async () => {
      await expect(
        service.updateRole('user-uuid', 'super_admin'),
      ).rejects.toThrow(BadRequestException);

      expect(usersRepo.updateRole).not.toHaveBeenCalled();
    });
  });

  describe('createBrokerUser', () => {
    it('hashes password and creates user record', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      usersRepo.createUser.mockResolvedValue({
        ...mockUser,
        role: 'broker_agent',
      });

      const result = await service.createBrokerUser({
        email: 'new@example.com',
        role: 'broker_agent',
        password: 'Password1!',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('Password1!', 12);
      expect(usersRepo.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          role: 'broker_agent',
          passwordHash: 'hashed_password',
          twoFaEnabled: false,
        }),
      );
      expect(result).toBeDefined();
    });

    it('throws ConflictException on duplicate email (PG 23505)', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      const pgError = Object.assign(
        new QueryFailedError('INSERT', [], new Error('duplicate key')),
        { code: '23505' },
      );
      usersRepo.createUser.mockRejectedValue(pgError);

      await expect(
        service.createBrokerUser({
          email: 'existing@example.com',
          role: 'broker_agent',
          password: 'Password1!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDeleteUser', () => {
    it('calls BaseRepository.softDelete', async () => {
      usersRepo.softDelete.mockResolvedValue(undefined);

      await service.softDeleteUser('user-uuid');

      expect(usersRepo.softDelete).toHaveBeenCalledWith('user-uuid');
    });
  });
});
