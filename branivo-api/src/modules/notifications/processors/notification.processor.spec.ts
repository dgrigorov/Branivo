import { Test, TestingModule } from '@nestjs/testing';
import { NotificationProcessor } from './notification.processor';
import {
  NotificationsService,
  RenewalNotificationJobData,
} from '../notifications.service';
import type { Job } from 'bull';

const mockJobData: RenewalNotificationJobData = {
  policyId: 'policy-1',
  stage: 'd_minus_30',
  tenantId: 'tenant-1',
  coverageEndDate: '2026-05-01T00:00:00.000Z',
};

const mockService = {
  deliverRenewalNotification: jest.fn().mockResolvedValue(undefined),
};

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        { provide: NotificationsService, useValue: mockService },
      ],
    }).compile();

    processor = module.get<NotificationProcessor>(NotificationProcessor);
  });

  it('handleRenewalNotification → deliverRenewalNotification(job.data)', async () => {
    const job = { data: mockJobData } as Job<RenewalNotificationJobData>;

    await processor.handleRenewalNotification(job);

    expect(mockService.deliverRenewalNotification).toHaveBeenCalledWith(
      mockJobData,
    );
  });
});
