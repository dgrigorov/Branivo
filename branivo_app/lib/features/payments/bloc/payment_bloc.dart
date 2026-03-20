import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/payment_api_repository.dart';
import 'payment_event.dart';
import 'payment_state.dart';

class PaymentBloc extends Bloc<PaymentEvent, PaymentState> {
  final PaymentApiRepository _paymentRepo;
  final String _bearerToken;

  /// Запазваме quoteId за retry (idempotency — същият quoteId → без дублиране)
  String? _currentQuoteId;

  PaymentBloc({
    required PaymentApiRepository paymentRepo,
    required String bearerToken,
  })  : _paymentRepo = paymentRepo,
        _bearerToken = bearerToken,
        super(const PaymentInitialState()) {
    on<PaymentIntentRequestedEvent>(_onPaymentIntentRequested);
    on<PaymentConfirmedEvent>(_onPaymentConfirmed);
    on<PaymentFailedEvent>(_onPaymentFailed);
    on<PaymentRetryRequestedEvent>(_onPaymentRetryRequested);
    on<PaymentProcessingStartedEvent>(_onPaymentProcessingStarted);
  }

  Future<void> _onPaymentIntentRequested(
    PaymentIntentRequestedEvent event,
    Emitter<PaymentState> emit,
  ) async {
    _currentQuoteId = event.quoteId;
    emit(const PaymentLoadingState());

    try {
      final response = await _paymentRepo.createPaymentIntent(
        quoteId: event.quoteId,
        bearerToken: _bearerToken,
      );
      emit(PaymentReadyState(
        clientSecret: response.clientSecret,
        amount: response.amount,
        currency: response.currency,
      ));
    } catch (e) {
      emit(PaymentFailedState(
        message: 'Неуспешно зареждане на плащането. Моля, опитайте отново.',
        canRetry: true,
      ));
    }
  }

  void _onPaymentConfirmed(
    PaymentConfirmedEvent event,
    Emitter<PaymentState> emit,
  ) {
    // Optimistic success — НЕ активира полицата
    // Активацията е САМО в Story 4.3 Stripe webhook
    emit(PaymentSuccessState(paymentIntentId: event.paymentIntentId));
  }

  void _onPaymentFailed(
    PaymentFailedEvent event,
    Emitter<PaymentState> emit,
  ) {
    emit(PaymentFailedState(message: event.errorMessage, canRetry: true));
  }

  void _onPaymentProcessingStarted(
    PaymentProcessingStartedEvent event,
    Emitter<PaymentState> emit,
  ) {
    emit(const PaymentProcessingState());
  }

  void _onPaymentRetryRequested(
    PaymentRetryRequestedEvent event,
    Emitter<PaymentState> emit,
  ) {
    // Ре-използваме същия quoteId → идемпотентно (AC6)
    if (_currentQuoteId != null) {
      add(PaymentIntentRequestedEvent(quoteId: _currentQuoteId!));
    }
  }
}
