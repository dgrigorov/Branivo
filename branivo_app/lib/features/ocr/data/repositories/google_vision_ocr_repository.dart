import 'package:dio/dio.dart';
import 'package:flutter/painting.dart' show Offset;
import 'package:image_picker/image_picker.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../../../../core/api/endpoints.dart';
import 'ocr_models.dart';
import 'ocr_repository.dart';

class OcrVisionException implements Exception {
  const OcrVisionException(this.message);
  final String message;
  @override
  String toString() => 'OcrVisionException: $message';
}

class OcrOfflineException implements Exception {
  const OcrOfflineException();
  @override
  String toString() => 'OcrOfflineException: no internet connection';
}

/// Server-side Google Vision fallback OCR repository.
/// Uploads full-resolution JPEG images to /api/v1/ocr/vision-scan.
/// Performs 1 retry with 2s exponential backoff on HTTP error.
class GoogleVisionOcrRepository implements OcrRepository {
  GoogleVisionOcrRepository({required Dio dio}) : _dio = dio;

  final Dio _dio;

  static const _timeout = Duration(seconds: 10);

  @override
  Future<OcrScanResponse> scanImages(
    List<XFile> images,
    String sessionToken, {
    List<List<Offset>?>? corners,
  }) async {
    await _checkConnectivity();

    final deadline = DateTime.now().add(_timeout);

    return _attemptScan(images, sessionToken, deadline, attempt: 1);
  }

  Future<OcrScanResponse> _attemptScan(
    List<XFile> images,
    String sessionToken,
    DateTime deadline,
    {required int attempt}
  ) async {
    final remaining = deadline.difference(DateTime.now());
    if (remaining.isNegative) {
      throw const OcrVisionException('Google Vision timeout exceeded');
    }

    try {
      final formData = FormData();
      for (final image in images) {
        final bytes = await image.readAsBytes();
        formData.files.add(MapEntry(
          'images',
          MultipartFile.fromBytes(
            bytes,
            filename: image.name,
            contentType: DioMediaType('image', 'jpeg'),
          ),
        ));
      }
      formData.fields.add(MapEntry('session_token', sessionToken));

      final response = await _dio.post<Map<String, dynamic>>(
        ApiEndpoints.ocrVisionScan,
        data: formData,
        options: Options(
          receiveTimeout: remaining > _timeout ? _timeout : remaining,
          headers: {'X-Session-Token': sessionToken},
        ),
      );

      return OcrScanResponse.fromJson(response.data!);
    } on DioException catch (e) {
      if (attempt < 2) {
        // Only retry if there's at least 2s remaining in the deadline
        final remainingAfterDelay = deadline.difference(
          DateTime.now().add(const Duration(seconds: 2)),
        );
        if (remainingAfterDelay.isNegative) {
          throw OcrVisionException('Vision retry aborted — deadline exceeded: ${e.message}');
        }
        await Future<void>.delayed(const Duration(seconds: 2));
        return _attemptScan(images, sessionToken, deadline, attempt: attempt + 1);
      }
      throw OcrVisionException('Google Vision HTTP error after retry: ${e.message}');
    }
  }

  Future<void> _checkConnectivity() async {
    final result = await Connectivity().checkConnectivity();
    final isOnline = result == ConnectivityResult.wifi ||
        result == ConnectivityResult.mobile ||
        result == ConnectivityResult.ethernet;
    if (!isOnline) throw const OcrOfflineException();
  }

  /// Not supported — Vision is synchronous
  @override
  Future<OcrScanResponse> getStatus(String jobId) {
    throw UnsupportedError(
      'GoogleVisionOcrRepository does not support async polling.',
    );
  }
}
