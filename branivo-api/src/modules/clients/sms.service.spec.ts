import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { SmsService } from './sms.service';
import { TenantContext } from '../../common/tenant-context/tenant.context';

const mockConfig = {
  get: jest.fn(),
};

const mockTenantContext = {
  getDomain: jest.fn().mockReturnValue('broker.bg'),
};

describe('SmsService', () => {
  let service: SmsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: TenantContext, useValue: mockTenantContext },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
  });

  describe('sendOtp', () => {
    it('should throw ServiceUnavailableException when Twilio is not configured', async () => {
      mockConfig.get.mockReturnValue(undefined);

      await expect(service.sendOtp('+35988000000', '123456')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should use tenant domain from TenantContext in SMS body', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'ACtest';
        if (key === 'TWILIO_AUTH_TOKEN') return 'token';
        if (key === 'TWILIO_PHONE_NUMBER') return '+1234567890';
        return undefined;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(''),
      } as unknown as Response);

      await service.sendOtp('+35988000000', '654321');

      const callBody = (fetchSpy.mock.calls[0][1] as RequestInit)
        ?.body as string;
      expect(callBody).toContain('broker.bg');
      expect(callBody).toContain('654321');

      fetchSpy.mockRestore();
    });

    it('should throw ServiceUnavailableException when Twilio returns non-ok response', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'ACtest';
        if (key === 'TWILIO_AUTH_TOKEN') return 'token';
        if (key === 'TWILIO_PHONE_NUMBER') return '+1234567890';
        return undefined;
      });

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request'),
      } as unknown as Response);

      await expect(service.sendOtp('+35988000000', '654321')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
