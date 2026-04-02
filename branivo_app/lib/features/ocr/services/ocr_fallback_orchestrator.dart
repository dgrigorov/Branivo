import 'dart:async';
import '../data/repositories/ocr_models.dart';
import '../data/repositories/google_vision_ocr_repository.dart';
import 'ocr_scoring_engine.dart';

sealed class OcrFallbackResult {}

class MlKitResult extends OcrFallbackResult {
  MlKitResult(this.fields, this.scoreResult);
  final Map<String, OcrField> fields;
  final ScoreResult scoreResult;
}

class VisionResult extends OcrFallbackResult {
  VisionResult(this.fields, this.scoreResult);
  final Map<String, OcrField> fields;
  final ScoreResult scoreResult;
}

class ManualEntryResult extends OcrFallbackResult {
  ManualEntryResult(this.prefilledFields, {this.message});
  final Map<String, OcrField> prefilledFields;
  /// UX message — never uses the word "грешка"
  final String? message;
}

const _kManualMessage =
    'Не успяхме да разчетем напълно. Моля проверете данните:';

/// Orchestrates the OCR fallback chain:
/// ML Kit → Google Vision → Manual entry (pre-filled)
class OcrFallbackOrchestrator {
  OcrFallbackOrchestrator({
    required GoogleVisionOcrRepository visionRepository,
    required OcrScoringEngine scoringEngine,
  })  : _visionRepository = visionRepository,
        _scoringEngine = scoringEngine;

  final GoogleVisionOcrRepository _visionRepository;
  final OcrScoringEngine _scoringEngine;

  /// Orchestrates fallback based on ML Kit result.
  /// [mlKitFields] may be empty if ML Kit timed out.
  /// [mlKitTimedOut] indicates the ML Kit scan exceeded its timeout.
  Future<OcrFallbackResult> orchestrate({
    required Map<String, OcrField> mlKitFields,
    required String sessionToken,
    bool mlKitTimedOut = false,
  }) async {
    final mlKitScore = _scoringEngine.score(mlKitFields);

    final hasCriticalFields = _hasCriticalFields(mlKitFields);

    final needsFallback = mlKitTimedOut ||
        mlKitScore.finalScore < 0.60 ||
        !hasCriticalFields;

    if (!needsFallback) {
      return MlKitResult(mlKitFields, mlKitScore);
    }

    // Try Google Vision (will throw OcrOfflineException if offline)
    try {
      final visionResponse = await _visionRepository.scanImages(
        [], // images sent separately by the caller — here we pass empty for log
        sessionToken,
      );

      final visionFields = visionResponse.fields ?? {};
      final merged = _scoringEngine.merge(mlKitFields, visionFields);

      // Re-check critical fields after merge
      if (!_hasCriticalFields(merged)) {
        return ManualEntryResult(merged, message: _kManualMessage);
      }

      final mergedScore = _scoringEngine.score(merged);
      if (mergedScore.finalScore >= 0.60) {
        return VisionResult(merged, mergedScore);
      }
      return ManualEntryResult(merged, message: _kManualMessage);
    } on OcrOfflineException {
      return ManualEntryResult(mlKitFields);
    } on OcrVisionException {
      return ManualEntryResult(mlKitFields, message: _kManualMessage);
    }
  }

  bool _hasCriticalFields(Map<String, OcrField> fields) {
    final make = fields['make']?.value;
    final regNumber = fields['license_plate']?.value;
    return (make != null && make.isNotEmpty) ||
        (regNumber != null && regNumber.isNotEmpty);
  }
}
