import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreatePaymentIntent } from '@/lib/hooks/use-payment';
import type { PaymentIntentResponse } from '@/lib/hooks/use-payment';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockResponse: PaymentIntentResponse = {
  clientSecret: 'pi_test_secret_123',
  paymentId: 'pi_test_123',
  amount: 450,
  currency: 'BGN',
};

const BEARER_TOKEN = 'test-bearer-token';
const QUOTE_ID = 'quote-uuid-001';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  return Wrapper;
}

describe('useCreatePaymentIntent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns clientSecret and paymentId on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    });

    const { result } = renderHook(
      () => useCreatePaymentIntent(BEARER_TOKEN),
      { wrapper: createWrapper() },
    );

    result.current.mutate(QUOTE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.clientSecret).toBe('pi_test_secret_123');
    expect(result.current.data?.paymentId).toBe('pi_test_123');
    expect(result.current.data?.amount).toBe(450);
    expect(result.current.data?.currency).toBe('BGN');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/payments/intent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${BEARER_TOKEN}`,
        }),
        body: JSON.stringify({ quoteId: QUOTE_ID }),
      }),
    );
  });

  it('sets mutation error state on HTTP error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
    });

    const { result } = renderHook(
      () => useCreatePaymentIntent(BEARER_TOKEN),
      { wrapper: createWrapper() },
    );

    result.current.mutate(QUOTE_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});
