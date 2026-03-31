import 'package:image_picker/image_picker.dart';
import 'ocr_models.dart';

import 'package:flutter/painting.dart' show Offset;

abstract class OcrRepository {
  /// [corners] — normalized 0..1 corner points per image (TL,TR,BR,BL order).
  /// Pass null for an image to skip perspective correction for that step.
  Future<OcrScanResponse> scanImages(
    List<XFile> images,
    String sessionToken, {
    List<List<Offset>?>? corners,
  });
  Future<OcrScanResponse> getStatus(String jobId);
}
