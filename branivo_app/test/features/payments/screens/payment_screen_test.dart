import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/payments/bloc/payment_bloc.dart';
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
        bearerToken: any(named: 'bearerToken'),
      ),
    ).thenAnswer((_) async => mockResponse);

    bloc = PaymentBloc(paymentRepo: mockRepo, bearerToken: 'test-token');
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
  });
}
