import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminInsurerDetailService } from './admin-insurer-detail.service';
import type {
  AdminInsurerMonitorRepository,
  InsurerDetailRow,
} from './repositories/admin-insurer-monitor.repository';
import type { CircuitBreakerService } from '../quotes/circuit-breaker.service';
import type { CryptoService } from '../../common/crypto/crypto.service';

const baseRow: InsurerDetailRow = {
  id: 'ins-uuid-1',
  name: 'Allianz Bulgaria',
  code: 'allianz',
  isActive: true,
  isManuallyDisabled: false,
  disabledReason: null,
  rating: '4.5',
  claimSpeed: '7.2',
  extrasConfig: {},
  adapterClass: 'MockInsurerAdapter',
  apiEndpoint: 'https://api.allianz.bg/v1',
  fscInsurerId: null,
  logoUrl: null,
  description: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-02T00:00:00Z',
  fscTrustpilotScore: null,
  fscTrustpilotReviewsCount: null,
  fscTrustpilotUrl: null,
  fscWebsite: null,
  fscOfficeAddress: null,
  fscContactPhone: null,
  fscContactEmails: null,
  fscSocialLinks: null,
  fscLogoUrl: null,
  fscLongDescription: null,
};

const mockRepo = {
  findInsurerDetailById: jest.fn(),
  updateInsurerConfig: jest.fn().mockResolvedValue(undefined),
  setApiKey: jest.fn().mockResolvedValue(undefined),
  getApiEndpoint: jest.fn(),
  findAllInsurers: jest.fn(),
  findInsurerById: jest.fn(),
  disableInsurer: jest.fn(),
  enableInsurer: jest.fn(),
};

const mockCircuitBreaker = {
  getInsurerMetrics: jest.fn().mockReturnValue(new Map()),
  getAggregatedCircuitState: jest.fn().mockReturnValue('CLOSED'),
};

const mockCryptoService = {
  encrypt: jest.fn().mockReturnValue('encrypted-key-abc'),
};

describe('AdminInsurerDetailService', () => {
  let service: AdminInsurerDetailService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminInsurerDetailService(
      mockRepo as unknown as AdminInsurerMonitorRepository,
      mockCircuitBreaker as unknown as CircuitBreakerService,
      mockCryptoService as unknown as CryptoService,
    );
  });

  describe('getDetail', () => {
    it('returns insurer detail dto', async () => {
      mockRepo.findInsurerDetailById.mockResolvedValue(baseRow);

      const result = await service.getDetail('ins-uuid-1');

      expect(result.insurerId).toBe('ins-uuid-1');
      expect(result.name).toBe('Allianz Bulgaria');
      expect(result.rating).toBe(4.5);
      expect(result.claimSpeed).toBe(7.2);
      expect(result.circuitState).toBe('CLOSED');
      expect(result.fsc).toBeNull();
    });

    it('throws NotFoundException when insurer not found', async () => {
      mockRepo.findInsurerDetailById.mockResolvedValue(null);

      await expect(service.getDetail('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('includes fsc data when fscInsurerId is set', async () => {
      const rowWithFsc: InsurerDetailRow = {
        ...baseRow,
        fscInsurerId: 'fsc-uuid-1',
        fscTrustpilotScore: '4.2',
        fscTrustpilotReviewsCount: 150,
        fscTrustpilotUrl: 'https://trustpilot.com/allianz',
        fscWebsite: 'https://allianz.bg',
        fscOfficeAddress: 'ул. Алианц 1, София',
        fscContactPhone: '+35929999999',
        fscContactEmails: ['info@allianz.bg'],
        fscSocialLinks: ['https://facebook.com/allianz'],
        fscLogoUrl: 'https://logo.allianz.bg/logo.png',
        fscLongDescription: 'Водеща застрахователна компания',
      };
      mockRepo.findInsurerDetailById.mockResolvedValue(rowWithFsc);

      const result = await service.getDetail('ins-uuid-1');

      expect(result.fsc).not.toBeNull();
      expect(result.fsc!.trustpilotScore).toBe(4.2);
      expect(result.fsc!.contactEmails).toEqual(['info@allianz.bg']);
    });
  });

  describe('setApiKey', () => {
    it('encrypts and saves api key', async () => {
      mockRepo.findInsurerDetailById.mockResolvedValue(baseRow);

      await service.setApiKey('ins-uuid-1', { apiKey: 'super-secret-key-123' });

      expect(mockCryptoService.encrypt).toHaveBeenCalledWith(
        'super-secret-key-123',
      );
      expect(mockRepo.setApiKey).toHaveBeenCalledWith(
        'ins-uuid-1',
        'encrypted-key-abc',
      );
    });

    it('throws NotFoundException when insurer not found', async () => {
      mockRepo.findInsurerDetailById.mockResolvedValue(null);

      await expect(
        service.setApiKey('bad-id', { apiKey: 'some-key-123' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('testConnection', () => {
    it('throws NotFoundException when insurer not found', async () => {
      mockRepo.findInsurerDetailById.mockResolvedValue(null);

      await expect(service.testConnection('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when no api endpoint configured', async () => {
      mockRepo.findInsurerDetailById.mockResolvedValue({
        ...baseRow,
        apiEndpoint: null,
      });

      await expect(service.testConnection('ins-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for private/SSRF-prone endpoint', async () => {
      mockRepo.findInsurerDetailById.mockResolvedValue({
        ...baseRow,
        apiEndpoint: 'http://169.254.169.254/latest/meta-data/',
      });

      await expect(service.testConnection('ins-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns success result when endpoint responds', async () => {
      mockRepo.findInsurerDetailById.mockResolvedValue({
        ...baseRow,
        apiEndpoint: 'https://api.allianz.bg/v1',
      });

      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
      });

      const result = await service.testConnection('ins-uuid-1');

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns failure result when fetch throws', async () => {
      mockRepo.findInsurerDetailById.mockResolvedValue({
        ...baseRow,
        apiEndpoint: 'https://api.allianz.bg/v1',
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.testConnection('ins-uuid-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('ECONNREFUSED');
    });
  });
});
