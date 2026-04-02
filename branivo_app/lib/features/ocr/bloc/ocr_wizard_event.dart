part of 'ocr_wizard_bloc.dart';

abstract class OcrWizardEvent {}

class OcrStartCaptureEvent extends OcrWizardEvent {
  OcrStartCaptureEvent({required this.sessionToken});
  final String sessionToken;
}

class OcrImageCapturedEvent extends OcrWizardEvent {
  OcrImageCapturedEvent({required this.step, required this.image});
  final int step;
  final XFile image;
}

class OcrScanSubmittedEvent extends OcrWizardEvent {
  OcrScanSubmittedEvent({required this.sessionToken});
  final String sessionToken;
}

class OcrStatusPolledEvent extends OcrWizardEvent {
  OcrStatusPolledEvent({required this.jobId});
  final String jobId;
}

class OcrManualFallbackRequestedEvent extends OcrWizardEvent {}

/// User tapped "Продължи" on the preview screen — proceeds to crop editor.
class OcrPreviewConfirmedEvent extends OcrWizardEvent {
  OcrPreviewConfirmedEvent({required this.step, required this.sessionToken});
  final int step;
  final String sessionToken;
}

/// User tapped "Повтори" on the preview or crop screen — discard the last image.
class OcrPreviewRetakeEvent extends OcrWizardEvent {
  OcrPreviewRetakeEvent({required this.step});
  final int step;
}

// ─── Camera quality events ────────────────────────────────────────────────────

/// A camera frame has been analyzed — emitted every ~200ms by camera preview
class OcrFrameAnalyzedEvent extends OcrWizardEvent {
  OcrFrameAnalyzedEvent({required this.quality});
  final QualityResult quality;
}

/// ML Kit detected a VIN with sufficient confidence
class OcrVinDetectedEvent extends OcrWizardEvent {
  OcrVinDetectedEvent({required this.vin, required this.confidence});
  final String vin;
  final double confidence;
}

/// 3 consecutive stable frames accumulated — ready for auto-capture
class OcrQualityOkEvent extends OcrWizardEvent {}

/// 5-second timeout expired without quality OK
class OcrManualAssistEvent extends OcrWizardEvent {}
/// User confirmed the perspective crop corners.
class OcrCropConfirmedEvent extends OcrWizardEvent {
  OcrCropConfirmedEvent({
    required this.step,
    required this.corners,
    required this.sessionToken,
  });
  final int step;
  /// Normalized 0..1 corner points: TL, TR, BR, BL.
  final List<Offset> corners;
  final String sessionToken;
}
