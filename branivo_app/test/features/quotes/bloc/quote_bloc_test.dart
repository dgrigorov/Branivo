import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/quotes/bloc/quote_bloc.dart';
import 'package:branivo_app/features/quotes/bloc/quote_event.dart';
import 'package:branivo_app/features/quotes/bloc/quote_state.dart';
import 'package:branivo_app/features/quotes/data/quote_api_repository.dart';

class MockQuoteApiRepository extends Mock implements QuoteApiRepository {}

const _sessionToken = 'test-session-token';

final _mockOffer = QuoteOffer(
  id: 'offer-id-1',
  insurerCode: 'allianz',
  insurerName: 'Allianz Bulgaria',
  price: 450,
  currency: 'BGN',
  score: 0.75,
  isRecommended: true,
  status: 'success',
  extras: {},
  paymentOptions: [],
);

final _mockSession = QuoteSession(
  sessionToken: _sessionToken,
  offers: [_mockOffer],
  status: 'complete',
  requestedAt: '2026-03-20T10:00:00Z',
);

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

  group('QuoteLoadRequestedEvent', () {
    test('emits Loading then Loaded on success', () async {
      when(
        () => mockRepository.createQuoteRequest(
          sessionToken: _sessionToken,
          vehicleData: null,
        ),
      ).thenAnswer((_) async => _mockSession);

      bloc.add(const QuoteLoadRequestedEvent(sessionToken: _sessionToken));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<QuoteLoadingState>(),
          isA<QuoteLoadedState>(),
        ]),
      );

      final loaded = bloc.state as QuoteLoadedState;
      expect(loaded.offers, hasLength(1));
      expect(loaded.recommendedOffer?.insurerCode, equals('allianz'));
    });

    test('emits Loading then Error on API failure', () async {
      when(
        () => mockRepository.createQuoteRequest(
          sessionToken: _sessionToken,
          vehicleData: null,
        ),
      ).thenThrow(Exception('Network error'));

      bloc.add(const QuoteLoadRequestedEvent(sessionToken: _sessionToken));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<QuoteLoadingState>(),
          isA<QuoteErrorState>(),
        ]),
      );
    });

    test('emits QuoteLoadedState with only successful offers', () async {
      final partialSession = QuoteSession(
        sessionToken: _sessionToken,
        offers: [
          _mockOffer,
          QuoteOffer(
            id: 'offer-2',
            insurerCode: 'generali',
            insurerName: 'Generali',
            price: null,
            currency: 'BGN',
            score: null,
            isRecommended: false,
            status: 'error',
            extras: {},
            paymentOptions: [],
            errorReason: 'unavailable',
          ),
        ],
        status: 'complete',
        requestedAt: '2026-03-20T10:00:00Z',
      );

      when(
        () => mockRepository.createQuoteRequest(
          sessionToken: _sessionToken,
          vehicleData: null,
        ),
      ).thenAnswer((_) async => partialSession);

      bloc.add(const QuoteLoadRequestedEvent(sessionToken: _sessionToken));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<QuoteLoadingState>(),
          isA<QuoteLoadedState>(),
        ]),
      );

      final loaded = bloc.state as QuoteLoadedState;
      expect(loaded.offers, hasLength(2));
    });
  });

  group('QuoteRefreshRequestedEvent', () {
    test('emits Loading then Loaded', () async {
      when(
        () => mockRepository.getQuotesBySession(_sessionToken),
      ).thenAnswer((_) async => _mockSession);

      bloc.add(const QuoteRefreshRequestedEvent(sessionToken: _sessionToken));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<QuoteLoadingState>(),
          isA<QuoteLoadedState>(),
        ]),
      );
    });
  });
}
