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
