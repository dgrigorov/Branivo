import 'package:dio/dio.dart';

class PaymentIntentResponse {
  final String clientSecret;
  final String paymentId;
  final double amount;
  final String currency;

  const PaymentIntentResponse({
    required this.clientSecret,
    required this.paymentId,
    required this.amount,
    required this.currency,
  });

  factory PaymentIntentResponse.fromJson(Map<String, dynamic> json) {
    return PaymentIntentResponse(
      clientSecret: json['clientSecret'] as String,
      paymentId: json['paymentId'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
    );
  }
}

class PaymentApiRepository {
  final Dio _dio;

  const PaymentApiRepository({required Dio dio}) : _dio = dio;

  Future<PaymentIntentResponse> createPaymentIntent({
    required String quoteId,
    required String bearerToken,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/payments/intent',
      data: {'quoteId': quoteId},
      options: Options(
        headers: {'Authorization': 'Bearer $bearerToken'},
      ),
    );
    return PaymentIntentResponse.fromJson(
      response.data!,
    );
  }
}
