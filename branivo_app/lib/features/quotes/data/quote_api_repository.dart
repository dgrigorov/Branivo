import 'package:dio/dio.dart';

class VehicleData {
  const VehicleData({
    required this.vin,
    required this.licensePlate,
    required this.make,
    required this.model,
    required this.year,
  });

  final String vin;
  final String licensePlate;
  final String make;
  final String model;
  final int year;

  Map<String, dynamic> toJson() => {
        'vin': vin,
        'licensePlate': licensePlate,
        'make': make,
        'model': model,
        'year': year,
      };
}

class QuoteOffer {
  const QuoteOffer({
    required this.id,
    required this.insurerCode,
    required this.insurerName,
    required this.price,
    required this.currency,
    required this.score,
    required this.isRecommended,
    required this.status,
    required this.extras,
    this.errorReason,
  });

  factory QuoteOffer.fromJson(Map<String, dynamic> json) {
    return QuoteOffer(
      id: json['id'] as String,
      insurerCode: json['insurerCode'] as String,
      insurerName: json['insurerName'] as String,
      price: json['price'] != null ? (json['price'] as num).toDouble() : null,
      currency: json['currency'] as String? ?? 'BGN',
      score: json['score'] != null ? (json['score'] as num).toDouble() : null,
      isRecommended: json['isRecommended'] as bool? ?? false,
      status: json['status'] as String,
      extras: json['extras'] as Map<String, dynamic>? ?? {},
      errorReason: json['errorReason'] as String?,
    );
  }

  final String id;
  final String insurerCode;
  final String insurerName;
  final double? price;
  final String currency;
  final double? score;
  final bool isRecommended;
  final String status;
  final Map<String, dynamic> extras;
  final String? errorReason;
}

class QuoteSession {
  const QuoteSession({
    required this.sessionToken,
    required this.offers,
    required this.status,
    required this.requestedAt,
  });

  factory QuoteSession.fromJson(Map<String, dynamic> json) {
    final offersJson = json['offers'] as List<dynamic>? ?? [];
    return QuoteSession(
      sessionToken: json['sessionToken'] as String,
      offers: offersJson
          .map((o) => QuoteOffer.fromJson(o as Map<String, dynamic>))
          .toList(),
      status: json['status'] as String,
      requestedAt: json['requestedAt'] as String,
    );
  }

  final String sessionToken;
  final List<QuoteOffer> offers;
  final String status;
  final String requestedAt;
}

class QuoteApiRepository {
  QuoteApiRepository({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<QuoteSession> createQuoteRequest({
    required String sessionToken,
    VehicleData? vehicleData,
  }) async {
    final body = <String, dynamic>{'sessionToken': sessionToken};
    if (vehicleData != null) body['vehicleData'] = vehicleData.toJson();

    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/quotes',
      data: body,
      options: Options(headers: {'X-Session-Token': sessionToken}),
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return QuoteSession.fromJson(data);
  }

  Future<QuoteSession> getQuotesBySession(String sessionToken) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/v1/quotes/$sessionToken',
      options: Options(headers: {'X-Session-Token': sessionToken}),
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return QuoteSession.fromJson(data);
  }
}
