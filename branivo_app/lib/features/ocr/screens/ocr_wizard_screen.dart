import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:permission_handler/permission_handler.dart';
import '../bloc/ocr_wizard_bloc.dart';
import '../data/repositories/ocr_models.dart';

const _fieldLabels = {
  'license_plate': 'Регистрационен номер',
  'vin': 'VIN номер',
  'make': 'Марка',
  'model': 'Модел',
  'year': 'Година',
  'color': 'Цвят',
  'engine_volume': 'Обем на двигателя',
  'fuel_type': 'Вид гориво',
  'first_registration_date': 'Дата на първа регистрация',
};

const _stepLabels = [
  'Насочете камерата към лицевата страна на Свидетелство за регистрация — Част I',
  'Насочете камерата към Свидетелство за регистрация — Част II',
];

class OcrWizardScreen extends StatefulWidget {
  const OcrWizardScreen({
    super.key,
    required this.sessionToken,
    required this.onComplete,
    required this.onManualEntry,
  });

  final String sessionToken;
  final void Function(Map<String, OcrField> fields) onComplete;
  final VoidCallback onManualEntry;

  @override
  State<OcrWizardScreen> createState() => _OcrWizardScreenState();
}

class _OcrWizardScreenState extends State<OcrWizardScreen> {
  CameraController? _cameraController;
  List<CameraDescription> _cameras = [];
  bool _cameraReady = false;

  @override
  void initState() {
    super.initState();
    context.read<OcrWizardBloc>().add(OcrStartCaptureEvent());
    _initCamera();
  }

  Future<void> _initCamera() async {
    final status = await Permission.camera.request();
    if (!status.isGranted) {
      if (mounted) widget.onManualEntry();
      return;
    }

    _cameras = await availableCameras();
    if (_cameras.isEmpty) return;

    final rear = _cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.back,
      orElse: () => _cameras.first,
    );

    _cameraController = CameraController(
      rear,
      ResolutionPreset.high,
      enableAudio: false,
    );

    await _cameraController!.initialize();
    if (mounted) setState(() => _cameraReady = true);
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    super.dispose();
  }

  Future<void> _captureImage(int step) async {
    if (_cameraController == null || !_cameraReady) return;
    final file = await _cameraController!.takePicture();
    if (!mounted) return;

    final bloc = context.read<OcrWizardBloc>();
    bloc.add(OcrImageCapturedEvent(step: step, image: file));

    if (step == _stepLabels.length - 1) {
      bloc.add(OcrScanSubmittedEvent(sessionToken: widget.sessionToken));
    }
  }

  @override
  Widget build(BuildContext context) {
    final disableAnimations = MediaQuery.of(context).disableAnimations;

    return BlocConsumer<OcrWizardBloc, OcrWizardState>(
      listener: (context, state) {
        if (state is OcrCompletedState) {
          widget.onComplete(state.fields);
        } else if (state is OcrManualInputState) {
          widget.onManualEntry();
        }
      },
      builder: (context, state) {
        if (state is OcrFailedState) {
          return _FailedView(onManualEntry: widget.onManualEntry);
        }

        if (state is OcrProcessingState || (state is OcrCapturingState && !_cameraReady)) {
          return _LoadingView(disableAnimations: disableAnimations);
        }

        if (state is OcrCompletedState) {
          return _ResultsView(
            fields: state.fields,
            onManualEntry: widget.onManualEntry,
          );
        }

        final step = state is OcrCapturingState ? state.step : 0;
        return _CaptureView(
          step: step,
          cameraController: _cameraController,
          cameraReady: _cameraReady,
          onCapture: () => _captureImage(step),
          onManualEntry: widget.onManualEntry,
        );
      },
    );
  }
}

class _CaptureView extends StatelessWidget {
  const _CaptureView({
    required this.step,
    required this.cameraController,
    required this.cameraReady,
    required this.onCapture,
    required this.onManualEntry,
  });

  final int step;
  final CameraController? cameraController;
  final bool cameraReady;
  final VoidCallback onCapture;
  final VoidCallback onManualEntry;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Step indicator
        Row(
          children: List.generate(_stepLabels.length, (i) {
            return Expanded(
              child: Container(
                height: 4,
                margin: const EdgeInsets.symmetric(horizontal: 2),
                decoration: BoxDecoration(
                  color: i < step
                      ? Colors.green
                      : i == step
                          ? Colors.blue
                          : Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 16),

        // Camera preview with guide overlay
        Semantics(
          label: _stepLabels[step],
          child: Stack(
            alignment: Alignment.center,
            children: [
              if (cameraReady && cameraController != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: CameraPreview(cameraController!),
                )
              else
                Container(
                  height: 240,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.amber, width: 3),
                  ),
                ),
              // High-contrast guide overlay
              Container(
                height: 240,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.amber, width: 3),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        Text(
          _stepLabels[step],
          style: Theme.of(context).textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Text(
          'Стъпка ${step + 1} от ${_stepLabels.length}',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Colors.grey,
              ),
        ),
        const SizedBox(height: 16),

        ElevatedButton.icon(
          onPressed: onCapture,
          icon: const Icon(Icons.camera_alt),
          label: const Text('Снимай'),
          style: ElevatedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
          ),
        ),
        const SizedBox(height: 8),

        TextButton(
          onPressed: onManualEntry,
          child: const Text('Въведи ръчно'),
        ),
      ],
    );
  }
}

class _LoadingView extends StatelessWidget {
  const _LoadingView({required this.disableAnimations});
  final bool disableAnimations;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          disableAnimations
              ? Container(
                  width: 32,
                  height: 32,
                  decoration: const BoxDecoration(
                    color: Colors.blue,
                    shape: BoxShape.circle,
                  ),
                )
              : const CircularProgressIndicator(),
          const SizedBox(height: 12),
          const Text('Обработваме документа…'),
        ],
      ),
    );
  }
}

class _FailedView extends StatelessWidget {
  const _FailedView({required this.onManualEntry});
  final VoidCallback onManualEntry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.warning_amber, color: Colors.orange, size: 48),
          const SizedBox(height: 12),
          const Text(
            'Не успяхме да разчетем документа. Моля, попълнете ръчно.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: onManualEntry,
            child: const Text('Попълни ръчно'),
          ),
        ],
      ),
    );
  }
}

class _ResultsView extends StatelessWidget {
  const _ResultsView({required this.fields, required this.onManualEntry});
  final Map<String, OcrField> fields;
  final VoidCallback onManualEntry;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Разпознати данни',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          ..._fieldLabels.entries.map((entry) {
            final field = fields[entry.key];
            final isLow = field != null && field.isLowConfidence;

            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.value,
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                  const SizedBox(height: 4),
                  Tooltip(
                    message: isLow ? 'Моля, проверете тази информация' : '',
                    child: TextFormField(
                      initialValue: field?.value ?? '',
                      decoration: InputDecoration(
                        suffixIcon: isLow
                            ? const Icon(Icons.warning_amber, color: Colors.amber)
                            : const Icon(Icons.check_circle, color: Colors.green),
                        enabledBorder: OutlineInputBorder(
                          borderSide: BorderSide(
                            color: isLow ? Colors.amber : Colors.green,
                          ),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderSide: BorderSide(
                            color: isLow ? Colors.amber : Colors.green,
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
          TextButton(
            onPressed: onManualEntry,
            child: const Text('Редактирай ръчно'),
          ),
        ],
      ),
    );
  }
}
