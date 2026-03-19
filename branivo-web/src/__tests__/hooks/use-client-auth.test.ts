import { renderHook, act } from '@testing-library/react';
import { useClientAuth, RateLimitError, OtpExpiredError } from '@/lib/hooks/use-client-auth';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useClientAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestOtp', () => {
    it('should POST to BFF and return expires_in', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ expires_in: 300 }),
      });

      const { result } = renderHook(() => useClientAuth());

      let response: { expires_in: number } | undefined;
      await act(async () => {
        response = await result.current.requestOtp('+35988123456');
      });

      expect(response).toEqual({ expires_in: 300 });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/client/request-otp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ phone_number: '+35988123456' }),
        }),
      );
    });

    it('should throw RateLimitError on 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ retry_after: 3600 }),
      });

      const { result } = renderHook(() => useClientAuth());

      await act(async () => {
        await expect(result.current.requestOtp('+35988')).rejects.toThrow(RateLimitError);
      });
    });
  });

  describe('verifyOtp', () => {
    it('should POST with session_id and return ClientUser', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'jwt',
          refresh_token: 'refresh',
          user: { id: 'uid', phone_number: '+35988', is_new: false },
        }),
      });

      const { result } = renderHook(() => useClientAuth());

      let user: { id: string; phone_number: string; is_new: boolean } | undefined;
      await act(async () => {
        user = await result.current.verifyOtp('+35988', '123456', 'session-uuid');
      });

      expect(user).toEqual({ id: 'uid', phone_number: '+35988', is_new: false });
      const callBody = JSON.parse(
        (mockFetch.mock.calls[0] as Parameters<typeof fetch>)[1]?.body as string,
      ) as { session_id?: string };
      expect(callBody.session_id).toBe('session-uuid');
    });

    it('should throw RateLimitError on 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ retry_after: 3600 }),
      });

      const { result } = renderHook(() => useClientAuth());

      await act(async () => {
        await expect(result.current.verifyOtp('+35988', '000000')).rejects.toThrow(RateLimitError);
      });
    });

    it('should throw OtpExpiredError on 422', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ message: 'Кодът е изтекъл' }),
      });

      const { result } = renderHook(() => useClientAuth());

      await act(async () => {
        await expect(result.current.verifyOtp('+35988', '000000')).rejects.toThrow(OtpExpiredError);
      });
    });
  });
});
