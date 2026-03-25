import 'package:flutter/material.dart';

const _kIndigo = Color(0xFF6366F1);
const _kDark = Color(0xFF1E293B);
const _kTextDark = Color(0xFF111827);
const _kTextMuted = Color(0xFF6B7280);

/// Single progress dot for onboarding slides.
class OnboardingDot extends StatelessWidget {
  const OnboardingDot({super.key, required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      width: active ? 18 : 6,
      height: 6,
      decoration: BoxDecoration(
        color: active ? _kIndigo : _kTextMuted.withAlpha(80),
        borderRadius: BorderRadius.circular(3),
      ),
    );
  }
}

/// Layout wrapper for slides 1 and 2.
class SlideLayout extends StatelessWidget {
  const SlideLayout({
    super.key,
    required this.child,
    required this.onSkip,
    required this.onNext,
    required this.dotIndex,
  });

  final Widget child;
  final VoidCallback onSkip;
  final VoidCallback onNext;
  final int dotIndex;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildTopBar(),
          const SizedBox(height: 24),
          Expanded(child: child),
          _buildBottom(),
          const SizedBox(height: 36),
        ],
      ),
    );
  }

  Widget _buildTopBar() => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      const SizedBox(width: 60),
      Row(children: [
        OnboardingDot(active: dotIndex == 0),
        const SizedBox(width: 5),
        OnboardingDot(active: dotIndex == 1),
      ]),
      TextButton(
        onPressed: onSkip,
        child: const Text(
          'Пропусни',
          style: TextStyle(color: _kTextMuted, fontSize: 13),
        ),
      ),
    ],
  );

  Widget _buildBottom() => SizedBox(
    height: 52,
    child: ElevatedButton(
      onPressed: onNext,
      style: ElevatedButton.styleFrom(
        backgroundColor: _kIndigo,
        foregroundColor: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      child: const Text(
        'Напред',
        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
  );
}

/// Primary action button (indigo filled).
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: _kIndigo,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

/// Outlined secondary button.
class OutlinedActionButton extends StatelessWidget {
  const OutlinedActionButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: _kDark,
          side: BorderSide(color: _kDark.withAlpha(60), width: 1.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: _kTextDark,
          ),
        ),
      ),
    );
  }
}
