part of 'ocr_wizard_bloc.dart';

abstract class OcrWizardEvent {}

class OcrStartCaptureEvent extends OcrWizardEvent {}

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

/// User tapped "Продължи" on the preview screen.
class OcrPreviewConfirmedEvent extends OcrWizardEvent {
  OcrPreviewConfirmedEvent({required this.step, required this.sessionToken});
  final int step;
  final String sessionToken;
}

/// User tapped "Повтори" on the preview screen — discard the last image.
class OcrPreviewRetakeEvent extends OcrWizardEvent {
  OcrPreviewRetakeEvent({required this.step});
  final int step;
}
