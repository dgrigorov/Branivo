import 'dart:async';
import 'package:flutter/painting.dart' show Offset;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import '../data/repositories/ocr_models.dart';
import '../data/repositories/ocr_repository.dart';
import '../services/camera_quality_analyzer.dart';

part 'ocr_wizard_event.dart';
part 'ocr_wizard_state.dart';

const int _totalSteps = 3; // small vehicle registration card: owner + front + back
const Duration _pollInterval = Duration(seconds: 2);
const Duration _maxPollDuration = Duration(seconds: 35);
const int _kConsecutiveStableRequired = 3;
const Duration _kManualAssistTimeout = Duration(seconds: 5);

/// OCR Wizard flow:
///  Phase 1 — Capture: user photographs all [_totalSteps] sides.
///            OcrCapturingState advances step until all images are taken.
///  Phase 2 — Crop: user edits each image one by one (OcrCropState per step).
///  Phase 3 — Process: OcrScanSubmittedEvent → API → OcrCompletedState.
///
/// Retake: clears ALL captured data and returns to step 0 (simplest UX).
class OcrWizardBloc extends Bloc<OcrWizardEvent, OcrWizardState> {
  OcrWizardBloc({
    required OcrRepository repository,
  })  : _repository = repository,
        super(OcrInitialState()) {
    on<OcrStartCaptureEvent>(_onStartCapture);
    on<OcrImageCapturedEvent>(_onImageCaptured);
    on<OcrPreviewConfirmedEvent>(_onPreviewConfirmed);
    on<OcrPreviewRetakeEvent>(_onPreviewRetake);
    on<OcrCropConfirmedEvent>(_onCropConfirmed);
    on<OcrScanSubmittedEvent>(_onScanSubmitted);
    on<OcrStatusPolledEvent>(_onStatusPolled);
    on<OcrManualFallbackRequestedEvent>(_onManualFallback);
    on<OcrFrameAnalyzedEvent>(_onFrameAnalyzed);
    on<OcrVinDetectedEvent>(_onVinDetected);
    on<OcrQualityOkEvent>(_onQualityOk);
    on<OcrManualAssistEvent>(_onManualAssist);
  }

  final OcrRepository _repository;

  final List<XFile> _capturedImages = [];
  final List<List<Offset>> _capturedCorners = [];
  String _sessionToken = '';
  Timer? _pollTimer;
  DateTime? _pollStartTime;
  Timer? _manualAssistTimer;
  int _consecutiveStableFrames = 0;
  bool _vinCaptured = false;

  void _onStartCapture(
    OcrStartCaptureEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    _sessionToken = event.sessionToken;
    _capturedImages.clear();
    _capturedCorners.clear();
    _vinCaptured = false;
    _consecutiveStableFrames = 0;
    emit(OcrCapturingState(step: 0));
  }

  void _onImageCaptured(
    OcrImageCapturedEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    _capturedImages.add(event.image);
    final nextStep = event.step + 1;

    if (nextStep < _totalSteps) {
      // Still more sides to photograph — stay in capture phase.
      emit(OcrCapturingState(
        step: nextStep,
        capturedImages: List.unmodifiable(_capturedImages),
      ));
    } else {
      // All sides captured — move to crop phase, start with first image.
      emit(OcrCropState(
        step: 0,
        image: _capturedImages[0],
        corners: const [],
        sessionToken: _sessionToken,
      ));
    }
  }

  // Kept for backwards compatibility — not reached in normal flow.
  void _onPreviewConfirmed(
    OcrPreviewConfirmedEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    emit(OcrCropState(
      step: event.step,
      image: _capturedImages[event.step],
      corners: const [],
      sessionToken: _sessionToken,
    ));
  }

  /// Clears all captured data and returns to step 0.
  void _onPreviewRetake(
    OcrPreviewRetakeEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    _capturedImages.clear();
    _capturedCorners.clear();
    emit(OcrCapturingState(step: 0));
  }

  Future<void> _onCropConfirmed(
    OcrCropConfirmedEvent event,
    Emitter<OcrWizardState> emit,
  ) async {
    _capturedCorners.add(event.corners);
    final nextCropStep = event.step + 1;

    if (nextCropStep < _capturedImages.length) {
      // More images still need to be cropped.
      emit(OcrCropState(
        step: nextCropStep,
        image: _capturedImages[nextCropStep],
        corners: const [],
        sessionToken: _sessionToken,
      ));
    } else {
      // All images cropped — go directly to scan (no intermediate animation).
      add(OcrScanSubmittedEvent(sessionToken: event.sessionToken));
    }
  }

  Future<void> _onScanSubmitted(
    OcrScanSubmittedEvent event,
    Emitter<OcrWizardState> emit,
  ) async {
    if (_capturedImages.isEmpty) return;

    emit(OcrProcessingState(jobId: 'local-scanning'));

    try {
      final response = await _repository.scanImages(
        _capturedImages,
        event.sessionToken,
        corners: _capturedCorners.isEmpty ? null : _capturedCorners,
      );

      if (response.status == OcrJobStatus.completed && response.fields != null) {
        emit(OcrCompletedState(
          fields: response.fields!,
          jobId: response.jobId,
          rawText: response.rawText,
          debugImages: response.debugImages,
        ));
      } else if (response.status == OcrJobStatus.processing) {
        emit(OcrProcessingState(jobId: response.jobId));
        _startPolling(response.jobId);
      } else {
        emit(OcrFailedState());
      }
    } catch (e) {
      emit(OcrFailedState(errorMessage: e.toString()));
    }
  }

  Future<void> _onStatusPolled(
    OcrStatusPolledEvent event,
    Emitter<OcrWizardState> emit,
  ) async {
    _pollStartTime ??= DateTime.now();

    if (DateTime.now().difference(_pollStartTime!) > _maxPollDuration) {
      _stopPolling();
      emit(OcrFailedState(
        errorMessage: 'OCR обработката отне твърде дълго. Опитайте отново.',
      ));
      return;
    }

    try {
      final response = await _repository.getStatus(event.jobId);

      if (response.status == OcrJobStatus.completed && response.fields != null) {
        _stopPolling();
        emit(OcrCompletedState(
          fields: response.fields!,
          jobId: response.jobId,
          rawText: response.rawText,
          debugImages: response.debugImages,
        ));
      } else if (response.status == OcrJobStatus.failed) {
        _stopPolling();
        emit(OcrFailedState());
      }
    } catch (_) {
      // transient network error — continue polling
    }
  }

  void _onManualFallback(
    OcrManualFallbackRequestedEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    _stopPolling();
    emit(OcrManualInputState());
  }

  // ─── Camera quality handlers (story-24.1) ────────────────────────────────

  void _onFrameAnalyzed(
    OcrFrameAnalyzedEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    final quality = event.quality;

    if (quality.status == QualityStatus.vinFound && !_vinCaptured) {
      _vinCaptured = true;
      _cancelManualAssistTimer();
      add(OcrVinDetectedEvent(
        vin: quality.detectedVin ?? '',
        confidence: quality.vinConfidence,
      ));
      return;
    }

    if (quality.status == QualityStatus.ok) {
      _consecutiveStableFrames++;
      _startManualAssistTimerIfNeeded();
      if (_consecutiveStableFrames >= _kConsecutiveStableRequired) {
        _cancelManualAssistTimer();
        add(OcrQualityOkEvent());
        return;
      }
    } else {
      _consecutiveStableFrames = 0;
    }

    emit(OcrCameraQualityState(status: quality.status, quality: quality));
  }

  void _onVinDetected(
    OcrVinDetectedEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    emit(OcrVinDetectedState(vin: event.vin, confidence: event.confidence));
  }

  void _onQualityOk(
    OcrQualityOkEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    _consecutiveStableFrames = 0;
    emit(OcrCameraQualityState(status: QualityStatus.ok));
  }

  void _onManualAssist(
    OcrManualAssistEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    emit(OcrManualAssistState());
  }

  void _startManualAssistTimerIfNeeded() {
    if (_manualAssistTimer != null) return;
    _manualAssistTimer = Timer(_kManualAssistTimeout, () {
      if (!isClosed) add(OcrManualAssistEvent());
    });
  }

  void _cancelManualAssistTimer() {
    _manualAssistTimer?.cancel();
    _manualAssistTimer = null;
  }

  void _startPolling(String jobId) {
    _pollStartTime = DateTime.now();
    _pollTimer = Timer.periodic(_pollInterval, (_) {
      add(OcrStatusPolledEvent(jobId: jobId));
    });
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _pollStartTime = null;
  }

  @override
  Future<void> close() {
    _stopPolling();
    _cancelManualAssistTimer();
    return super.close();
  }
}
