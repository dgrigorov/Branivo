import 'package:dio/dio.dart';

class SessionUnavailableException implements Exception {
  const SessionUnavailableException(this.message);

  final String message;

  @override
  String toString() => 'SessionUnavailableException: $message';
}

class AnonSessionData {
  const AnonSessionData({
    required this.sessionId,
    required this.tenantId,
    required this.createdAt,
    this.vehicleData,
    this.selectedQuoteId,
  });

  final String sessionId;
  final String tenantId;
  final String createdAt;
  final Map<String, dynamic>? vehicleData;
  final String? selectedQuoteId;

  factory AnonSessionData.fromJson(Map<String, dynamic> json) {
    return AnonSessionData(
      sessionId: json['session_id'] as String,
      tenantId: json['tenant_id'] as String,
      createdAt: json['created_at'] as String,
      vehicleData: json['vehicle_data'] as Map<String, dynamic>?,
      selectedQuoteId: json['selected_quote_id'] as String?,
    );
  }
}

class AnonymousSessionRepository {
  AnonymousSessionRepository({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<String> createSession() async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/sessions/anonymous',
      );
      return response.data!['session_id'] as String;
    } on DioException catch (e) {
      if (e.response?.statusCode == 503) {
        throw const SessionUnavailableException(
          'Временно изискваме регистрация',
        );
      }
      rethrow;
    }
  }

  Future<AnonSessionData?> getSession(String sessionId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/v1/sessions/anonymous/$sessionId',
      );
      return AnonSessionData.fromJson(response.data!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      if (e.response?.statusCode == 503) {
        throw const SessionUnavailableException(
          'Временно изискваме регистрация',
        );
      }
      rethrow;
    }
  }

  Future<void> updateSession(
    String sessionId,
    Map<String, dynamic> data,
  ) async {
    try {
      await _dio.put<void>(
        '/api/v1/sessions/anonymous/$sessionId/data',
        data: data,
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 503) {
        throw const SessionUnavailableException(
          'Временно изискваме регистрация',
        );
      }
      rethrow;
    }
  }

  Future<void> migrateSession(String sessionId, String userId) async {
    try {
      await _dio.post<void>(
        '/api/v1/sessions/anonymous/$sessionId/migrate',
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 503) {
        throw const SessionUnavailableException(
          'Временно изискваме регистрация',
        );
      }
      rethrow;
    }
  }
}
