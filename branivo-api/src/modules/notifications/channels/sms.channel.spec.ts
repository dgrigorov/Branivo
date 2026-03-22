import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsChannel } from './sms.channel';
import { EmailChannel } from './email.channel';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockEmailChannel = {
  send: jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string) => {
    const values: Record<string, string> = {
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'authtoken',
      TWILIO_PHONE_NUMBER: '+15555555555',
    };
    return values[key] ?? null;
  }),
};

describe('SmsChannel', () => {
  let channel: SmsChannel;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsChannel,
        { provide: ConfigService, useValue: mockConfig },
        { provide: EmailChannel, useValue: mockEmailChannel },
      ],
    }).compile();

    channel = module.get<SmsChannel>(SmsChannel);
  });

  it('Twilio success → { status: sent, fallbackUsed: false }', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('{}'),
    });

    const result = await channel.send({
      phoneNumber: '+359888000000',
      message: 'ГО изтича 01.05.2026. Поднови: https://example.com/renewal/1',
    });

    expect(result).toEqual({ status: 'sent', fallbackUsed: false });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('Twilio failure + email fallback → { status: sms_failed, fallbackUsed: true }', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: jest.fn().mockResolvedValue('error'),
    });

    const result = await channel.send({
      phoneNumber: '+359888000000',
      message: 'ГО изтича',
      fallbackEmail: 'client@example.com',
      emailSubject: 'Напомняне',
      emailBody: '<p>ГО изтича</p>',
      tenantName: 'Demo Broker',
    });

    expect(result).toEqual({ status: 'sms_failed', fallbackUsed: true });
    expect(mockEmailChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'client@example.com' }),
    );
  });

  it('Twilio failure, no fallback email → { status: sms_failed, fallbackUsed: false }', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: jest.fn().mockResolvedValue('error'),
    });

    const result = await channel.send({
      phoneNumber: '+359888000000',
      message: 'ГО изтича',
    });

    expect(result).toEqual({ status: 'sms_failed', fallbackUsed: false });
    expect(mockEmailChannel.send).not.toHaveBeenCalled();
  });
});
