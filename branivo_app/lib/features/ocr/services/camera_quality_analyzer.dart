import 'dart:async';
import 'dart:ui' show Size;
import 'package:camera/camera.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

/// Priority order for quality failures: blur > overexposed > dark > tooFar
enum QualityStatus { blur, dark, overexposed, tooFar, unstable, ok, vinFound }

class QualityResult {
  const QualityResult({
    required this.status,
    required this.blurVariance,
    required this.brightnessAvg,
    required this.frameFill,
    this.vinConfidence = 0.0,
    this.detectedVin,
  });

  final QualityStatus status;
  final double blurVariance;
  final double brightnessAvg;
  final double frameFill;
  final double vinConfidence;
  final String? detectedVin;
}

/// VIN pattern: uppercase letters excluding I, O, Q — plus digits, exactly 17 chars
final _vinPattern = RegExp(r'[A-HJ-NPR-Z0-9]{17}');

const _kBlurReject = 80.0;
const _kBlurStable = 150.0;
const _kBrightnessMin = 40.0;
const _kBrightnessMax = 210.0;
const _kFrameFillMin = 0.65;
const _kVinConfidenceThreshold = 0.82;

/// Analyzes camera frames for quality metrics and VIN detection.
/// Processes at 5fps (200ms throttle via Timer.periodic in UI layer).
class CameraQualityAnalyzer {
  CameraQualityAnalyzer() : _recognizer = TextRecognizer(script: TextRecognitionScript.latin);

  final TextRecognizer _recognizer;
  bool _disposed = false;

  /// Analyzes a single [CameraImage] frame for blur, brightness, frame fill, and VIN.
  /// [overlayAspectRatio] is the document overlay's aspect ratio (width/height).
  Future<QualityResult> analyzeFrame(
    CameraImage frame,
    double overlayAspectRatio,
  ) async {
    if (_disposed) {
      return const QualityResult(
        status: QualityStatus.blur,
        blurVariance: 0,
        brightnessAvg: 0,
        frameFill: 0,
      );
    }

    try {
      return await _doAnalyze(frame, overlayAspectRatio);
    } catch (_) {
      // If analysis throws, reset consecutive frame tracking by returning blur
      return const QualityResult(
        status: QualityStatus.blur,
        blurVariance: 0,
        brightnessAvg: 0,
        frameFill: 0,
      );
    }
  }

  Future<QualityResult> _doAnalyze(
    CameraImage frame,
    double overlayAspectRatio,
  ) async {
    // Guard: handle frames smaller than crop target
    final cropW = frame.width < 320 ? frame.width : 320;
    final cropH = frame.height < 240 ? frame.height : 240;

    final blurVariance = _computeBlurVariance(frame, cropW, cropH);
    final brightnessAvg = _computeBrightnessAvg(frame, cropW, cropH);
    final frameFill = _computeFrameFill(frame, overlayAspectRatio);

    // Priority: blur > overexposed > dark > tooFar (first failing wins)
    if (blurVariance < _kBlurReject) {
      return QualityResult(
        status: QualityStatus.blur,
        blurVariance: blurVariance,
        brightnessAvg: brightnessAvg,
        frameFill: frameFill,
      );
    }

    if (brightnessAvg > _kBrightnessMax) {
      return QualityResult(
        status: QualityStatus.overexposed,
        blurVariance: blurVariance,
        brightnessAvg: brightnessAvg,
        frameFill: frameFill,
      );
    }

    if (brightnessAvg < _kBrightnessMin) {
      return QualityResult(
        status: QualityStatus.dark,
        blurVariance: blurVariance,
        brightnessAvg: brightnessAvg,
        frameFill: frameFill,
      );
    }

    if (frameFill < _kFrameFillMin) {
      return QualityResult(
        status: QualityStatus.tooFar,
        blurVariance: blurVariance,
        brightnessAvg: brightnessAvg,
        frameFill: frameFill,
      );
    }

    // All spatial/quality checks pass — try VIN detection
    final vinResult = await _detectVin(frame);
    if (vinResult != null) {
      return QualityResult(
        status: QualityStatus.vinFound,
        blurVariance: blurVariance,
        brightnessAvg: brightnessAvg,
        frameFill: frameFill,
        vinConfidence: vinResult.$2,
        detectedVin: vinResult.$1,
      );
    }

    // Blur variance 80-149 is unstable (not rejected, not stable enough for auto-capture)
    if (blurVariance < _kBlurStable) {
      return QualityResult(
        status: QualityStatus.unstable,
        blurVariance: blurVariance,
        brightnessAvg: brightnessAvg,
        frameFill: frameFill,
      );
    }

    return QualityResult(
      status: QualityStatus.ok,
      blurVariance: blurVariance,
      brightnessAvg: brightnessAvg,
      frameFill: frameFill,
    );
  }

  /// Computes Laplacian variance as a blur metric on center crop.
  /// Higher variance = sharper image.
  double _computeBlurVariance(CameraImage frame, int cropW, int cropH) {
    final plane = frame.planes[0]; // Y plane (luminance)
    final bytes = plane.bytes;
    final frameW = frame.width;

    final startX = (frameW - cropW) ~/ 2;
    final startY = (frame.height - cropH) ~/ 2;

    double sum = 0;
    double sumSq = 0;
    int count = 0;

    // Laplacian kernel: approximate second derivative of brightness
    for (var y = startY + 1; y < startY + cropH - 1; y++) {
      for (var x = startX + 1; x < startX + cropW - 1; x++) {
        final idx = y * frameW + x;
        if (idx >= bytes.length || idx - frameW < 0 || idx + frameW >= bytes.length) continue;

        final lap = (bytes[idx - frameW] & 0xFF) +
            (bytes[idx + frameW] & 0xFF) +
            (bytes[idx - 1] & 0xFF) +
            (bytes[idx + 1] & 0xFF) -
            4 * (bytes[idx] & 0xFF);

        final lapD = lap.toDouble();
        sum += lapD;
        sumSq += lapD * lapD;
        count++;
      }
    }

    if (count == 0) return 0;
    final mean = sum / count;
    return (sumSq / count) - (mean * mean);
  }

  /// Computes average luminance on center crop.
  double _computeBrightnessAvg(CameraImage frame, int cropW, int cropH) {
    final plane = frame.planes[0];
    final bytes = plane.bytes;
    final frameW = frame.width;

    final startX = (frameW - cropW) ~/ 2;
    final startY = (frame.height - cropH) ~/ 2;

    double sum = 0;
    int count = 0;

    for (var y = startY; y < startY + cropH; y++) {
      for (var x = startX; x < startX + cropW; x++) {
        final idx = y * frameW + x;
        if (idx >= bytes.length) continue;
        sum += bytes[idx] & 0xFF;
        count++;
      }
    }

    return count == 0 ? 0 : sum / count;
  }

  /// Estimates how much of the frame the document fills based on aspect ratio.
  double _computeFrameFill(CameraImage frame, double overlayAspectRatio) {
    final frameAspect = frame.width / frame.height;
    // Document overlay fill = ratio of overlay area to frame area
    // If overlay aspect matches frame aspect, fill is high; otherwise lower
    if (overlayAspectRatio <= 0 || frameAspect <= 0) return 0;
    final ratio = overlayAspectRatio / frameAspect;
    // Normalize: 1.0 = perfectly matched, less = document smaller than frame
    return (ratio > 1.0 ? 1.0 / ratio : ratio).clamp(0.0, 1.0);
  }

  /// Detects VIN in the frame using ML Kit.
  /// Returns (vin, confidence) or null if no valid VIN detected.
  Future<(String, double)?> _detectVin(CameraImage frame) async {
    if (_disposed) return null;

    try {
      final inputImage = InputImage.fromBytes(
        bytes: frame.planes[0].bytes,
        metadata: InputImageMetadata(
          size: Size(frame.width.toDouble(), frame.height.toDouble()),
          rotation: InputImageRotation.rotation0deg,
          format: InputImageFormat.nv21,
          bytesPerRow: frame.planes[0].bytesPerRow,
        ),
      );

      final result = await _recognizer.processImage(inputImage);

      // Collect all VIN-like patterns, sort by confidence descending
      final candidates = <(String, double)>[];
      for (final block in result.blocks) {
        for (final line in block.lines) {
          final text = line.text.toUpperCase().replaceAll(' ', '');
          final match = _vinPattern.firstMatch(text);
          if (match != null) {
            final confidence = line.elements.isEmpty
                ? 0.0
                : line.elements.map((e) => e.confidence ?? 0.0).reduce((a, b) => a + b) /
                    line.elements.length;
            candidates.add((match.group(0)!, confidence));
          }
        }
      }

      if (candidates.isEmpty) return null;

      // Take highest confidence candidate
      candidates.sort((a, b) => b.$2.compareTo(a.$2));
      final best = candidates.first;
      if (best.$2 >= _kVinConfidenceThreshold) return best;
      return null;
    } catch (_) {
      return null;
    }
  }

  void dispose() {
    _disposed = true;
    _recognizer.close();
  }
}
