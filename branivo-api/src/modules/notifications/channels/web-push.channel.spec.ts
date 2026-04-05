import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  WebPushChannel,
  WebPushPayload,
  WebPushSubscriptionDto,
} from './web-push.channel';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import * as webPush from 'web-push';

const mockSubscription: WebPushSubscriptionDto = {
  endpoint: 'https://push.example.com/sub/abc123',
  p256dh: 'p256dhKeyBase64',
  auth: 'authSecretBase64',
};

const mockPayload: WebPushPayload = {
  title: 'Подновяване на полица',
  body: 'Полицата изтича на 01.05.2026',
  url: 'https://demo.branivo.bg/renewal/policy-1',
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const values: Record<string, string> = {
      VAPID_PUBLIC_KEY: 'mock-public-key',
      VAPID_PRIVATE_KEY: 'mock-private-key',
      VAPID_SUBJECT: 'mailto:admin@branivo.io',
    };
    return values[key] ?? undefined;
  }),
};

describe('WebPushChannel', () => {
  let channel: WebPushChannel;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebPushChannel,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    channel = module.get<WebPushChannel>(WebPushChannel);
  });

  it('успешно изпращане → status sent', async () => {
    (webPush.sendNotification as jest.Mock).mockResolvedValue({
      statusCode: 201,
    });

    const result = await channel.send(mockSubscription, mockPayload);

    expect(result).toEqual({
      status: 'sent',
      endpoint: mockSubscription.endpoint,
    });
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: mockSubscription.endpoint,
        keys: { p256dh: mockSubscription.p256dh, auth: mockSubscription.auth },
      },
      JSON.stringify(mockPayload),
    );
  });

  it('HTTP 410 Gone → status expired + endpoint', async () => {
    (webPush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 410,
    });

    const result = await channel.send(mockSubscription, mockPayload);

    expect(result).toEqual({
      status: 'expired',
      endpoint: mockSubscription.endpoint,
    });
  });

  it('HTTP 404 Not Found → status expired + endpoint', async () => {
    (webPush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 404,
    });

    const result = await channel.send(mockSubscription, mockPayload);

    expect(result).toEqual({
      status: 'expired',
      endpoint: mockSubscription.endpoint,
    });
  });

  it('network error (без statusCode) → хвърля грешка', async () => {
    const networkError = new Error('Network error');
    (webPush.sendNotification as jest.Mock).mockRejectedValue(networkError);

    await expect(channel.send(mockSubscription, mockPayload)).rejects.toThrow(
      'Network error',
    );
  });

  it('setVapidDetails се извиква при конструиране с валидни ключове', () => {
    expect(webPush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:admin@branivo.io',
      'mock-public-key',
      'mock-private-key',
    );
  });
});
