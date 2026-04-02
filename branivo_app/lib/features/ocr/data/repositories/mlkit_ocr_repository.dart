import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import '../../../../core/api/endpoints.dart';
import '../services/talon_parser.dart';
import 'ocr_models.dart';
import 'ocr_repository.dart';

/// On-device OCR using Google ML Kit Text Recognition.
///
/// Images are processed entirely on the device — they never leave the phone.
/// After processing, the parsed fields (no images) are reported to the backend
/// to record the scan in ocr_jobs for analytics purposes.
class MlKitOcrRepository implements OcrRepository {
  MlKitOcrRepository({required Dio dio}) : _dio = dio;

  final Dio _dio;

  @override
  Future<OcrScanResponse> scanImages(
    List<XFile> images,
    String sessionToken,
  ) async {
    if (images.isEmpty) {
      return OcrScanResponse(
        jobId: 'local-empty',
        status: OcrJobStatus.completed,
        provider: OcrProvider.mlKit,
        fields: const {},
        rawText: null,
      );
    }

    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    final buffer = StringBuffer();

    try {
      for (final image in images) {
        final inputImage = InputImage.fromFilePath(image.path);
        final result = await recognizer.processImage(inputImage);
        if (result.text.isNotEmpty) {
          buffer.writeln(result.text);
        }
      }
    } finally {
      await recognizer.close();
    }

    final rawText = buffer.toString();
    final fields = TalonParser.parse(rawText);

    // Report to backend for analytics — fire-and-forget, don't block the UX
    _reportToBackend(sessionToken, fields, images.length, rawText).ignore();

    return OcrScanResponse(
      jobId: 'local-${DateTime.now().millisecondsSinceEpoch}',
      status: OcrJobStatus.completed,
      provider: OcrProvider.mlKit,
      fields: fields,
      rawText: rawText,
    );
  }

  Future<void> _reportToBackend(
    String sessionToken,
    Map<String, OcrField> fields,
    int imagesCount,
    String rawText,
  ) async {
    try {
      final fieldsJson = fields.map(
        (k, v) => MapEntry(k, {
          'value': v.value,
          'confidence': v.confidence,
          'auto_filled': v.autoFilled,
        }),
      );
      await _dio.post<void>(
        ApiEndpoints.ocrReportMlKit,
        data: {
          'session_token': sessionToken,
          'fields': fieldsJson,
          'images_count': imagesCount,
          if (rawText.isNotEmpty) 'raw_text': rawText,
        },
      );
    } catch (e) {
      // Analytics reporting is best-effort — never fail the scan flow.
      // Log so persistent failures (e.g. wrong endpoint) are visible in debug.
      assert(() {
        // ignore: avoid_print
        print('[MlKitOcrRepository] reportToBackend failed: $e');
        return true;
      }());
    }
  }

  /// ML Kit always returns results synchronously in [scanImages].
  /// Status polling is only needed for async cloud providers.
  @override
  Future<OcrScanResponse> getStatus(String jobId) {
    throw UnsupportedError(
      'MlKitOcrRepository does not support async polling. '
      'scanImages() always returns OcrJobStatus.completed.',
    );
  }
}
