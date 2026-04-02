import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'ocr_wizard_constants.dart';

/// Full-screen live camera preview.
///
/// Features:
///  - Pinch-to-zoom / tap-to-focus
///  - Flash toggle (off ↔ torch)
///  - Auto capture toggle with document-detection green overlay
///  - Captured photo thumbnails in the bottom-right corner
///  - Collapsible legend (drag sheet down to hide; ⓘ button to restore)
class OcrCameraView extends StatelessWidget {
  const OcrCameraView({
    super.key,
    required this.step,
    required this.capturedImages,
    required this.camera,
    required this.cameraReady,
    required this.zoom,
    required this.minZoom,
    required this.maxZoom,
    required this.flashEnabled,
    required this.autoCaptureEnabled,
    required this.isDocumentDetected,
    required this.onCapture,
    required this.onManualEntry,
    required this.onFlashToggle,
    required this.onAutoCaptureToggle,
    required this.onScaleStart,
    required this.onScaleUpdate,
    required this.onTapFocus,
  });

  final int step;
  final List<String> capturedImages;
  final CameraController? camera;
  final bool cameraReady;
  final double zoom;
  final double minZoom;
  final double maxZoom;
  final bool flashEnabled;
  final bool autoCaptureEnabled;
  final bool isDocumentDetected;
  final VoidCallback onCapture;
  final VoidCallback onManualEntry;
  final VoidCallback onFlashToggle;
  final VoidCallback onAutoCaptureToggle;
  final void Function(ScaleStartDetails) onScaleStart;
  final Future<void> Function(ScaleUpdateDetails) onScaleUpdate;
  final Future<void> Function(TapUpDetails, Size) onTapFocus;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (ctx, constraints) {
        final screenSize = Size(constraints.maxWidth, constraints.maxHeight);
        return Stack(
          fit: StackFit.expand,
          children: [
            // ── Camera full-screen fill ───────────────────────────────────────
            Positioned.fill(
              child: cameraReady && camera != null
                  ? GestureDetector(
                      onScaleStart: onScaleStart,
                      onScaleUpdate: onScaleUpdate,
                      onTapUp: (d) => onTapFocus(d, screenSize),
                      child: _CameraFill(camera: camera!),
                    )
                  : const ColoredBox(color: Colors.black),
            ),

            // ── Green edge flash when document detected (auto capture only) ──
            if (isDocumentDetected && autoCaptureEnabled)
              Positioned.fill(
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(color: kOcrGreen, width: 3),
                    ),
                  ),
                ),
              ),

            // ── Top bar ───────────────────────────────────────────────────────
            Positioned(
              top: 0, left: 0, right: 0,
              child: _TopBar(
                step: step,
                zoom: zoom,
                minZoom: minZoom,
                flashEnabled: flashEnabled,
                autoCaptureEnabled: autoCaptureEnabled,
                isDocumentDetected: isDocumentDetected,
                onBack: onManualEntry,
                onFlashToggle: onFlashToggle,
                onAutoCaptureToggle: onAutoCaptureToggle,
              ),
            ),

            // ── Captured thumbnails — bottom right ────────────────────────────
            if (capturedImages.isNotEmpty)
              Positioned(
                right: 16,
                bottom: _kBottomSheetCollapsedHeight + 72,
                child: _ThumbnailStack(paths: capturedImages),
              ),

            // ── Bottom sheet (stateful — collapsible legend) ──────────────────
            Positioned(
              bottom: 0, left: 0, right: 0,
              child: _BottomSheetWidget(
                step: step,
                autoCaptureEnabled: autoCaptureEnabled,
                isDocumentDetected: isDocumentDetected,
                onCapture: onCapture,
                onManualEntry: onManualEntry,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Estimated height of the collapsed bottom sheet (step title + capture btn).
const double _kBottomSheetCollapsedHeight = 130;

// ─── Camera fill ──────────────────────────────────────────────────────────────

class _CameraFill extends StatelessWidget {
  const _CameraFill({required this.camera});
  final CameraController camera;

  @override
  Widget build(BuildContext context) {
    final preview = camera.value.previewSize;
    final double w = preview?.height ?? 720;
    final double h = preview?.width ?? 1280;
    return FittedBox(
      fit: BoxFit.cover,
      clipBehavior: Clip.hardEdge,
      child: SizedBox(width: w, height: h, child: CameraPreview(camera)),
    );
  }
}

// ─── Thumbnails ───────────────────────────────────────────────────────────────

class _ThumbnailStack extends StatelessWidget {
  const _ThumbnailStack({required this.paths});
  final List<String> paths;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: paths.asMap().entries.map((e) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Container(
            width: 60,
            height: 44,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: kOcrGreen, width: 2),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withAlpha(120),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.file(File(e.value), fit: BoxFit.cover),
                  Positioned(
                    bottom: 2, right: 4,
                    child: Text(
                      '${e.key + 1}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        shadows: [Shadow(color: Colors.black87, blurRadius: 4)],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.step,
    required this.zoom,
    required this.minZoom,
    required this.flashEnabled,
    required this.autoCaptureEnabled,
    required this.isDocumentDetected,
    required this.onBack,
    required this.onFlashToggle,
    required this.onAutoCaptureToggle,
  });

  final int step;
  final double zoom;
  final double minZoom;
  final bool flashEnabled;
  final bool autoCaptureEnabled;
  final bool isDocumentDetected;
  final VoidCallback onBack;
  final VoidCallback onFlashToggle;
  final VoidCallback onAutoCaptureToggle;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Row(
          children: [
            _IconBtn(icon: Icons.arrow_back_ios_new_rounded, onTap: onBack, size: 14),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.black.withAlpha(130),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white24),
              ),
              child: const Text(
                kDocumentTypeLabel,
                style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
              ),
            ),
            const Spacer(),
            _StepPills(step: step),
            const Spacer(),
            _IconBtn(
              icon: flashEnabled ? Icons.flash_on_rounded : Icons.flash_off_rounded,
              onTap: onFlashToggle,
              active: flashEnabled,
            ),
            const SizedBox(width: 8),
            _AutoCaptureBtn(
              enabled: autoCaptureEnabled,
              detected: isDocumentDetected,
              onTap: onAutoCaptureToggle,
            ),
          ],
        ),
      ),
    );
  }
}

class _IconBtn extends StatelessWidget {
  const _IconBtn({required this.icon, required this.onTap, this.active = false, this.size = 18});
  final IconData icon;
  final VoidCallback onTap;
  final bool active;
  final double size;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38, height: 38,
        decoration: BoxDecoration(
          color: active ? kOcrIndigo.withAlpha(180) : Colors.black.withAlpha(130),
          shape: BoxShape.circle,
          border: Border.all(color: active ? kOcrIndigo : Colors.white24),
        ),
        child: Icon(icon, size: size, color: Colors.white),
      ),
    );
  }
}

class _AutoCaptureBtn extends StatelessWidget {
  const _AutoCaptureBtn({required this.enabled, required this.detected, required this.onTap});
  final bool enabled;
  final bool detected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = enabled ? (detected ? kOcrGreen : kOcrIndigo) : Colors.white54;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38, height: 38,
        decoration: BoxDecoration(
          color: enabled ? color.withAlpha(detected ? 60 : 40) : Colors.black.withAlpha(130),
          shape: BoxShape.circle,
          border: Border.all(color: enabled ? color : Colors.white24, width: enabled && detected ? 2 : 1),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(Icons.camera_alt_rounded, size: 18, color: color),
            Positioned(
              right: 6, bottom: 6,
              child: Container(
                width: 13, height: 13,
                decoration: BoxDecoration(color: enabled ? color : Colors.black54, shape: BoxShape.circle),
                child: const Center(
                  child: Text('А', style: TextStyle(color: Colors.white, fontSize: 7, fontWeight: FontWeight.w900)),
                ),
              ),
            ),
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
              color: done ? kOcrGreen : active ? kOcrIndigo : Colors.white30,
              borderRadius: BorderRadius.circular(4),
            ),
          );
        }),
      ),
    );
  }
}

// ─── Bottom sheet — stateful (collapsible legend) ─────────────────────────────

class _BottomSheetWidget extends StatefulWidget {
  const _BottomSheetWidget({
    required this.step,
    required this.autoCaptureEnabled,
    required this.isDocumentDetected,
    required this.onCapture,
    required this.onManualEntry,
  });

  final int step;
  final bool autoCaptureEnabled;
  final bool isDocumentDetected;
  final VoidCallback onCapture;
  final VoidCallback onManualEntry;

  @override
  State<_BottomSheetWidget> createState() => _BottomSheetWidgetState();
}

class _BottomSheetWidgetState extends State<_BottomSheetWidget> {
  bool _legendVisible = true;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      // Drag down anywhere on the sheet → collapse legend
      onVerticalDragEnd: (d) {
        if (d.primaryVelocity != null && d.primaryVelocity! > 200 && _legendVisible) {
          setState(() => _legendVisible = false);
        } else if (d.primaryVelocity != null && d.primaryVelocity! < -200 && !_legendVisible) {
          setState(() => _legendVisible = true);
        }
      },
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xF2111827),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Drag handle row ───────────────────────────────────────────
              Row(
                children: [
                  Expanded(
                    child: Center(
                      child: Container(
                        width: 36, height: 4,
                        decoration: BoxDecoration(
                          color: Colors.white24,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ),
                  // ⓘ icon to restore legend when hidden
                  if (!_legendVisible)
                    GestureDetector(
                      onTap: () => setState(() => _legendVisible = true),
                      child: Container(
                        width: 32, height: 32,
                        decoration: BoxDecoration(
                          color: kOcrIndigo.withAlpha(30),
                          shape: BoxShape.circle,
                          border: Border.all(color: kOcrIndigo.withAlpha(60)),
                        ),
                        child: Icon(Icons.info_outline_rounded, size: 16, color: kOcrIndigo),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),

              // ── Step label ────────────────────────────────────────────────
              Row(
                children: [
                  _Chip(label: 'СНИМКА ${widget.step + 1} / $kTotalSteps', color: kOcrIndigo),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                kStepTitles[widget.step],
                style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 2),
              Text(
                widget.autoCaptureEnabled && widget.isDocumentDetected
                    ? 'Документ засечен — задръжте неподвижно…'
                    : widget.autoCaptureEnabled
                        ? 'Насочете камерата към документа…'
                        : kStepSubs[widget.step],
                style: TextStyle(
                  color: widget.autoCaptureEnabled && widget.isDocumentDetected ? kOcrGreen : kOcrTextSub,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),

              // ── Collapsible legend ────────────────────────────────────────
              AnimatedSize(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeInOut,
                child: _legendVisible
                    ? Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: _LegendChips(legend: kLegendFor(widget.step)),
                      )
                    : const SizedBox.shrink(),
              ),

              const SizedBox(height: 14),

              // ── Action row: manual entry icon · capture btn · (spacer) ───
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Manual entry icon
                  _SheetIconBtn(
                    icon: Icons.keyboard_rounded,
                    onTap: widget.onManualEntry,
                    tooltip: 'Въведи ръчно',
                  ),
                  const SizedBox(width: 24),
                  // Capture — large circle button
                  GestureDetector(
                    onTap: widget.onCapture,
                    child: Container(
                      width: 72, height: 72,
                      decoration: BoxDecoration(
                        color: kOcrIndigo,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: kOcrIndigo.withAlpha(80),
                            blurRadius: 16,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 30),
                    ),
                  ),
                  const SizedBox(width: 24),
                  // Placeholder for symmetry
                  const SizedBox(width: 44),
                ],
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _SheetIconBtn extends StatelessWidget {
  const _SheetIconBtn({required this.icon, required this.onTap, required this.tooltip});
  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44, height: 44,
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white12),
        ),
        child: Icon(icon, color: kOcrMuted, size: 20),
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
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5),
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
      spacing: 6, runSpacing: 4,
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
          Text(code, style: const TextStyle(color: kOcrIndigo, fontSize: 10, fontWeight: FontWeight.w700)),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(color: kOcrTextSub, fontSize: 10)),
        ],
      ),
    );
  }
}

