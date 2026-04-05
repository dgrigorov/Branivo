import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/payments/bloc/payment_bloc.dart';
import 'package:branivo_app/features/payments/bloc/payment_event.dart';
import 'package:branivo_app/features/payments/bloc/payment_state.dart';
import 'package:branivo_app/features/payments/data/payment_api_repository.dart';

class MockPaymentApiRepository extends Mock implements PaymentApiRepository {}

const _quoteId = 'quote-uuid-001';

final _mockResponse = PaymentIntentResponse(
  clientSecret: 'pi_test_secret_123',
  paymentId: 'pi_test_123',
  amount: 450.0,
  currency: 'BGN',
);

void main() {
  late MockPaymentApiRepository mockRepo;
  late PaymentBloc bloc;

  setUp(() {
    mockRepo = MockPaymentApiRepository();
    bloc = PaymentBloc(paymentRepo: mockRepo);
  });

  tearDown(() {
    bloc.close();
  });

  group('PaymentIntentRequestedEvent', () {
    test('emits LoadingState then ReadyState on success', () async {
      when(
        () => mockRepo.createPaymentIntent(quoteId: _quoteId),
      ).thenAnswer((_) async => _mockResponse);

      bloc.add(const PaymentIntentRequestedEvent(quoteId: _quoteId));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<PaymentLoadingState>(),
          isA<PaymentReadyState>(),
        ]),
      );

      final ready = bloc.state as PaymentReadyState;
      expect(ready.clientSecret, equals('pi_test_secret_123'));
      expect(ready.amount, equals(450.0));
      expect(ready.currency, equals('BGN'));
    });

    test('emits LoadingState then FailedState on API error', () async {
      when(
        () => mockRepo.createPaymentIntent(quoteId: _quoteId),
      ).thenThrow(Exception('Network error'));

      bloc.add(const PaymentIntentRequestedEvent(quoteId: _quoteId));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<PaymentLoadingState>(),
          isA<PaymentFailedState>(),
        ]),
      );

      final failed = bloc.state as PaymentFailedState;
      expect(failed.canRetry, isTrue);
    });
  });

  group('PaymentConfirmedEvent', () {
    test('emits PaymentSuccessState — НЕ активира полица', () async {
      bloc.add(
          const PaymentConfirmedEvent(paymentIntentId: 'pi_test_123'));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<PaymentSuccessState>(),
        ]),
      );

      final success = bloc.state as PaymentSuccessState;
      expect(success.paymentIntentId, equals('pi_test_123'));
      // PaymentSuccessState НЕ съдържа policy activation logic
    });
  });

  group('PaymentCanceledEvent (AC6)', () {
    test('emits PaymentReadyState (not PaymentFailedState) when user cancels', () async {
      when(
        () => mockRepo.createPaymentIntent(quoteId: _quoteId),
      ).thenAnswer((_) async => _mockResponse);

      // Load PaymentIntent first to store clientSecret
      bloc.add(const PaymentIntentRequestedEvent(quoteId: _quoteId));
      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<PaymentLoadingState>(),
          isA<PaymentReadyState>(),
        ]),
      );

      // Simulate processing started (PaymentSheet opened)
      bloc.add(const PaymentProcessingStartedEvent());
      await expectLater(
        bloc.stream,
        emitsInOrder([isA<PaymentProcessingState>()]),
      );

      // User cancels PaymentSheet → must restore PaymentReadyState
      bloc.add(const PaymentCanceledEvent());
      await expectLater(
        bloc.stream,
        emitsInOrder([isA<PaymentReadyState>()]),
      );

      // Verify not in error state
      expect(bloc.state, isA<PaymentReadyState>());
    });
  });

  group('PaymentRetryRequestedEvent', () {
    test('retries using same quoteId for idempotency (AC6)', () async {
      when(
        () => mockRepo.createPaymentIntent(quoteId: _quoteId),
      ).thenAnswer((_) async => _mockResponse);

      // Първо зареждаме intent
      bloc.add(const PaymentIntentRequestedEvent(quoteId: _quoteId));
      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<PaymentLoadingState>(),
          isA<PaymentReadyState>(),
        ]),
      );

      // Retry — трябва да използва СЪЩИЯ quoteId
      bloc.add(const PaymentRetryRequestedEvent());
      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<PaymentLoadingState>(),
          isA<PaymentReadyState>(),
        ]),
      );

      // createPaymentIntent трябва да е извикан 2 пъти с СЪЩИЯ quoteId
      verify(
        () => mockRepo.createPaymentIntent(quoteId: _quoteId),
      ).called(2);
    });
  });
}
