import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantConfigResponseDto } from './dto/tenant-config-response.dto';

const mockTenantConfig: TenantConfigResponseDto = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  slug: 'broker1',
  name: 'Broker One',
  status: 'active',
  plan: 'starter',
  features: { fleet: false, api_access: false },
  branding: {
    primaryColor: '#1A56DB',
    secondaryColor: null,
    brandFont: null,
    logoUrl: null,
    supportEmail: 'support@broker1.branivo.bg',
    supportPhone: null,
  },
};

const mockTenantsService = {
  getTenantConfig: jest.fn(),
  updateBranding: jest.fn(),
};

describe('TenantsController', () => {
  let controller: TenantsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [{ provide: TenantsService, useValue: mockTenantsService }],
    }).compile();

    controller = module.get<TenantsController>(TenantsController);
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('returns { data: TenantConfigResponseDto } for a known tenant', async () => {
      mockTenantsService.getTenantConfig.mockResolvedValueOnce(
        mockTenantConfig,
      );

      const result = await controller.getConfig();

      expect(result).toEqual({ data: mockTenantConfig });
      expect(mockTenantsService.getTenantConfig).toHaveBeenCalledTimes(1);
    });

    it('propagates NotFoundException when tenant is not found', async () => {
      mockTenantsService.getTenantConfig.mockRejectedValueOnce(
        new NotFoundException('Tenant configuration not found'),
      );

      await expect(controller.getConfig()).rejects.toThrow(NotFoundException);
    });

    it('response data includes all required fields including secondaryColor and brandFont', async () => {
      mockTenantsService.getTenantConfig.mockResolvedValueOnce(
        mockTenantConfig,
      );

      const { data } = await controller.getConfig();

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('slug');
      expect(data).toHaveProperty('features');
      expect(data).toHaveProperty('branding');
      expect(data.branding).toHaveProperty('secondaryColor');
      expect(data.branding).toHaveProperty('brandFont');
      expect(data).not.toHaveProperty('api_key_enc');
      expect(data).not.toHaveProperty('stripe_credentials');
    });
  });

  describe('updateBranding', () => {
    beforeEach(() => {
      mockTenantsService.updateBranding.mockResolvedValue(undefined);
    });

    it('calls service.updateBranding and returns void (204)', async () => {
      const result = await controller.updateBranding(
        { primaryColor: '#1A56DB' },
        undefined,
      );

      expect(mockTenantsService.updateBranding).toHaveBeenCalledWith(
        { primaryColor: '#1A56DB' },
        undefined,
      );
      expect(result).toBeUndefined();
    });

    it('passes logo file to service when provided', async () => {
      const logoFile = {
        buffer: Buffer.from('img'),
        mimetype: 'image/png',
      } as Express.Multer.File;

      await controller.updateBranding({ brandFont: 'Roboto' }, logoFile);

      expect(mockTenantsService.updateBranding).toHaveBeenCalledWith(
        { brandFont: 'Roboto' },
        logoFile,
      );
    });

    it('propagates BadRequestException for non-WCAG color', async () => {
      mockTenantsService.updateBranding.mockRejectedValueOnce(
        new BadRequestException('Color #FFFF00 fails WCAG AA contrast'),
      );

      await expect(
        controller.updateBranding({ primaryColor: '#FFFF00' }, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls service with empty dto when no fields provided', async () => {
      await controller.updateBranding({}, undefined);

      expect(mockTenantsService.updateBranding).toHaveBeenCalledWith(
        {},
        undefined,
      );
    });
  });
});
