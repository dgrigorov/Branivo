import { AdminSubscriptionJob } from './admin-subscription.job';

const mockAdminSubscriptionService = {
  enforcePendingDowngrades: jest.fn().mockResolvedValue(undefined),
};

describe('AdminSubscriptionJob', () => {
  let job: AdminSubscriptionJob;

  beforeEach(() => {
    jest.clearAllMocks();
    job = new AdminSubscriptionJob(mockAdminSubscriptionService as never);
  });

  describe('handlePendingDowngrades()', () => {
    it('трябва да извика enforcePendingDowngrades()', async () => {
      await job.handlePendingDowngrades();

      expect(
        mockAdminSubscriptionService.enforcePendingDowngrades,
      ).toHaveBeenCalledTimes(1);
    });

    it('не трябва да хвърля грешка', async () => {
      await expect(job.handlePendingDowngrades()).resolves.not.toThrow();
    });

    it('не трябва да хвърля грешка дори при грешка от service (catch и log)', async () => {
      mockAdminSubscriptionService.enforcePendingDowngrades.mockRejectedValueOnce(
        new Error('DB error'),
      );

      await expect(job.handlePendingDowngrades()).resolves.not.toThrow();
    });
  });
});
