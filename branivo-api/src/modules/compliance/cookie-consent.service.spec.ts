import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CookieConsentService } from './cookie-consent.service';
import { CookieConsentRecord } from './entities/cookie-consent-record.entity';
import { TenantCookiePolicy } from './entities/tenant-cookie-policy.entity';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { SaveCookieConsentDto } from './dto/save-cookie-consent.dto';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CLIENT_ID = 'cccccccc-0000-0000-0000-000000000003';

const mockInsertBuilder = {
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orUpdate: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
};

const mockConsentRepo = {
  findOne: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue(mockInsertBuilder),
};

const mockPolicyRepo = {
  findOne: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

describe('CookieConsentService', () => {
  let service: CookieConsentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConsentRepo.createQueryBuilder.mockReturnValue(mockInsertBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CookieConsentService,
        {
          provide: getRepositoryToken(CookieConsentRecord),
          useValue: mockConsentRepo,
        },
        {
          provide: getRepositoryToken(TenantCookiePolicy),
          useValue: mockPolicyRepo,
        },
        { provide: TenantContext, useValue: mockTenantContext },
      ],
    }).compile();

    service = module.get<CookieConsentService>(CookieConsentService);
  });

  describe('saveConsent', () => {
    it('forces necessary=true regardless of DTO value', async () => {
      mockPolicyRepo.findOne.mockResolvedValue({ version: 1 });

      const dto: SaveCookieConsentDto = {
        necessary: false,
        analytics: true,
        marketing: false,
        functional: false,
      };
      await service.saveConsent(CLIENT_ID, dto, null, null);

      expect(mockInsertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ necessary: true }),
      );
    });

    it('calls orUpdate for UPSERT — second call does not duplicate', async () => {
      mockPolicyRepo.findOne.mockResolvedValue({ version: 2 });

      const dto: SaveCookieConsentDto = {
        necessary: true,
        analytics: true,
        marketing: true,
        functional: false,
      };

      await service.saveConsent(CLIENT_ID, dto, '1.2.3.4', 'TestAgent/1.0');
      await service.saveConsent(CLIENT_ID, dto, '1.2.3.4', 'TestAgent/1.0');

      expect(mockInsertBuilder.orUpdate).toHaveBeenCalledTimes(2);
      expect(mockInsertBuilder.execute).toHaveBeenCalledTimes(2);
    });

    it('includes policyVersion from latest published policy', async () => {
      mockPolicyRepo.findOne.mockResolvedValue({ version: 3 });

      const dto: SaveCookieConsentDto = {
        necessary: true,
        analytics: false,
        marketing: false,
        functional: false,
      };
      await service.saveConsent(CLIENT_ID, dto, null, null);

      expect(mockInsertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ policyVersion: 3 }),
      );
    });

    it('returns saved=true and consentedAt ISO string', async () => {
      mockPolicyRepo.findOne.mockResolvedValue(null);

      const dto: SaveCookieConsentDto = {
        necessary: true,
        analytics: false,
        marketing: false,
        functional: false,
      };
      const result = await service.saveConsent(CLIENT_ID, dto, null, null);

      expect(result.saved).toBe(true);
      expect(result.consentedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getConsent', () => {
    it('returns default values when no consent record exists', async () => {
      mockConsentRepo.findOne.mockResolvedValue(null);

      const result = await service.getConsent(CLIENT_ID);

      expect(result.necessary).toBe(true);
      expect(result.analytics).toBe(false);
      expect(result.marketing).toBe(false);
      expect(result.functional).toBe(false);
      expect(result.consentedAt).toBeNull();
      expect(result.policyVersion).toBeNull();
    });

    it('returns correct values when consent record exists', async () => {
      const consentedAt = new Date('2026-04-06T10:00:00Z');
      mockConsentRepo.findOne.mockResolvedValue({
        tenantId: TENANT_ID,
        clientId: CLIENT_ID,
        necessary: true,
        analytics: true,
        marketing: false,
        functional: true,
        policyVersion: 2,
        consentedAt,
      });

      const result = await service.getConsent(CLIENT_ID);

      expect(result.analytics).toBe(true);
      expect(result.marketing).toBe(false);
      expect(result.functional).toBe(true);
      expect(result.policyVersion).toBe(2);
      expect(result.consentedAt).toBe(consentedAt.toISOString());
    });
  });
});
