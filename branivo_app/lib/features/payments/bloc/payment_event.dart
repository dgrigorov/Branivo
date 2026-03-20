abstract class PaymentEvent {
  const PaymentEvent();
}

class PaymentIntentRequestedEvent extends PaymentEvent {
  final String quoteId;

  const PaymentIntentRequestedEvent({required this.quoteId});
}

class PaymentConfirmedEvent extends PaymentEvent {
  final String paymentIntentId;

  const PaymentConfirmedEvent({required this.paymentIntentId});
}

class PaymentFailedEvent extends PaymentEvent {
  final String errorMessage;

  const PaymentFailedEvent({required this.errorMessage});
}

class PaymentRetryRequestedEvent extends PaymentEvent {
  const PaymentRetryRequestedEvent();
}

class PaymentProcessingStartedEvent extends PaymentEvent {
  const PaymentProcessingStartedEvent();
}
