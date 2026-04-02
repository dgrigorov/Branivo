import 'package:flutter_test/flutter_test.dart';
import 'package:branivo_app/features/ocr/services/ocr_scoring_engine.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_models.dart';

void main() {
  const engine = OcrScoringEngine();

  // Convenience factory
  OcrField field(String? value, double confidence) =>
      OcrField(value: value, confidence: confidence, autoFilled: true);

  group('OcrScoringEngine — merge', () {
    test('merge: scan2 empty → returns scan1 unchanged', () {
      final scan1 = {
        'make': field('BMW', 0.90),
        'model': field('X5', 0.85),
      };
      final result = engine.merge(scan1, {});
      expect(result['make']?.confidence, 0.90);
      expect(result['model']?.confidence, 0.85);
    });

    test('merge: scan1 empty → returns scan2', () {
      final scan2 = {'year': field('2020', 0.80)};
      final result = engine.merge({}, scan2);
      expect(result['year']?.confidence, 0.80);
    });

    test('merge: higher confidence wins per field', () {
      final scan1 = {'make': field('BMW', 0.70)};
      final scan2 = {'make': field('BMW', 0.90)};
      final result = engine.merge(scan1, scan2);
      expect(result['make']?.confidence, 0.90);
    });

    test('merge: scan1 higher confidence kept over scan2', () {
      final scan1 = {'vin': field('WVWZZZ3BZ3E123456', 0.92)};
      final scan2 = {'vin': field('WVWZZZ3BZ3E123456', 0.75)};
      final result = engine.merge(scan1, scan2);
      expect(result['vin']?.confidence, 0.92);
    });

    test('merge: null value treated as confidence -1, non-null wins', () {
      final scan1 = {'make': field(null, 0.0)};
      final scan2 = {'make': field('Toyota', 0.0)};
      final result = engine.merge(scan1, scan2);
      // scan2 has non-null value → should win
      expect(result['make']?.value, 'Toyota');
    });

    test('merge: score boundary 0.60 is inclusive for top3', () {
      // 0.60 exactly should map to top3, not manual
      final fields = {
        'make': field('BMW', 0.60),
        'model': field('X5', 0.60),
        'year': field('2020', 0.60),
        'license_plate': field('СА1234АА', 0.60),
        'vin': field('WVWZZZ3BZ3E123456', 0.60),
      };
      // Compute score manually: cc=0.60, kw=1.0 (BMW known), make=0.60, model=0.60, year=0.60
      // score = 0.60*0.25 + 1.0*0.15 + 0.60*0.25 + 0.60*0.25 + 0.60*0.10
      //       = 0.15 + 0.15 + 0.15 + 0.15 + 0.06 = 0.66 → top3
      final result = engine.score(fields);
      expect(result.bucket, ScoreBucket.top3);
    });
  });

  group('OcrScoringEngine — score buckets', () {
    test('score ≥ 0.85 → auto bucket', () {
      final fields = {
        'make': field('BMW', 0.95),
        'model': field('X5', 0.93),
        'year': field('2020', 0.90),
        'license_plate': field('СА1234АА', 0.95),
        'vin': field('WVWZZZ3BZ3E123456', 0.92),
      };
      final result = engine.score(fields);
      expect(result.bucket, ScoreBucket.auto);
      expect(result.finalScore, greaterThanOrEqualTo(0.85));
    });

    test('score 0.60–0.84 → top3 bucket', () {
      final fields = {
        'make': field('BMW', 0.70),
        'model': field('X5', 0.65),
        'year': field('2020', 0.68),
      };
      final result = engine.score(fields);
      expect(result.bucket, ScoreBucket.top3);
    });

    test('score < 0.60 → manual bucket', () {
      final fields = {
        'make': field(null, 0.0),
        'model': field(null, 0.0),
        'year': field(null, 0.0),
      };
      final result = engine.score(fields);
      expect(result.bucket, ScoreBucket.manual);
    });

    test('empty fields → manual bucket with score 0', () {
      final result = engine.score({});
      expect(result.bucket, ScoreBucket.manual);
      expect(result.finalScore, 0.0);
    });
  });

  group('OcrScoringEngine — keyword scoring', () {
    test('known Latin make → kw = 1.0', () {
      final fields = {'make': field('BMW', 0.90)};
      final result = engine.score(fields);
      expect(result.fieldScores['kw'], 1.0);
    });

    test('Cyrillic BMW → normalised to BMW → kw = 1.0', () {
      final fields = {'make': field('БМВ', 0.90)};
      final result = engine.score(fields);
      expect(result.fieldScores['kw'], 1.0);
    });

    test('Cyrillic Volkswagen → normalised → kw = 1.0', () {
      final fields = {'make': field('Фолксваген', 0.90)};
      final result = engine.score(fields);
      expect(result.fieldScores['kw'], 1.0);
    });

    test('unknown make → kw = 0.0', () {
      final fields = {'make': field('UnknownMakeXYZ', 0.90)};
      final result = engine.score(fields);
      expect(result.fieldScores['kw'], 0.0);
    });

    test('null make → kw = 0.0', () {
      final fields = {'make': field(null, 0.0)};
      final result = engine.score(fields);
      expect(result.fieldScores['kw'], 0.0);
    });
  });

  group('OcrScoringEngine — ScoreResult fields', () {
    test('fieldScores contains all weight keys', () {
      final fields = {'make': field('Toyota', 0.80)};
      final result = engine.score(fields);
      expect(result.fieldScores.keys, containsAll(['cc', 'kw', 'make', 'model', 'year']));
    });

    test('finalScore matches formula', () {
      // cc=0.80, kw=1.0 (Toyota), make=0.80, model=0 (missing), year=0
      // score = 0.80*0.25 + 1.0*0.15 + 0.80*0.25 + 0*0.25 + 0*0.10
      //       = 0.20 + 0.15 + 0.20 = 0.55
      final fields = {'make': field('Toyota', 0.80)};
      final result = engine.score(fields);
      expect(result.finalScore, closeTo(0.55, 0.001));
    });
  });
}
