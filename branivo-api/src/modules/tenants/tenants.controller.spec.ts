import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
    logoUrl: null,
    supportEmail: 'support@broker1.branivo.bg',
    supportPhone: null,
  },
};

const mockTenantsService = {
  getTenantConfig: jest.fn(),
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

    it('response data includes all required fields', async () => {
      mockTenantsService.getTenantConfig.mockResolvedValueOnce(
        mockTenantConfig,
      );

      const { data } = await controller.getConfig();

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('slug');
      expect(data).toHaveProperty('features');
      expect(data).toHaveProperty('branding');
      // Ensures no sensitive fields are present
      expect(data).not.toHaveProperty('api_key_enc');
      expect(data).not.toHaveProperty('stripe_credentials');
    });
  });
});
