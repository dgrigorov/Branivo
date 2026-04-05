import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/payment_api_repository.dart';
import 'payment_event.dart';
import 'payment_state.dart';

class PaymentBloc extends Bloc<PaymentEvent, PaymentState> {
  final PaymentApiRepository _paymentRepo;

  /// Запазваме quoteId за retry (idempotency — същият quoteId → без дублиране)
  String? _currentQuoteId;

  /// Запазваме данните от PaymentReadyState за restore след cancel (AC6)
  String? _lastClientSecret;
  double? _lastAmount;
  String? _lastCurrency;

  PaymentBloc({
    required PaymentApiRepository paymentRepo,
  })  : _paymentRepo = paymentRepo,
        super(const PaymentInitialState()) {
    on<PaymentIntentRequestedEvent>(_onPaymentIntentRequested);
    on<PaymentConfirmedEvent>(_onPaymentConfirmed);
    on<PaymentFailedEvent>(_onPaymentFailed);
    on<PaymentRetryRequestedEvent>(_onPaymentRetryRequested);
    on<PaymentProcessingStartedEvent>(_onPaymentProcessingStarted);
    on<PaymentCanceledEvent>(_onPaymentCanceled);
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
      );
      _lastClientSecret = response.clientSecret;
      _lastAmount = response.amount;
      _lastCurrency = response.currency;
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

  void _onPaymentCanceled(
    PaymentCanceledEvent event,
    Emitter<PaymentState> emit,
  ) {
    // AC6: user closed PaymentSheet without paying → go back to ready state
    // НЕ показваме error message; потребителят може да опита отново
    if (state is PaymentProcessingState) {
      final clientSecret = _lastClientSecret;
      if (clientSecret != null) {
        emit(PaymentReadyState(
          clientSecret: clientSecret,
          amount: _lastAmount ?? 0,
          currency: _lastCurrency ?? 'BGN',
        ));
      }
    }
  }
}
