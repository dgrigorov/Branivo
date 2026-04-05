import 'package:flutter/material.dart';
import 'onboarding_illustrations.dart';

const _kIndigo = Color(0xFF6366F1);
const _kDark = Color(0xFF1E293B);
const _kTextDark = Color(0xFF111827);
const _kTextMuted = Color(0xFF6B7280);

/// Single progress dot — pill-shaped when active.
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

/// Primary action button (indigo filled).
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed});
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      width: double.infinity,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: _kIndigo,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
        child: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      ),
    );
  }
}

/// Outlined secondary button.
class OutlinedActionButton extends StatelessWidget {
  const OutlinedActionButton({super.key, required this.label, required this.onPressed});
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: _kDark,
          side: BorderSide(color: _kDark.withAlpha(60), width: 1.5),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _kTextDark),
        ),
      ),
    );
  }
}

/// Bullet point row for onboarding slide content.
class BulletItem extends StatelessWidget {
  const BulletItem({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 7, right: 10),
            width: 5,
            height: 5,
            decoration: const BoxDecoration(color: _kTextDark, shape: BoxShape.circle),
          ),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 15, color: _kTextDark, height: 1.5)),
          ),
        ],
      ),
    );
  }
}

/// Info/security card below bullet list.
class InfoCard extends StatelessWidget {
  const InfoCard({super.key, required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: _kIndigo.withAlpha(16),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: _kIndigo),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 12, color: _kTextDark.withAlpha(180), height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}

/// Airbnb-style slide layout:
/// - Top ~45%: illustration hero with blob + phone
/// - Bottom ~55%: title, bullets, info card, CTA
class AirbnbSlide extends StatelessWidget {
  const AirbnbSlide({
    super.key,
    required this.phoneContent,
    required this.title,
    required this.bullets,
    required this.infoIcon,
    required this.infoText,
    required this.onSkip,
    required this.onNext,
    required this.ctaLabel,
    required this.dotIndex,
  });

  final Widget phoneContent;
  final String title;
  final List<String> bullets;
  final IconData infoIcon;
  final String infoText;
  final VoidCallback onSkip;
  final VoidCallback onNext;
  final String ctaLabel;
  final int dotIndex;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildTopBar(),
        Expanded(
          flex: 44,
          child: IllustrationHero(phoneContent: phoneContent),
        ),
        Expanded(
          flex: 56,
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 22),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: _kTextDark,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 16),
                ...bullets.map((b) => BulletItem(text: b)),
                const SizedBox(height: 10),
                InfoCard(icon: infoIcon, text: infoText),
                const SizedBox(height: 20),
                PrimaryButton(label: ctaLabel, onPressed: onNext),
                const SizedBox(height: 28),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTopBar() => Padding(
    padding: const EdgeInsets.fromLTRB(20, 12, 16, 0),
    child: Row(
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
          child: const Text('Пропусни', style: TextStyle(color: _kTextMuted, fontSize: 13)),
        ),
      ],
    ),
  );
}
