enum BulkVehicleQuoteStatus { success, partial, failed }

extension BulkVehicleQuoteStatusExtension on BulkVehicleQuoteStatus {
  static BulkVehicleQuoteStatus fromString(String value) {
    switch (value) {
      case 'success':
        return BulkVehicleQuoteStatus.success;
      case 'partial':
        return BulkVehicleQuoteStatus.partial;
      case 'failed':
      default:
        return BulkVehicleQuoteStatus.failed;
    }
  }
}

class QuoteOffer {
  static const String statusSuccess = 'success';
  static const String statusError = 'error';

  final String id;
  final String insurerCode;
  final String insurerName;
  final double? price;
  final String currency;
  final bool isRecommended;
  final String status;

  const QuoteOffer({
    required this.id,
    required this.insurerCode,
    required this.insurerName,
    this.price,
    required this.currency,
    required this.isRecommended,
    required this.status,
  });

  factory QuoteOffer.fromJson(Map<String, dynamic> json) {
    return QuoteOffer(
      id: json['id'] as String,
      insurerCode: json['insurerCode'] as String,
      insurerName: json['insurerName'] as String,
      price: (json['price'] as num?)?.toDouble(),
      currency: json['currency'] as String,
      isRecommended: json['isRecommended'] as bool? ?? false,
      status: json['status'] as String? ?? 'error',
    );
  }
}

class VehicleQuoteResult {
  final String vehicleId;
  final String licensePlate;
  final String make;
  final String model;
  final String sessionToken;
  final BulkVehicleQuoteStatus status;
  final List<QuoteOffer> offers;

  const VehicleQuoteResult({
    required this.vehicleId,
    required this.licensePlate,
    required this.make,
    required this.model,
    required this.sessionToken,
    required this.status,
    required this.offers,
  });

  factory VehicleQuoteResult.fromJson(Map<String, dynamic> json) {
    final offersJson = json['offers'] as List<dynamic>? ?? [];
    return VehicleQuoteResult(
      vehicleId: json['vehicleId'] as String,
      licensePlate: json['licensePlate'] as String,
      make: json['make'] as String,
      model: json['model'] as String,
      sessionToken: json['sessionToken'] as String? ?? '',
      status: BulkVehicleQuoteStatusExtension.fromString(
        json['status'] as String? ?? 'failed',
      ),
      offers: offersJson
          .map((e) => QuoteOffer.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class BulkQuoteResponse {
  final List<VehicleQuoteResult> results;

  const BulkQuoteResponse({required this.results});

  factory BulkQuoteResponse.fromJson(Map<String, dynamic> json) {
    final resultsJson = json['results'] as List<dynamic>? ?? [];
    return BulkQuoteResponse(
      results: resultsJson
          .map((e) => VehicleQuoteResult.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class BulkPurchaseItem {
  final String vehicleId;
  final String quoteId;

  const BulkPurchaseItem({required this.vehicleId, required this.quoteId});

  Map<String, dynamic> toJson() => {
        'vehicleId': vehicleId,
        'quoteId': quoteId,
      };
}

class BulkPurchaseSuccessItem {
  final String vehicleId;
  final String quoteId;
  final String clientSecret;
  final String paymentId;

  const BulkPurchaseSuccessItem({
    required this.vehicleId,
    required this.quoteId,
    required this.clientSecret,
    required this.paymentId,
  });

  factory BulkPurchaseSuccessItem.fromJson(Map<String, dynamic> json) {
    return BulkPurchaseSuccessItem(
      vehicleId: json['vehicleId'] as String,
      quoteId: json['quoteId'] as String,
      clientSecret: json['clientSecret'] as String,
      paymentId: json['paymentId'] as String,
    );
  }
}

class BulkPurchaseFailedItem {
  final String vehicleId;
  final String quoteId;
  final String error;

  const BulkPurchaseFailedItem({
    required this.vehicleId,
    required this.quoteId,
    required this.error,
  });

  factory BulkPurchaseFailedItem.fromJson(Map<String, dynamic> json) {
    return BulkPurchaseFailedItem(
      vehicleId: json['vehicleId'] as String,
      quoteId: json['quoteId'] as String,
      error: json['error'] as String,
    );
  }
}

class BulkPurchaseSummary {
  final int total;
  final int succeeded;
  final int failed;

  const BulkPurchaseSummary({
    required this.total,
    required this.succeeded,
    required this.failed,
  });

  factory BulkPurchaseSummary.fromJson(Map<String, dynamic> json) {
    return BulkPurchaseSummary(
      total: json['total'] as int,
      succeeded: json['succeeded'] as int,
      failed: json['failed'] as int,
    );
  }
}

class BulkPurchaseResponse {
  final List<BulkPurchaseSuccessItem> succeeded;
  final List<BulkPurchaseFailedItem> failed;
  final BulkPurchaseSummary summary;

  const BulkPurchaseResponse({
    required this.succeeded,
    required this.failed,
    required this.summary,
  });

  factory BulkPurchaseResponse.fromJson(Map<String, dynamic> json) {
    final succeededJson = json['succeeded'] as List<dynamic>? ?? [];
    final failedJson = json['failed'] as List<dynamic>? ?? [];
    return BulkPurchaseResponse(
      succeeded: succeededJson
          .map(
            (e) => BulkPurchaseSuccessItem.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      failed: failedJson
          .map(
            (e) => BulkPurchaseFailedItem.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      summary: BulkPurchaseSummary.fromJson(
        json['summary'] as Map<String, dynamic>,
      ),
    );
  }
}
