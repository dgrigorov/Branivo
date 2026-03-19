import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../registration/bloc/registration_bloc.dart';

class RateLimitException implements Exception {
  const RateLimitException({required this.retryAfter});
  final int retryAfter;

  @override
  String toString() => 'RateLimitException: retry_after=$retryAfter';
}

class OtpExpiredException implements Exception {
  const OtpExpiredException();

  @override
  String toString() => 'OtpExpiredException';
}

class ClientAuthRepository {
  ClientAuthRepository({
    required Dio dio,
    required FlutterSecureStorage storage,
  })  : _dio = dio,
        _storage = storage;

  final Dio _dio;
  final FlutterSecureStorage _storage;

  Future<int> requestOtp(String phoneNumber) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/client/request-otp',
        data: {'phone_number': phoneNumber},
      );
      return (response.data!['expires_in'] as num).toInt();
    } on DioException catch (e) {
      if (e.response?.statusCode == 429) {
        final data = e.response?.data as Map<String, dynamic>?;
        final retryAfter = (data?['retry_after'] as num?)?.toInt() ?? 3600;
        throw RateLimitException(retryAfter: retryAfter);
      }
      rethrow;
    }
  }

  Future<ClientUser> verifyOtp(
    String phoneNumber,
    String otpCode, {
    String? sessionId,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/client/verify-otp',
        data: {
          'phone_number': phoneNumber,
          'otp_code': otpCode,
          if (sessionId != null) 'session_id': sessionId,
        },
      );
      final body = response.data!;

      // Persist tokens securely
      await _storage.write(
        key: 'access_token',
        value: body['access_token'] as String,
      );
      await _storage.write(
        key: 'refresh_token',
        value: body['refresh_token'] as String,
      );

      return ClientUser.fromJson(body['user'] as Map<String, dynamic>);
    } on DioException catch (e) {
      if (e.response?.statusCode == 429) {
        final data = e.response?.data as Map<String, dynamic>?;
        final retryAfter = (data?['retry_after'] as num?)?.toInt() ?? 3600;
        throw RateLimitException(retryAfter: retryAfter);
      }
      if (e.response?.statusCode == 422) {
        throw const OtpExpiredException();
      }
      rethrow;
    }
  }
}
