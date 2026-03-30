import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'ocr_wizard_constants.dart';

/// Full-screen live camera preview with document corner-bracket overlay.
///
/// Supports:
///  - pinch-to-zoom (up to device max zoom)
///  - tap-to-focus / tap-to-expose
///  - corner bracket guide overlay
class OcrCameraView extends StatelessWidget {
  const OcrCameraView({
    super.key,
    required this.step,
    required this.capturedCount,
    required this.camera,
    required this.cameraReady,
    required this.zoom,
    required this.minZoom,
    required this.maxZoom,
    required this.onCapture,
    required this.onManualEntry,
    required this.onScaleStart,
    required this.onScaleUpdate,
    required this.onTapFocus,
  });

  final int step;
  final int capturedCount;
  final CameraController? camera;
  final bool cameraReady;
  final double zoom;
  final double minZoom;
  final double maxZoom;
  final VoidCallback onCapture;
  final VoidCallback onManualEntry;
  final void Function(ScaleStartDetails) onScaleStart;
  final Future<void> Function(ScaleUpdateDetails) onScaleUpdate;
  final Future<void> Function(TapUpDetails, Size) onTapFocus;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Live camera preview
        if (cameraReady && camera != null)
          LayoutBuilder(
            builder: (ctx, constraints) => GestureDetector(
              onScaleStart: onScaleStart,
              onScaleUpdate: onScaleUpdate,
              onTapUp: (d) => onTapFocus(
                d,
                Size(constraints.maxWidth, constraints.maxHeight),
              ),
              child: CameraPreview(camera!),
            ),
          )
        else
          const ColoredBox(color: Colors.black),

        // Document frame overlay with corner brackets
        const CustomPaint(painter: _DocFramePainter()),

        // Top bar
        _TopBar(step: step, zoom: zoom, minZoom: minZoom, onBack: onManualEntry),

        // Bottom info + capture sheet
        _BottomSheet(
          step: step,
          capturedCount: capturedCount,
          onCapture: onCapture,
          onManualEntry: onManualEntry,
        ),
      ],
    );
  }
}

// ─── Top transparent bar ───────────────────────────────────────────────────────

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.step,
    required this.zoom,
    required this.minZoom,
    required this.onBack,
  });
  final int step;
  final double zoom;
  final double minZoom;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Row(
          children: [
            GestureDetector(
              onTap: onBack,
              child: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Colors.black.withAlpha(130),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white24),
                ),
                child: const Icon(
                  Icons.arrow_back_ios_new_rounded,
                  size: 14,
                  color: Colors.white,
                ),
              ),
            ),
            const Spacer(),
            _StepPills(step: step),
            const Spacer(),
            if (zoom > minZoom + 0.15)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.black.withAlpha(130),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${zoom.toStringAsFixed(1)}×',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              )
            else
              const SizedBox(width: 38),
          ],
        ),
      ),
    );
  }
}

class _StepPills extends StatelessWidget {
  const _StepPills({required this.step});
  final int step;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withAlpha(130),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(kTotalSteps, (i) {
          final done = i < step;
          final active = i == step;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            width: active ? 22 : 8,
            height: 8,
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: done
                  ? kOcrGreen
                  : active
                      ? kOcrIndigo
                      : Colors.white30,
              borderRadius: BorderRadius.circular(4),
            ),
          );
        }),
      ),
    );
  }
}

// ─── Bottom info + capture sheet ───────────────────────────────────────────────

class _BottomSheet extends StatelessWidget {
  const _BottomSheet({
    required this.step,
    required this.capturedCount,
    required this.onCapture,
    required this.onManualEntry,
  });
  final int step;
  final int capturedCount;
  final VoidCallback onCapture;
  final VoidCallback onManualEntry;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomCenter,
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xF2111827),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                children: [
                  _Chip(
                    label: 'СТЪПКА ${step + 1} / $kTotalSteps',
                    color: kOcrIndigo,
                  ),
                  if (capturedCount > 0) ...[
                    const SizedBox(width: 6),
                    _Chip(
                      label: '✓ $capturedCount взета',
                      color: kOcrGreen,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              Text(
                kStepTitles[step],
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                kStepSubs[step],
                style: const TextStyle(
                  color: kOcrTextSub,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 10),
              _LegendChips(legend: kLegendFor(step)),
              const SizedBox(height: 14),
              SizedBox(
                height: 54,
                child: ElevatedButton.icon(
                  onPressed: onCapture,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kOcrIndigo,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  icon: const Icon(Icons.camera_alt_rounded, size: 22),
                  label: const Text(
                    'Снимай',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              TextButton(
                onPressed: onManualEntry,
                child: const Text(
                  'Въведи ръчно',
                  style: TextStyle(color: kOcrMuted, fontSize: 13),
                ),
              ),
              const SizedBox(height: 4),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(35),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _LegendChips extends StatelessWidget {
  const _LegendChips({required this.legend});
  final List<(String, String)> legend;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: legend.map((item) => _LegendChip(code: item.$1, label: item.$2)).toList(),
    );
  }
}

class _LegendChip extends StatelessWidget {
  const _LegendChip({required this.code, required this.label});
  final String code;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.white12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            code,
            style: const TextStyle(
              color: kOcrIndigo,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(color: kOcrTextSub, fontSize: 10),
          ),
        ],
      ),
    );
  }
}

// ─── Document frame overlay painter ───────────────────────────────────────────

class _DocFramePainter extends CustomPainter {
  const _DocFramePainter();

  @override
  void paint(Canvas canvas, Size size) {
    // Viewport rect — position between top bar and bottom sheet
    final rect = Rect.fromLTWH(
      size.width * 0.05,
      size.height * 0.13,
      size.width * 0.90,
      size.width * 0.90 * 0.64,
    );

    // Semi-dark scrim outside the doc area
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height)),
        Path()..addRRect(RRect.fromRectAndRadius(rect, const Radius.circular(10))),
      ),
      Paint()..color = Colors.black54,
    );

    // Corner brackets
    final paint = Paint()
      ..color = kOcrIndigo
      ..strokeWidth = 3.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    const armLen = 26.0;
    const corner = 10.0;

    _drawCorner(canvas, paint, rect.topLeft, 1, 1, armLen, corner);
    _drawCorner(canvas, paint, rect.topRight, -1, 1, armLen, corner);
    _drawCorner(canvas, paint, rect.bottomLeft, 1, -1, armLen, corner);
    _drawCorner(canvas, paint, rect.bottomRight, -1, -1, armLen, corner);
  }

  void _drawCorner(
    Canvas c,
    Paint p,
    Offset pt,
    double dx,
    double dy,
    double len,
    double r,
  ) {
    c.drawLine(Offset(pt.dx + dx * r, pt.dy), Offset(pt.dx + dx * (r + len), pt.dy), p);
    c.drawLine(Offset(pt.dx, pt.dy + dy * r), Offset(pt.dx, pt.dy + dy * (r + len)), p);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
