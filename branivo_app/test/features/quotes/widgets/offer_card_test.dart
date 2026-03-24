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
  errorReason: 'unavailable',
);

Widget _buildWidget(
  QuoteOffer offer, {
  bool isRecommended = false,
  String? recommendReason,
}) {
  return MaterialApp(
    home: Scaffold(
      body: OfferCard(
        offer: offer,
        isRecommended: isRecommended,
        recommendReason: recommendReason,
      ),
    ),
  );
}

void main() {
  group('OfferCard', () {
    testWidgets('renders recommended badge when isRecommended is true', (tester) async {
      await tester.pumpWidget(_buildWidget(_successOffer, isRecommended: true));

      expect(find.text('⭐ Препоръчано'), findsOneWidget);
    });

    testWidgets('does not render badge when isRecommended is false', (tester) async {
      await tester.pumpWidget(_buildWidget(_successOffer));

      expect(find.text('⭐ Препоръчано'), findsNothing);
    });

    testWidgets('renders "Временно недостъпен" for error status', (tester) async {
      await tester.pumpWidget(_buildWidget(_errorOffer));

      expect(find.textContaining('Временно недостъпен'), findsOneWidget);
    });

    testWidgets('Semantics label contains insurer name', (tester) async {
      await tester.pumpWidget(_buildWidget(_successOffer, isRecommended: true));

      final semantics = tester.getSemantics(find.byType(OfferCard));
      expect(semantics.label, contains('Allianz Bulgaria'));
    });

    testWidgets('renders price for success offer', (tester) async {
      await tester.pumpWidget(_buildWidget(_successOffer));

      expect(find.textContaining('450.00'), findsOneWidget);
    });

    testWidgets('renders recommendReason subtitle when recommended and reason provided',
        (tester) async {
      await tester.pumpWidget(_buildWidget(
        _successOffer,
        isRecommended: true,
        recommendReason: 'Най-добра комбинация',
      ));

      expect(find.text('Най-добра комбинация'), findsOneWidget);
    });

    testWidgets('does not render recommendReason when not recommended', (tester) async {
      await tester.pumpWidget(_buildWidget(
        _successOffer,
        isRecommended: false,
        recommendReason: 'Най-добра комбинация',
      ));

      expect(find.text('Най-добра комбинация'), findsNothing);
    });

    testWidgets('does not render subtitle when recommendReason is null', (tester) async {
      await tester.pumpWidget(_buildWidget(
        _successOffer,
        isRecommended: true,
      ));

      // Badge is shown but no reason subtitle
      expect(find.text('⭐ Препоръчано'), findsOneWidget);
    });
  });
}
