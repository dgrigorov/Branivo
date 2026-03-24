import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:branivo_app/features/payments/screens/policy_confirmation_screen.dart';

Widget _buildWidget({
  String insurerName = 'Allianz Bulgaria',
  double amount = 450.0,
  String currency = 'BGN',
  String paymentIntentId = 'pi_test_abc123',
}) {
  return MaterialApp(
    home: PolicyConfirmationScreen(
      insurerName: insurerName,
      amount: amount,
      currency: currency,
      paymentIntentId: paymentIntentId,
    ),
  );
}

void main() {
  group('PolicyConfirmationScreen', () {
    testWidgets('renders success header text', (tester) async {
      await tester.pumpWidget(_buildWidget());

      expect(find.text('Плащането е прието!'), findsOneWidget);
    });

    testWidgets('renders insurer name in header', (tester) async {
      await tester.pumpWidget(_buildWidget());

      expect(find.textContaining('Allianz Bulgaria'), findsAtLeastNWidgets(1));
    });

    testWidgets('renders policy details card with amount', (tester) async {
      await tester.pumpWidget(_buildWidget());

      expect(find.text('450.00 BGN'), findsOneWidget);
    });

    testWidgets('renders loyalty banner for non-zero points', (tester) async {
      await tester.pumpWidget(_buildWidget(amount: 450.0));

      expect(find.textContaining('+45 точки очаквани'), findsOneWidget);
    });

    testWidgets('renders Изтегли PDF button', (tester) async {
      await tester.pumpWidget(_buildWidget());

      expect(find.text('Изтегли PDF'), findsOneWidget);
    });

    testWidgets('renders Към начало button', (tester) async {
      await tester.pumpWidget(_buildWidget());

      expect(find.text('Към начало'), findsOneWidget);
    });

    testWidgets('does not render loyalty banner when amount is very small',
        (tester) async {
      await tester.pumpWidget(_buildWidget(amount: 0.5));

      expect(find.textContaining('точки'), findsNothing);
    });

    testWidgets('renders status В обработка in details', (tester) async {
      await tester.pumpWidget(_buildWidget());

      expect(find.text('В обработка'), findsOneWidget);
    });

    testWidgets('PDF button shows snackbar on tap', (tester) async {
      await tester.pumpWidget(_buildWidget());

      await tester.tap(find.text('Изтегли PDF'));
      await tester.pump();

      expect(
        find.textContaining('PDF ще бъде готов'),
        findsOneWidget,
      );
    });
  });
}
