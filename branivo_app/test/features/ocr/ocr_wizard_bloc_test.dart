import 'package:image_picker/image_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/ocr/bloc/ocr_wizard_bloc.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_api_repository.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_models.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_repository.dart';

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

    test('OcrPreviewConfirmedEvent → OcrCapturingState(step: 1)', () async {
      final bloc = buildBloc();
      bloc.add(OcrStartCaptureEvent());
      await expectLater(bloc.stream, emits(isA<OcrCapturingState>()));

      bloc.add(OcrImageCapturedEvent(step: 0, image: MockXFile()));
      await expectLater(bloc.stream, emits(isA<OcrPreviewState>()));

      bloc.add(OcrPreviewConfirmedEvent(step: 0, sessionToken: sessionToken));
      await expectLater(
        bloc.stream,
        emits(isA<OcrCapturingState>().having((s) => s.step, 'step', 1)),
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
  });
}
