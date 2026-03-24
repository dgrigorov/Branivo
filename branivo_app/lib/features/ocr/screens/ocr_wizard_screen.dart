import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import '../bloc/ocr_wizard_bloc.dart';
import '../data/repositories/ocr_models.dart';

// ─── Design tokens ────────────────────────────────────────────────────────────
const _kBg = Color(0xFF111827);
const _kSurface = Color(0xFF1E293B);
const _kIndigo = Color(0xFF6366F1);
const _kGreen = Color(0xFF10B981);
const _kMuted = Color(0xFF64748B);
const _kTextSub = Color(0xFF94A3B8);

// ─── Step metadata ────────────────────────────────────────────────────────────
const _totalSteps = 3;

const _stepTitles = <String>[
  'Специфики на МПС-то',
  'Данните на МПС-то',
  'Лични данни',
];

const _stepSubs = <String>[
  'Снимайте задната страна — категория, дати, обем, гориво, места, EURO',
  'Снимайте предната страна — рег. №, рамен номер (VIN), марка, цвят',
  'Снимайте страната с личните данни — собственик, адрес и ЕГН',
];

// ─── Talon legend per step (field codes on Bulgarian vehicle certificate) ─────
// Step 0: back side — technical/specification fields (снимка задна страна)
const _legendStep0 = <(String, String)>[
  ('J', 'Категория (M1)'),
  ('B', '1-ва регистрация'),
  ('I', 'Дата на валидност'),
  ('P.1', 'Обем (cc)'),
  ('P.2', 'Мощност (kW)'),
  ('P.3', 'Гориво'),
  ('S.1', 'Места'),
  ('V.9', 'Евро стандарт'),
];

// Step 1: front side — identification fields (снимка предна страна)
const _legendStep1 = <(String, String)>[
  ('A', 'Рег. номер'),
  ('E', 'Рама / VIN'),
  ('D.1', 'Марка и модел'),
  ('R', 'Цвят'),
  ('No', 'Номер на талона'),
  ('D', 'Категория МПС'),
];

// ─── Field labels ─────────────────────────────────────────────────────────────
const _fieldLabels = <String, String>{
  'license_plate': 'Рег. №',
  'vin': 'VIN / Номер на рамата',
  'cert_number': 'Номер на малък талон',
  'make': 'Марка',
  'model': 'Модел МПС',
  'year': 'Година',
  'color': 'Цвят',
  'engine_volume': 'Обем',
  'fuel_type': 'Гориво',
  'first_registration_date': 'Първа регистрация',
  'owner_name': 'Собственик',
  'owner_egn': 'ЕГН / ЛНЧ',
  'owner_address': 'Адрес',
};

// Fields shown as partial reveal after step 0 (back/technical side captured)
const _step1PreviewFields = <String>[
  'engine_volume',
  'fuel_type',
  'first_registration_date',
  'year',
];

// Fields shown as partial reveal after step 1 (front/identification side captured)
const _step2PreviewFields = <String>[
  'license_plate',
  'vin',
  'cert_number',
  'make',
  'model',
  'color',
];

// ─── Main screen ──────────────────────────────────────────────────────────────

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
  bool _permissionDenied = false;
  bool _permissionPermanentlyDenied = false;

  @override
  void initState() {
    super.initState();
    context.read<OcrWizardBloc>().add(OcrStartCaptureEvent());
    WidgetsBinding.instance.addPostFrameCallback((_) => _initCamera());
  }

  Future<void> _initCamera() async {
    try {
      _cameras = await availableCameras();
      if (!mounted) return;
      if (_cameras.isEmpty) {
        setState(() {
          _permissionDenied = true;
          _permissionPermanentlyDenied = false;
        });
        return;
      }
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
      // Enable continuous autofocus for document scanning
      try {
        await _cameraController!.setFocusMode(FocusMode.auto);
        await _cameraController!.setExposureMode(ExposureMode.auto);
      } catch (_) {}
      if (mounted) setState(() => _cameraReady = true);
    } on CameraException catch (e) {
      if (!mounted) return;
      final isPermanent =
          e.code == 'CameraAccessDeniedWithoutPrompt' ||
          e.code == 'CameraAccessRestricted';
      setState(() {
        _permissionDenied = true;
        _permissionPermanentlyDenied = isPermanent;
      });
    }
  }

  Future<void> _retryPermission() async {
    setState(() {
      _permissionDenied = false;
      _permissionPermanentlyDenied = false;
    });
    _cameraController?.dispose();
    _cameraController = null;
    await _initCamera();
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    super.dispose();
  }

  Future<void> _captureImage(int step) async {
    if (_cameraController == null || !_cameraReady) return;
    try {
      final file = await _cameraController!.takePicture();
      if (!mounted) return;
      final bloc = context.read<OcrWizardBloc>();
      bloc.add(OcrImageCapturedEvent(step: step, image: file));
      if (step == _totalSteps - 1) {
        bloc.add(OcrScanSubmittedEvent(sessionToken: widget.sessionToken));
      }
    } catch (_) {
      if (mounted) {
        context.read<OcrWizardBloc>().add(OcrManualFallbackRequestedEvent());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final disableAnimations = MediaQuery.of(context).disableAnimations;
    return Scaffold(
      backgroundColor: _kBg,
      body: SafeArea(
        child: BlocConsumer<OcrWizardBloc, OcrWizardState>(
          listener: _onStateChange,
          builder: (context, state) => _buildBody(context, state, disableAnimations),
        ),
      ),
    );
  }

  void _onStateChange(BuildContext context, OcrWizardState state) {
    if (state is OcrCompletedState) widget.onComplete(state.fields);
    if (state is OcrManualInputState) widget.onManualEntry();
  }

  Widget _buildBody(BuildContext context, OcrWizardState state, bool disableAnimations) {
    if (_permissionDenied) {
      return _PermissionDeniedView(
        isPermanent: _permissionPermanentlyDenied,
        onRetry: _retryPermission,
        onManualEntry: widget.onManualEntry,
        onBack: () => Navigator.of(context).maybePop(),
      );
    }
    if (state is OcrFailedState) {
      return _FailedView(message: state.errorMessage, onManualEntry: widget.onManualEntry);
    }
    if (state is OcrInitialState ||
        state is OcrProcessingState ||
        (state is OcrCapturingState && !_cameraReady)) {
      return _LoadingView(disableAnimations: disableAnimations);
    }
    if (state is OcrCompletedState) {
      return _ResultsView(
        fields: state.fields,
        onProceed: () => widget.onComplete(state.fields),
        onManualEntry: widget.onManualEntry,
      );
    }
    final step = state is OcrCapturingState ? state.step : 0;
    final capturedCount = state is OcrCapturingState ? state.capturedImages.length : 0;
    return _CaptureView(
      step: step,
      capturedCount: capturedCount,
      cameraController: _cameraController,
      cameraReady: _cameraReady,
      onCapture: () => _captureImage(step),
      onBack: widget.onManualEntry,
    );
  }
}

// ─── Capture view (stateful for tap-to-focus) ─────────────────────────────────

class _CaptureView extends StatefulWidget {
  const _CaptureView({
    required this.step,
    required this.capturedCount,
    required this.cameraController,
    required this.cameraReady,
    required this.onCapture,
    required this.onBack,
  });

  final int step;
  final int capturedCount;
  final CameraController? cameraController;
  final bool cameraReady;
  final VoidCallback onCapture;
  final VoidCallback onBack;

  @override
  State<_CaptureView> createState() => _CaptureViewState();
}

class _CaptureViewState extends State<_CaptureView> {
  final GlobalKey _cameraKey = GlobalKey();
  Offset? _focusPoint;
  Timer? _focusTimer;

  @override
  void dispose() {
    _focusTimer?.cancel();
    super.dispose();
  }

  Future<void> _onCameraTap(TapUpDetails details) async {
    final controller = widget.cameraController;
    if (controller == null || !widget.cameraReady) return;
    final box = _cameraKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;

    final local = box.globalToLocal(details.globalPosition);
    final x = (local.dx / box.size.width).clamp(0.0, 1.0);
    final y = (local.dy / box.size.height).clamp(0.0, 1.0);

    setState(() => _focusPoint = local);
    _focusTimer?.cancel();
    _focusTimer = Timer(const Duration(milliseconds: 2000), () {
      if (mounted) setState(() => _focusPoint = null);
      // Reset to continuous autofocus after tap
      controller.setFocusPoint(null).catchError((_) {});
      controller.setExposurePoint(null).catchError((_) {});
    });

    try {
      // Must set FocusMode.auto BEFORE setFocusPoint — iOS requirement
      await controller.setFocusMode(FocusMode.auto);
      await controller.setExposureMode(ExposureMode.auto);
      await controller.setFocusPoint(Offset(x, y));
      await controller.setExposurePoint(Offset(x, y));
    } catch (_) {
      // focus not supported on this device — silently ignore
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildTopBar(),
        _buildProgressBar(),
        const SizedBox(height: 4),
        _buildStepHint(),
        if (widget.step == 0) _buildLegend(_legendStep0),
        if (widget.step == 1) _buildLegend(_legendStep1),
        const SizedBox(height: 10),
        _buildCameraArea(),
        if (widget.capturedCount > 0) ...[
          const SizedBox(height: 8),
          _buildPartialReveal(widget.step),
        ],
        _buildCaptureButton(),
        Center(
          child: TextButton(
            onPressed: widget.onBack,
            child: const Text('Въведи ръчно', style: TextStyle(color: _kMuted, fontSize: 13)),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildTopBar() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
    child: Row(
      children: [
        GestureDetector(
          onTap: widget.onBack,
          child: Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(color: _kSurface, shape: BoxShape.circle),
            child: const Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: Colors.white),
          ),
        ),
        const SizedBox(width: 12),
        const Text(
          'Сканирай талона',
          style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ],
    ),
  );

  Widget _buildProgressBar() => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
    child: Row(
      children: List.generate(_totalSteps, (i) {
        final color = i < widget.step
            ? _kGreen
            : i == widget.step
                ? _kIndigo
                : const Color(0xFF374151);
        return Expanded(
          child: Container(
            height: 3,
            margin: const EdgeInsets.symmetric(horizontal: 3),
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
          ),
        );
      }),
    ),
  );

  Widget _buildStepHint() => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'СТЪПКА ${widget.step + 1} ОТ $_totalSteps',
          style: const TextStyle(
            color: _kIndigo, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _stepTitles[widget.step],
          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 2),
        Text(_stepSubs[widget.step], style: const TextStyle(color: _kMuted, fontSize: 12)),
      ],
    ),
  );

  Widget _buildLegend(List<(String, String)> items) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: _kSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF374151)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'ЛЕГЕНДА НА ПОЛЕТАТА',
            style: TextStyle(
              color: _kIndigo, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 6),
          _buildLegendGrid(items),
        ],
      ),
    ),
  );

  Widget _buildLegendGrid(List<(String, String)> items) {
    final half = (items.length / 2).ceil();
    final left = items.take(half).toList();
    final right = items.skip(half).toList();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: _buildLegendColumn(left)),
        const SizedBox(width: 8),
        Expanded(child: _buildLegendColumn(right)),
      ],
    );
  }

  Widget _buildLegendColumn(List<(String, String)> items) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: items.map((item) => _buildLegendRow(item.$1, item.$2)).toList(),
  );

  Widget _buildLegendRow(String code, String label) => Padding(
    padding: const EdgeInsets.only(bottom: 3),
    child: Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
          decoration: BoxDecoration(
            color: _kIndigo.withAlpha(40),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            code,
            style: const TextStyle(color: _kIndigo, fontSize: 10, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(width: 5),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(color: _kTextSub, fontSize: 10),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    ),
  );

  Widget _buildCameraArea() => Expanded(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: GestureDetector(
        onTapUp: _onCameraTap,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: SizedBox.expand(
            key: _cameraKey,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (widget.cameraReady && widget.cameraController != null)
                  _buildCameraPreview()
                else
                  Container(
                    color: _kSurface,
                    child: const Center(child: CircularProgressIndicator(color: _kIndigo)),
                  ),
                CustomPaint(painter: _FrameGuidePainter()),
                if (_focusPoint != null) _buildFocusIndicator(_focusPoint!),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  Widget _buildCameraPreview() {
    final controller = widget.cameraController!;
    // previewSize is reported in landscape — swap w/h for portrait rendering
    final previewSize = controller.value.previewSize;
    final w = previewSize?.height ?? 1920.0;
    final h = previewSize?.width ?? 1080.0;
    return FittedBox(
      fit: BoxFit.cover,
      child: SizedBox(width: w, height: h, child: CameraPreview(controller)),
    );
  }

  Widget _buildFocusIndicator(Offset point) => Positioned(
    left: point.dx - 26,
    top: point.dy - 26,
    child: Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.white70, width: 1.5),
        borderRadius: BorderRadius.circular(4),
      ),
    ),
  );

  Widget _buildPartialReveal(int currentStep) {
    final previewFields = currentStep == 2 ? _step2PreviewFields : _step1PreviewFields;
    final label = currentStep == 2 ? '✓ Снимки 1 и 2 получени' : '✓ Снимка 1 получена';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: _kSurface,
          borderRadius: BorderRadius.circular(10),
          border: const Border(left: BorderSide(color: _kGreen, width: 3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(color: _kGreen, fontSize: 11, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            ...previewFields.map(
              (key) => Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  '${_fieldLabels[key] ?? key}: разпознава се…',
                  style: const TextStyle(color: _kTextSub, fontSize: 12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCaptureButton() => Padding(
    padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
    child: SizedBox(
      height: 52,
      child: ElevatedButton.icon(
        onPressed: widget.onCapture,
        style: ElevatedButton.styleFrom(
          backgroundColor: _kIndigo,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(50)),
        ),
        icon: const Icon(Icons.camera_alt_rounded, size: 20),
        label: const Text('Снимай', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      ),
    ),
  );
}

// ─── Frame guide painter ──────────────────────────────────────────────────────

class _FrameGuidePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const inset = 16.0;
    const cornerLen = 22.0;
    final paint = Paint()
      ..color = _kIndigo
      ..strokeWidth = 3.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.square;

    final rect = Rect.fromLTRB(inset, inset, size.width - inset, size.height - inset);
    _drawCorner(canvas, rect.topLeft, paint, cornerLen, 1, 1);
    _drawCorner(canvas, rect.topRight, paint, cornerLen, -1, 1);
    _drawCorner(canvas, rect.bottomLeft, paint, cornerLen, 1, -1);
    _drawCorner(canvas, rect.bottomRight, paint, cornerLen, -1, -1);

    final scanPaint = Paint()
      ..color = _kIndigo.withAlpha(120)
      ..strokeWidth = 1.5;
    final scanY = size.height / 2;
    canvas.drawLine(
      Offset(inset + cornerLen + 4, scanY),
      Offset(size.width - inset - cornerLen - 4, scanY),
      scanPaint,
    );
  }

  void _drawCorner(Canvas canvas, Offset origin, Paint paint, double len, double sx, double sy) {
    canvas.drawLine(origin, origin.translate(len * sx, 0), paint);
    canvas.drawLine(origin, origin.translate(0, len * sy), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ─── Permission denied view ───────────────────────────────────────────────────

class _PermissionDeniedView extends StatelessWidget {
  const _PermissionDeniedView({
    required this.isPermanent,
    required this.onRetry,
    required this.onManualEntry,
    required this.onBack,
  });

  final bool isPermanent;
  final VoidCallback onRetry;
  final VoidCallback onManualEntry;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: GestureDetector(
            onTap: onBack,
            child: Container(
              width: 36,
              height: 36,
              decoration: const BoxDecoration(color: _kSurface, shape: BoxShape.circle),
              child: const Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: Colors.white),
            ),
          ),
        ),
        Expanded(child: _buildContent()),
      ],
    );
  }

  Widget _buildContent() => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: const BoxDecoration(color: _kSurface, shape: BoxShape.circle),
          child: const Icon(Icons.camera_alt_outlined, size: 36, color: _kIndigo),
        ),
        const SizedBox(height: 24),
        const Text(
          'Нужен е достъп до камерата',
          style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 12),
        Text(
          isPermanent
              ? 'Достъпът до камерата е блокиран. Отвори Настройки → Поверителност и защита → Камера и разреши достъп за Branivo.'
              : 'За да сканирате талона, приложението се нуждае от достъп до камерата.',
          style: const TextStyle(color: _kMuted, fontSize: 14, height: 1.5),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 32),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: isPermanent ? () => launchUrl(Uri.parse('app-settings:')) : onRetry,
            style: ElevatedButton.styleFrom(
              backgroundColor: _kIndigo,
              foregroundColor: Colors.white,
              elevation: 0,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(
              isPermanent ? 'Отвори настройки' : 'Дай разрешение',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: onManualEntry,
          child: const Text('Въведи ръчно', style: TextStyle(color: _kMuted)),
        ),
      ],
    ),
  );
}

// ─── Loading view ─────────────────────────────────────────────────────────────

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
                  width: 40, height: 40,
                  decoration: const BoxDecoration(color: _kIndigo, shape: BoxShape.circle),
                )
              : const CircularProgressIndicator(color: _kIndigo),
          const SizedBox(height: 16),
          const Text('Обработваме документа…', style: TextStyle(color: _kTextSub, fontSize: 14)),
        ],
      ),
    );
  }
}

// ─── Failed view ──────────────────────────────────────────────────────────────

class _FailedView extends StatelessWidget {
  const _FailedView({required this.onManualEntry, this.message});

  final VoidCallback onManualEntry;
  final String? message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.warning_amber_rounded, color: Colors.amber, size: 56),
          const SizedBox(height: 16),
          const Text(
            'Не успяхме да разчетем документа',
            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            message ?? 'Моля, попълнете данните ръчно.',
            style: const TextStyle(color: _kMuted, fontSize: 13, height: 1.5),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: onManualEntry,
              style: ElevatedButton.styleFrom(
                backgroundColor: _kIndigo,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Попълни ръчно', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Results view ─────────────────────────────────────────────────────────────

class _ResultsView extends StatelessWidget {
  const _ResultsView({
    required this.fields,
    required this.onProceed,
    required this.onManualEntry,
  });

  final Map<String, OcrField> fields;
  final VoidCallback onProceed;
  final VoidCallback onManualEntry;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
          child: Row(
            children: [
              const Icon(Icons.check_circle_rounded, color: _kGreen, size: 22),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Разпознати данни',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
              TextButton(
                onPressed: onManualEntry,
                child: const Text('Редактирай', style: TextStyle(color: _kIndigo, fontSize: 13)),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            children: _fieldLabels.entries.map((entry) {
              final field = fields[entry.key];
              if (field == null) return const SizedBox.shrink();
              return _buildFieldCard(entry.value, field);
            }).toList(),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: onProceed,
              style: ElevatedButton.styleFrom(
                backgroundColor: _kIndigo,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text(
                'Продължи към офертите',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFieldCard(String label, OcrField field) {
    final isLow = field.isLowConfidence;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: _kSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isLow ? Colors.amber.withAlpha(100) : _kGreen.withAlpha(80),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: _kMuted, fontSize: 11, fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  field.value ?? '—',
                  style: const TextStyle(
                    color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Icon(
            isLow ? Icons.warning_amber_rounded : Icons.check_circle_rounded,
            color: isLow ? Colors.amber : _kGreen,
            size: 18,
          ),
        ],
      ),
    );
  }
}
