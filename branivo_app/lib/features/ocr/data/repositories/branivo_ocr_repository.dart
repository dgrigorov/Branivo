import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/api/endpoints.dart';
import 'ocr_models.dart';
import 'ocr_repository.dart';

/// OCR via the branivo-ocr Python microservice (FastAPI + EasyOCR).
///
/// The wizard captures 3 images in order:
///   images[0] → step=1 (MRZ / owner page)
///   images[1] → step=2 (vehicle identity page)
///   images[2] → step=3 (technical specs page)
///
/// Results from all available steps are merged (first non-null value wins).
class BranivoOcrRepository implements OcrRepository {
  BranivoOcrRepository() : _dio = _buildDio();

  final Dio _dio;

  static Dio _buildDio() => Dio(
        BaseOptions(
          baseUrl: ApiEndpoints.ocrServiceBaseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 120),
        ),
      );

  // Wizard order → OCR API step mapping:
  //   wizard[0] = step=1 (MRZ / owner page)
  //   wizard[1] = step=2 (vehicle identity page)
  //   wizard[2] = step=3 (technical specs page)
  static const _stepMap = [1, 2, 3];

  @override
  Future<OcrScanResponse> scanImages(
    List<XFile> images,
    String sessionToken,
  ) async {
    final merged = <String, dynamic>{};
    double totalConf = 0;
    int steps = 0;

    for (int i = 0; i < images.length && i < 3; i++) {
      final step = _stepMap[i];
      try {
        final result = await _callStep(images[i], step);
        final conf = (result['confidence'] as num? ?? 0).toDouble();
        final data = result['data'] as Map<String, dynamic>? ?? {};
        totalConf += conf;
        steps++;
        // First non-null value wins across steps
        data.forEach((k, v) {
          if (v != null && merged[k] == null) merged[k] = v;
        });
      } catch (_) {
        // A failing step doesn't abort the whole scan
      }
    }

    final avgConf = steps > 0 ? totalConf / steps : 0.0;
    return OcrScanResponse(
      jobId: 'branivo-${DateTime.now().millisecondsSinceEpoch}',
      status: OcrJobStatus.completed,
      provider: OcrProvider.branivoOcr,
      fields: _toFields(merged, avgConf),
      avgConfidence: avgConf,
    );
  }

  Future<Map<String, dynamic>> _callStep(XFile image, int step) async {
    final bytes = await image.readAsBytes();
    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(
        bytes,
        filename: image.name.isNotEmpty ? image.name : 'talon.jpg',
        contentType: DioMediaType('image', 'jpeg'),
      ),
    });
    final response = await _dio.post<Map<String, dynamic>>(
      '/ocr/talon',
      queryParameters: {'step': step},
      data: formData,
    );
    return response.data!;
  }

  Map<String, OcrField> _toFields(Map<String, dynamic> data, double conf) {
    final fields = <String, OcrField>{};
    for (final entry in data.entries) {
      if (entry.value == null) continue;
      fields[entry.key] = OcrField(
        value: entry.value.toString(),
        confidence: conf,
        autoFilled: true,
      );
    }
    return fields;
  }

  @override
  Future<OcrScanResponse> getStatus(String jobId) {
    throw UnsupportedError(
      'BranivoOcrRepository processes synchronously in scanImages().',
    );
  }
}
