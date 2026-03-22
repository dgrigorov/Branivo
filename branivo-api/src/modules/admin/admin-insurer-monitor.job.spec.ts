import { AdminInsurerMonitorJob } from './admin-insurer-monitor.job';

const mockService = {
  runErrorRateCheck: jest.fn().mockResolvedValue(undefined),
};

describe('AdminInsurerMonitorJob', () => {
  let job: AdminInsurerMonitorJob;

  beforeEach(() => {
    jest.clearAllMocks();
    job = new AdminInsurerMonitorJob(mockService as never);
  });

  it('трябва да извика runErrorRateCheck', async () => {
    await job.runErrorRateCheck();
    expect(mockService.runErrorRateCheck).toHaveBeenCalledTimes(1);
  });

  it('трябва да хвърля ако service хвърли грешка', async () => {
    mockService.runErrorRateCheck.mockRejectedValue(new Error('DB error'));
    await expect(job.runErrorRateCheck()).rejects.toThrow('DB error');
  });
});
