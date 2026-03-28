import 'package:image_picker/image_picker.dart';
import 'ocr_models.dart';

abstract class OcrRepository {
  Future<OcrScanResponse> scanImages(List<XFile> images, String sessionToken);
  Future<OcrScanResponse> getStatus(String jobId);
}
