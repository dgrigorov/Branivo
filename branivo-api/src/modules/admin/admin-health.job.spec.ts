import { Test, TestingModule } from '@nestjs/testing';
import { AdminHealthJob } from './admin-health.job';
import { AdminHealthService } from './admin-health.service';

const mockAdminHealthService = {
  runInactivityCheck: jest.fn(),
};

describe('AdminHealthJob', () => {
  let job: AdminHealthJob;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminHealthJob,
        { provide: AdminHealthService, useValue: mockAdminHealthService },
      ],
    }).compile();

    job = module.get<AdminHealthJob>(AdminHealthJob);
  });

  afterEach(() => jest.clearAllMocks());

  describe('runDailyHealthCheck', () => {
    it('calls runInactivityCheck on the service', async () => {
      mockAdminHealthService.runInactivityCheck.mockResolvedValueOnce(
        undefined,
      );

      await job.runDailyHealthCheck();

      expect(mockAdminHealthService.runInactivityCheck).toHaveBeenCalledTimes(
        1,
      );
    });

    it('propagates errors from service', async () => {
      mockAdminHealthService.runInactivityCheck.mockRejectedValueOnce(
        new Error('DB error'),
      );

      await expect(job.runDailyHealthCheck()).rejects.toThrow('DB error');
    });
  });
});
