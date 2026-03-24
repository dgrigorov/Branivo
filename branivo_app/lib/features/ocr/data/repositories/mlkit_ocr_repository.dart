import 'package:camera/camera.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import '../services/talon_parser.dart';
import 'ocr_models.dart';
import 'ocr_repository.dart';

/// On-device OCR using Google ML Kit Text Recognition.
///
/// Images are processed entirely on the device — they never leave the phone.
/// This satisfies the business requirement of not storing personal document images.
class MlKitOcrRepository implements OcrRepository {
  @override
  Future<OcrScanResponse> scanImages(
    List<XFile> images,
    String sessionToken,
  ) async {
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

    final fields = TalonParser.parse(buffer.toString());

    return OcrScanResponse(
      jobId: 'local-${DateTime.now().millisecondsSinceEpoch}',
      status: OcrJobStatus.completed,
      provider: OcrProvider.mlKit,
      fields: fields,
    );
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
