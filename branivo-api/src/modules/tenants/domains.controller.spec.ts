import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { DomainResponseDto } from './dto/domain-response.dto';

const mockDomain: DomainResponseDto = {
  id: 'domain-uuid-1',
  domain: 'polici.mybrokerage.bg',
  isPrimary: false,
  status: 'pending',
  verificationRecord: {
    name: '_branivo-verify.polici.mybrokerage.bg',
    type: 'TXT',
    value: 'branivo-verify=' + 'a'.repeat(64),
  },
  verifiedAt: null,
  failureReason: null,
  createdAt: new Date('2026-01-01'),
};

const mockDomainsService = {
  registerDomain: jest.fn(),
  listDomains: jest.fn(),
  deleteDomain: jest.fn(),
};

describe('DomainsController', () => {
  let controller: DomainsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DomainsController],
      providers: [{ provide: DomainsService, useValue: mockDomainsService }],
    }).compile();

    controller = module.get<DomainsController>(DomainsController);
    jest.clearAllMocks();
  });

  describe('registerDomain (POST /tenants/domains)', () => {
    it('returns { data: DomainResponseDto } on success with verificationRecord', async () => {
      mockDomainsService.registerDomain.mockResolvedValue(mockDomain);

      const result = await controller.registerDomain({
        domain: 'polici.mybrokerage.bg',
      });

      expect(result).toEqual({ data: mockDomain });
      expect(result.data.verificationRecord).not.toBeNull();
      expect(result.data.status).toBe('pending');
    });

    it('propagates ConflictException when domain already exists', async () => {
      mockDomainsService.registerDomain.mockRejectedValue(
        new ConflictException('Tenant already has a custom domain'),
      );

      await expect(
        controller.registerDomain({ domain: 'other.bg' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listDomains (GET /tenants/domains)', () => {
    it('returns { data: DomainResponseDto[] }', async () => {
      const activePrimary: DomainResponseDto = {
        ...mockDomain,
        id: 'primary-id',
        isPrimary: true,
        status: 'active',
        verificationRecord: null,
      };
      mockDomainsService.listDomains.mockResolvedValue([
        activePrimary,
        mockDomain,
      ]);

      const result = await controller.listDomains();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].isPrimary).toBe(true);
      expect(result.data[1].status).toBe('pending');
    });
  });

  describe('deleteDomain (DELETE /tenants/domains/:id)', () => {
    it('returns void on success', async () => {
      mockDomainsService.deleteDomain.mockResolvedValue(undefined);

      const result = await controller.deleteDomain('domain-uuid-1');

      expect(result).toBeUndefined();
      expect(mockDomainsService.deleteDomain).toHaveBeenCalledWith(
        'domain-uuid-1',
      );
    });

    it('propagates NotFoundException when domain is not found', async () => {
      mockDomainsService.deleteDomain.mockRejectedValue(
        new NotFoundException('Domain not found'),
      );

      await expect(controller.deleteDomain('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propagates ForbiddenException when deleting primary domain', async () => {
      mockDomainsService.deleteDomain.mockRejectedValue(
        new ForbiddenException('Cannot delete the primary subdomain'),
      );

      await expect(controller.deleteDomain('primary-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
