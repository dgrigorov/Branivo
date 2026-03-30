import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import '../bloc/ocr_wizard_bloc.dart';
import '../data/repositories/ocr_models.dart';
import '../services/camera_quality_analyzer.dart';

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
  'Данните на МПС-то',
  'Специфики на МПС-то',
  'Лични данни',
];

const _stepSubs = <String>[
  'Снимайте предната страна — рег. №, рамен номер (VIN), марка, цвят',
  'Снимайте задната страна — категория, дати, обем, гориво, места, EURO',
  'Снимайте страната с личните данни — собственик, адрес и ЕГН',
];

// ─── Talon legend per step (field codes on Bulgarian vehicle certificate) ─────
// Step 0: front side — identification fields (снимка предна страна)
const _legendStep0 = <(String, String)>[
  ('A', 'Рег. номер'),
  ('E', 'Рама / VIN'),
  ('D.1', 'Марка и модел'),
  ('R', 'Цвят'),
  ('No', 'Номер на талона'),
  ('D', 'Категория МПС'),
];

// Step 1: back side — technical/specification fields (снимка задна страна)
const _legendStep1 = <(String, String)>[
  ('J', 'Категория (M1)'),
  ('B', '1-ва регистрация'),
  ('I', 'Дата на валидност'),
  ('P.1', 'Обем (cc)'),
  ('P.2', 'Мощност (kW)'),
  ('P.3', 'Гориво'),
  ('S.1', 'Места'),
  ('V.9', 'Евро стандарт'),
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
  'engine_volume': 'Обем (cc)',
  'power_kw': 'Мощност (kW)',
  'fuel_type': 'Гориво',
  'seats': 'Брой места',
  'vehicle_category': 'Категория МПС',
  'euro_standard': 'Евро стандарт',
  'first_registration_date': 'Първа регистрация',
  'registration_validity': 'Валидност на регистрацията',
  'owner_name': 'Собственик',
  'owner_egn': 'ЕГН / ЛНЧ',
  'owner_address': 'Адрес',
};

// Fields shown as partial reveal after step 0 (front/identification side captured)
const _step1PreviewFields = <String>[
  'license_plate',
  'vin',
  'cert_number',
  'make',
  'model',
  'color',
];

// Fields shown as partial reveal after step 1 (back/technical side captured)
const _step2PreviewFields = <String>[
  'engine_volume',
  'power_kw',
  'fuel_type',
  'first_registration_date',
  'year',
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
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    context.read<OcrWizardBloc>().add(OcrStartCaptureEvent());
  }

  Future<void> _captureImage(int step) async {
    final file = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 1600,
      maxHeight: 1600,
      preferredCameraDevice: CameraDevice.rear,
    );
    if (file == null || !mounted) return;
    context.read<OcrWizardBloc>().add(
      OcrImageCapturedEvent(step: step, image: file),
    );
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
    if (state is OcrManualInputState) widget.onManualEntry();
    // VIN auto-capture: haptic + trigger capture
    if (state is OcrVinDetectedState) {
      final disableAnimations = MediaQuery.of(context).disableAnimations;
      if (!disableAnimations) {
        HapticFeedback.mediumImpact();
      }
    }
  }

  Widget _buildBody(BuildContext context, OcrWizardState state, bool disableAnimations) {
    if (state is OcrFailedState) {
      return _FailedView(message: state.errorMessage, onManualEntry: widget.onManualEntry);
    }
    if (state is OcrInitialState || state is OcrProcessingState) {
      return _LoadingView(disableAnimations: disableAnimations);
    }
    if (state is OcrCompletedState) {
      return _ResultsView(
        fields: state.fields,
        rawText: state.rawText,
        onProceed: (edited) => widget.onComplete(edited),
        onManualEntry: widget.onManualEntry,
      );
    }
    if (state is OcrPreviewState) {
      return _PreviewView(
        step: state.step,
        image: state.image,
        onConfirm: () => context.read<OcrWizardBloc>().add(
          OcrPreviewConfirmedEvent(
            step: state.step,
            sessionToken: widget.sessionToken,
          ),
        ),
        onRetake: () => context.read<OcrWizardBloc>().add(
          OcrPreviewRetakeEvent(step: state.step),
        ),
      );
    }
    // Camera quality states: show overlay
    if (state is OcrCameraQualityState || state is OcrVinDetectedState || state is OcrManualAssistState) {
      return _CameraQualityView(
        state: state,
        disableAnimations: disableAnimations,
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
    final capturedCount = state is OcrCapturingState ? state.capturedImages.length : 0;
    return _CaptureView(
      step: step,
      capturedCount: capturedCount,
      onCapture: () => _captureImage(step),
      onBack: widget.onManualEntry,
    );
  }
}

// ─── Camera quality overlay view ──────────────────────────────────────────────

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
        Container(color: _kBg),
        // Quality frame overlay
        Center(
          child: QualityFrameOverlay(
            status: status ?? QualityStatus.blur,
            disableAnimations: disableAnimations,
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
              disableAnimations: disableAnimations,
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
              decoration: const BoxDecoration(color: _kSurface, shape: BoxShape.circle),
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
            _debugLine('blur', q?.blurVariance?.toStringAsFixed(1) ?? '—'),
            _debugLine('bright', q?.brightnessAvg?.toStringAsFixed(1) ?? '—'),
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
        backgroundColor: _kIndigo,
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
            style: const TextStyle(color: _kTextSub, fontSize: 14),
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

// ─── Capture view ─────────────────────────────────────────────────────────────

class _CaptureView extends StatelessWidget {
  const _CaptureView({
    required this.step,
    required this.capturedCount,
    required this.onCapture,
    required this.onBack,
  });

  final int step;
  final int capturedCount;
  final VoidCallback onCapture;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildTopBar(),
                  _buildProgressBar(),
                  const SizedBox(height: 4),
                  _buildStepHint(),
                  if (step == 0) _buildLegend(_legendStep0),
                  if (step == 1) _buildLegend(_legendStep1),
                  const SizedBox(height: 10),
                  _buildInstructionArea(),
                  if (capturedCount > 0) ...[
                    const SizedBox(height: 8),
                    _buildPartialReveal(step),
                  ],
                  _buildCaptureButton(),
                  Center(
                    child: TextButton(
                      onPressed: onBack,
                      child: const Text('Въведи ръчно', style: TextStyle(color: _kMuted, fontSize: 13)),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildTopBar() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
    child: Row(
      children: [
        GestureDetector(
          onTap: onBack,
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
        final color = i < step
            ? _kGreen
            : i == step
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
          'СТЪПКА ${step + 1} ОТ $_totalSteps',
          style: const TextStyle(
            color: _kIndigo, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _stepTitles[step],
          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 2),
        Text(_stepSubs[step], style: const TextStyle(color: _kMuted, fontSize: 12)),
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

  Widget _buildInstructionArea() => Flexible(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        decoration: BoxDecoration(
          color: _kSurface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF374151)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: _kIndigo.withAlpha(30),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.document_scanner_outlined, size: 36, color: _kIndigo),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                _stepSubs[step],
                style: const TextStyle(color: _kTextSub, fontSize: 13, height: 1.5),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: _kIndigo.withAlpha(25),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _kIndigo.withAlpha(60)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.tips_and_updates_outlined, size: 13, color: _kIndigo),
                  SizedBox(width: 6),
                  Text(
                    'Натиснете "Снимай" за да отворите камерата',
                    style: TextStyle(color: _kIndigo, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
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
        onPressed: onCapture,
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

// ─── Preview view ─────────────────────────────────────────────────────────────

class _PreviewView extends StatelessWidget {
  const _PreviewView({
    required this.step,
    required this.image,
    required this.onConfirm,
    required this.onRetake,
  });

  final int step;
  final XFile image;
  final VoidCallback onConfirm;
  final VoidCallback onRetake;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(
            children: [
              GestureDetector(
                onTap: onRetake,
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: const BoxDecoration(
                    color: _kSurface,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.arrow_back_ios_new_rounded,
                    size: 14,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'СНИМКА ${step + 1} ОТ $_totalSteps',
                      style: const TextStyle(
                        color: _kIndigo,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                    Text(
                      _stepTitles[step],
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.file(
                File(image.path),
                fit: BoxFit.cover,
                width: double.infinity,
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
          child: SizedBox(
            height: 52,
            child: ElevatedButton.icon(
              onPressed: onConfirm,
              style: ElevatedButton.styleFrom(
                backgroundColor: _kGreen,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(50),
                ),
              ),
              icon: const Icon(Icons.check_rounded, size: 20),
              label: Text(
                step == _totalSteps - 1
                    ? 'Анализирай данните'
                    : 'Продължи към снимка ${step + 2}',
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
        Center(
          child: TextButton.icon(
            onPressed: onRetake,
            icon: const Icon(Icons.replay_rounded, size: 16, color: _kMuted),
            label: const Text(
              'Снимай отново',
              style: TextStyle(color: _kMuted, fontSize: 13),
            ),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }
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

class _ResultsView extends StatefulWidget {
  const _ResultsView({
    required this.fields,
    required this.onProceed,
    required this.onManualEntry,
    this.rawText,
  });

  final Map<String, OcrField> fields;
  final void Function(Map<String, OcrField>) onProceed;
  final VoidCallback onManualEntry;
  final String? rawText;

  @override
  State<_ResultsView> createState() => _ResultsViewState();
}

class _ResultsViewState extends State<_ResultsView> {
  bool _showDebug = false;
  late final Map<String, TextEditingController> _controllers;

  @override
  void initState() {
    super.initState();
    _controllers = {
      for (final key in _fieldLabels.keys)
        key: TextEditingController(text: widget.fields[key]?.value ?? ''),
    };
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, OcrField> _buildEditedFields() => {
        for (final entry in _controllers.entries)
          if (entry.value.text.isNotEmpty)
            entry.key: OcrField(
              value: entry.value.text,
              confidence: widget.fields[entry.key]?.confidence ?? 1.0,
              autoFilled: false,
            ),
      };

  // Таблон кодове → описание (EU Directive 1999/37/EC)
  static const _legendCodes = <String, String>{
    'A': '(A) Регистрационен номер',
    'B': '(B) Първа дата на регистрация',
    'C.2.1': '(C.2.1) Фамилия на собственика',
    'C.2.2': '(C.2.2) Собствено име',
    'C.2.3': '(C.2.3) Адрес',
    'D': '(D) Категория МПС',
    'D.1': '(D.1) Марка',
    'D.2': '(D.2) Тип/вариант/версия',
    'D.3': '(D.3) Търговско наименование',
    'E': '(E) Идентификационен номер (VIN)',
    'F.1': '(F.1) Технически допустима макс. маса',
    'F.2': '(F.2) Регистрирана маса',
    'G': '(G) Маса в готовност за движение',
    'H': '(H) Срок на валидност',
    'I': '(I) Дата на регистрация',
    'J': '(J) Категория на МПС',
    'K': '(K) Номер на одобряване',
    'P.1': '(P.1) Работен обем (cc)',
    'P.2': '(P.2) Максимална мощност (kW)',
    'P.3': '(P.3) Вид гориво',
    'R': '(R) Цвят',
    'S.1': '(S.1) Брой места',
    'V.9': '(V.9) Ниво на емисии (EURO)',
  };

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
              IconButton(
                icon: Icon(
                  _showDebug ? Icons.bug_report : Icons.bug_report_outlined,
                  color: _showDebug ? Colors.amber : _kMuted,
                  size: 20,
                ),
                tooltip: 'Debug ML Kit',
                onPressed: () => setState(() => _showDebug = !_showDebug),
              ),
              TextButton(
                onPressed: widget.onManualEntry,
                child: const Text('Редактирай', style: TextStyle(color: _kIndigo, fontSize: 13)),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            children: [
              if (_showDebug) ...[
                _buildDebugSection(),
                const SizedBox(height: 16),
                const Divider(color: Colors.white12),
                const SizedBox(height: 8),
              ],
              ..._fieldLabels.entries.map((entry) =>
                _buildFieldCard(entry.value, entry.key),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: () => widget.onProceed(_buildEditedFields()),
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

  String _buildMappingText() {
    final buf = StringBuffer();
    for (final legend in _legendCodes.entries) {
      final fieldKey = _legendCodeToFieldKey(legend.key);
      final field = fieldKey != null ? widget.fields[fieldKey] : null;
      if (field?.value != null) {
        buf.writeln(
          '${legend.value} → ${field!.value!} (${(field.confidence * 100).toStringAsFixed(0)}%)',
        );
      } else {
        buf.writeln('${legend.value} → не е разпознато');
      }
    }
    return buf.toString().trimRight();
  }

  Future<void> _copyToClipboard(String text, String label) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$label копиран'),
          duration: const Duration(seconds: 2),
          backgroundColor: _kSurface,
        ),
      );
    }
  }

  Widget _buildDebugSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Parsed fields with legend codes ──────────────────────────────────
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.amber.withAlpha(20),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.amber.withAlpha(80)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      '🔍 Разпознати полета (TalonParser)',
                      style: TextStyle(
                        color: Colors.amber,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => _copyToClipboard(_buildMappingText(), 'Mapping'),
                    icon: const Icon(Icons.copy_rounded, size: 18, color: Colors.amber),
                    tooltip: 'Копирай mapping',
                    padding: const EdgeInsets.all(8),
                    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ..._legendCodes.entries.map((legend) {
                // Find the parsed field value for this legend code
                final fieldKey = _legendCodeToFieldKey(legend.key);
                final field = fieldKey != null ? widget.fields[fieldKey] : null;
                final hasValue = field?.value != null;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        legend.value,
                        style: TextStyle(
                          color: hasValue ? Colors.greenAccent : _kMuted,
                          fontSize: 11,
                          fontFamily: 'monospace',
                          fontWeight: hasValue ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                      if (hasValue) ...[
                        const Text(' → ', style: TextStyle(color: _kMuted, fontSize: 11)),
                        Expanded(
                          child: Text(
                            field!.value!,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Text(
                          ' ${(field.confidence * 100).toStringAsFixed(0)}%',
                          style: const TextStyle(color: Colors.greenAccent, fontSize: 10),
                        ),
                      ] else
                        const Expanded(
                          child: Text(
                            ' — не е разпознато',
                            style: TextStyle(color: _kMuted, fontSize: 11),
                          ),
                        ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // ── Raw ML Kit text ───────────────────────────────────────────────────
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF0D1117),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.white12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      '📄 Raw ML Kit текст',
                      style: TextStyle(
                        color: _kMuted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: widget.rawText?.isNotEmpty == true
                        ? () => _copyToClipboard(widget.rawText!, 'Raw текст')
                        : null,
                    icon: Icon(
                      Icons.copy_rounded,
                      size: 18,
                      color: widget.rawText?.isNotEmpty == true ? _kTextSub : _kMuted.withAlpha(80),
                    ),
                    tooltip: 'Копирай raw текст',
                    padding: const EdgeInsets.all(8),
                    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                widget.rawText?.isNotEmpty == true
                    ? widget.rawText!
                    : '(нищо не е разпознато)',
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// Maps a talon legend code to the corresponding parsed field key.
  String? _legendCodeToFieldKey(String code) => switch (code) {
        'A' => 'license_plate',
        'E' => 'vin',
        'D.1' => 'make',
        'B' => 'first_registration_date',
        'I' => 'registration_validity',
        'J' => 'vehicle_category',
        'R' => 'color',
        'P.1' => 'engine_volume',
        'P.2' => 'power_kw',
        'P.3' => 'fuel_type',
        'S.1' => 'seats',
        'V.9' => 'euro_standard',
        'C.2.1' || 'C.2.2' => 'owner_name',
        'C.2.3' => 'owner_address',
        _ => null,
      };

  // Keyboard type per field key
  static TextInputType _keyboardType(String key) => switch (key) {
        'engine_volume' || 'power_kw' || 'year' => TextInputType.number,
        'owner_egn' => TextInputType.number,
        'first_registration_date' || 'registration_validity' =>
          TextInputType.datetime,
        _ => TextInputType.text,
      };

  // Format placeholder hint per field key
  static String _placeholder(String key) => switch (key) {
        'license_plate' => 'напр. СА1234АВ',
        'vin' => 'напр. WBA3A5G51DNP26082',
        'cert_number' => 'напр. 002345678',
        'make' => 'напр. BMW',
        'model' => 'напр. 320d',
        'year' => 'напр. 2019',
        'color' => 'напр. черен',
        'engine_volume' => 'напр. 1995',
        'power_kw' => 'напр. 140',
        'fuel_type' => 'напр. дизел',
        'seats' => 'напр. 5 или 4+1',
        'vehicle_category' => 'напр. M1',
        'euro_standard' => 'напр. EURO 6',
        'first_registration_date' => 'напр. 15.03.2019',
        'registration_validity' => 'напр. 31.12.2026',
        'owner_name' => 'напр. Иванов Иван',
        'owner_egn' => 'напр. 8501011234',
        'owner_address' => 'напр. гр. София, ул. Раковски 1',
        _ => 'Въведете ръчно...',
      };

  Widget _buildFieldCard(String label, String fieldKey) {
    final original = widget.fields[fieldKey];
    final controller = _controllers[fieldKey]!;
    final isMissing = original == null || (original.value?.isEmpty ?? true);
    final isLow = original?.isLowConfidence ?? true;

    final Color borderColor;
    final Color iconColor;
    final IconData iconData;
    if (isMissing) {
      borderColor = Colors.red.withAlpha(120);
      iconColor = Colors.red.shade300;
      iconData = Icons.edit_outlined;
    } else if (isLow) {
      borderColor = Colors.amber.withAlpha(100);
      iconColor = Colors.amber;
      iconData = Icons.warning_amber_rounded;
    } else {
      borderColor = _kGreen.withAlpha(80);
      iconColor = _kGreen;
      iconData = Icons.check_circle_rounded;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
      decoration: BoxDecoration(
        color: _kSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: _kMuted, fontSize: 11, fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Icon(iconData, color: iconColor, size: 16),
            ],
          ),
          TextField(
            controller: controller,
            keyboardType: _keyboardType(fieldKey),
            style: const TextStyle(
              color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600,
            ),
            decoration: InputDecoration(
              isDense: true,
              filled: false,
              contentPadding: const EdgeInsets.symmetric(vertical: 6),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              hintText: _placeholder(fieldKey),
              hintStyle: const TextStyle(
                color: _kMuted, fontSize: 13, fontWeight: FontWeight.normal,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
