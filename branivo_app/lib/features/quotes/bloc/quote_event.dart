import '../data/quote_api_repository.dart';

abstract class QuoteEvent {
  const QuoteEvent();
}

class QuoteLoadRequestedEvent extends QuoteEvent {
  const QuoteLoadRequestedEvent({
    required this.sessionToken,
    this.vehicleData,
  });

  final String sessionToken;
  final VehicleData? vehicleData;
}

class QuoteRefreshRequestedEvent extends QuoteEvent {
  const QuoteRefreshRequestedEvent({required this.sessionToken});

  final String sessionToken;
}
