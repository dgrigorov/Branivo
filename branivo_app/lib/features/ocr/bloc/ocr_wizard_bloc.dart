import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import '../data/repositories/ocr_models.dart';
import '../data/repositories/ocr_repository.dart';
import '../services/camera_quality_analyzer.dart';
import '../services/ocr_scoring_engine.dart';
import '../services/ocr_fallback_orchestrator.dart';
import '../services/ocr_enrichment_service.dart';

part 'ocr_wizard_event.dart';
part 'ocr_wizard_state.dart';

const int _totalSteps = 3;
const Duration _pollInterval = Duration(seconds: 2);
const Duration _maxPollDuration = Duration(seconds: 35);

/// Required consecutive stable frames before auto-capture
const int _kConsecutiveStableRequired = 3;

/// Timeout before manual assist button appears
const Duration _kManualAssistTimeout = Duration(seconds: 5);

class OcrWizardBloc extends Bloc<OcrWizardEvent, OcrWizardState> {
  OcrWizardBloc({
    required OcrRepository repository,
    OcrFallbackOrchestrator? fallbackOrchestrator,
    OcrEnrichmentService? enrichmentService,
    OcrScoringEngine? scoringEngine,
  })  : _repository = repository,
        _fallbackOrchestrator = fallbackOrchestrator,
        _enrichmentService = enrichmentService,
        _scoringEngine = scoringEngine ?? const OcrScoringEngine(),
        super(OcrInitialState()) {
    on<OcrStartCaptureEvent>(_onStartCapture);
    on<OcrImageCapturedEvent>(_onImageCaptured);
    on<OcrPreviewConfirmedEvent>(_onPreviewConfirmed);
    on<OcrPreviewRetakeEvent>(_onPreviewRetake);
    on<OcrScanSubmittedEvent>(_onScanSubmitted);
    on<OcrStatusPolledEvent>(_onStatusPolled);
    on<OcrManualFallbackRequestedEvent>(_onManualFallback);
    on<OcrFrameAnalyzedEvent>(_onFrameAnalyzed);
    on<OcrVinDetectedEvent>(_onVinDetected);
    on<OcrQualityOkEvent>(_onQualityOk);
    on<OcrManualAssistEvent>(_onManualAssist);
  }

  final OcrRepository _repository;
  final OcrFallbackOrchestrator? _fallbackOrchestrator;
  final OcrEnrichmentService? _enrichmentService;
  final OcrScoringEngine _scoringEngine;

  final List<XFile> _capturedImages = [];
  Timer? _pollTimer;
  DateTime? _pollStartTime;
  Timer? _manualAssistTimer;
  int _consecutiveStableFrames = 0;
  bool _vinCaptured = false;

  void _onStartCapture(
    OcrStartCaptureEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    _capturedImages.clear();
    _consecutiveStableFrames = 0;
    _vinCaptured = false;
    _cancelManualAssistTimer();
    emit(OcrCapturingState(step: 0));
  }

  void _onImageCaptured(
    OcrImageCapturedEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    _capturedImages.add(event.image);
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
      await _executeScan(event.sessionToken, emit);
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
    await _executeScan(event.sessionToken, emit);
  }

  // ─── Camera quality handlers ──────────────────────────────────────────────

  void _onFrameAnalyzed(
    OcrFrameAnalyzedEvent event,
    Emitter<OcrWizardState> emit,
  ) {
    final quality = event.quality;

    // VIN_FOUND takes priority over QUALITY_OK
    if (quality.status == QualityStatus.vinFound && !_vinCaptured) {
      _vinCaptured = true;
      _cancelManualAssistTimer();
      add(OcrVinDetectedEvent(
        vin: quality.detectedVin ?? '',
        confidence: quality.vinConfidence,
      ));
      return;
    }

    // Count consecutive stable frames (only status.ok counts, not unstable)
    if (quality.status == QualityStatus.ok) {
      _consecutiveStableFrames++;
      // Start manual assist timer on first quality frame if not already running
      _startManualAssistTimerIfNeeded();

      if (_consecutiveStableFrames >= _kConsecutiveStableRequired) {
        _cancelManualAssistTimer();
        add(OcrQualityOkEvent());
        return;
      }
    } else {
      // Any non-ok, non-vinFound frame resets consecutive counter
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
      if (!isClosed) {
        add(OcrManualAssistEvent());
      }
    });
  }

  void _cancelManualAssistTimer() {
    _manualAssistTimer?.cancel();
    _manualAssistTimer = null;
  }

  // ─── Scan execution ───────────────────────────────────────────────────────

  Future<void> _executeScan(
    String sessionToken,
    Emitter<OcrWizardState> emit,
  ) async {
    if (_capturedImages.isEmpty) return;

    _stopPolling();
    emit(OcrProcessingState(jobId: 'local-scanning'));

    try {
      OcrScanResponse response;

      // Run fallback orchestration if available
      if (_fallbackOrchestrator != null) {
        // Skip ML Kit extraction — Vision is primary for document OCR.
        // ML Kit is used only for live VIN detection in the viewfinder.
        // Passing mlKitTimedOut: true forces the orchestrator to call Vision immediately.
        final fallbackResult = await _fallbackOrchestrator!.orchestrate(
          mlKitFields: const {},
          sessionToken: sessionToken,
          mlKitTimedOut: true,
        );

        final (fields, scored) = _extractFromFallback(fallbackResult, const {});

        // Run enrichment (blocking group, max 5s)
        if (_enrichmentService != null) {
          final regNumber = fields['license_plate']?.value;
          final vin = fields['vin']?.value;
          final enrichResult = await _enrichmentService!.enrich(
            regNumber: regNumber,
            vin: vin,
            sessionToken: sessionToken,
          );

          // Hard block: existing active policy
          if (enrichResult.policyBlock != null) {
            emit(OcrDuplicatePolicyState(
              policyNumber: enrichResult.policyBlock!.policyNumber,
              insurer: enrichResult.policyBlock!.insurer,
            ));
            _sendOcrLog(
              sessionToken: sessionToken,
              fields: fields,
              scored: scored,
              enrichResult: enrichResult,
              visionUsed: fallbackResult is VisionResult,
            );
            return;
          }

          // ГФ hit — show banner (non-blocking)
          if (enrichResult.gf?.policyFound == true) {
            emit(OcrGfHitState(
              insurer: enrichResult.gf!.insurer ?? '',
              validUntil: enrichResult.gf!.validUntil ?? '',
            ));
          } else if (enrichResult.gf?.timedOut == true) {
            emit(OcrGfWarningState());
          }

          // Fire-and-forget log
          _sendOcrLog(
            sessionToken: sessionToken,
            fields: fields,
            scored: scored,
            enrichResult: enrichResult,
            visionUsed: fallbackResult is VisionResult,
          );
        }

        emit(OcrCompletedState(
          fields: fields,
          jobId: 'local-${DateTime.now().millisecondsSinceEpoch}',
        ));
        return;
      }

      // Fallback: standard scan without orchestrator
      response = await _repository.scanImages(_capturedImages, sessionToken);

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
        emit(OcrFailedState(
          errorMessage: 'OCR върна неочакван статус. Моля, опитайте отново.',
        ));
      }
    } catch (e) {
      emit(OcrFailedState(errorMessage: e.toString()));
    }
  }

  (Map<String, OcrField>, ScoreResult) _extractFromFallback(
    OcrFallbackResult result,
    Map<String, OcrField> mlKitFallback,
  ) {
    return switch (result) {
      MlKitResult(:final fields, :final scoreResult) => (fields, scoreResult),
      VisionResult(:final fields, :final scoreResult) => (fields, scoreResult),
      ManualEntryResult(:final prefilledFields) => (
          prefilledFields,
          _scoringEngine.score(prefilledFields),
        ),
    };
  }

  void _sendOcrLog({
    required String sessionToken,
    required Map<String, OcrField> fields,
    required ScoreResult scored,
    OcrEnrichmentResult? enrichResult,
    bool visionUsed = false,
  }) {
    if (_enrichmentService == null) return;

    final fieldConfidences = fields.map(
      (k, v) => MapEntry(k, v.confidence),
    );

    final payload = OcrLogPayload(
      mlkitConfidence: scored.fieldScores['cc'],
      mlkitFieldConfidences: fieldConfidences,
      visionUsed: visionUsed,
      scoreCc: scored.fieldScores['cc'],
      scoreKw: scored.fieldScores['kw'],
      scoreMake: scored.fieldScores['make'],
      scoreModel: scored.fieldScores['model'],
      scoreYear: scored.fieldScores['year'],
      finalScore: scored.finalScore,
      scoreBucket: ScoreBucketDto.values.firstWhere(
        (b) => b.name == scored.bucket.name,
        orElse: () => ScoreBucketDto.manual,
      ),
      vinFound: fields['vin']?.value != null,
      gfHit: enrichResult?.gf != null,
      gfPolicyFound: enrichResult?.gf?.policyFound,
      enrichmentDurationMs: enrichResult?.durationMs,
    );

    // fire-and-forget — never awaited, never passes BuildContext
    unawaited(_enrichmentService!.logScan(payload, sessionToken));
  }

  // ─── Polling ──────────────────────────────────────────────────────────────

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
    _cancelManualAssistTimer();
    return super.close();
  }
}
