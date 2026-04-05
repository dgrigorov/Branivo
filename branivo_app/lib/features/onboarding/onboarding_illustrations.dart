import 'package:flutter/material.dart';

const _kIndigo = Color(0xFF6366F1);
const _kTextMuted = Color(0xFF6B7280);
const _kBlobColor = Color(0xFFEDE9FF);
const _kPink = Color(0xFFEA4080);

// ─── Blob Painter ──────────────────────────────────────────────────────────────

class BlobPainter extends CustomPainter {
  const BlobPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final w = size.width;
    final h = size.height;
    final path = Path()
      ..moveTo(w * 0.15, h * 0.35)
      ..cubicTo(w * 0.05, h * 0.08, w * 0.40, h * -0.02, w * 0.72, h * 0.10)
      ..cubicTo(w * 0.96, h * 0.20, w * 1.04, h * 0.58, w * 0.84, h * 0.78)
      ..cubicTo(w * 0.68, h * 0.95, w * 0.28, h * 0.97, w * 0.10, h * 0.80)
      ..cubicTo(w * -0.04, h * 0.65, w * 0.10, h * 0.54, w * 0.15, h * 0.35)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(BlobPainter old) => old.color != color;
}

// ─── Dot Grid Painter ─────────────────────────────────────────────────────────

class DotGridPainter extends CustomPainter {
  const DotGridPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    const spacing = 11.0;
    const radius = 1.8;
    for (double x = 0; x <= size.width; x += spacing) {
      for (double y = 0; y <= size.height; y += spacing) {
        canvas.drawCircle(Offset(x, y), radius, paint);
      }
    }
  }

  @override
  bool shouldRepaint(DotGridPainter old) => old.color != color;
}

// ─── Scan Corner Marker ────────────────────────────────────────────────────────

class _ScanCorner extends StatelessWidget {
  const _ScanCorner({required this.top, required this.left});
  final bool top;
  final bool left;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(12, 12),
      painter: _CornerPainter(top: top, left: left),
    );
  }
}

class _CornerPainter extends CustomPainter {
  const _CornerPainter({required this.top, required this.left});
  final bool top;
  final bool left;

  @override
  void paint(Canvas canvas, Size s) {
    final paint = Paint()
      ..color = _kPink
      ..strokeWidth = 2.8
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final path = Path();
    if (top && left) {
      path..moveTo(0, s.height)..lineTo(0, 0)..lineTo(s.width, 0);
    } else if (top && !left) {
      path..moveTo(0, 0)..lineTo(s.width, 0)..lineTo(s.width, s.height);
    } else if (!top && left) {
      path..moveTo(0, 0)..lineTo(0, s.height)..lineTo(s.width, s.height);
    } else {
      path..moveTo(0, s.height)..lineTo(s.width, s.height)..lineTo(s.width, 0);
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_CornerPainter old) => false;
}

// ─── Phone Mockup ──────────────────────────────────────────────────────────────

class PhoneMockup extends StatelessWidget {
  const PhoneMockup({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 128,
      height: 236,
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(60),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      padding: const EdgeInsets.all(5),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(21),
        child: Container(color: Colors.white, child: child),
      ),
    );
  }
}

// ─── Scan Document Content (Slide 1) ──────────────────────────────────────────

class ScanDocumentContent extends StatelessWidget {
  const ScanDocumentContent({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SizedBox(
        width: 82,
        height: 58,
        child: Stack(
          children: [
            _buildDocument(),
            Positioned(top: 0, left: 0, child: const _ScanCorner(top: true, left: true)),
            Positioned(top: 0, right: 0, child: const _ScanCorner(top: true, left: false)),
            Positioned(bottom: 0, left: 0, child: const _ScanCorner(top: false, left: true)),
            Positioned(bottom: 0, right: 0, child: const _ScanCorner(top: false, left: false)),
          ],
        ),
      ),
    );
  }

  Widget _buildDocument() => Container(
    decoration: BoxDecoration(
      color: const Color(0xFFF2EEFF),
      borderRadius: BorderRadius.circular(5),
    ),
    padding: const EdgeInsets.all(7),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 14,
              height: 18,
              decoration: BoxDecoration(
                color: _kIndigo.withAlpha(70),
                borderRadius: BorderRadius.circular(2),
              ),
              child: const Icon(Icons.person, size: 9, color: _kIndigo),
            ),
            const SizedBox(width: 5),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(width: 38, height: 3, color: _kIndigo),
                const SizedBox(height: 3),
                Container(width: 28, height: 2.5, color: _kIndigo.withAlpha(160)),
                const SizedBox(height: 2),
                Container(width: 22, height: 2.5, color: _kIndigo.withAlpha(100)),
              ],
            ),
          ],
        ),
        const Spacer(),
        Container(width: 56, height: 2, color: _kIndigo.withAlpha(90)),
        const SizedBox(height: 4),
        Row(
          children: [
            Container(
              width: 16,
              height: 5,
              decoration: BoxDecoration(
                color: Colors.black45,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 3),
            ...List.generate(
              8,
              (i) => Container(
                margin: const EdgeInsets.only(right: 1),
                width: 2,
                height: 7,
                color: _kIndigo.withAlpha(180),
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

// ─── Offers Content (Slide 2) ─────────────────────────────────────────────────

class OffersPhoneContent extends StatelessWidget {
  const OffersPhoneContent({super.key});

  static const _prices = ['89 лв.', '76 лв.', '102 лв.'];
  static const _colors = [Color(0xFF10B981), Color(0xFF6366F1), Color(0xFF6B7280)];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 62,
            height: 4,
            decoration: BoxDecoration(
              color: _kIndigo,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 8),
          ...List.generate(3, _buildOfferCard),
        ],
      ),
    );
  }

  Widget _buildOfferCard(int i) => Container(
    margin: const EdgeInsets.only(bottom: 6),
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
    decoration: BoxDecoration(
      color: i == 0 ? _kIndigo.withAlpha(18) : Colors.white,
      borderRadius: BorderRadius.circular(7),
      border: Border.all(
        color: i == 0 ? _kIndigo.withAlpha(90) : Colors.grey.withAlpha(40),
      ),
    ),
    child: Row(
      children: [
        Container(
          width: 18,
          height: 18,
          decoration: BoxDecoration(
            color: _colors[i].withAlpha(30),
            shape: BoxShape.circle,
          ),
          child: Icon(Icons.shield_outlined, size: 10, color: _colors[i]),
        ),
        const SizedBox(width: 5),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(width: double.infinity, height: 3, color: Colors.grey.withAlpha(100)),
              const SizedBox(height: 2),
              Container(width: 22, height: 3, color: _colors[i].withAlpha(180)),
            ],
          ),
        ),
        const SizedBox(width: 4),
        Text(
          _prices[i],
          style: TextStyle(
            fontSize: 8,
            fontWeight: FontWeight.w700,
            color: _colors[i],
          ),
        ),
      ],
    ),
  );
}

// ─── Illustration Hero (top half of slide) ───────────────────────────────────

class IllustrationHero extends StatelessWidget {
  const IllustrationHero({super.key, required this.phoneContent});
  final Widget phoneContent;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Blob
          Positioned.fill(
            child: CustomPaint(painter: const BlobPainter(color: _kBlobColor)),
          ),
          // Dots left
          Positioned(
            left: 0,
            top: 0,
            bottom: 0,
            width: 55,
            child: CustomPaint(
              painter: DotGridPainter(color: _kTextMuted.withAlpha(55)),
            ),
          ),
          // Dots right
          Positioned(
            right: 0,
            top: 0,
            bottom: 0,
            width: 55,
            child: CustomPaint(
              painter: DotGridPainter(color: _kTextMuted.withAlpha(55)),
            ),
          ),
          // Phone
          PhoneMockup(child: phoneContent),
        ],
      ),
    );
  }
}
