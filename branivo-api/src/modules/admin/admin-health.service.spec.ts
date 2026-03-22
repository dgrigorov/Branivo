import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminHealthService } from './admin-health.service';
import { AdminHealthRepository } from './repositories/admin-health.repository';
import { EmailService } from '../../common/email/email.service';
import { TenantHealthSummaryResponseDto } from './dto/tenant-health-summary-response.dto';
import { TenantHealthDetailResponseDto } from './dto/tenant-health-detail-response.dto';
import { InactiveTenantAlertDto } from './dto/inactive-tenant-alert.dto';

const mockAdminHealthRepository = {
  findAllTenantsHealth: jest.fn(),
  findTenantHealthDetail: jest.fn(),
  findTenantsWithInactiveDays: jest.fn(),
  countOrphanedPolicies: jest.fn(),
};

const mockEmailService = {
  sendInactivityAlert: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('admin@branivo.bg'),
};

describe('AdminHealthService', () => {
  let service: AdminHealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminHealthService,
        { provide: AdminHealthRepository, useValue: mockAdminHealthRepository },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AdminHealthService>(AdminHealthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getPlatformHealthDashboard', () => {
    it('delegates to repository and returns result', async () => {
      const summary = new TenantHealthSummaryResponseDto();
      summary.tenantId = 'uuid-1';
      mockAdminHealthRepository.findAllTenantsHealth.mockResolvedValueOnce([
        summary,
      ]);

      const result = await service.getPlatformHealthDashboard();

      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe('uuid-1');
      expect(
        mockAdminHealthRepository.findAllTenantsHealth,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTenantHealthDetail', () => {
    it('returns detail when tenant exists', async () => {
      const detail = new TenantHealthDetailResponseDto();
      detail.tenantId = 'uuid-1';
      mockAdminHealthRepository.findTenantHealthDetail.mockResolvedValueOnce(
        detail,
      );

      const result = await service.getTenantHealthDetail('uuid-1');

      expect(result.tenantId).toBe('uuid-1');
      expect(
        mockAdminHealthRepository.findTenantHealthDetail,
      ).toHaveBeenCalledWith('uuid-1');
    });

    it('throws NotFoundException when tenant not found', async () => {
      mockAdminHealthRepository.findTenantHealthDetail.mockResolvedValueOnce(
        null,
      );

      await expect(service.getTenantHealthDetail('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('runInactivityCheck', () => {
    beforeEach(() => {
      mockAdminHealthRepository.countOrphanedPolicies.mockResolvedValue(0);
    });

    it('sends alert email for each inactive tenant', async () => {
      const alert1 = new InactiveTenantAlertDto();
      alert1.tenantId = 'uuid-3';
      alert1.tenantName = 'Sleeping Broker';
      alert1.inactiveDays = 14;

      const alert2 = new InactiveTenantAlertDto();
      alert2.tenantId = 'uuid-4';
      alert2.tenantName = 'Another Broker';
      alert2.inactiveDays = 8;

      mockAdminHealthRepository.findTenantsWithInactiveDays.mockResolvedValueOnce(
        [alert1, alert2],
      );

      await service.runInactivityCheck();

      expect(mockEmailService.sendInactivityAlert).toHaveBeenCalledTimes(2);
      expect(mockEmailService.sendInactivityAlert).toHaveBeenCalledWith(
        'admin@branivo.bg',
        'Sleeping Broker',
        14,
      );
      expect(mockEmailService.sendInactivityAlert).toHaveBeenCalledWith(
        'admin@branivo.bg',
        'Another Broker',
        8,
      );
    });

    it('continues sending alerts when one email fails', async () => {
      const alert1 = new InactiveTenantAlertDto();
      alert1.tenantId = 'uuid-3';
      alert1.tenantName = 'Failing Broker';
      alert1.inactiveDays = 10;

      const alert2 = new InactiveTenantAlertDto();
      alert2.tenantId = 'uuid-4';
      alert2.tenantName = 'Other Broker';
      alert2.inactiveDays = 8;

      mockAdminHealthRepository.findTenantsWithInactiveDays.mockResolvedValueOnce(
        [alert1, alert2],
      );
      mockEmailService.sendInactivityAlert
        .mockRejectedValueOnce(new Error('SMTP error'))
        .mockResolvedValueOnce(undefined);

      await expect(service.runInactivityCheck()).resolves.not.toThrow();
      expect(mockEmailService.sendInactivityAlert).toHaveBeenCalledTimes(2);
    });

    it('does not send email when no inactive tenants', async () => {
      mockAdminHealthRepository.findTenantsWithInactiveDays.mockResolvedValueOnce(
        [],
      );

      await service.runInactivityCheck();

      expect(mockEmailService.sendInactivityAlert).not.toHaveBeenCalled();
    });

    it('calls findTenantsWithInactiveDays with 7 days', async () => {
      mockAdminHealthRepository.findTenantsWithInactiveDays.mockResolvedValueOnce(
        [],
      );

      await service.runInactivityCheck();

      expect(
        mockAdminHealthRepository.findTenantsWithInactiveDays,
      ).toHaveBeenCalledWith(7);
    });

    it('calls logIsolationIncident when orphaned policies detected (AC4)', async () => {
      mockAdminHealthRepository.findTenantsWithInactiveDays.mockResolvedValueOnce(
        [],
      );
      mockAdminHealthRepository.countOrphanedPolicies.mockResolvedValueOnce(2);

      const logSpy = jest.spyOn(service, 'logIsolationIncident');

      await service.runInactivityCheck();

      expect(logSpy).toHaveBeenCalledWith('system');
    });

    it('does not call logIsolationIncident when no anomalies', async () => {
      mockAdminHealthRepository.findTenantsWithInactiveDays.mockResolvedValueOnce(
        [],
      );
      mockAdminHealthRepository.countOrphanedPolicies.mockResolvedValueOnce(0);

      const logSpy = jest.spyOn(service, 'logIsolationIncident');

      await service.runInactivityCheck();

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('logIsolationIncident', () => {
    it('does not throw', () => {
      expect(() => service.logIsolationIncident('tenant-uuid')).not.toThrow();
    });
  });
});
