import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { OcrAnalyticsService } from './ocr-analytics.service';
import { EmailService } from '../../common/email/email.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import type { OcrAnalyticsFiltersDto } from './dto/ocr-analytics.dto';

describe('OcrAnalyticsService', () => {
  let service: OcrAnalyticsService;
  let mockQuery: jest.Mock;
  let mockEmailService: { sendOcrAlertEmail: jest.Mock };
  let mockRedis: { exists: jest.Mock; setex: jest.Mock };
  let mockConfig: { get: jest.Mock };

  const rawStatsRows = [
    {
      field_name: 'license_plate',
      avg_confidence: '0.97',
      fallback_rate: '0.05',
      total_jobs: '100',
    },
    {
      field_name: 'vin',
      avg_confidence: '0.70',
      fallback_rate: '0.25',
      total_jobs: '80',
    },
  ];

  const rawTrendRows = [
    {
      date: new Date('2026-03-13'),
      avg_confidence: '0.90',
      fallback_rate: '0.10',
      total_jobs: '20',
    },
    {
      date: new Date('2026-03-14'),
      avg_confidence: '0.85',
      fallback_rate: '0.15',
      total_jobs: '25',
    },
  ];

  beforeEach(async () => {
    mockQuery = jest.fn();
    mockEmailService = {
      sendOcrAlertEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockRedis = { exists: jest.fn(), setex: jest.fn().mockResolvedValue('OK') };
    mockConfig = { get: jest.fn().mockReturnValue('admin@branivo.bg') };

    const module = await Test.createTestingModule({
      providers: [
        OcrAnalyticsService,
        { provide: getDataSourceToken(), useValue: { query: mockQuery } },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(OcrAnalyticsService);
  });

  describe('getAnalytics()', () => {
    it('returns stats for all tenants when no tenantId provided', async () => {
      mockQuery.mockResolvedValueOnce(rawStatsRows);
      const filters: OcrAnalyticsFiltersDto = {};

      const result = await service.getAnalytics(filters);

      expect(result.days).toBe(7);
      expect(result.tenantId).toBeUndefined();
      expect(result.stats).toHaveLength(2);
      expect(result.stats[0]).toMatchObject({
        fieldName: 'license_plate',
        avgConfidence: 0.97,
        fallbackRate: 0.05,
        totalJobs: 100,
      });
      expect(result.generatedAt).toBeDefined();
    });

    it('passes tenantId filter when provided', async () => {
      mockQuery.mockResolvedValueOnce([rawStatsRows[0]]);
      const filters: OcrAnalyticsFiltersDto = {
        tenantId: 'tenant-uuid-1',
        days: 30,
      };

      const result = await service.getAnalytics(filters);

      expect(result.tenantId).toBe('tenant-uuid-1');
      expect(result.days).toBe(30);
      const queryCall = mockQuery.mock.calls[0] as [
        string,
        (string | number)[],
      ];
      expect(queryCall[1]).toContain('tenant-uuid-1');
    });

    it('uses default 7 days when days not specified', async () => {
      mockQuery.mockResolvedValueOnce([]);
      await service.getAnalytics({});
      const queryCall = mockQuery.mock.calls[0] as [
        string,
        (string | number)[],
      ];
      expect(queryCall[1][0]).toBe(7);
    });
  });

  describe('getTrend()', () => {
    it('returns trend points for 7 days', async () => {
      mockQuery.mockResolvedValueOnce(rawTrendRows);

      const result = await service.getTrend('license_plate', 7);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        date: '2026-03-13',
        avgConfidence: 0.9,
        fallbackRate: 0.1,
        totalJobs: 20,
      });
    });

    it('returns trend points for 30 days', async () => {
      mockQuery.mockResolvedValueOnce(rawTrendRows);

      const result = await service.getTrend('vin', 30);

      const queryCall = mockQuery.mock.calls[0] as [
        string,
        (string | number)[],
      ];
      expect(queryCall[1]).toContain(30);
      expect(result).toHaveLength(2);
    });

    it('includes tenantId filter in query when provided', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await service.getTrend('make', 7, 'tenant-uuid-1');

      const queryCall = mockQuery.mock.calls[0] as [
        string,
        (string | number)[],
      ];
      expect(queryCall[1]).toContain('tenant-uuid-1');
    });
  });

  describe('checkAndSendAlerts()', () => {
    it('sends email alert when fallback rate > 20%', async () => {
      mockQuery.mockResolvedValueOnce([
        { field_name: 'vin', tenant_id: 'tenant-1', fallback_rate: '0.25' },
      ]);
      mockRedis.exists.mockResolvedValueOnce(0);

      await service.checkAndSendAlerts();

      expect(mockEmailService.sendOcrAlertEmail).toHaveBeenCalledWith(
        'admin@branivo.bg',
        'vin',
        0.25,
        'tenant-1',
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'ocr_alert:tenant-1:vin',
        3600,
        '1',
      );
    });

    it('does NOT send email when fallback rate <= 20% (query returns empty)', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await service.checkAndSendAlerts();

      expect(mockEmailService.sendOcrAlertEmail).not.toHaveBeenCalled();
    });

    it('skips alert when Redis key already exists (dedup)', async () => {
      mockQuery.mockResolvedValueOnce([
        { field_name: 'vin', tenant_id: 'tenant-1', fallback_rate: '0.30' },
      ]);
      mockRedis.exists.mockResolvedValueOnce(1);

      await service.checkAndSendAlerts();

      expect(mockEmailService.sendOcrAlertEmail).not.toHaveBeenCalled();
    });

    it('sends alerts for multiple fields/tenants without dedup', async () => {
      mockQuery.mockResolvedValueOnce([
        { field_name: 'vin', tenant_id: 'tenant-1', fallback_rate: '0.25' },
        { field_name: 'make', tenant_id: 'tenant-2', fallback_rate: '0.35' },
      ]);
      mockRedis.exists.mockResolvedValue(0);

      await service.checkAndSendAlerts();

      expect(mockEmailService.sendOcrAlertEmail).toHaveBeenCalledTimes(2);
    });
  });
});
