import 'dart:async';
import 'package:dio/dio.dart';
import '../../../../core/api/endpoints.dart';
import '../data/repositories/ocr_models.dart';

/// Calls the backend enrichment endpoint and parses the result.
/// The endpoint runs existing policy check (blocking) + parallel KAT/GF/NHTSA.
class OcrEnrichmentService {
  OcrEnrichmentService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  static const _enrichTimeout = Duration(seconds: 5);

  /// Fetches enrichment data for the given vehicle identifiers.
  /// Returns an [OcrEnrichmentResult] with whatever data arrived within timeout.
  Future<OcrEnrichmentResult> enrich({
    required String? regNumber,
    required String? vin,
    required String sessionToken,
  }) async {
    final start = DateTime.now();

    try {
      final params = <String, String>{
        'fields': 'kat,gf,nhtsa',
        if (regNumber != null && regNumber.isNotEmpty) 'reg_number': regNumber,
        if (vin != null && vin.isNotEmpty) 'vin': vin,
      };

      final response = await _dio.get<Map<String, dynamic>>(
        ApiEndpoints.vehicleEnrich,
        queryParameters: params,
        options: Options(
          receiveTimeout: _enrichTimeout,
          headers: {'X-Session-Token': sessionToken},
        ),
      );

      final durationMs = DateTime.now().difference(start).inMilliseconds;
      final data = response.data ?? {};
      data['duration_ms'] = durationMs;

      return OcrEnrichmentResult.fromJson(data);
    } on DioException {
      final durationMs = DateTime.now().difference(start).inMilliseconds;
      return OcrEnrichmentResult(
        durationMs: durationMs,
        gf: const GfResult(timedOut: true),
      );
    }
  }

  /// Fire-and-forget OCR scan log — does NOT block the UX.
  /// Never passes BuildContext into this method.
  Future<void> logScan(OcrLogPayload payload, String sessionToken) async {
    try {
      await _dio.post<void>(
        ApiEndpoints.ocrLog,
        data: payload.toJson(),
        options: Options(
          headers: {'X-Session-Token': sessionToken},
          sendTimeout: const Duration(seconds: 5),
        ),
      );
    } catch (_) {
      // Best-effort — analytics logging must never affect UX
    }
  }
}
