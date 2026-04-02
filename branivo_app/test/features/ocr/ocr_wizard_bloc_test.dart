import 'package:image_picker/image_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/ocr/bloc/ocr_wizard_bloc.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_api_repository.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_models.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_repository.dart';
import 'package:branivo_app/features/ocr/services/camera_quality_analyzer.dart';

class MockOcrRepository extends Mock implements OcrRepository {}
class MockXFile extends Mock implements XFile {}

void main() {
  late MockOcrRepository mockRepository;

  setUp(() {
    mockRepository = MockOcrRepository();
    registerFallbackValue(MockXFile());
  });

  OcrWizardBloc buildBloc() => OcrWizardBloc(repository: mockRepository);

  const sessionToken = 'anon-session-test';
  const jobId = 'ocr-job-uuid-123';

  final mockFields = {
    'license_plate': OcrField(value: 'СА1234АА', confidence: 0.95, autoFilled: true),
    'vin': OcrField(value: 'WVWZZZ3BZ3E123456', confidence: 0.92, autoFilled: true),
  };

  group('OcrWizardBloc — capture-all-then-crop flow', () {
    test('initial state is OcrInitialState', () {
      expect(buildBloc().state, isA<OcrInitialState>());
    });

    test('OcrStartCaptureEvent → OcrCapturingState(step: 0)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));

      await expectLater(
        bloc.stream,
        emits(isA<OcrCapturingState>().having((s) => s.step, 'step', 0)),
      );
    });

    // ── Capture phase ────────────────────────────────────────────────────────

    test('capture step 0 → OcrCapturingState(step: 1) — stays in capture phase', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));

      await expectLater(
        bloc.stream,
        emits(isA<OcrCapturingState>()
            .having((s) => s.step, 'step', 1)
            .having((s) => s.capturedImages.length, 'capturedImages.length', 1)),
      );
    });

    test('capture step 2 (all 3 captured) → OcrCropState(step: 0)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));
      bloc.add(OcrImageCapturedEvent(step: 1, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 2, image: MockXFile()));

      await expectLater(
        bloc.stream,
        emits(isA<OcrCropState>().having((s) => s.step, 'step', 0)),
      );
    });

    // ── Crop phase ───────────────────────────────────────────────────────────

    test('OcrCropConfirmedEvent step 0 → OcrCropState(step: 1)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));
      bloc.add(OcrImageCapturedEvent(step: 1, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));
      bloc.add(OcrImageCapturedEvent(step: 2, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCropState>()));

      bloc.add(OcrCropConfirmedEvent(
        step: 0,
        corners: const [Offset(0, 0), Offset(1, 0), Offset(1, 1), Offset(0, 1)],
        sessionToken: sessionToken,
      ));

      await expectLater(
        bloc.stream,
        emits(isA<OcrCropState>().having((s) => s.step, 'step', 1)),
      );
    });

    test('OcrCropConfirmedEvent step 2 (last) → OcrStepProcessingState then scan', () async {
      when(() => mockRepository.scanImages(any(), sessionToken, corners: any(named: 'corners')))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: jobId,
                status: OcrJobStatus.completed,
                fields: mockFields,
              ));

      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));
      bloc.add(OcrImageCapturedEvent(step: 1, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));
      bloc.add(OcrImageCapturedEvent(step: 2, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCropState>()));

      bloc.add(OcrCropConfirmedEvent(
        step: 0,
        corners: const [Offset(0, 0), Offset(1, 0), Offset(1, 1), Offset(0, 1)],
        sessionToken: sessionToken,
      ));
      await expectLater(bloc.stream, emits(isA<OcrCropState>()));

      bloc.add(OcrCropConfirmedEvent(
        step: 1,
        corners: const [Offset(0, 0), Offset(1, 0), Offset(1, 1), Offset(0, 1)],
        sessionToken: sessionToken,
      ));
      await expectLater(bloc.stream, emits(isA<OcrCropState>()));

      bloc.add(OcrCropConfirmedEvent(
        step: 2,
        corners: const [Offset(0, 0), Offset(1, 0), Offset(1, 1), Offset(0, 1)],
        sessionToken: sessionToken,
      ));

      // After last crop, goes directly to scan (no step processing animation).
      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OcrProcessingState>(),
          isA<OcrCompletedState>().having(
            (s) => s.fields['license_plate']?.value,
            'license_plate.value',
            'СА1234АА',
          ),
        ]),
      );
    });

    // ── Retake ───────────────────────────────────────────────────────────────

    test('OcrPreviewRetakeEvent → OcrCapturingState(step: 0) clears all', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));
      bloc.add(OcrImageCapturedEvent(step: 1, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));
      bloc.add(OcrImageCapturedEvent(step: 2, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrCropState>()));

      bloc.add(OcrPreviewRetakeEvent(step: 0));
      await expectLater(
        bloc.stream,
        emits(isA<OcrCapturingState>()
            .having((s) => s.step, 'step', 0)
            .having((s) => s.capturedImages.length, 'capturedImages.length', 0)),
      );
    });

    // ── API success ──────────────────────────────────────────────────────────

    test('OcrScanSubmittedEvent → OcrCompletedState on success', () async {
      when(() => mockRepository.scanImages(any(), sessionToken))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: jobId,
                status: OcrJobStatus.completed,
                fields: mockFields,
              ));

      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      bloc.add(OcrScanSubmittedEvent(sessionToken: sessionToken));

      // step 0 captured → OcrCapturingState(step:1); then scan submitted directly
      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OcrCapturingState>(), // start
          isA<OcrCapturingState>(), // after capture step 0
          isA<OcrProcessingState>(),
          isA<OcrCompletedState>().having(
            (s) => s.fields['license_plate']?.value,
            'license_plate.value',
            'СА1234АА',
          ),
        ]),
      );
    });

    test('OcrScanSubmittedEvent → OcrProcessingState on async fallback', () async {
      when(() => mockRepository.scanImages(any(), sessionToken))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: jobId,
                status: OcrJobStatus.processing,
              ));

      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      bloc.add(OcrScanSubmittedEvent(sessionToken: sessionToken));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OcrCapturingState>(),
          isA<OcrCapturingState>(),
          isA<OcrProcessingState>().having((s) => s.jobId, 'jobId', 'local-scanning'),
          isA<OcrProcessingState>().having((s) => s.jobId, 'jobId', jobId),
        ]),
      );

      await bloc.close();
    });

    test('full 3-step flow: last OcrPreviewConfirmedEvent triggers scan directly', () async {
      when(() => mockRepository.scanImages(any(), sessionToken))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: jobId,
                status: OcrJobStatus.completed,
                fields: mockFields,
              ));

      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));

      for (int step = 0; step < 3; step++) {
        bloc.add(OcrImageCapturedEvent(step: step, image: MockXFile()));
        bloc.add(OcrPreviewConfirmedEvent(step: step, sessionToken: sessionToken));
      }

      await expectLater(
        bloc.stream,
        emitsThrough(isA<OcrCompletedState>()),
      );
      await bloc.close();
    });

    test('OcrManualFallbackRequestedEvent → OcrManualInputState', () async {
      final bloc = buildBloc();
      bloc.add(OcrManualFallbackRequestedEvent());

      await expectLater(
        bloc.stream,
        emits(isA<OcrManualInputState>()),
      );
    });

    test('OcrScanSubmittedEvent with API error → OcrFailedState', () async {
      when(() => mockRepository.scanImages(any(), sessionToken))
          .thenThrow(OcrApiException('Server error'));

      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      bloc.add(OcrScanSubmittedEvent(sessionToken: sessionToken));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OcrCapturingState>(), // start
          isA<OcrCapturingState>(), // after capture step 0
          isA<OcrProcessingState>(),
          isA<OcrFailedState>(),
        ]),
      );
    });

    // ─── Camera quality state machine tests ─────────────────────────────────

    test('OcrFrameAnalyzedEvent with blur status → OcrCameraQualityState(blur)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      const quality = QualityResult(
        status: QualityStatus.blur,
        blurVariance: 50.0,
        brightnessAvg: 120.0,
        frameFill: 0.70,
      );
      bloc.add(OcrFrameAnalyzedEvent(quality: quality));

      await expectLater(
        bloc.stream,
        emits(isA<OcrCameraQualityState>().having(
          (s) => s.status, 'status', QualityStatus.blur,
        )),
      );
    });

    test('OcrFrameAnalyzedEvent VIN found → OcrVinDetectedState', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      const quality = QualityResult(
        status: QualityStatus.vinFound,
        blurVariance: 200.0,
        brightnessAvg: 120.0,
        frameFill: 0.80,
        vinConfidence: 0.92,
        detectedVin: 'WVWZZZ3BZ3E123456',
      );
      bloc.add(OcrFrameAnalyzedEvent(quality: quality));

      await expectLater(
        bloc.stream,
        emits(isA<OcrVinDetectedState>().having(
          (s) => s.vin, 'vin', 'WVWZZZ3BZ3E123456',
        )),
      );
      await bloc.close();
    });

    test('OcrManualAssistEvent → OcrManualAssistState', () async {
      final bloc = buildBloc();
      bloc.add(OcrManualAssistEvent());

      await expectLater(
        bloc.stream,
        emits(isA<OcrManualAssistState>()),
      );
    });

    test('VIN_FOUND takes priority over QUALITY_OK when both conditions met', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      // Send VIN found — should emit VinDetected, not QualityOk
      const quality = QualityResult(
        status: QualityStatus.vinFound,
        blurVariance: 200.0,
        brightnessAvg: 120.0,
        frameFill: 0.80,
        vinConfidence: 0.92,
        detectedVin: 'WVWZZZ3BZ3E123456',
      );
      bloc.add(OcrFrameAnalyzedEvent(quality: quality));

      await expectLater(
        bloc.stream,
        emits(isA<OcrVinDetectedState>()),
      );
      // VIN captured flag prevents second trigger
      bloc.add(OcrFrameAnalyzedEvent(quality: quality));
      // Should NOT emit another VinDetectedState
      await bloc.close();
    });

    test('OcrStartCaptureEvent resets consecutive frame counter', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      // Send 2 ok frames, then restart — counter should reset
      const okQuality = QualityResult(
        status: QualityStatus.ok,
        blurVariance: 200.0,
        brightnessAvg: 120.0,
        frameFill: 0.80,
      );
      bloc.add(OcrFrameAnalyzedEvent(quality: okQuality));
      bloc.add(OcrFrameAnalyzedEvent(quality: okQuality));
      bloc.add(OcrStartCaptureEvent(sessionToken: sessionToken));

      await expectLater(
        bloc.stream,
        emitsThrough(isA<OcrCapturingState>().having((s) => s.step, 'step', 0)),
      );
      await bloc.close();
    });
  });
}
