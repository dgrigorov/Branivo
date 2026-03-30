part of 'ocr_wizard_bloc.dart';

abstract class OcrWizardState {}

class OcrInitialState extends OcrWizardState {}

class OcrCapturingState extends OcrWizardState {
  OcrCapturingState({required this.step, this.capturedImages = const []});
  final int step;
  final List<XFile> capturedImages;
}

class OcrProcessingState extends OcrWizardState {
  OcrProcessingState({required this.jobId});
  final String jobId;
}

class OcrCompletedState extends OcrWizardState {
  OcrCompletedState({required this.fields, required this.jobId, this.rawText});
  final Map<String, OcrField> fields;
  final String jobId;
  /// Raw text recognized by ML Kit — used for debug overlay.
  final String? rawText;
}

class OcrFailedState extends OcrWizardState {
  OcrFailedState({this.errorMessage});
  final String? errorMessage;
}

class OcrManualInputState extends OcrWizardState {}

/// Shown after a photo is captured — user can confirm or retake.
class OcrPreviewState extends OcrWizardState {
  OcrPreviewState({required this.step, required this.image});
  final int step;
  final XFile image;
}

/// Shown between steps — animates preprocessing pipeline (grayscale, contrast, etc.)
class OcrStepProcessingState extends OcrWizardState {
  OcrStepProcessingState({required this.step, required this.image});
  final int step;
  final XFile image;
}

// ─── Camera quality states (story-24.1) ──────────────────────────────────────

/// Camera is analyzing frames — shows live quality overlay
class OcrCameraQualityState extends OcrWizardState {
  OcrCameraQualityState({required this.status, this.quality});
  final QualityStatus status;
  final QualityResult? quality;
}

/// VIN detected — triggers auto-capture
class OcrVinDetectedState extends OcrWizardState {
  OcrVinDetectedState({required this.vin, required this.confidence});
  final String vin;
  final double confidence;
}

/// Manual assist button should appear (5s timeout)
class OcrManualAssistState extends OcrWizardState {}

// ─── Enrichment states (story-24.1) ──────────────────────────────────────────

/// Hard block: existing active policy found for this vehicle
class OcrDuplicatePolicyState extends OcrWizardState {
  OcrDuplicatePolicyState({
    required this.policyNumber,
    required this.insurer,
  });
  final String policyNumber;
  final String insurer;
}

/// ГФ found an active policy — show banner with details
class OcrGfHitState extends OcrWizardState {
  OcrGfHitState({required this.insurer, required this.validUntil});
  final String insurer;
  final String validUntil;
}

/// ГФ API timed out — show non-blocking warning
class OcrGfWarningState extends OcrWizardState {}
