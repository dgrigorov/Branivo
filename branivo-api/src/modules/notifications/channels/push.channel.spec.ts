import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushChannel } from './push.channel';

// Mock firebase-admin before importing channel
jest.mock('firebase-admin', () => ({
  apps: [] as unknown[],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn().mockReturnValue({}),
  },
  messaging: jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue('message-id'),
  }),
}));

import * as admin from 'firebase-admin';

const mockConfig = {
  get: jest.fn().mockReturnValue('mock-value'),
};

describe('PushChannel', () => {
  let channel: PushChannel;

  beforeEach(async () => {
    // Reset apps array between tests
    (admin.apps as unknown[]).length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushChannel,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    channel = module.get<PushChannel>(PushChannel);
  });

  it('push_token null → push_skipped без грешка', async () => {
    const result = await channel.send({
      pushToken: null,
      title: 'Test',
      body: 'Test body',
    });

    expect(result).toEqual({ status: 'push_skipped' });
    expect(admin.messaging).not.toHaveBeenCalled();
  });

  it('valid push_token → FCM изпращане, status sent', async () => {
    const mockSend = jest.fn().mockResolvedValue('msg-id');
    (admin.messaging as jest.Mock).mockReturnValue({ send: mockSend });

    const result = await channel.send({
      pushToken: 'valid-token-123',
      title: 'Renewal',
      body: 'Полица изтича',
    });

    expect(result).toEqual({ status: 'sent' });
    expect(mockSend).toHaveBeenCalledWith({
      token: 'valid-token-123',
      notification: { title: 'Renewal', body: 'Полица изтича' },
    });
  });

  it('registration-token-not-registered → push_skipped', async () => {
    const mockSend = jest.fn().mockRejectedValue({
      code: 'messaging/registration-token-not-registered',
    });
    (admin.messaging as jest.Mock).mockReturnValue({ send: mockSend });

    const result = await channel.send({
      pushToken: 'invalid-token',
      title: 'Test',
      body: 'Test',
    });

    expect(result).toEqual({ status: 'push_skipped' });
  });
});
