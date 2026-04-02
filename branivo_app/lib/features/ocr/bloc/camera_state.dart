import '../services/camera_quality_analyzer.dart';

/// Sealed camera state machine for the OCR wizard camera flow.
///
/// State transitions:
/// IDLE → SCANNING → VIN_FOUND (auto-capture upon VIN hit)
///                 → QUALITY_OK (3 consecutive stable frames) → AUTO_CAPTURE
///                 → MANUAL_ASSIST (5s timeout) → MANUAL_CAPTURE
/// AUTO_CAPTURE / MANUAL_CAPTURE → PROCESSING
sealed class CameraOcrState {}

/// Initial state — camera not yet active
class CameraIdle extends CameraOcrState {}

/// Camera is active and analysing frames
class CameraScanning extends CameraOcrState {
  CameraScanning({
    this.consecutiveStableFrames = 0,
    this.secondsElapsed = 0.0,
    this.lastQuality,
  });

  final int consecutiveStableFrames;
  final double secondsElapsed;
  final QualityResult? lastQuality;

  CameraScanning copyWith({
    int? consecutiveStableFrames,
    double? secondsElapsed,
    QualityResult? lastQuality,
  }) =>
      CameraScanning(
        consecutiveStableFrames: consecutiveStableFrames ?? this.consecutiveStableFrames,
        secondsElapsed: secondsElapsed ?? this.secondsElapsed,
        lastQuality: lastQuality ?? this.lastQuality,
      );
}

/// VIN detected with sufficient confidence — auto-capture is triggered
class CameraVinFound extends CameraOcrState {
  CameraVinFound({required this.vin, required this.confidence});
  final String vin;
  final double confidence;
}

/// 3 consecutive stable frames accumulated — auto-capture is triggered
class CameraQualityOk extends CameraOcrState {}

/// 5-second timeout elapsed without quality OK — floating manual button appears
class CameraManualAssist extends CameraOcrState {}

/// Image captured automatically (from VIN hit or 3 stable frames)
class CameraAutoCapture extends CameraOcrState {}

/// Image captured manually by the user tapping the floating button
class CameraManualCapture extends CameraOcrState {}

/// OCR processing is underway
class CameraProcessing extends CameraOcrState {}

/// Processing failed with an error message
class CameraProcessingError extends CameraOcrState {
  CameraProcessingError({required this.message});
  final String message;
}
