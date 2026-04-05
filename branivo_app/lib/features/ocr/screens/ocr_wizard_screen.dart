import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../vehicle_catalog/data/repositories/vehicle_catalog_repository.dart';
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

  // Flash & auto-capture state
  bool _flashEnabled = false;
  bool _autoCaptureEnabled = false;
  bool _isDocumentDetected = false;
  bool _autoCaptureLock = false;
  bool _disposed = false;

  // Frame analysis state (image stream)
  List<int>? _prevSamples;
  int _stableFrames = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initCamera();
    context.read<OcrWizardBloc>().add(
      OcrStartCaptureEvent(sessionToken: widget.sessionToken),
    );
  }

  @override
  void dispose() {
    _disposed = true;
    WidgetsBinding.instance.removeObserver(this);
    _stopStream();
    _camera?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive) {
      _stopStream();
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
      // Restore flash state
      await ctrl.setFlashMode(_flashEnabled ? FlashMode.torch : FlashMode.off);
    } catch (_) {
      // Camera unavailable — fallback placeholder shown
    }
  }

  // ─── Flash ──────────────────────────────────────────────────────────────────

  Future<void> _toggleFlash() async {
    final ctrl = _camera;
    if (ctrl == null || !_cameraReady) return;
    final next = !_flashEnabled;
    await ctrl.setFlashMode(next ? FlashMode.torch : FlashMode.off);
    if (mounted) setState(() => _flashEnabled = next);
  }

  // ─── Auto-capture toggle ────────────────────────────────────────────────────

  void _toggleAutoCapture() {
    final next = !_autoCaptureEnabled;
    setState(() {
      _autoCaptureEnabled = next;
      _isDocumentDetected = false;
      _stableFrames = 0;
      _autoCaptureLock = false;
    });

    final bloc = context.read<OcrWizardBloc>();
    final state = bloc.state;
    final step = state is OcrCapturingState ? state.step : 0;

    if (next) {
      _startStream(step);
    } else {
      _stopStream();
    }
  }

  // ─── Image stream ───────────────────────────────────────────────────────────

  void _startStream(int step) {
    final ctrl = _camera;
    if (ctrl == null || !_cameraReady || ctrl.value.isStreamingImages) return;
    _stableFrames = 0;
    _prevSamples = null;
    _autoCaptureLock = false;
    ctrl.startImageStream((img) => _analyzeFrame(img, step));
  }

  void _stopStream() {
    try {
      final ctrl = _camera;
      if (ctrl != null && ctrl.value.isInitialized && ctrl.value.isStreamingImages) {
        ctrl.stopImageStream();
      }
    } catch (_) {}
    if (!_disposed && mounted) {
      setState(() {
        _isDocumentDetected = false;
        _stableFrames = 0;
      });
    }
  }

  /// Lightweight frame analysis: sample 64 luma values, detect motion/brightness.
  ///
  /// Triggers auto-capture when stable for ~20 frames (≈2s at 10 analyzed fps).
  void _analyzeFrame(CameraImage img, int step) {
    // Sample Y plane (Android YUV) or first channel (iOS BGRA)
    final plane = img.planes[0].bytes;
    final stride = img.planes[0].bytesPerRow;
    final pixelStride = img.planes[0].bytesPerPixel ?? 1;
    final h = img.height;
    final w = img.width;

    final samples = <int>[];
    for (int row = 0; row < 8; row++) {
      for (int col = 0; col < 8; col++) {
        final py = (h * row ~/ 8);
        final px = (w * col ~/ 8);
        final idx = py * stride + px * pixelStride;
        if (idx < plane.length) samples.add(plane[idx]);
      }
    }

    if (samples.isEmpty) return;

    final avg = samples.fold(0, (a, b) => a + b) / samples.length;
    // Reject under- or over-exposed frames
    if (avg < 40 || avg > 235) {
      _stableFrames = (_stableFrames - 2).clamp(0, 50);
      _prevSamples = samples;
      _updateDetected(false);
      return;
    }

    // Motion detection via frame diff
    final prev = _prevSamples;
    if (prev != null && prev.length == samples.length) {
      var diff = 0;
      for (int i = 0; i < samples.length; i++) {
        diff += (samples[i] - prev[i]).abs();
      }
      if (diff / samples.length < 8) {
        _stableFrames = (_stableFrames + 1).clamp(0, 50);
      } else {
        _stableFrames = (_stableFrames - 3).clamp(0, 50);
      }
    }
    _prevSamples = samples;

    _updateDetected(_stableFrames >= 10);

    // Auto-fire after ~2s stable
    if (_stableFrames >= 20 && !_autoCaptureLock) {
      _autoCaptureLock = true;
      _stableFrames = 0;
      _triggerAutoCapture(step);
    }
  }

  void _updateDetected(bool detected) {
    if (!_disposed && detected != _isDocumentDetected && mounted) {
      setState(() => _isDocumentDetected = detected);
    }
  }

  Future<void> _triggerAutoCapture(int step) async {
    final ctrl = _camera;
    if (ctrl == null || !ctrl.value.isInitialized) {
      _autoCaptureLock = false;
      return;
    }
    // Must stop stream before takePicture
    if (ctrl.value.isStreamingImages) {
      await ctrl.stopImageStream();
    }
    await _takePhoto(step);
    // Stream restart is handled in _onState when OcrCapturingState is emitted
  }

  // ─── Photo capture ──────────────────────────────────────────────────────────

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

  // ─── Zoom & focus ───────────────────────────────────────────────────────────

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

  // ─── Build ──────────────────────────────────────────────────────────────────

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

    if (state is OcrCapturingState) {
      // Returning to camera after a retake or first launch
      if (!_cameraReady) _initCamera();
      _autoCaptureLock = false;
      _stableFrames = 0;
      if (mounted) setState(() => _isDocumentDetected = false);
      if (_autoCaptureEnabled) _startStream(state.step);
    }

    // VIN auto-capture: haptic feedback (story-24.1)
    if (state is OcrVinDetectedState) {
      final disableAnimations = MediaQuery.of(context).disableAnimations;
      if (!disableAnimations) HapticFeedback.mediumImpact();
    }

    if (state is OcrCropState ||
        state is OcrStepProcessingState ||
        state is OcrProcessingState) {
      _stopStream();
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
        catalogRepository:
            context.read<VehicleCatalogRepository?>(),
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
        key: ValueKey('crop-${state.step}'),
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
        onContinue: () => context.read<OcrWizardBloc>().add(
          OcrStartCaptureEvent(sessionToken: widget.sessionToken),
        ),
        onBack: widget.onManualEntry,
      );
    }
    if (state is OcrGfWarningState) {
      return _GfWarningView(
        onContinue: () => context.read<OcrWizardBloc>().add(
          OcrStartCaptureEvent(sessionToken: widget.sessionToken),
        ),
      );
    }
    final step = state is OcrCapturingState ? state.step : 0;
    final captured = state is OcrCapturingState
        ? state.capturedImages.map((f) => f.path).toList()
        : <String>[];

    return OcrCameraView(
      step: step,
      capturedImages: captured,
      camera: _camera,
      cameraReady: _cameraReady,
      zoom: _zoom,
      minZoom: _minZoom,
      maxZoom: _maxZoom,
      flashEnabled: _flashEnabled,
      autoCaptureEnabled: _autoCaptureEnabled,
      isDocumentDetected: _isDocumentDetected,
      onCapture: () => _takePhoto(step),
      onManualEntry: widget.onManualEntry,
      onFlashToggle: _toggleFlash,
      onAutoCaptureToggle: _toggleAutoCapture,
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

