import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/quote_api_repository.dart';
import 'quote_event.dart';
import 'quote_state.dart';

class QuoteBloc extends Bloc<QuoteEvent, QuoteState> {
  QuoteBloc({required QuoteApiRepository repository})
      : _repository = repository,
        super(const QuoteInitialState()) {
    on<QuoteLoadRequestedEvent>(_onLoadRequested);
    on<QuoteRefreshRequestedEvent>(_onRefreshRequested);
  }

  final QuoteApiRepository _repository;

  Future<void> _onLoadRequested(
    QuoteLoadRequestedEvent event,
    Emitter<QuoteState> emit,
  ) async {
    emit(const QuoteLoadingState());
    try {
      final session = await _repository.createQuoteRequest(
        sessionToken: event.sessionToken,
        vehicleData: event.vehicleData,
      );

      final recommended = session.offers.where((o) => o.isRecommended).firstOrNull;
      final pendingCount = session.offers.where((o) => o.status == 'pending').length;

      if (pendingCount > 0) {
        emit(QuotePartialState(
          offers: session.offers,
          pendingCount: pendingCount,
        ));
      } else {
        emit(QuoteLoadedState(
          offers: session.offers,
          recommendedOffer: recommended,
        ));
      }
    } catch (e) {
      emit(QuoteErrorState(message: e.toString()));
    }
  }

  Future<void> _onRefreshRequested(
    QuoteRefreshRequestedEvent event,
    Emitter<QuoteState> emit,
  ) async {
    emit(const QuoteLoadingState());
    try {
      final session = await _repository.getQuotesBySession(event.sessionToken);
      final recommended = session.offers.where((o) => o.isRecommended).firstOrNull;

      emit(QuoteLoadedState(
        offers: session.offers,
        recommendedOffer: recommended,
      ));
    } catch (e) {
      emit(QuoteErrorState(message: e.toString()));
    }
  }
}
