import '../data/quote_api_repository.dart';

abstract class QuoteState {
  const QuoteState();
}

class QuoteInitialState extends QuoteState {
  const QuoteInitialState();
}

class QuoteLoadingState extends QuoteState {
  const QuoteLoadingState();
}

class QuoteLoadedState extends QuoteState {
  const QuoteLoadedState({
    required this.offers,
    this.recommendedOffer,
  });

  final List<QuoteOffer> offers;
  final QuoteOffer? recommendedOffer;
}

class QuotePartialState extends QuoteState {
  const QuotePartialState({
    required this.offers,
    required this.pendingCount,
  });

  final List<QuoteOffer> offers;
  final int pendingCount;
}

class QuoteErrorState extends QuoteState {
  const QuoteErrorState({required this.message});

  final String message;
}
