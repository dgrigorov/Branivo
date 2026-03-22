import { NotFoundException } from '@nestjs/common';
import { AdminInsurerMonitorService } from './admin-insurer-monitor.service';
import { InsurerCallMetrics } from '../quotes/circuit-breaker.service';
import { InsurerStatusRow } from './repositories/admin-insurer-monitor.repository';

const mockInsurers: InsurerStatusRow[] = [
  {
    id: 'ins-uuid-1',
    name: 'Allianz',
    code: 'allianz',
    isActive: true,
    isManuallyDisabled: false,
    disabledReason: null,
    disabledByAdminId: null,
  },
  {
    id: 'ins-uuid-2',
    name: 'Generali',
    code: 'generali',
    isActive: true,
    isManuallyDisabled: true,
    disabledReason: 'API down',
    disabledByAdminId: 'admin-uuid',
  },
];

const mockRepository = {
  findAllInsurers: jest.fn().mockResolvedValue(mockInsurers),
  findInsurerById: jest
    .fn()
    .mockImplementation((id: string) =>
      Promise.resolve(mockInsurers.find((i) => i.id === id) ?? null),
    ),
  disableInsurer: jest.fn().mockResolvedValue(undefined),
  enableInsurer: jest.fn().mockResolvedValue(undefined),
};

const allianzMetrics = new Map<string, InsurerCallMetrics>([
  ['allianz', { errorRate: 0.5, avgLatencyMs: 120, totalCalls: 10 }],
]);

const mockCircuitBreakerService = {
  getInsurerMetrics: jest.fn().mockReturnValue(allianzMetrics),
  getAggregatedCircuitState: jest.fn().mockReturnValue('closed'),
  resetBreakersForInsurer: jest.fn(),
};

const mockEmailService = {
  sendInsurerAlertEmail: jest.fn().mockResolvedValue(undefined),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('admin@branivo.bg'),
};

describe('AdminInsurerMonitorService', () => {
  let service: AdminInsurerMonitorService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.findAllInsurers.mockResolvedValue(mockInsurers);
    mockRepository.findInsurerById.mockImplementation((id: string) =>
      Promise.resolve(mockInsurers.find((i) => i.id === id) ?? null),
    );
    mockCircuitBreakerService.getInsurerMetrics.mockReturnValue(allianzMetrics);
    mockCircuitBreakerService.getAggregatedCircuitState.mockReturnValue(
      'closed',
    );

    service = new AdminInsurerMonitorService(
      mockRepository as never,
      mockCircuitBreakerService as never,
      mockEmailService as never,
      mockConfigService as never,
    );
  });

  describe('getInsurerApiDashboard()', () => {
    it('трябва да върне статус за всички застрахователи', async () => {
      const result = await service.getInsurerApiDashboard();

      expect(result).toHaveLength(2);
      expect(result[0].insurerCode).toBe('allianz');
      expect(result[0].errorRate5min).toBe(0.5);
      expect(result[0].avgLatencyMs).toBe(120);
      expect(result[0].totalCalls5min).toBe(10);
      expect(result[0].isManuallyDisabled).toBe(false);
    });

    it('трябва да използва default metrics (0) за insurers без история', async () => {
      const result = await service.getInsurerApiDashboard();

      const generali = result.find((r) => r.insurerCode === 'generali');
      expect(generali).toBeDefined();
      expect(generali!.errorRate5min).toBe(0);
      expect(generali!.totalCalls5min).toBe(0);
    });

    it('трябва да включва circuit state от CircuitBreakerService', async () => {
      mockCircuitBreakerService.getAggregatedCircuitState.mockReturnValueOnce(
        'open',
      );
      const result = await service.getInsurerApiDashboard();
      expect(result[0].circuitState).toBe('open');
    });
  });

  describe('activateManualFallback()', () => {
    it('трябва да деактивира insurer и да нулира circuit breaker', async () => {
      await service.activateManualFallback(
        'ins-uuid-1',
        'admin-uuid',
        'API degraded',
      );

      expect(mockRepository.disableInsurer).toHaveBeenCalledWith(
        'ins-uuid-1',
        'admin-uuid',
        'API degraded',
      );
      expect(
        mockCircuitBreakerService.resetBreakersForInsurer,
      ).toHaveBeenCalledWith('allianz');
    });

    it('трябва да хвърли NotFoundException при несъществуващ insurer', async () => {
      await expect(
        service.activateManualFallback('nonexistent', 'admin-uuid', 'reason'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivateManualFallback()', () => {
    it('трябва да активира insurer и да нулира circuit breaker', async () => {
      await service.deactivateManualFallback('ins-uuid-2', 'admin-uuid');

      expect(mockRepository.enableInsurer).toHaveBeenCalledWith(
        'ins-uuid-2',
        'admin-uuid',
      );
      expect(
        mockCircuitBreakerService.resetBreakersForInsurer,
      ).toHaveBeenCalledWith('generali');
    });

    it('трябва да хвърли NotFoundException при несъществуващ insurer', async () => {
      await expect(
        service.deactivateManualFallback('nonexistent', 'admin-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('runErrorRateCheck()', () => {
    it('не трябва да изпраща алерт при error rate <= 1%', async () => {
      // allianz has 0.5% error rate — below threshold
      await service.runErrorRateCheck();
      expect(mockEmailService.sendInsurerAlertEmail).not.toHaveBeenCalled();
    });

    it('трябва да изпрати алерт при error rate > 1%', async () => {
      const highErrorMetrics = new Map<string, InsurerCallMetrics>([
        ['allianz', { errorRate: 2.5, avgLatencyMs: 800, totalCalls: 20 }],
      ]);
      mockCircuitBreakerService.getInsurerMetrics.mockReturnValue(
        highErrorMetrics,
      );

      await service.runErrorRateCheck();

      expect(mockEmailService.sendInsurerAlertEmail).toHaveBeenCalledWith(
        'admin@branivo.bg',
        'Allianz',
        2.5,
        800,
      );
    });

    it('не трябва да изпраща алерт за вече деактивирани insurers', async () => {
      const highErrorMetrics = new Map<string, InsurerCallMetrics>([
        ['generali', { errorRate: 5.0, avgLatencyMs: 1000, totalCalls: 30 }],
      ]);
      mockCircuitBreakerService.getInsurerMetrics.mockReturnValue(
        highErrorMetrics,
      );

      await service.runErrorRateCheck();

      // generali е isManuallyDisabled=true — не трябва алерт
      expect(mockEmailService.sendInsurerAlertEmail).not.toHaveBeenCalled();
    });

    it('трябва да продължи при грешка в email изпращане', async () => {
      const highErrorMetrics = new Map<string, InsurerCallMetrics>([
        ['allianz', { errorRate: 3.0, avgLatencyMs: 500, totalCalls: 15 }],
      ]);
      mockCircuitBreakerService.getInsurerMetrics.mockReturnValue(
        highErrorMetrics,
      );
      mockEmailService.sendInsurerAlertEmail.mockRejectedValue(
        new Error('SMTP error'),
      );

      await expect(service.runErrorRateCheck()).resolves.not.toThrow();
    });
  });
});
