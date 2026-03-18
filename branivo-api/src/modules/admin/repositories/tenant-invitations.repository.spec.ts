import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { TenantInvitationsRepository } from './tenant-invitations.repository';
import { TenantInvitation } from '../entities/tenant-invitation.entity';

const FUTURE_DATE = new Date(Date.now() + 48 * 60 * 60 * 1000);

const makeInvitation = (
  overrides: Partial<TenantInvitation> = {},
): TenantInvitation =>
  Object.assign(new TenantInvitation(), {
    id: 'invite-uuid',
    tenantId: 'tenant-uuid',
    email: 'broker@example.com',
    token: 'valid-token',
    status: 'pending',
    expiresAt: FUTURE_DATE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

describe('TenantInvitationsRepository', () => {
  let repo: TenantInvitationsRepository;
  let typeormRepo: jest.Mocked<Repository<TenantInvitation>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TenantInvitationsRepository,
        {
          provide: getRepositoryToken(TenantInvitation),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = module.get(TenantInvitationsRepository);
    typeormRepo = module.get(getRepositoryToken(TenantInvitation));
  });

  describe('findByToken', () => {
    it('returns invitation for valid pending non-expired token', async () => {
      const invitation = makeInvitation();
      typeormRepo.findOne.mockResolvedValue(invitation);

      const result = await repo.findByToken('valid-token');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(typeormRepo.findOne).toHaveBeenCalledWith({
        where: {
          token: 'valid-token',
          status: 'pending',
          expiresAt: MoreThan(expect.any(Date)),
        },
      });
      expect(result).toBe(invitation);
    });

    it('returns null for expired token (repository passes expiresAt > now filter)', async () => {
      typeormRepo.findOne.mockResolvedValue(null);

      const result = await repo.findByToken('expired-token');

      expect(result).toBeNull();
    });

    it('returns null for used token (status filter excludes non-pending)', async () => {
      typeormRepo.findOne.mockResolvedValue(null);

      const result = await repo.findByToken('used-token');

      expect(result).toBeNull();
    });
  });

  describe('markAsUsed', () => {
    it('updates invitation status to used', async () => {
      typeormRepo.update.mockResolvedValue({ affected: 1 } as never);

      await repo.markAsUsed('invite-uuid');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(typeormRepo.update).toHaveBeenCalledWith('invite-uuid', {
        status: 'used',
      });
    });
  });

  describe('create', () => {
    it('creates and saves invitation with pending status', async () => {
      const invitation = makeInvitation();
      typeormRepo.create.mockReturnValue(invitation);
      typeormRepo.save.mockResolvedValue(invitation);

      const result = await repo.create({
        tenantId: 'tenant-uuid',
        email: 'broker@example.com',
        token: 'valid-token',
        expiresAt: FUTURE_DATE,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(typeormRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
      expect(result).toBe(invitation);
    });
  });
});
