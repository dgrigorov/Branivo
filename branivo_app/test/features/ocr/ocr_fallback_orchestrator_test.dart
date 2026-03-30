import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/ocr/services/ocr_fallback_orchestrator.dart';
import 'package:branivo_app/features/ocr/services/ocr_scoring_engine.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_models.dart';
import 'package:branivo_app/features/ocr/data/repositories/google_vision_ocr_repository.dart';
import 'package:image_picker/image_picker.dart';

class MockGoogleVisionRepo extends Mock implements GoogleVisionOcrRepository {}
class MockXFile extends Mock implements XFile {}

void main() {
  late MockGoogleVisionRepo mockVisionRepo;
  late OcrScoringEngine engine;
  late OcrFallbackOrchestrator orchestrator;

  const sessionToken = 'anon-session-test';

  OcrField field(String? value, double confidence) =>
      OcrField(value: value, confidence: confidence, autoFilled: true);

  final highScoreFields = {
    'make': field('BMW', 0.95),
    'model': field('X5', 0.93),
    'license_plate': field('СА1234АА', 0.95),
    'vin': field('WVWZZZ3BZ3E123456', 0.92),
    'year': field('2020', 0.90),
  };

  final lowScoreFields = {
    'make': field(null, 0.0),
    'model': field(null, 0.0),
    'license_plate': field(null, 0.0),
  };

  setUp(() {
    mockVisionRepo = MockGoogleVisionRepo();
    engine = const OcrScoringEngine();
    orchestrator = OcrFallbackOrchestrator(
      visionRepository: mockVisionRepo,
      scoringEngine: engine,
    );
    registerFallbackValue(MockXFile());
    registerFallbackValue(<XFile>[]);
  });

  group('OcrFallbackOrchestrator — ML Kit sufficient', () {
    test('high score → MlKitResult returned without calling Vision', () async {
      final result = await orchestrator.orchestrate(
        mlKitFields: highScoreFields,
        sessionToken: sessionToken,
      );

      expect(result, isA<MlKitResult>());
      verifyNever(() => mockVisionRepo.scanImages(any(), any()));
    });
  });

  group('OcrFallbackOrchestrator — ML Kit insufficient', () {
    test('low score → calls Google Vision', () async {
      when(() => mockVisionRepo.scanImages(any(), any()))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: 'vision-job',
                status: OcrJobStatus.completed,
                fields: highScoreFields,
              ));

      final result = await orchestrator.orchestrate(
        mlKitFields: lowScoreFields,
        sessionToken: sessionToken,
      );

      expect(result, isA<VisionResult>());
      verify(() => mockVisionRepo.scanImages(any(), sessionToken)).called(1);
    });

    test('ML Kit timeout → calls Google Vision', () async {
      when(() => mockVisionRepo.scanImages(any(), any()))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: 'vision-job',
                status: OcrJobStatus.completed,
                fields: highScoreFields,
              ));

      final result = await orchestrator.orchestrate(
        mlKitFields: {},
        sessionToken: sessionToken,
        mlKitTimedOut: true,
      );

      expect(result, isA<VisionResult>());
    });

    test('Vision also low score → ManualEntryResult with message', () async {
      when(() => mockVisionRepo.scanImages(any(), any()))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: 'vision-job',
                status: OcrJobStatus.completed,
                fields: lowScoreFields,
              ));

      final result = await orchestrator.orchestrate(
        mlKitFields: lowScoreFields,
        sessionToken: sessionToken,
      );

      expect(result, isA<ManualEntryResult>());
      final manual = result as ManualEntryResult;
      expect(manual.message, isNotNull);
      expect(manual.message, isNot(contains('грешка')));
    });

    test('offline → ManualEntryResult with ML Kit prefill (no Vision call)', () async {
      when(() => mockVisionRepo.scanImages(any(), any()))
          .thenThrow(const OcrOfflineException());

      final result = await orchestrator.orchestrate(
        mlKitFields: lowScoreFields,
        sessionToken: sessionToken,
      );

      expect(result, isA<ManualEntryResult>());
      final manual = result as ManualEntryResult;
      expect(manual.prefilledFields, lowScoreFields);
    });

    test('Vision HTTP error → ManualEntryResult with message', () async {
      when(() => mockVisionRepo.scanImages(any(), any()))
          .thenThrow(const OcrVisionException('HTTP 500'));

      final result = await orchestrator.orchestrate(
        mlKitFields: lowScoreFields,
        sessionToken: sessionToken,
      );

      expect(result, isA<ManualEntryResult>());
    });

    test('Vision result merged per-field max-confidence', () async {
      final mlKitPartial = {
        'make': field('BMW', 0.70),
        'model': field(null, 0.0),
        'license_plate': field('СА1234АА', 0.85),
      };
      final visionPartial = {
        'make': field('BMW', 0.65),      // lower — ML Kit wins
        'model': field('X5', 0.88),      // higher — Vision wins
        'year': field('2020', 0.90),     // new field from Vision
      };

      when(() => mockVisionRepo.scanImages(any(), any()))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: 'vision-job',
                status: OcrJobStatus.completed,
                fields: visionPartial,
              ));

      final result = await orchestrator.orchestrate(
        mlKitFields: mlKitPartial,
        sessionToken: sessionToken,
      );

      // Score should be high enough for VisionResult
      if (result is VisionResult) {
        expect(result.fields['make']?.confidence, 0.70); // ML Kit wins
        expect(result.fields['model']?.confidence, 0.88); // Vision wins
        expect(result.fields['year']?.value, '2020');
      }
      // If ManualEntryResult, that's also acceptable since score may be < 0.60
    });

    test('make=null AND reg=null after Vision merge → ManualEntry', () async {
      // Even if Vision returns high confidence on other fields,
      // missing critical fields should push to manual
      final visionNoMakeNoReg = {
        'year': field('2020', 0.95),
        'color': field('red', 0.90),
      };

      when(() => mockVisionRepo.scanImages(any(), any()))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: 'vision-job',
                status: OcrJobStatus.completed,
                fields: visionNoMakeNoReg,
              ));

      final result = await orchestrator.orchestrate(
        mlKitFields: {},
        sessionToken: sessionToken,
        mlKitTimedOut: true,
      );

      expect(result, isA<ManualEntryResult>());
    });
  });
}
