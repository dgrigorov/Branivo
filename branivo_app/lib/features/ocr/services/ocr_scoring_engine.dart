import '../data/repositories/ocr_models.dart';

enum ScoreBucket { auto, top3, manual }

class ScoreResult {
  const ScoreResult({
    required this.finalScore,
    required this.bucket,
    required this.fieldScores,
  });

  final double finalScore;
  final ScoreBucket bucket;
  final Map<String, double> fieldScores;
}

/// Top-20 Bulgarian Cyrillic make names → Latin normalisation
const _cyrillicToLatin = <String, String>{
  'ФОЛКСВАГЕН': 'VOLKSWAGEN',
  'ФОЛКСВАГEН': 'VOLKSWAGEN',
  'БМВ': 'BMW',
  'МЕРЦЕДЕС': 'MERCEDES',
  'МЕРСЕДЕС': 'MERCEDES',
  'ТОЙОТА': 'TOYOTA',
  'ФОРД': 'FORD',
  'АУДИ': 'AUDI',
  'ХОНДА': 'HONDA',
  'НИССАН': 'NISSAN',
  'НИСАН': 'NISSAN',
  'КИА': 'KIA',
  'ХЮНДАЙ': 'HYUNDAI',
  'ХУНДАЙ': 'HYUNDAI',
  'ОПЕЛ': 'OPEL',
  'РЕНО': 'RENAULT',
  'СИТРОЕН': 'CITROEN',
  'ПЕЖО': 'PEUGEOT',
  'ШКОДА': 'SKODA',
  'МАЗДА': 'MAZDA',
  'МИТСУБИШИ': 'MITSUBISHI',
  'СУЗУКИ': 'SUZUKI',
  'ВОЛВО': 'VOLVO',
};

/// Known vehicle makes (Latin) for keyword scoring
const _knownMakes = <String>{
  'VOLKSWAGEN', 'BMW', 'MERCEDES', 'MERCEDES-BENZ',
  'TOYOTA', 'FORD', 'AUDI', 'HONDA', 'NISSAN', 'KIA',
  'HYUNDAI', 'OPEL', 'RENAULT', 'CITROEN', 'PEUGEOT',
  'SKODA', 'MAZDA', 'MITSUBISHI', 'SUZUKI', 'VOLVO',
  'SEAT', 'DACIA', 'FIAT', 'ALFA', 'LADA',
};

/// Scoring weights: cc×0.25 + kw×0.15 + make×0.25 + model×0.25 + year×0.10
class OcrScoringEngine {
  const OcrScoringEngine();

  /// Merges two field maps using per-field max-confidence.
  /// null confidence is treated as -1 (any non-null confidence wins).
  Map<String, OcrField> merge(
    Map<String, OcrField> scan1,
    Map<String, OcrField> scan2,
  ) {
    if (scan2.isEmpty) return scan1;
    if (scan1.isEmpty) return scan2;

    final result = Map<String, OcrField>.from(scan1);
    for (final entry in scan2.entries) {
      final existing = result[entry.key];
      if (existing == null) {
        result[entry.key] = entry.value;
      } else {
        // null value → confidence treated as -1 so any non-null wins
        final c1 = existing.value == null ? -1.0 : existing.confidence;
        final c2 = entry.value.value == null ? -1.0 : entry.value.confidence;
        if (c2 > c1) {
          result[entry.key] = entry.value;
        }
      }
    }
    return result;
  }

  /// Computes a composite score for the given OCR fields.
  ScoreResult score(Map<String, OcrField> fields) {
    final cc = _characterConfidence(fields);
    final kw = _keywordScore(fields);
    final make = fields['make']?.confidence ?? 0.0;
    final model = fields['model']?.confidence ?? 0.0;
    final year = fields['year']?.confidence ?? 0.0;

    final fieldScores = <String, double>{
      'cc': cc,
      'kw': kw,
      'make': make,
      'model': model,
      'year': year,
    };

    final finalScore = cc * 0.25 + kw * 0.15 + make * 0.25 + model * 0.25 + year * 0.10;

    final ScoreBucket bucket;
    if (finalScore >= 0.85) {
      bucket = ScoreBucket.auto;
    } else if (finalScore >= 0.60) {
      // 0.60 is inclusive for top3 (not manual)
      bucket = ScoreBucket.top3;
    } else {
      bucket = ScoreBucket.manual;
    }

    return ScoreResult(finalScore: finalScore, bucket: bucket, fieldScores: fieldScores);
  }

  /// Average character-level confidence across all recognized fields.
  double _characterConfidence(Map<String, OcrField> fields) {
    final values = fields.values
        .where((f) => f.value != null)
        .map((f) => f.confidence)
        .toList();
    if (values.isEmpty) return 0.0;
    return values.reduce((a, b) => a + b) / values.length;
  }

  /// Keyword match rate — checks if make/model match known vehicle makes.
  double _keywordScore(Map<String, OcrField> fields) {
    final makeField = fields['make']?.value;
    if (makeField == null || makeField.isEmpty) return 0.0;

    final normalised = _normaliseMake(makeField);
    return _knownMakes.contains(normalised) ? 1.0 : 0.0;
  }

  /// Normalises a make string: handles Cyrillic → Latin conversion.
  String _normaliseMake(String raw) {
    final upper = raw.trim().toUpperCase();
    return _cyrillicToLatin[upper] ?? upper;
  }
}
