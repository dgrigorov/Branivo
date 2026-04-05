import { renderHook, act, waitFor } from '@testing-library/react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// Valid base64url encoded string (88 chars — correct length for a P-256 public key)
const MOCK_VAPID_KEY =
  'BHFLJxEVjS8-UDwJlvbXLiMkfOIWqJPeq77wz0GC1lCeRpQKrRG0qRCIBM4eSDwBfzMjsNMCDrEFYT1SJdxfbk';

const mockSubscription = {
  endpoint: 'https://push.example.com/sub/abc123',
  toJSON: () => ({
    endpoint: 'https://push.example.com/sub/abc123',
    keys: { p256dh: 'p256dhKeyBase64', auth: 'authSecretBase64' },
  }),
};

const mockGetSubscription = jest.fn().mockResolvedValue(null);
const mockSubscribe = jest.fn().mockResolvedValue(mockSubscription);
const mockFetch = jest.fn().mockResolvedValue({ ok: true });

interface MockRegistration {
  pushManager: {
    getSubscription: jest.Mock;
    subscribe: jest.Mock;
  };
}

function installNavigatorServiceWorker(
  registrationOverrides: Partial<MockRegistration> = {},
): void {
  const mockRegistration: MockRegistration = {
    pushManager: { getSubscription: mockGetSubscription, subscribe: mockSubscribe },
    ...registrationOverrides,
  };
  Object.defineProperty(global.navigator, 'serviceWorker', {
    configurable: true,
    writable: true,
    value: { ready: Promise.resolve(mockRegistration) },
  });
}

function setNotificationPermission(
  permission: NotificationPermission,
  requestResult: NotificationPermission = permission,
): void {
  Object.defineProperty(global, 'Notification', {
    configurable: true,
    writable: true,
    value: {
      permission,
      requestPermission: jest.fn().mockResolvedValue(requestResult),
    },
  });
}

function setPushManagerAvailable(): void {
  Object.defineProperty(global, 'PushManager', {
    configurable: true,
    writable: true,
    value: class MockPushManager {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = MOCK_VAPID_KEY;
  mockGetSubscription.mockResolvedValue(null);
  mockSubscribe.mockResolvedValue(mockSubscription);
  setNotificationPermission('default', 'granted');
  installNavigatorServiceWorker();
  setPushManagerAvailable();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
});

describe('usePushNotifications', () => {
  it('default → requestPermission → granted → subscribe → POST до API', async () => {
    act(() => {
      renderHook(() => usePushNotifications());
    });

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled(), { timeout: 2000 });

    expect(mockSubscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 2000 });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/clients/me/push-subscription',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"endpoint"') as string,
      }),
    );
  });

  it('denied → не извиква subscribe, не прави API call', async () => {
    setNotificationPermission('denied', 'denied');

    act(() => { renderHook(() => usePushNotifications()); });
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('вече subscribed → не прави дублиран subscribe', async () => {
    mockGetSubscription.mockResolvedValue(mockSubscription);
    setNotificationPermission('granted', 'granted');

    act(() => { renderHook(() => usePushNotifications()); });
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requestPermission → denied → не subscribe', async () => {
    setNotificationPermission('default', 'denied');

    act(() => { renderHook(() => usePushNotifications()); });
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('без VAPID key → не прави нищо', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    act(() => { renderHook(() => usePushNotifications()); });
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
