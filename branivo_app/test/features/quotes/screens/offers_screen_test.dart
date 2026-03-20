import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/quotes/screens/offers_screen.dart';
import 'package:branivo_app/features/quotes/bloc/quote_bloc.dart';
import 'package:branivo_app/features/quotes/bloc/quote_state.dart';
import 'package:branivo_app/features/quotes/data/quote_api_repository.dart';
import 'package:branivo_app/features/quotes/widgets/offer_card.dart';

class MockQuoteApiRepository extends Mock implements QuoteApiRepository {}

final _offer = QuoteOffer(
  id: 'offer-1',
  insurerCode: 'allianz',
  insurerName: 'Allianz Bulgaria',
  price: 450,
  currency: 'BGN',
  score: 0.75,
  isRecommended: true,
  status: 'success',
  extras: {},
);

Widget _buildTestWidget(QuoteBloc bloc) {
  return MaterialApp(
    home: BlocProvider.value(
      value: bloc,
      child: const OffersScreen(sessionToken: 'test-session'),
    ),
  );
}

void main() {
  late MockQuoteApiRepository mockRepository;
  late QuoteBloc bloc;

  setUp(() {
    mockRepository = MockQuoteApiRepository();
    bloc = QuoteBloc(repository: mockRepository);
  });

  tearDown(() {
    bloc.close();
  });

  group('OffersScreen', () {
    testWidgets('shows skeleton (OfferCardSkeleton) when loading', (tester) async {
      await tester.pumpWidget(_buildTestWidget(bloc));
      // Initial state is QuoteInitialState → shows skeleton
      expect(find.byType(OfferCardSkeleton), findsWidgets);
    });

    testWidgets('renders offer cards when QuoteLoadedState', (tester) async {
      final loadedBloc = QuoteBloc(repository: mockRepository);

      await tester.pumpWidget(_buildTestWidget(loadedBloc));

      loadedBloc.emit(QuoteLoadedState(offers: [_offer], recommendedOffer: _offer));
      await tester.pump();

      expect(find.byType(OfferCard), findsOneWidget);
    });
  });
}
