import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import '../bloc/ocr_wizard_bloc.dart';
import 'ocr_wizard_constants.dart';

/// Full-screen perspective crop editor.
///
/// Shows the captured image with 4 draggable corner handles.
/// The user adjusts the quad to match the document edges, then confirms.
///
/// Key: corner handles are stored in *screen-space* (0..1 relative to device
/// screen) for smooth dragging, but are converted to *image-space* (0..1
/// relative to the image's displayed rect) before dispatching the confirm
/// event. This ensures the Python service's cv2.warpPerspective receives
/// coordinates relative to the actual image, not the screen letterbox.
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
  late List<Offset> _corners; // screen-space 0..1
  List<Offset>? _defaultCorners; // reset target (screen-space)

  // Image display geometry — needed to convert screen→image coords.
  double _imgLeft = 0;
  double _imgTop = 0;
  double _displayW = 0;
  double _displayH = 0;

  Uint8List? _imageBytes;

  static const List<Offset> _fallbackCorners = [
    Offset(0.10, 0.35),
    Offset(0.90, 0.35),
    Offset(0.90, 0.65),
    Offset(0.10, 0.65),
  ];

  @override
  void initState() {
    super.initState();
    _corners = widget.initialCorners.isNotEmpty
        ? List.from(widget.initialCorners)
        : List.from(_fallbackCorners);
    _loadImage();
  }

  Future<void> _loadImage() async {
    final bytes = await widget.image.readAsBytes();
    if (!mounted) return;

    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final naturalW = frame.image.width.toDouble();
    final naturalH = frame.image.height.toDouble();
    frame.image.dispose();
    codec.dispose();

    if (!mounted) return;

    final screenSize = MediaQuery.of(context).size;
    final (corners, left, top, dw, dh) = _computeLayout(
      naturalW: naturalW,
      naturalH: naturalH,
      screenSize: screenSize,
    );

    setState(() {
      _imageBytes = bytes;
      _imgLeft = left;
      _imgTop = top;
      _displayW = dw;
      _displayH = dh;
      _defaultCorners = corners;
      _corners = corners;
    });
  }

  /// Returns initial corner positions (screen-space 0..1, 10% inset from image
  /// rect) and the image's display geometry within the screen.
  (List<Offset>, double, double, double, double) _computeLayout({
    required double naturalW,
    required double naturalH,
    required Size screenSize,
  }) {
    final imgAspect = naturalW / naturalH;
    final screenAspect = screenSize.width / screenSize.height;

    double dw, dh;
    if (imgAspect > screenAspect) {
      dw = screenSize.width;
      dh = screenSize.width / imgAspect;
    } else {
      dh = screenSize.height;
      dw = screenSize.height * imgAspect;
    }

    final left = (screenSize.width - dw) / 2;
    final top = (screenSize.height - dh) / 2;

    const inset = 0.10;
    final tlX = (left + dw * inset) / screenSize.width;
    final tlY = (top + dh * inset) / screenSize.height;
    final brX = (left + dw * (1 - inset)) / screenSize.width;
    final brY = (top + dh * (1 - inset)) / screenSize.height;

    return (
      [Offset(tlX, tlY), Offset(brX, tlY), Offset(brX, brY), Offset(tlX, brY)],
      left, top, dw, dh,
    );
  }

  void _moveCorner(int index, DragUpdateDetails d, Size size) {
    setState(() {
      final nx = (_corners[index].dx + d.delta.dx / size.width).clamp(0.0, 1.0);
      final ny = (_corners[index].dy + d.delta.dy / size.height).clamp(0.0, 1.0);
      _corners[index] = Offset(nx, ny);
    });
  }

  /// Convert screen-space corners (0..1 relative to screen) to image-space
  /// corners (0..1 relative to the image's display rect).
  ///
  /// The Python service multiplies these by the image's pixel dimensions to get
  /// the src quad for cv2.warpPerspective.
  List<Offset> _toImageCorners(Size screenSize) {
    if (_displayW == 0 || _displayH == 0) return _corners;
    return _corners.map((c) {
      final sx = c.dx * screenSize.width;
      final sy = c.dy * screenSize.height;
      final ix = ((sx - _imgLeft) / _displayW).clamp(0.0, 1.0);
      final iy = ((sy - _imgTop) / _displayH).clamp(0.0, 1.0);
      return Offset(ix, iy);
    }).toList();
  }

  void _confirm() {
    final screenSize = MediaQuery.of(context).size;
    final imageCorners = _toImageCorners(screenSize);
    context.read<OcrWizardBloc>().add(
      OcrCropConfirmedEvent(
        step: widget.step,
        corners: imageCorners,
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
          Positioned.fill(child: _buildImageLayer()),
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
            Positioned.fill(
              child: Image.memory(bytes, fit: BoxFit.contain),
            ),
            Positioned.fill(
              child: CustomPaint(painter: _CropOverlayPainter(_corners)),
            ),
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
    final left = (screenX - handleRadius).clamp(0.0, size.width - handleRadius * 2);
    final top = (screenY - handleRadius).clamp(0.0, size.height - handleRadius * 2);

    return Positioned(
      left: left,
      top: top,
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
      top: 0, left: 0, right: 0,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              const Icon(Icons.crop_free_rounded, color: kOcrBlue, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'СНИМКА ${widget.step + 1} ОТ $kTotalSteps',
                      style: const TextStyle(
                        color: kOcrIndigo,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const Text(
                      'Избери ъглите на документа',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: () => setState(() {
                  _corners = List.from(_defaultCorners ?? _fallbackCorners);
                }),
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
      bottom: 0, left: 0, right: 0,
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
                  child: const Text('Снимай отново'),
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
                  child: Text(
                    widget.step < kTotalSteps - 1
                        ? 'Следваща снимка'
                        : 'Запази и анализирай',
                    style: const TextStyle(fontWeight: FontWeight.w700),
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
    if (corners.length < 4) return;

    final pts = corners
        .map((c) => Offset(c.dx * size.width, c.dy * size.height))
        .toList();

    // Dark scrim outside the selected quad
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
