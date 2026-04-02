import 'package:dio/dio.dart';

// Mock quotes — застрахователите нямат API ключове все още
const _mockQuotes = true; // TODO: set to false when insurer keys are added

double _round2(double n) => (n * 100).roundToDouble() / 100;

class QuoteInstallment {
  const QuoteInstallment({required this.number, required this.amountBgn});

  factory QuoteInstallment.fromJson(Map<String, dynamic> json) =>
      QuoteInstallment(
        number: json['number'] as int,
        amountBgn: (json['amountBgn'] as num).toDouble(),
      );

  final int number;
  final double amountBgn;
}

class QuotePaymentOption {
  const QuotePaymentOption({
    required this.installmentCount,
    required this.installments,
    required this.totalBgn,
  });

  factory QuotePaymentOption.fromJson(Map<String, dynamic> json) {
    final rawList = json['installments'] as List<dynamic>? ?? [];
    return QuotePaymentOption(
      installmentCount: json['installmentCount'] as int,
      installments: rawList
          .map((i) => QuoteInstallment.fromJson(i as Map<String, dynamic>))
          .toList(),
      totalBgn: (json['totalBgn'] as num).toDouble(),
    );
  }

  final int installmentCount;
  final List<QuoteInstallment> installments;
  final double totalBgn;

  QuoteInstallment? get firstInstallment =>
      installments.isNotEmpty ? installments.first : null;
}

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
    this.paymentOptions = const [],
    this.errorReason,
  });

  factory QuoteOffer.fromJson(Map<String, dynamic> json) {
    final rawOptions = json['paymentOptions'] as List<dynamic>? ?? [];
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
      paymentOptions: rawOptions
          .map((o) => QuotePaymentOption.fromJson(o as Map<String, dynamic>))
          .toList(),
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
  final List<QuotePaymentOption> paymentOptions;
  final String? errorReason;

  QuotePaymentOption? optionFor(int count) =>
      paymentOptions.where((o) => o.installmentCount == count).firstOrNull;
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
    if (_mockQuotes) {
      await Future<void>.delayed(const Duration(milliseconds: 600));
      return _buildMockSession(sessionToken);
    }
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
    if (_mockQuotes) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      return _buildMockSession(sessionToken);
    }
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/v1/quotes/$sessionToken',
      options: Options(headers: {'X-Session-Token': sessionToken}),
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return QuoteSession.fromJson(data);
  }

  // Реални данни от Boleron API (carNo=AA0000BB, yearsExperience=11)
  static QuoteSession _buildMockSession(String sessionToken) {
    return QuoteSession(
      sessionToken: sessionToken,
      status: 'complete',
      requestedAt: DateTime.now().toIso8601String(),
      offers: [
        // Сортирани по цена: Bulstrad е най-евтин
        QuoteOffer(
          id: 'mock-offer-bulstrad',
          insurerCode: 'bulstrad',
          insurerName: 'Булстрад Виена',
          price: 202.08,
          currency: 'BGN',
          score: 0.88,
          isRecommended: true,
          status: 'success',
          extras: const {'roadside_assistance': true, 'green_card': true},
          paymentOptions: _buildBoleronOptions(
            single: 202.08,
            twoFirst: 103.32, twoSecond: 98.76,
            fourFirst: 55.15, fourOthers: 49.02, fourLast: 48.89,
          ),
        ),
        QuoteOffer(
          id: 'mock-offer-allianz',
          insurerCode: 'allianz',
          insurerName: 'Алианц България',
          price: 184.15,
          currency: 'BGN',
          score: 0.85,
          isRecommended: false,
          status: 'success',
          extras: const {'roadside_assistance': true, 'green_card': true},
          paymentOptions: _buildBoleronOptions(
            single: 184.15,
            twoFirst: 96.72, twoSecond: 87.43,
            fourFirst: 53.00, fourOthers: 46.27, fourLast: 46.27,
          ),
        ),
        QuoteOffer(
          id: 'mock-offer-ozk',
          insurerCode: 'ozk',
          insurerName: 'ОЗК Застраховане',
          price: 356.86,
          currency: 'BGN',
          score: 0.74,
          isRecommended: false,
          status: 'success',
          extras: const {'green_card': true},
          paymentOptions: _buildBoleronOptions(
            single: 356.86,
            twoFirst: 187.29, twoSecond: 170.67,
            fourFirst: 103.50, fourOthers: 86.88, fourLast: 82.89,
          ),
        ),
        QuoteOffer(
          id: 'mock-offer-generali',
          insurerCode: 'generali',
          insurerName: 'Дженерали Застраховане',
          price: 373.56,
          currency: 'BGN',
          score: 0.72,
          isRecommended: false,
          status: 'success',
          extras: const {'green_card': true, 'roadside_assistance': true},
          paymentOptions: _buildBoleronOptions(
            single: 373.56,
            twoFirst: 197.64, twoSecond: 181.01,
            fourFirst: 107.18, fourOthers: 90.50, fourLast: 90.48,
          ),
        ),
        QuoteOffer(
          id: 'mock-offer-euroins',
          insurerCode: 'euroins',
          insurerName: 'Евроинс Иншурънс',
          price: 389.09,
          currency: 'BGN',
          score: 0.70,
          isRecommended: false,
          status: 'success',
          extras: const {'green_card': true},
          paymentOptions: _buildBoleronOptions(
            single: 389.09,
            twoFirst: 203.46, twoSecond: 186.82,
            fourFirst: 110.62, fourOthers: 94.02, fourLast: 94.02,
          ),
        ),
        QuoteOffer(
          id: 'mock-offer-uniqa',
          insurerCode: 'uniqa',
          insurerName: 'УНИКА България',
          price: 475.19,
          currency: 'BGN',
          score: 0.65,
          isRecommended: false,
          status: 'success',
          extras: const {'green_card': true},
          paymentOptions: _buildBoleronOptions(
            single: 475.19,
            twoFirst: 249.33, twoSecond: 232.04,
            fourFirst: 134.89, fourOthers: 117.56, fourLast: 117.53,
          ),
        ),
        QuoteOffer(
          id: 'mock-offer-bulins',
          insurerCode: 'bulins',
          insurerName: 'Булинс АД',
          price: 357.00,
          currency: 'BGN',
          score: 0.68,
          isRecommended: false,
          status: 'success',
          extras: const {'green_card': true},
          paymentOptions: _buildBoleronOptions(
            single: 357.00,
            twoFirst: 187.29, twoSecond: 169.71,
            fourFirst: 98.00, fourOthers: 87.00, fourLast: 85.00,
          ),
        ),
        QuoteOffer(
          id: 'mock-offer-dzi',
          insurerCode: 'dzi',
          insurerName: 'ДЗИ Общо Застраховане',
          price: 581.08,
          currency: 'BGN',
          score: 0.60,
          isRecommended: false,
          status: 'success',
          extras: const {'green_card': true, 'roadside_assistance': true},
          paymentOptions: _buildBoleronOptions(
            single: 581.08,
            twoFirst: 300.00, twoSecond: 281.08,
            fourFirst: 158.00, fourOthers: 141.00, fourLast: 141.08,
          ),
        ),
      ],
    );
  }
}

List<QuotePaymentOption> _buildBoleronOptions({
  required double single,
  required double twoFirst,
  required double twoSecond,
  required double fourFirst,
  required double fourOthers,
  required double fourLast,
}) {
  return [
    QuotePaymentOption(
      installmentCount: 1,
      installments: [QuoteInstallment(number: 1, amountBgn: single)],
      totalBgn: single,
    ),
    QuotePaymentOption(
      installmentCount: 2,
      installments: [
        QuoteInstallment(number: 1, amountBgn: twoFirst),
        QuoteInstallment(number: 2, amountBgn: twoSecond),
      ],
      totalBgn: _round2(twoFirst + twoSecond),
    ),
    QuotePaymentOption(
      installmentCount: 4,
      installments: [
        QuoteInstallment(number: 1, amountBgn: fourFirst),
        QuoteInstallment(number: 2, amountBgn: fourOthers),
        QuoteInstallment(number: 3, amountBgn: fourOthers),
        QuoteInstallment(number: 4, amountBgn: fourLast),
      ],
      totalBgn: _round2(fourFirst + fourOthers * 2 + fourLast),
    ),
  ];
}
