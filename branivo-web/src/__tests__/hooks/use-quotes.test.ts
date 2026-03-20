import { createQuoteRequest } from '@/lib/hooks/use-quotes';
import type { QuoteSession } from '@/lib/hooks/use-quotes';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const SESSION_TOKEN = 'test-session-token';

const mockSession: QuoteSession = {
  sessionToken: SESSION_TOKEN,
  offers: [
    {
      id: 'offer-1',
      insurerCode: 'allianz',
      insurerName: 'Allianz Bulgaria',
      price: 450,
      currency: 'BGN',
      score: 0.75,
      isRecommended: true,
      status: 'success',
      extras: {},
    },
  ],
  status: 'complete',
  requestedAt: new Date().toISOString(),
};

const mockApiResponse = { data: mockSession, meta: { timestamp: new Date().toISOString() } };

describe('use-quotes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createQuoteRequest', () => {
    it('success — returns QuoteSession', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockApiResponse,
      });

      const result = await createQuoteRequest(SESSION_TOKEN);

      expect(result.sessionToken).toBe(SESSION_TOKEN);
      expect(result.offers).toHaveLength(1);
      expect(result.offers[0].insurerCode).toBe('allianz');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ message: 'Too many requests' }),
      });

      await expect(createQuoteRequest(SESSION_TOKEN)).rejects.toThrow('429');
    });

    it('sends X-Session-Token header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockApiResponse,
      });

      await createQuoteRequest(SESSION_TOKEN);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers['X-Session-Token']).toBe(SESSION_TOKEN);
    });
  });
});
