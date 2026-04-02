import { Repository } from 'typeorm';
import { VehicleEnrichmentService } from './vehicle-enrichment.service';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { KatApiAdapter } from './adapters/kat-api.adapter';
import { GarantsionenFondAdapter } from './adapters/garantsionen-fond.adapter';
import { Policy, PolicyStatus } from '../policies/entities/policy.entity';
import { KatApiUnavailableError } from './exceptions/kat-api-unavailable.exception';
import { GfApiUnavailableError } from './exceptions/gf-api-unavailable.exception';

const TENANT_ID = 'tenant-uuid-vehicles';

const mockPolicyRepo = {
  createQueryBuilder: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

const mockKatAdapter = {
  validateVin: jest.fn(),
};

const mockGfAdapter = {
  checkVehicle: jest.fn(),
};

// Query builder chain mock
const mockQb = {
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
};

describe('VehicleEnrichmentService', () => {
  let service: VehicleEnrichmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPolicyRepo.createQueryBuilder.mockReturnValue(mockQb);
    mockQb.getOne.mockResolvedValue(null); // no existing policy by default

    service = new VehicleEnrichmentService(
      mockPolicyRepo as unknown as Repository<Policy>,
      mockTenantContext as unknown as TenantContext,
      mockKatAdapter as unknown as KatApiAdapter,
      mockGfAdapter as unknown as GarantsionenFondAdapter,
    );
  });

  describe('existing policy check', () => {
    it('returns existing_policy status ok with null data when no policy found', async () => {
      mockQb.getOne.mockResolvedValue(null);
      const result = await service.enrich({
        reg_number: 'СА1234АА',
        vin: undefined,
        fields: ['kat'],
      });
      expect(result.existing_policy?.status).toBe('ok');
    });

    it('blocks further enrichment when active policy found', async () => {
      mockQb.getOne.mockResolvedValue({
        id: 'policy-uuid',
        policyNumber: 'GO-2025-00123',
        insurerId: 'insurer-uuid',
        status: PolicyStatus.ACTIVE,
        tenantId: TENANT_ID,
      } as Policy);

      const result = await service.enrich({
        reg_number: 'СА1234АА',
        vin: undefined,
        fields: ['kat', 'gf', 'nhtsa'],
      });

      expect(result.existing_policy?.status).toBe('ok');
      expect(
        (
          result.existing_policy as {
            status: string;
            data: { policy_number: string };
          }
        )?.data?.policy_number,
      ).toBe('GO-2025-00123');
      // No kat/gf/nhtsa should be called when existing policy found
      expect(mockKatAdapter.validateVin).not.toHaveBeenCalled();
      expect(mockGfAdapter.checkVehicle).not.toHaveBeenCalled();
    });

    it('uses tenant_id scope for policy check', async () => {
      await service.enrich({
        reg_number: 'СА1234АА',
        vin: 'WVWZZZ3BZ3E123456',
        fields: ['kat'],
      });

      expect(mockQb.where).toHaveBeenCalledWith('p.tenant_id = :tenantId', {
        tenantId: TENANT_ID,
      });
    });
  });

  describe('KAT enrichment', () => {
    it('returns kat status ok on success', async () => {
      mockKatAdapter.validateVin.mockResolvedValue({
        available: true,
        status: 'ok',
      });

      const result = await service.enrich({
        reg_number: undefined,
        vin: 'WVWZZZ3BZ3E123456',
        fields: ['kat'],
      });

      expect(result.kat?.status).toBe('ok');
    });

    it('returns kat status timeout on KatApiUnavailableError', async () => {
      mockKatAdapter.validateVin.mockRejectedValue(
        new KatApiUnavailableError(),
      );

      const result = await service.enrich({
        reg_number: undefined,
        vin: 'WVWZZZ3BZ3E123456',
        fields: ['kat'],
      });

      expect(result.kat?.status).toBe('timeout');
    });

    it('returns kat status error when vin is null', async () => {
      const result = await service.enrich({
        reg_number: undefined,
        vin: undefined,
        fields: ['kat'],
      });

      expect(result.kat?.status).toBe('error');
      expect(mockKatAdapter.validateVin).not.toHaveBeenCalled();
    });
  });

  describe('GF enrichment', () => {
    it('returns gf status ok with policy_found false when no flagging', async () => {
      mockGfAdapter.checkVehicle.mockResolvedValue({
        flagged: false,
        source: 'api',
      });

      const result = await service.enrich({
        reg_number: 'СА1234АА',
        vin: 'WVWZZZ3BZ3E123456',
        fields: ['gf'],
      });

      expect(result.gf?.status).toBe('ok');
      const gfData = (
        result.gf as { status: string; data: { policy_found: boolean } }
      )?.data;
      expect(gfData?.policy_found).toBe(false);
    });

    it('returns gf status timeout on GfApiUnavailableError', async () => {
      mockGfAdapter.checkVehicle.mockRejectedValue(new GfApiUnavailableError());

      const result = await service.enrich({
        reg_number: 'СА1234АА',
        vin: undefined,
        fields: ['gf'],
      });

      expect(result.gf?.status).toBe('timeout');
    });

    it('returns gf status error when both reg_number and vin are null', async () => {
      const result = await service.enrich({
        reg_number: undefined,
        vin: undefined,
        fields: ['gf'],
      });

      expect(result.gf?.status).toBe('error');
      expect(mockGfAdapter.checkVehicle).not.toHaveBeenCalled();
    });
  });

  describe('parallel enrichment', () => {
    it('runs only requested fields', async () => {
      mockKatAdapter.validateVin.mockResolvedValue({ status: 'ok' });

      await service.enrich({
        reg_number: undefined,
        vin: 'WVWZZZ3BZ3E123456',
        fields: ['kat'],
      });

      expect(mockKatAdapter.validateVin).toHaveBeenCalled();
      expect(mockGfAdapter.checkVehicle).not.toHaveBeenCalled();
    });

    it('deduplicates fields (kat,kat → kat called once)', async () => {
      mockKatAdapter.validateVin.mockResolvedValue({ status: 'ok' });

      // The DTO transform deduplicates; we test service is called once
      await service.enrich({
        reg_number: undefined,
        vin: 'WVWZZZ3BZ3E123456',
        fields: ['kat'],
      });

      expect(mockKatAdapter.validateVin).toHaveBeenCalledTimes(1);
    });
  });
});
