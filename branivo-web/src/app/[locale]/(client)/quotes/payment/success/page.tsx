'use client';

// Optimistic success page — показва се след успешно плащане
// НЕ прави API call за policy activation — активацията е САМО в Story 4.3 Stripe webhook

export default function PaymentSuccessPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
      <div className="mb-4 text-green-500">
        <svg
          className="w-16 h-16 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Плащането е прието
      </h1>
      <p className="text-gray-600 mb-6">
        Подготвяме вашата полица...
      </p>
      <div className="flex items-center gap-2 text-gray-500">
        <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent" />
        <span>Обработва се</span>
      </div>
    </div>
  );
}
