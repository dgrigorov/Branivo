import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import '../bloc/ocr_wizard_bloc.dart';
import 'ocr_wizard_constants.dart';

/// Full-screen perspective crop editor.
///
/// Shows the captured image with 4 draggable corner handles.
/// The user adjusts the quad to match the document edges, then confirms.
/// The quad overlay darkens the area outside the selected region.
class OcrCropEditorView extends StatefulWidget {
  const OcrCropEditorView({
    super.key,
    required this.step,
    required this.image,
    required this.initialCorners,
    required this.sessionToken,
  });

  final int step;
  final XFile image;
  final List<Offset> initialCorners;
  final String sessionToken;

  @override
  State<OcrCropEditorView> createState() => _OcrCropEditorViewState();
}

class _OcrCropEditorViewState extends State<OcrCropEditorView> {
  late List<Offset> _corners;
  Uint8List? _imageBytes;

  static const List<Offset> _resetCorners = [
    Offset(0.02, 0.02),
    Offset(0.98, 0.02),
    Offset(0.98, 0.98),
    Offset(0.02, 0.98),
  ];

  @override
  void initState() {
    super.initState();
    _corners = List.from(widget.initialCorners);
    _loadImage();
  }

  Future<void> _loadImage() async {
    final bytes = await widget.image.readAsBytes();
    if (mounted) setState(() => _imageBytes = bytes);
  }

  void _moveCorner(int index, DragUpdateDetails d, Size size) {
    setState(() {
      final nx = (_corners[index].dx + d.delta.dx / size.width).clamp(0.0, 1.0);
      final ny = (_corners[index].dy + d.delta.dy / size.height).clamp(0.0, 1.0);
      _corners[index] = Offset(nx, ny);
    });
  }

  void _confirm() {
    context.read<OcrWizardBloc>().add(
      OcrCropConfirmedEvent(
        step: widget.step,
        corners: List.from(_corners),
        sessionToken: widget.sessionToken,
      ),
    );
  }

  void _retake() {
    context.read<OcrWizardBloc>().add(OcrPreviewRetakeEvent(step: widget.step));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          _buildImageLayer(),
          _buildTopBar(),
          _buildBottomBar(),
        ],
      ),
    );
  }

  Widget _buildImageLayer() {
    final bytes = _imageBytes;
    if (bytes == null) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }
    return LayoutBuilder(
      builder: (ctx, constraints) {
        final size = constraints.biggest;
        return Stack(
          children: [
            // Image fills full area
            Positioned.fill(
              child: Image.memory(bytes, fit: BoxFit.contain),
            ),
            // Crop overlay
            Positioned.fill(
              child: CustomPaint(
                painter: _CropOverlayPainter(_corners),
              ),
            ),
            // Corner handles
            for (int i = 0; i < 4; i++) _buildHandle(i, size),
          ],
        );
      },
    );
  }

  Widget _buildHandle(int index, Size size) {
    const handleRadius = 22.0;
    final screenX = _corners[index].dx * size.width;
    final screenY = _corners[index].dy * size.height;

    return Positioned(
      left: screenX - handleRadius,
      top: screenY - handleRadius,
      child: GestureDetector(
        onPanUpdate: (d) => _moveCorner(index, d, size),
        child: Container(
          width: handleRadius * 2,
          height: handleRadius * 2,
          decoration: BoxDecoration(
            color: Colors.white.withAlpha(40),
            border: Border.all(color: kOcrBlue, width: 2.5),
            borderRadius: BorderRadius.circular(4),
          ),
          child: const Icon(Icons.open_with_rounded, color: Colors.white, size: 18),
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              const Icon(Icons.crop_free_rounded, color: kOcrBlue, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Избери ъглите на документа',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: () => setState(() => _corners = List.from(_resetCorners)),
                icon: const Icon(Icons.restart_alt_rounded, size: 16, color: kOcrMuted),
                label: const Text(
                  'Нулирай',
                  style: TextStyle(color: kOcrMuted, fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBottomBar() {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.transparent, Colors.black.withAlpha(200)],
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _retake,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white70,
                    side: const BorderSide(color: Colors.white24),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Повтори снимката'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: _confirm,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kOcrBlue,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text(
                    'Запази и продължи',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Crop overlay painter ──────────────────────────────────────────────────────

class _CropOverlayPainter extends CustomPainter {
  const _CropOverlayPainter(this.corners);
  final List<Offset> corners;

  @override
  void paint(Canvas canvas, Size size) {
    final pts = corners
        .map((c) => Offset(c.dx * size.width, c.dy * size.height))
        .toList();

    // Dark scrim outside the selected quad (even-odd fill rule cuts the hole)
    final scrimPath = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..moveTo(pts[0].dx, pts[0].dy)
      ..lineTo(pts[1].dx, pts[1].dy)
      ..lineTo(pts[2].dx, pts[2].dy)
      ..lineTo(pts[3].dx, pts[3].dy)
      ..close();
    scrimPath.fillType = PathFillType.evenOdd;
    canvas.drawPath(scrimPath, Paint()..color = Colors.black.withAlpha(150));

    // Blue quad border
    final borderPath = Path()
      ..moveTo(pts[0].dx, pts[0].dy)
      ..lineTo(pts[1].dx, pts[1].dy)
      ..lineTo(pts[2].dx, pts[2].dy)
      ..lineTo(pts[3].dx, pts[3].dy)
      ..close();
    canvas.drawPath(
      borderPath,
      Paint()
        ..color = kOcrBlue
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0,
    );
  }

  @override
  bool shouldRepaint(_CropOverlayPainter old) => old.corners != corners;
}
