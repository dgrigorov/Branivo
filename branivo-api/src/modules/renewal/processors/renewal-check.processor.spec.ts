import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bull';
import { RenewalCheckProcessor } from './renewal-check.processor';
import { RenewalService } from '../renewal.service';

describe('RenewalCheckProcessor', () => {
  let processor: RenewalCheckProcessor;
  let renewalService: jest.Mocked<
    Pick<RenewalService, 'runDailyCheck' | 'notifySuperAdminOnFailure'>
  >;

  beforeEach(async () => {
    renewalService = {
      runDailyCheck: jest.fn(),
      notifySuperAdminOnFailure: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RenewalCheckProcessor,
        { provide: RenewalService, useValue: renewalService },
      ],
    }).compile();

    processor = module.get<RenewalCheckProcessor>(RenewalCheckProcessor);
  });

  describe('handleDailyCheck()', () => {
    it('delegates to renewalService.runDailyCheck()', async () => {
      renewalService.runDailyCheck.mockResolvedValue(undefined);

      await processor.handleDailyCheck();

      expect(renewalService.runDailyCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe('onFailed()', () => {
    it('ignores failures for non-renewal jobs on QUEUE_NOTIFICATIONS', async () => {
      const error = new Error('Notification delivery failed');
      const job = {
        name: 'notification:renewal',
        id: 'job-99',
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job;

      await processor.onFailed(job, error);

      expect(renewalService.notifySuperAdminOnFailure).not.toHaveBeenCalled();
    });

    it('calls notifySuperAdminOnFailure on final attempt', async () => {
      renewalService.notifySuperAdminOnFailure.mockResolvedValue(undefined);
      const error = new Error('Queue error');
      const job = {
        name: 'renewal:daily-check',
        id: 'job-1',
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job;

      await processor.onFailed(job, error);

      expect(renewalService.notifySuperAdminOnFailure).toHaveBeenCalledWith(
        error,
      );
    });

    it('does NOT call notifySuperAdminOnFailure on non-final attempt', async () => {
      const error = new Error('Transient error');
      const job = {
        name: 'renewal:daily-check',
        id: 'job-1',
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as unknown as Job;

      await processor.onFailed(job, error);

      expect(renewalService.notifySuperAdminOnFailure).not.toHaveBeenCalled();
    });

    it('treats undefined attempts as 1 and notifies on first failure', async () => {
      renewalService.notifySuperAdminOnFailure.mockResolvedValue(undefined);
      const error = new Error('Unexpected error');
      const job = {
        name: 'renewal:daily-check',
        id: 'job-2',
        attemptsMade: 1,
        opts: {},
      } as unknown as Job;

      await processor.onFailed(job, error);

      expect(renewalService.notifySuperAdminOnFailure).toHaveBeenCalledWith(
        error,
      );
    });
  });
});
