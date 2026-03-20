'use client';

import { useMutation } from '@tanstack/react-query';

export interface PaymentIntentResponse {
  clientSecret: string;
  paymentId: string;
  amount: number;
  currency: string;
}

export function useCreatePaymentIntent(token: string) {
  return useMutation({
    mutationFn: async (quoteId: string): Promise<PaymentIntentResponse> => {
      const res = await fetch('/api/v1/payments/intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ quoteId }),
      });
      if (!res.ok) {
        throw new Error('Failed to create payment intent');
      }
      return res.json() as Promise<PaymentIntentResponse>;
    },
  });
}
