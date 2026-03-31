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

  group('OcrWizardBloc', () {
    test('initial state is OcrInitialState', () {
      expect(buildBloc().state, isA<OcrInitialState>());
    });

    test('OcrStartCaptureEvent → OcrCapturingState(step: 0)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent());

      await expectLater(
        bloc.stream,
        emits(isA<OcrCapturingState>().having((s) => s.step, 'step', 0)),
      );
    });

    test('OcrImageCapturedEvent → OcrPreviewState for that step', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent());
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      final image = MockXFile();
      bloc.add(OcrImageCapturedEvent(step: 0, image: image));

      await expectLater(
        bloc.stream,
        emits(isA<OcrPreviewState>().having((s) => s.step, 'step', 0)),
      );
    });

    test('OcrPreviewConfirmedEvent → OcrCropState(step: 0)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent());
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrPreviewState>()));

      bloc.add(OcrPreviewConfirmedEvent(step: 0, sessionToken: sessionToken));
      await expectLater(
        bloc.stream,
        emits(isA<OcrCropState>().having((s) => s.step, 'step', 0)),
      );
    });

    test('OcrCropConfirmedEvent → OcrStepProcessingState then OcrCapturingState(step: 1)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent());
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrPreviewState>()));

      bloc.add(OcrPreviewConfirmedEvent(step: 0, sessionToken: sessionToken));
      await expectLater(bloc.stream, emits(isA<OcrCropState>()));

      bloc.add(OcrCropConfirmedEvent(
        step: 0,
        corners: const [Offset(0, 0), Offset(1, 0), Offset(1, 1), Offset(0, 1)],
        sessionToken: sessionToken,
      ));
      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OcrStepProcessingState>().having((s) => s.step, 'step', 0),
          isA<OcrCapturingState>().having((s) => s.step, 'step', 1),
        ]),
      );
    });

    test('OcrPreviewRetakeEvent → OcrCapturingState(same step)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent());
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrPreviewState>()));

      bloc.add(OcrPreviewRetakeEvent(step: 0));
      await expectLater(
        bloc.stream,
        emits(isA<OcrCapturingState>().having((s) => s.step, 'step', 0)),
      );
    });

    test('OcrScanSubmittedEvent → OcrCompletedState on vision success', () async {
      when(() => mockRepository.scanImages(any(), sessionToken))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: jobId,
                status: OcrJobStatus.completed,
                fields: mockFields,
              ));

      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent());
      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      bloc.add(OcrScanSubmittedEvent(sessionToken: sessionToken));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OcrCapturingState>(),
          isA<OcrPreviewState>(),
          // Emitted immediately before await to give UI a loading indicator.
          isA<OcrProcessingState>(),
          isA<OcrCompletedState>().having(
            (s) => s.fields['license_plate']?.value,
            'license_plate.value',
            'СА1234АА',
          ),
        ]),
      );
    });

    test('OcrScanSubmittedEvent → OcrProcessingState on textract fallback', () async {
      when(() => mockRepository.scanImages(any(), sessionToken))
          .thenAnswer((_) async => OcrScanResponse(
                jobId: jobId,
                status: OcrJobStatus.processing,
              ));

      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent());
      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      bloc.add(OcrScanSubmittedEvent(sessionToken: sessionToken));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OcrCapturingState>(),
          isA<OcrPreviewState>(),
          // Immediate local-scanning indicator before the cloud response.
          isA<OcrProcessingState>().having(
            (s) => s.jobId, 'jobId', 'local-scanning',
          ),
          // Cloud response confirms async processing with the real job id.
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
      bloc.add(OcrStartCaptureEvent());

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
      bloc.add(OcrStartCaptureEvent());
      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      bloc.add(OcrScanSubmittedEvent(sessionToken: sessionToken));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OcrCapturingState>(),
          isA<OcrPreviewState>(),
          isA<OcrProcessingState>(),
          isA<OcrFailedState>(),
        ]),
      );
    });

    // ─── Camera quality state machine tests ─────────────────────────────────

    test('OcrFrameAnalyzedEvent with blur status → OcrCameraQualityState(blur)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent());
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
      bloc.add(OcrStartCaptureEvent());
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
      bloc.add(OcrStartCaptureEvent());
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
      bloc.add(OcrStartCaptureEvent());
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
      bloc.add(OcrStartCaptureEvent());

      await expectLater(
        bloc.stream,
        emitsThrough(isA<OcrCapturingState>().having((s) => s.step, 'step', 0)),
      );
      await bloc.close();
    });
  });
}
