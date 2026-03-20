abstract class PaymentState {
  const PaymentState();
}

class PaymentInitialState extends PaymentState {
  const PaymentInitialState();
}

class PaymentLoadingState extends PaymentState {
  const PaymentLoadingState();
}

class PaymentReadyState extends PaymentState {
  final String clientSecret;
  final double amount;
  final String currency;

  const PaymentReadyState({
    required this.clientSecret,
    required this.amount,
    required this.currency,
  });
}

class PaymentProcessingState extends PaymentState {
  const PaymentProcessingState();
}

/// Optimistic success state — НЕ активира полицата client-side
/// Активацията е САМО в Story 4.3 webhook
class PaymentSuccessState extends PaymentState {
  final String paymentIntentId;

  const PaymentSuccessState({required this.paymentIntentId});
}

class PaymentFailedState extends PaymentState {
  final String message;
  final bool canRetry;

  const PaymentFailedState({required this.message, this.canRetry = true});
}
