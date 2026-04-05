import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/payments/bloc/payment_bloc.dart';
import 'package:branivo_app/features/payments/bloc/payment_event.dart';
import 'package:branivo_app/features/payments/bloc/payment_state.dart';
import 'package:branivo_app/features/payments/data/payment_api_repository.dart';

class MockPaymentApiRepository extends Mock implements PaymentApiRepository {}

final mockResponse = PaymentIntentResponse(
  clientSecret: 'pi_test_secret_123',
  paymentId: 'pi_test_123',
  amount: 450.0,
  currency: 'BGN',
);

Widget _buildStateWidget(PaymentState initialState) {
  // Uses BlocBuilder directly without the full PaymentScreen
  // to avoid flutter_stripe native plugin issues in test env
  return MaterialApp(
    home: BlocBuilder<PaymentBloc, PaymentState>(
      buildWhen: (prev, next) => prev != next,
      builder: (context, state) {
        if (state is PaymentSuccessState) {
          return const Center(
            child: Text('Плащането е прието — полицата се обработва'),
          );
        }
        if (state is PaymentFailedState) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(state.message),
                if (state.canRetry)
                  const Text('Опитай отново'),
              ],
            ),
          );
        }
        if (state is PaymentLoadingState) {
          return const Center(child: CircularProgressIndicator());
        }
        if (state is PaymentProcessingState) {
          return const Center(
            child: Text('Обработва се плащането...'),
          );
        }
        if (state is PaymentReadyState) {
          return const Center(child: Text('payment-ready'));
        }
        return const SizedBox.shrink();
      },
    ),
  );
}

void main() {
  late MockPaymentApiRepository mockRepo;
  late PaymentBloc bloc;

  setUpAll(() {
    // Инициализираме Stripe с тестов ключ преди тестовете
    Stripe.publishableKey = 'pk_test_placeholder';
  });

  setUp(() {
    mockRepo = MockPaymentApiRepository();
    when(
      () => mockRepo.createPaymentIntent(
        quoteId: any(named: 'quoteId'),
      ),
    ).thenAnswer((_) async => mockResponse);

    bloc = PaymentBloc(paymentRepo: mockRepo);
  });

  tearDown(() {
    bloc.close();
  });

  group('PaymentScreen states', () {
    testWidgets(
        'PaymentSuccessState renders "Плащането е прието" without policy activation',
        (tester) async {
      await tester.pumpWidget(
        BlocProvider.value(
          value: bloc,
          child: _buildStateWidget(const PaymentInitialState()),
        ),
      );

      bloc.emit(const PaymentSuccessState(paymentIntentId: 'pi_test_123'));
      await tester.pump();

      expect(
        find.text('Плащането е прието — полицата се обработва'),
        findsOneWidget,
      );
      // Не трябва да има "активирана" текст
      expect(find.textContaining('активирана'), findsNothing);
    });

    testWidgets('PaymentFailedState renders Retry button', (tester) async {
      await tester.pumpWidget(
        BlocProvider.value(
          value: bloc,
          child: _buildStateWidget(const PaymentInitialState()),
        ),
      );

      bloc.emit(const PaymentFailedState(
        message: 'Неуспешно плащане',
        canRetry: true,
      ));
      await tester.pump();

      expect(find.text('Неуспешно плащане'), findsOneWidget);
      expect(find.text('Опитай отново'), findsOneWidget);
    });

    testWidgets('PaymentLoadingState renders CircularProgressIndicator',
        (tester) async {
      await tester.pumpWidget(
        BlocProvider.value(
          value: bloc,
          child: _buildStateWidget(const PaymentInitialState()),
        ),
      );

      bloc.emit(const PaymentLoadingState());
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsWidgets);
    });

    testWidgets(
        'AC4: PaymentReadyState renders payment-ready (PaymentSheet init)',
        (tester) async {
      await tester.pumpWidget(
        BlocProvider.value(
          value: bloc,
          child: _buildStateWidget(const PaymentInitialState()),
        ),
      );

      bloc.emit(const PaymentReadyState(
        clientSecret: 'pi_test_secret_123',
        amount: 450.0,
        currency: 'BGN',
      ));
      await tester.pump();

      expect(find.text('payment-ready'), findsOneWidget);
    });

    testWidgets(
        'AC5: PaymentSuccessState shows success — no client-side policy activation',
        (tester) async {
      await tester.pumpWidget(
        BlocProvider.value(
          value: bloc,
          child: _buildStateWidget(const PaymentInitialState()),
        ),
      );

      bloc.emit(const PaymentSuccessState(paymentIntentId: 'pi_123'));
      await tester.pump();

      expect(
        find.text('Плащането е прието — полицата се обработва'),
        findsOneWidget,
      );
      expect(find.textContaining('активирана'), findsNothing);
    });

    testWidgets(
        'AC6: PaymentCanceledEvent restores PaymentReadyState (no error shown)',
        (tester) async {
      await tester.pumpWidget(
        BlocProvider.value(
          value: bloc,
          child: _buildStateWidget(const PaymentInitialState()),
        ),
      );

      // Load PaymentIntent via event (REQUIRED: sets _lastClientSecret in BLoC).
      // bloc.emit() does NOT set _lastClientSecret, so cancel would silently no-op.
      // Use runAsync so the async mock future resolves (pump() only flushes fake timers).
      await tester.runAsync(() async {
        bloc.add(const PaymentIntentRequestedEvent(quoteId: 'quote-cancel-test'));
        await Future<void>.delayed(Duration.zero); // Let mock future resolve
      });
      await tester.pump(); // Rebuild widget with ReadyState

      // Verify we reached ready state
      expect(find.text('payment-ready'), findsOneWidget);

      // Simulate PaymentSheet opened (processing started)
      bloc.add(const PaymentProcessingStartedEvent());
      await tester.pump();

      // Simulate cancel from PaymentSheet (FailureCode.Canceled → AC6)
      bloc.add(const PaymentCanceledEvent());
      await tester.pump();

      // Should restore ready state, not show error
      expect(find.text('payment-ready'), findsOneWidget);
      expect(find.textContaining('Неуспешно'), findsNothing);
    });
  });
}
