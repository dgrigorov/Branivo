import 'package:camera/camera.dart';
import 'ocr_models.dart';

abstract class OcrRepository {
  Future<OcrScanResponse> scanImages(List<XFile> images, String sessionToken);
  Future<OcrScanResponse> getStatus(String jobId);
}
