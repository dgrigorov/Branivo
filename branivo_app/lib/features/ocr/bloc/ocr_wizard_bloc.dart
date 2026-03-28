import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import '../data/repositories/ocr_models.dart';
import '../data/repositories/ocr_repository.dart';

part 'ocr_wizard_event.dart';
part 'ocr_wizard_state.dart';

const int _totalSteps = 3;
const Duration _pollInterval = Duration(seconds: 2);
const Duration _maxPollDuration = Duration(seconds: 35);

class OcrWizardBloc extends Bloc<OcrWizardEvent, OcrWizardState> {
  OcrWizardBloc({required OcrRepository repository})
      : _repository = repository,
        super(OcrInitialState()) {
    on<OcrStartCaptureEvent>(_onStartCapture);
    on<OcrImageCapturedEvent>(_onImageCaptured);
    on<OcrPreviewConfirmedEvent>(_onPreviewConfirmed);
    on<OcrPreviewRetakeEvent>(_onPreviewRetake);
    on<OcrScanSubmittedEvent>(_onScanSubmitted);
    on<OcrStatusPolledEvent>(_onStatusPolled);
    on<OcrManualFallbackRequestedEvent>(_onManualFallback);
  }

  final OcrRepository _repository;
  final List<XFile> _capturedImages = [];
  Timer? _pollTimer;
  DateTime? _pollStartTime;

  void _onStartCapture(
    OcrStartCaptureEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    _capturedImages.clear();
    emit(OcrCapturingState(step: 0));
  }

  void _onImageCaptured(
    OcrImageCapturedEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    _capturedImages.add(event.image);
    // Always show preview so the user can confirm or retake the photo.
    emit(OcrPreviewState(step: event.step, image: event.image));
  }

  Future<void> _onPreviewConfirmed(
    OcrPreviewConfirmedEvent event,
    Emitter<OcrWizardState> emit,
  ) async {
    final nextStep = event.step + 1;
    if (nextStep < _totalSteps) {
      emit(OcrCapturingState(
        step: nextStep,
        capturedImages: List.unmodifiable(_capturedImages),
      ));
    } else {
      // Last photo confirmed — submit all captured images.
      add(OcrScanSubmittedEvent(sessionToken: event.sessionToken));
    }
  }

  void _onPreviewRetake(
    OcrPreviewRetakeEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    if (_capturedImages.isNotEmpty) _capturedImages.removeLast();
    emit(OcrCapturingState(
      step: event.step,
      capturedImages: List.unmodifiable(_capturedImages),
    ));
  }

  Future<void> _onScanSubmitted(
    OcrScanSubmittedEvent event,
    Emitter<OcrWizardState> emit,
  ) async {
    if (_capturedImages.isEmpty) return;

    // Emit processing state so the UI shows a loading indicator while
    // on-device (ML Kit) or cloud OCR is running.
    emit(OcrProcessingState(jobId: 'local-scanning'));

    try {
      final response = await _repository.scanImages(
        _capturedImages,
        event.sessionToken,
      );

      if (response.status == OcrJobStatus.completed && response.fields != null) {
        emit(OcrCompletedState(
          fields: response.fields!,
          jobId: response.jobId,
          rawText: response.rawText,
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
    return super.close();
  }
}
