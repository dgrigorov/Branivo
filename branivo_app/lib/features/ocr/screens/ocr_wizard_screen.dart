import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/ocr_wizard_bloc.dart';
import '../data/repositories/ocr_models.dart';
import '../services/camera_quality_analyzer.dart';
import 'ocr_camera_view.dart';
import 'ocr_wizard_constants.dart';
import 'ocr_crop_editor_view.dart';
import 'ocr_processing_view.dart';
import 'ocr_results_view.dart';

export 'ocr_wizard_constants.dart';

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

class _OcrWizardScreenState extends State<OcrWizardScreen>
    with WidgetsBindingObserver {
  CameraController? _camera;
  bool _cameraReady = false;
  double _zoom = 1.0;
  double _minZoom = 1.0;
  double _maxZoom = 8.0;
  double _baseZoom = 1.0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initCamera();
    context.read<OcrWizardBloc>().add(OcrStartCaptureEvent());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _camera?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive) {
      _camera?.dispose();
      _camera = null;
      if (mounted) setState(() => _cameraReady = false);
    } else if (state == AppLifecycleState.resumed && !_cameraReady) {
      _initCamera();
    }
  }

  Future<void> _initCamera() async {
    try {
      final cams = await availableCameras();
      if (cams.isEmpty || !mounted) return;
      final ctrl = CameraController(
        cams.first,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await ctrl.initialize();
      await ctrl.setFocusMode(FocusMode.auto);
      await ctrl.setExposureMode(ExposureMode.auto);
      final minZ = await ctrl.getMinZoomLevel();
      final maxZ = await ctrl.getMaxZoomLevel();
      if (!mounted) {
        await ctrl.dispose();
        return;
      }
      setState(() {
        _camera = ctrl;
        _cameraReady = true;
        _minZoom = minZ;
        _maxZoom = maxZ;
        _zoom = minZ;
      });
    } catch (_) {
      // Camera unavailable — fallback placeholder shown
    }
  }

  Future<void> _takePhoto(int step) async {
    final ctrl = _camera;
    if (ctrl == null || !ctrl.value.isInitialized || ctrl.value.isTakingPicture) return;
    try {
      final file = await ctrl.takePicture();
      if (!mounted) return;
      context.read<OcrWizardBloc>().add(
        OcrImageCapturedEvent(step: step, image: file),
      );
    } catch (_) {}
  }

  void _onScaleStart(ScaleStartDetails d) => _baseZoom = _zoom;

  Future<void> _onScaleUpdate(ScaleUpdateDetails d) async {
    final ctrl = _camera;
    if (ctrl == null || !_cameraReady) return;
    final z = (_baseZoom * d.scale).clamp(_minZoom, _maxZoom);
    await ctrl.setZoomLevel(z);
    if (mounted) setState(() => _zoom = z);
  }

  Future<void> _onTapFocus(TapUpDetails d, Size size) async {
    final ctrl = _camera;
    if (ctrl == null || !_cameraReady) return;
    final x = d.localPosition.dx / size.width;
    final y = d.localPosition.dy / size.height;
    await ctrl.setFocusPoint(Offset(x, y));
    await ctrl.setExposurePoint(Offset(x, y));
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: BlocConsumer<OcrWizardBloc, OcrWizardState>(
          listener: _onState,
          builder: _buildBody,
        ),
      ),
    );
  }

  void _onState(BuildContext ctx, OcrWizardState state) {
    if (state is OcrManualInputState) widget.onManualEntry();
    if (state is OcrCapturingState && !_cameraReady) _initCamera();
    // VIN auto-capture: haptic feedback (story-24.1)
    if (state is OcrVinDetectedState) {
      final disableAnimations = MediaQuery.of(context).disableAnimations;
      if (!disableAnimations) HapticFeedback.mediumImpact();
    }
  }

  Widget _buildBody(BuildContext ctx, OcrWizardState state) {
    if (state is OcrFailedState) {
      return OcrFailedView(
        message: state.errorMessage,
        onManualEntry: widget.onManualEntry,
      );
    }
    if (state is OcrCompletedState) {
      return OcrResultsView(
        fields: state.fields,
        rawText: state.rawText,
        debugImages: state.debugImages,
        onProceed: widget.onComplete,
        onManualEntry: widget.onManualEntry,
      );
    }
    if (state is OcrProcessingState || state is OcrInitialState) {
      return const OcrFinalProcessingView();
    }
    if (state is OcrStepProcessingState) {
      return OcrStepProcessingView(step: state.step, image: state.image);
    }
    if (state is OcrCropState) {
      return OcrCropEditorView(
        step: state.step,
        image: state.image,
        initialCorners: state.corners,
        sessionToken: state.sessionToken,
      );
    }
    if (state is OcrPreviewState) {
      return OcrPreviewView(
        step: state.step,
        image: state.image,
        onConfirm: () => ctx.read<OcrWizardBloc>().add(
          OcrPreviewConfirmedEvent(
            step: state.step,
            sessionToken: widget.sessionToken,
          ),
        ),
        onRetake: () {
          if (!_cameraReady) _initCamera();
          ctx.read<OcrWizardBloc>().add(OcrPreviewRetakeEvent(step: state.step));
        },
      );
    }
    // Camera quality states: show overlay
    if (state is OcrCameraQualityState || state is OcrVinDetectedState || state is OcrManualAssistState) {
      return _CameraQualityView(
        state: state,
        disableAnimations: MediaQuery.of(context).disableAnimations,
        onManualCapture: () => context.read<OcrWizardBloc>().add(
          OcrScanSubmittedEvent(sessionToken: widget.sessionToken),
        ),
        onBack: widget.onManualEntry,
      );
    }
    // Enrichment states: show informational overlays
    if (state is OcrDuplicatePolicyState) {
      return _DuplicatePolicyView(
        policyNumber: state.policyNumber,
        insurer: state.insurer,
        onBack: widget.onManualEntry,
      );
    }
    if (state is OcrGfHitState) {
      return _GfHitView(
        insurer: state.insurer,
        validUntil: state.validUntil,
        onContinue: () => context.read<OcrWizardBloc>().add(OcrStartCaptureEvent()),
        onBack: widget.onManualEntry,
      );
    }
    if (state is OcrGfWarningState) {
      return _GfWarningView(
        onContinue: () => context.read<OcrWizardBloc>().add(OcrStartCaptureEvent()),
      );
    }
    final step = state is OcrCapturingState ? state.step : 0;
    final captured = state is OcrCapturingState ? state.capturedImages.length : 0;
    return OcrCameraView(
      step: step,
      capturedCount: captured,
      camera: _camera,
      cameraReady: _cameraReady,
      zoom: _zoom,
      minZoom: _minZoom,
      maxZoom: _maxZoom,
      onCapture: () => _takePhoto(step),
      onManualEntry: widget.onManualEntry,
      onScaleStart: _onScaleStart,
      onScaleUpdate: _onScaleUpdate,
      onTapFocus: _onTapFocus,
    );
  }
}
class _CameraQualityView extends StatelessWidget {
  const _CameraQualityView({
    required this.state,
    required this.disableAnimations,
    required this.onManualCapture,
    required this.onBack,
  });

  final OcrWizardState state;
  final bool disableAnimations;
  final VoidCallback onManualCapture;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    QualityStatus? status;
    QualityResult? quality;
    final isManualAssist = state is OcrManualAssistState;
    final isVinFound = state is OcrVinDetectedState;

    if (state is OcrCameraQualityState) {
      final s = state as OcrCameraQualityState;
      status = s.status;
      quality = s.quality;
    } else if (isVinFound) {
      status = QualityStatus.vinFound;
    }

    return Stack(
      children: [
        // Background placeholder for camera preview
        Container(color: kOcrBg),
        // Quality frame overlay
        Center(
          child: QualityFrameOverlay(
            status: status ?? QualityStatus.blur,
            disableAnimations: MediaQuery.of(context).disableAnimations,
          ),
        ),
        // Debug overlay — kDebugMode or triple-tap
        _DebugQualityPanelWrapper(quality: quality),
        // Manual assist floating button (appears after 5s)
        if (isManualAssist)
          Positioned(
            bottom: 80,
            left: 40,
            right: 40,
            child: _ManualAssistButton(
              disableAnimations: MediaQuery.of(context).disableAnimations,
              onPressed: onManualCapture,
            ),
          ),
        // Back button
        Positioned(
          top: 12,
          left: 16,
          child: GestureDetector(
            onTap: onBack,
            child: Container(
              width: 36,
              height: 36,
              decoration: const BoxDecoration(color: kOcrSurface, shape: BoxShape.circle),
              child: const Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Quality frame overlay widget ────────────────────────────────────────────

class QualityFrameOverlay extends StatelessWidget {
  const QualityFrameOverlay({
    super.key,
    required this.status,
    required this.disableAnimations,
  });

  final QualityStatus status;
  final bool disableAnimations;

  @override
  Widget build(BuildContext context) {
    final (color, icon, label) = _statusProps(status);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 280,
          height: 180,
          decoration: BoxDecoration(
            border: Border.all(
              color: color,
              width: 3,
              strokeAlign: BorderSide.strokeAlignOutside,
            ),
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
          ],
        ),
      ],
    );
  }

  (Color, IconData, String) _statusProps(QualityStatus s) => switch (s) {
    QualityStatus.blur => (Colors.red, Icons.blur_on, 'Задръжте неподвижно'),
    QualityStatus.dark => (Colors.yellow, Icons.wb_sunny, 'Намерете по-добро осветление'),
    QualityStatus.overexposed => (Colors.yellow, Icons.wb_sunny, 'Намерете по-добро осветление'),
    QualityStatus.tooFar => (Colors.blue, Icons.center_focus_weak, 'Приближете талона'),
    QualityStatus.unstable => (Colors.orange, Icons.blur_on, 'Задръжте неподвижно'),
    QualityStatus.ok => (Colors.green, Icons.check_circle_outline, 'Отлично — сканиране...'),
    QualityStatus.vinFound => (Colors.green, Icons.check_circle, 'VIN открит — сканиране...'),
  };
}

// ─── Debug quality panel ──────────────────────────────────────────────────────

class _DebugQualityPanelWrapper extends StatefulWidget {
  const _DebugQualityPanelWrapper({this.quality});
  final QualityResult? quality;

  @override
  State<_DebugQualityPanelWrapper> createState() => _DebugQualityPanelWrapperState();
}

class _DebugQualityPanelWrapperState extends State<_DebugQualityPanelWrapper> {
  bool _showDebug = false;

  @override
  Widget build(BuildContext context) {
    if (kDebugMode || _showDebug) {
      return _buildPanel();
    }
    return GestureDetector(
      onTap: () {
        // Triple-tap: use GestureDetector with custom onTap count tracking
      },
      child: _TripleTapDetector(
        onTripleTap: () => setState(() => _showDebug = true),
        child: _showDebug ? _buildPanel() : const SizedBox.expand(),
      ),
    );
  }

  Widget _buildPanel() {
    final q = widget.quality;
    return Positioned(
      top: 60,
      right: 16,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _debugLine('blur', q?.blurVariance.toStringAsFixed(1) ?? '—'),
            _debugLine('bright', q?.brightnessAvg.toStringAsFixed(1) ?? '—'),
            _debugLine('fill', q != null ? '${(q.frameFill * 100).toStringAsFixed(0)}%' : '—'),
            _debugLine('VIN', q?.detectedVin ?? (q?.vinConfidence != null && q!.vinConfidence > 0 ? q.vinConfidence.toStringAsFixed(2) : '—')),
            _debugLine('state', q?.status.name ?? '—'),
          ],
        ),
      ),
    );
  }

  Widget _debugLine(String label, String value) => Text(
    '$label: $value',
    style: const TextStyle(color: Colors.white70, fontSize: 11, fontFamily: 'monospace'),
  );
}

class _TripleTapDetector extends StatefulWidget {
  const _TripleTapDetector({required this.child, required this.onTripleTap});
  final Widget child;
  final VoidCallback onTripleTap;

  @override
  State<_TripleTapDetector> createState() => _TripleTapDetectorState();
}

class _TripleTapDetectorState extends State<_TripleTapDetector> {
  int _tapCount = 0;
  DateTime? _lastTap;

  void _handleTap() {
    final now = DateTime.now();
    if (_lastTap != null && now.difference(_lastTap!) < const Duration(milliseconds: 500)) {
      _tapCount++;
    } else {
      _tapCount = 1;
    }
    _lastTap = now;
    if (_tapCount >= 3) {
      _tapCount = 0;
      widget.onTripleTap();
    }
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: _handleTap,
    child: widget.child,
  );
}

// ─── Manual assist floating button ───────────────────────────────────────────

class _ManualAssistButton extends StatefulWidget {
  const _ManualAssistButton({required this.disableAnimations, required this.onPressed});
  final bool disableAnimations;
  final VoidCallback onPressed;

  @override
  State<_ManualAssistButton> createState() => _ManualAssistButtonState();
}

class _ManualAssistButtonState extends State<_ManualAssistButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeIn;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _fadeIn = CurvedAnimation(parent: _controller, curve: Curves.easeIn);
    if (!widget.disableAnimations) {
      _controller.forward();
    } else {
      _controller.value = 1.0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: _fadeIn,
    child: ElevatedButton(
      onPressed: widget.onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: kOcrIndigo,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: const Text(
        'Снимай сега',
        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
  );
}

// ─── Enrichment result views ──────────────────────────────────────────────────

class _DuplicatePolicyView extends StatelessWidget {
  const _DuplicatePolicyView({
    required this.policyNumber,
    required this.insurer,
    required this.onBack,
  });

  final String policyNumber;
  final String insurer;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.block, color: Colors.red, size: 48),
          const SizedBox(height: 16),
          const Text(
            'Активна полица намерена',
            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            'Полица $policyNumber от $insurer е вече активна за това МПС.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: kOcrTextSub, fontSize: 14),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: onBack,
            child: const Text('Назад'),
          ),
        ],
      ),
    ),
  );
}

class _GfHitView extends StatelessWidget {
  const _GfHitView({
    required this.insurer,
    required this.validUntil,
    required this.onContinue,
    required this.onBack,
  });

  final String insurer;
  final String validUntil;
  final VoidCallback onContinue;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.amber.withValues(alpha: 0.15),
              border: Border.all(color: Colors.amber),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                const Icon(Icons.info_outline, color: Colors.amber, size: 32),
                const SizedBox(height: 8),
                Text(
                  'Открита активна ГО полица: $insurer, валидна до $validUntil',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onBack,
                  child: const Text('Виж детайли'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: onContinue,
                  child: const Text('Продължи с нова'),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _GfWarningView extends StatelessWidget {
  const _GfWarningView({required this.onContinue});
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 40),
          const SizedBox(height: 12),
          const Text(
            'Не можем да проверим активни полици в момента',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white, fontSize: 15),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: onContinue,
            child: const Text('Продължи'),
          ),
        ],
      ),
    ),
  );
}

