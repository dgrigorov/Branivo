import 'dart:async';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'ocr_wizard_constants.dart';

// ─── Step processing view ──────────────────────────────────────────────────────
// Shown between captures — animates through preprocessing pipeline stages.

class OcrStepProcessingView extends StatefulWidget {
  const OcrStepProcessingView({
    super.key,
    required this.step,
    required this.image,
  });

  final int step;
  final XFile image;

  @override
  State<OcrStepProcessingView> createState() => _OcrStepProcessingViewState();
}

class _OcrStepProcessingViewState extends State<OcrStepProcessingView> {
  static const _stages = [
    (Icons.aspect_ratio_rounded, 'Оразмеряване'),
    (Icons.contrast_rounded, 'Grayscale + Контраст'),
    (Icons.wb_sunny_outlined, 'Маскиране на блясъци'),
    (Icons.document_scanner_rounded, 'Изпращане към OCR'),
  ];

  int _active = 0;
  late final Timer _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(milliseconds: 450), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() {
        _active++;
        if (_active >= _stages.length) t.cancel();
      });
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kOcrBg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Captured image preview
            Expanded(
              flex: 5,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.file(File(widget.image.path), fit: BoxFit.cover),
                      // Dark gradient at bottom
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, Color(0xAA000000)],
                          ),
                        ),
                      ),
                      const Center(
                        child: CircularProgressIndicator(
                          color: kOcrIndigo,
                          strokeWidth: 2.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Processing pipeline stages
            Expanded(
              flex: 4,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                child: _PipelineCard(step: widget.step, active: _active, stages: _stages),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PipelineCard extends StatelessWidget {
  const _PipelineCard({
    required this.step,
    required this.active,
    required this.stages,
  });
  final int step;
  final int active;
  final List<(IconData, String)> stages;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: kOcrSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Обработваме снимка ${step + 1}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            kStepTitles[step],
            style: const TextStyle(color: kOcrMuted, fontSize: 12),
          ),
          const SizedBox(height: 16),
          ...stages.asMap().entries.map((e) {
            final idx = e.key;
            final (icon, label) = e.value;
            final done = idx < active;
            final isActive = idx == active;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 280),
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: done
                          ? kOcrGreen.withAlpha(30)
                          : isActive
                              ? kOcrIndigo.withAlpha(30)
                              : Colors.white.withAlpha(8),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      done ? Icons.check_rounded : icon,
                      size: 15,
                      color: done ? kOcrGreen : (isActive ? kOcrIndigo : kOcrMuted),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    label,
                    style: TextStyle(
                      color: done
                          ? Colors.white
                          : (isActive ? kOcrIndigo : kOcrMuted),
                      fontSize: 13,
                      fontWeight: done || isActive
                          ? FontWeight.w600
                          : FontWeight.normal,
                    ),
                  ),
                  if (isActive) ...[
                    const SizedBox(width: 8),
                    const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(
                        strokeWidth: 1.5,
                        color: kOcrIndigo,
                      ),
                    ),
                  ],
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ─── Final processing view ─────────────────────────────────────────────────────
// Shown while the API call is in flight (all 3 images sent).

class OcrFinalProcessingView extends StatelessWidget {
  const OcrFinalProcessingView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kOcrBg,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: kOcrIndigo.withAlpha(20),
                shape: BoxShape.circle,
                border: Border.all(color: kOcrIndigo.withAlpha(60), width: 1.5),
              ),
              child: const CircularProgressIndicator(
                color: kOcrIndigo,
                strokeWidth: 2,
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Анализираме документа…',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Извличаме данните от 3 снимки',
              style: TextStyle(color: kOcrMuted, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Preview view ──────────────────────────────────────────────────────────────
// Shown right after the user takes a photo — confirm or retake.

class OcrPreviewView extends StatelessWidget {
  const OcrPreviewView({
    super.key,
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
    return Scaffold(
      backgroundColor: kOcrBg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _header(),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Image.file(
                    File(image.path),
                    fit: BoxFit.contain,
                    width: double.infinity,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
              child: SizedBox(
                height: 54,
                child: ElevatedButton.icon(
                  onPressed: onConfirm,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kOcrGreen,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  icon: const Icon(Icons.check_rounded, size: 22),
                  label: Text(
                    step == kTotalSteps - 1
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
                icon: const Icon(Icons.replay_rounded, size: 16, color: kOcrMuted),
                label: const Text(
                  'Снимай отново',
                  style: TextStyle(color: kOcrMuted, fontSize: 13),
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Row(
        children: [
          GestureDetector(
            onTap: onRetake,
            child: Container(
              width: 38,
              height: 38,
              decoration: const BoxDecoration(
                color: Color(0xFF1E293B),
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
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'СНИМКА ${step + 1} ОТ $kTotalSteps',
                style: const TextStyle(
                  color: kOcrIndigo,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                ),
              ),
              Text(
                kStepTitles[step],
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Failed view ───────────────────────────────────────────────────────────────

class OcrFailedView extends StatelessWidget {
  const OcrFailedView({
    super.key,
    required this.onManualEntry,
    this.message,
  });

  final VoidCallback onManualEntry;
  final String? message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kOcrBg,
      body: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.warning_amber_rounded, color: Colors.amber, size: 56),
            const SizedBox(height: 16),
            const Text(
              'Не успяхме да разчетем документа',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              message ?? 'Моля, попълнете данните ръчно.',
              style: const TextStyle(
                color: kOcrMuted,
                fontSize: 13,
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: onManualEntry,
                style: ElevatedButton.styleFrom(
                  backgroundColor: kOcrIndigo,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Попълни ръчно',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
