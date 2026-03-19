import { renderHook, waitFor } from '@testing-library/react';
import { useAnonymousSession } from '@/lib/hooks/use-anonymous-session';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const STORAGE_KEY = 'branivo_anon_session_id';

describe('useAnonymousSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  it('POSTs for new session when localStorage is empty and stores in localStorage', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ session_id: 'new-session-uuid', expires_at: '2026-03-21T10:00:00Z' }),
    } as Response);

    const { result } = renderHook(() => useAnonymousSession());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sessionId).toBe('new-session-uuid');
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe('new-session-uuid');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/sessions/anonymous',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('GETs existing session when localStorage has a valid UUID', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'existing-session-uuid');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() => useAnonymousSession());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sessionId).toBe('existing-session-uuid');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/sessions/anonymous/existing-session-uuid',
      expect.any(Object),
    );
  });

  it('clears localStorage and creates new session on 404 (session expired)', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'expired-session-uuid');

    // GET returns 404 (expired)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response);
    // POST for new session
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ session_id: 'fresh-session-uuid', expires_at: '2026-03-21T10:00:00Z' }),
    } as Response);

    const { result } = renderHook(() => useAnonymousSession());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sessionId).toBe('fresh-session-uuid');
    expect(result.current.isExpired).toBe(true);
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe('fresh-session-uuid');
  });

  it('sets requiresLogin=true and does NOT store in localStorage on 503 with requires_login', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ requires_login: true, message: 'Временно изискваме регистрация' }),
    } as Response);

    const { result } = renderHook(() => useAnonymousSession());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requiresLogin).toBe(true);
    expect(result.current.sessionId).toBeNull();
    expect(localStorageMock.getItem(STORAGE_KEY)).toBeNull();
  });

  it('treats GET 503 without requires_login as expired (not requiresLogin)', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'session-uuid');

    // GET returns 503 but WITHOUT requires_login flag → treat as temporary outage
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ message: 'Service unavailable' }),
    } as Response);
    // POST for new session (called after expiry path)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ session_id: 'recovered-session-uuid', expires_at: '2026-03-21T10:00:00Z' }),
    } as Response);

    const { result } = renderHook(() => useAnonymousSession());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requiresLogin).toBe(false);
    expect(result.current.sessionId).toBe('recovered-session-uuid');
  });
});
