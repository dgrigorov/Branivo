import 'package:camera/camera.dart';
import 'package:dio/dio.dart';
import 'ocr_models.dart';
import 'ocr_repository.dart';

class OcrApiException implements Exception {
  OcrApiException(this.message);
  final String message;

  @override
  String toString() => 'OcrApiException: $message';
}

class OcrApiRepository implements OcrRepository {
  OcrApiRepository({required Dio dio}) : _dio = dio;

  final Dio _dio;

  @override
  Future<OcrScanResponse> scanImages(
    List<XFile> images,
    String sessionToken,
  ) async {
    final formData = FormData();
    for (final image in images) {
      final bytes = await image.readAsBytes();
      formData.files.add(MapEntry(
        'images',
        MultipartFile.fromBytes(
          bytes,
          filename: image.name.isNotEmpty ? image.name : 'image.jpg',
          contentType: DioMediaType('image', 'jpeg'),
        ),
      ));
    }

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/ocr/scan',
        data: formData,
        options: Options(
          headers: {'X-Session-Token': sessionToken},
        ),
      );

      return OcrScanResponse.fromJson(response.data!);
    } on DioException catch (e) {
      final message = _extractMessage(e);
      throw OcrApiException(message);
    }
  }

  @override
  Future<OcrScanResponse> getStatus(String jobId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/v1/ocr/status/$jobId',
      );
      return OcrScanResponse.fromJson(response.data!);
    } on DioException catch (e) {
      throw OcrApiException(_extractMessage(e));
    }
  }

  String _extractMessage(DioException e) {
    if (e.response?.data is Map) {
      final msg = (e.response!.data as Map)['message'];
      if (msg is String) return msg;
    }
    return e.message ?? 'Грешка при OCR заявка.';
  }
}
