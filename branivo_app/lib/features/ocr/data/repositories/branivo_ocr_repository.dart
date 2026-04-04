import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/painting.dart' show Offset;
import 'package:image_picker/image_picker.dart';
import '../../../../core/api/endpoints.dart';
import 'ocr_models.dart';
import 'ocr_repository.dart';

/// OCR via the branivo-ocr Python microservice (FastAPI + Tesseract).
///
/// Wizard step order:
///   images[0] → step=1 (MRZ / owner page)
///   images[1] → step=2 (vehicle identity page)
///   images[2] → step=3 (technical specs page)
///
/// Each image may optionally have 4 perspective-crop corner points (TL,TR,BR,BL,
/// normalized 0..1). When provided, the Python service applies
/// cv2.warpPerspective BEFORE the normal preprocessing pipeline.
///
/// When debug=true (default), the response includes preview_b64 — a base64
/// JPEG of the image that Tesseract actually processed, for in-app debug view.
class BranivoOcrRepository implements OcrRepository {
  BranivoOcrRepository() : _dio = _buildDio();

  final Dio _dio;

  static Dio _buildDio() => Dio(
        BaseOptions(
          baseUrl: ApiEndpoints.baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 120),
        ),
      );

  static const _stepMap = [1, 2, 3];

  @override
  Future<OcrScanResponse> scanImages(
    List<XFile> images,
    String sessionToken, {
    List<List<Offset>?>? corners,
  }) async {
    final merged = <String, dynamic>{};
    double totalConf = 0;
    int steps = 0;
    final debugImages = <String>[];

    for (int i = 0; i < images.length && i < 3; i++) {
      final step = _stepMap[i];
      final pts = corners != null && i < corners.length ? corners[i] : null;
      try {
        final result = await _callStep(images[i], step, corners: pts);
        final conf = (result['confidence'] as num? ?? 0).toDouble();
        final data = result['data'] as Map<String, dynamic>? ?? {};
        totalConf += conf;
        steps++;
        // First non-null value wins across steps
        data.forEach((k, v) {
          if (v != null && merged[k] == null) merged[k] = v;
        });
        // Collect debug preview if returned
        final preview = result['preview_b64'] as String?;
        debugImages.add(preview ?? '');
      } catch (_) {
        debugImages.add('');
      }
    }

    final avgConf = steps > 0 ? totalConf / steps : 0.0;
    return OcrScanResponse(
      jobId: 'branivo-${DateTime.now().millisecondsSinceEpoch}',
      status: OcrJobStatus.completed,
      provider: OcrProvider.branivoOcr,
      fields: _toFields(merged, avgConf),
      avgConfidence: avgConf,
      debugImages: debugImages.any((s) => s.isNotEmpty) ? debugImages : null,
    );
  }

  Future<Map<String, dynamic>> _callStep(
    XFile image,
    int step, {
    List<Offset>? corners,
  }) async {
    final bytes = await image.readAsBytes();
    final fields = <String, dynamic>{
      'file': MultipartFile.fromBytes(
        bytes,
        filename: image.name.isNotEmpty ? image.name : 'talon.jpg',
        contentType: DioMediaType('image', 'jpeg'),
      ),
    };

    if (corners != null && corners.length == 4) {
      // Serialize as [[x,y], [x,y], [x,y], [x,y]] — Python parses this JSON.
      fields['points'] = jsonEncode(
        corners
            .map((o) => [
                  double.parse(o.dx.toStringAsFixed(4)),
                  double.parse(o.dy.toStringAsFixed(4)),
                ])
            .toList(),
      );
    }

    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/ocr/talon',
      queryParameters: {'step': step, 'debug': true},
      data: FormData.fromMap(fields),
    );
    return response.data!;
  }

  // Maps Python TalonData field names → Flutter kFieldLabels keys.
  static const _fieldNameMap = {
    'registrationNumber': 'license_plate',
    'certNumber': 'cert_number',
    'fuel': 'fuel_type',
    'engine': 'engine_volume',
    'powerKw': 'power_kw',
    'vehicleCategory': 'vehicle_category',
    'egn': 'owner_egn',
    'firstRegistration': 'first_registration_date',
    'registrationValidity': 'registration_validity',
  };

  // Owner name split into 3 parts in Python model — skip individually, combine below.
  static const _ownerNameParts = {'ownerLastName', 'ownerFirstName', 'ownerMiddleName'};

  Map<String, OcrField> _toFields(Map<String, dynamic> data, double conf) {
    final fields = <String, OcrField>{};
    for (final entry in data.entries) {
      if (entry.value == null) continue;
      if (_ownerNameParts.contains(entry.key)) continue;
      final key = _fieldNameMap[entry.key] ?? entry.key;
      fields[key] = OcrField(
        value: entry.value.toString(),
        confidence: conf,
        autoFilled: true,
      );
    }

    // Combine owner name parts into a single owner_name field.
    final nameParts = [
      data['ownerLastName'],
      data['ownerFirstName'],
      data['ownerMiddleName'],
    ].whereType<String>().where((s) => s.isNotEmpty).toList();
    if (nameParts.isNotEmpty) {
      fields['owner_name'] = OcrField(
        value: nameParts.join(' '),
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
