import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:branivo_app/features/quotes/widgets/offer_card.dart';
import 'package:branivo_app/features/quotes/data/quote_api_repository.dart';

final _successOffer = QuoteOffer(
  id: 'offer-1',
  insurerCode: 'allianz',
  insurerName: 'Allianz Bulgaria',
  price: 450,
  currency: 'BGN',
  score: 0.75,
  isRecommended: false,
  status: 'success',
  extras: {},
  paymentOptions: [],
);

final _errorOffer = QuoteOffer(
  id: 'offer-2',
  insurerCode: 'generali',
  insurerName: 'Generali Bulgaria',
  price: null,
  currency: 'BGN',
  score: null,
  isRecommended: false,
  status: 'error',
  extras: {},
  paymentOptions: [],
  errorReason: 'unavailable',
);

Widget _buildWidget(
  QuoteOffer offer, {
  bool isRecommended = false,
  int selectedInstallmentCount = 1,
}) {
  return MaterialApp(
    home: Scaffold(
      body: OfferCard(
        offer: offer,
        isRecommended: isRecommended,
        selectedInstallmentCount: selectedInstallmentCount,
      ),
    ),
  );
}

void main() {
  group('OfferCard', () {
    testWidgets('renders recommended badge when isRecommended is true',
        (tester) async {
      await tester.pumpWidget(_buildWidget(_successOffer, isRecommended: true));

      expect(find.text('Препоръчано'), findsOneWidget);
    });

    testWidgets('does not render badge when isRecommended is false',
        (tester) async {
      await tester.pumpWidget(_buildWidget(_successOffer));

      expect(find.text('Препоръчано'), findsNothing);
    });

    testWidgets('renders "Временно недостъпен" for error status',
        (tester) async {
      await tester.pumpWidget(_buildWidget(_errorOffer));

      expect(find.textContaining('Временно недостъпен'), findsOneWidget);
    });

    testWidgets('Semantics label contains insurer name', (tester) async {
      await tester.pumpWidget(_buildWidget(_successOffer, isRecommended: true));

      final semantics = tester.getSemantics(find.byType(OfferCard));
      expect(semantics.label, contains('Allianz Bulgaria'));
    });

    testWidgets('renders total price for single installment', (tester) async {
      await tester.pumpWidget(_buildWidget(_successOffer));

      expect(find.textContaining('450.00'), findsOneWidget);
    });

    testWidgets('renders installment rows for 2-installment tab', (tester) async {
      final offer = QuoteOffer(
        id: 'offer-3',
        insurerCode: 'allianz',
        insurerName: 'Allianz Bulgaria',
        price: 200,
        currency: 'BGN',
        score: 0.8,
        isRecommended: false,
        status: 'success',
        extras: {},
        paymentOptions: [
          QuotePaymentOption(
            installmentCount: 2,
            installments: [
              QuoteInstallment(number: 1, amountBgn: 106.08),
              QuoteInstallment(number: 2, amountBgn: 93.92),
            ],
            totalBgn: 200.0,
          ),
        ],
      );

      await tester
          .pumpWidget(_buildWidget(offer, selectedInstallmentCount: 2));

      expect(find.textContaining('1-ва'), findsOneWidget);
      expect(find.textContaining('2-ра'), findsOneWidget);
      expect(find.textContaining('200.00 лв. общо'), findsOneWidget);
    });
  });
}
