'use client';

import { useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useCreatePaymentIntent } from '@/lib/hooks/use-payment';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

interface CheckoutFormProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

function CheckoutForm({ onSuccess, onError }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/quotes/payment/success`,
      },
      redirect: 'if_required', // 3DS се показва само при нужда
    });

    setIsProcessing(false);

    if (error) {
      // Apple Pay cancel: error.type === 'validation_error' && error.code === 'incomplete_number'
      // Google Pay cancel: error.type === 'card_error' && error.decline_code === 'cancelled'
      // In these cases the user just closed the wallet sheet — show no error (AC3)
      const isCancelledByUser =
        (error.type === 'validation_error' && error.code === 'incomplete_number') ||
        (error.type === 'card_error' && error.decline_code === 'cancelled') ||
        error.code === 'payment_intent_unexpected_state';

      if (!isCancelledByUser) {
        // Retry з СЪЩИЯ clientSecret (idempotent — AC6)
        onError(error.message ?? 'Неуспешно плащане. Моля, опитайте отново.');
      }
      // If cancelled — do nothing: form stays in current state, no error shown
    } else {
      // Optimistic state — НЕ активираме полицата тук (активацията е в Story 4.3 webhook)
      onSuccess();
      router.push('/quotes/payment/success');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement /> {/* card + Apple Pay + Google Pay */}
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="mt-4 w-full rounded-md bg-blue-600 py-3 text-white font-medium disabled:opacity-50"
      >
        {isProcessing ? 'Обработва се...' : 'Плати'}
      </button>
    </form>
  );
}

interface PaymentPageContentProps {
  quoteId: string;
  token: string;
}

function PaymentPageContent({ quoteId, token }: PaymentPageContentProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const mutation = useCreatePaymentIntent(token);

  const handleLoadPayment = useCallback(() => {
    mutation.mutate(quoteId);
  }, [mutation, quoteId]);

  // Auto-load PaymentIntent on mount
  if (!mutation.data && !mutation.isPending && !mutation.isError) {
    handleLoadPayment();
  }

  if (mutation.isPending || (!mutation.data && !mutation.isError)) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 rounded-full border-t-transparent" />
      </div>
    );
  }

  if (mutation.isError) {
    return (
      <div className="p-4 text-red-600">
        <p>Грешка при зареждане на плащането. Моля, опитайте отново.</p>
        <button
          onClick={() => mutation.mutate(quoteId)}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Опитай отново
        </button>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="p-4 text-center">
        <p className="text-lg font-medium">
          Плащането е прието — полицата се обработва
        </p>
      </div>
    );
  }

  const { clientSecret, amount, currency } = mutation.data!;

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">Плащане</h1>
      <p className="text-gray-600 mb-6">
        Сума: {amount.toFixed(2)} {currency}
      </p>
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">
          {errorMessage}
        </div>
      )}
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: { theme: 'stripe' },
        }}
      >
        <CheckoutForm
          onSuccess={() => setIsSuccess(true)}
          onError={(msg) => setErrorMessage(msg)}
        />
      </Elements>
    </div>
  );
}

export default function PaymentPage() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId') ?? '';
  // В реален сценарий токенът идва от auth context/cookie
  const token = searchParams.get('token') ?? '';

  if (!quoteId) {
    return (
      <div className="p-4 text-red-600">
        Невалидна страница — липсва quoteId параметър.
      </div>
    );
  }

  return <PaymentPageContent quoteId={quoteId} token={token} />;
}
