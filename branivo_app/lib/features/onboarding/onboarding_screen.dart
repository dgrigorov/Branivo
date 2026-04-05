import 'dart:async';
import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'onboarding_illustrations.dart';
import 'onboarding_widgets.dart';

const _kIndigo = Color(0xFF6366F1);
const _kTextDark = Color(0xFF111827);
const _kTextMuted = Color(0xFF6B7280);

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({
    super.key,
    required this.onLogin,
    required this.onRegister,
    required this.onAnonScan,
  });

  final VoidCallback onLogin;
  final VoidCallback onRegister;
  final VoidCallback onAnonScan;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  int _step = 0;
  final Set<String> _interests = {'go'};
  Timer? _splashTimer;

  @override
  void initState() {
    super.initState();
    _splashTimer = Timer(const Duration(seconds: 2), () => _advanceTo(1));
  }

  @override
  void dispose() {
    _splashTimer?.cancel();
    super.dispose();
  }

  void _advanceTo(int step) {
    if (!mounted) return;
    if (step == 4) _markSeen();
    setState(() => _step = step);
  }

  void _markSeen() => Hive.box<dynamic>('onboarding').put('seen', true);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: _buildStep(_step),
        ),
      ),
    );
  }

  Widget _buildStep(int step) {
    return switch (step) {
      0 => _buildSplash(),
      1 => _buildSlide1(),
      2 => _buildSlide2(),
      3 => _buildInterests(),
      _ => _buildEntryGate(),
    };
  }

  // ─── Splash ────────────────────────────────────────────────────────────────

  Widget _buildSplash() => GestureDetector(
    key: const ValueKey('splash'),
    onTap: () => _advanceTo(1),
    child: Container(
      color: Colors.white,
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _buildLogo(),
            const SizedBox(height: 18),
            const Text(
              'Branivo',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _kTextDark),
            ),
            const SizedBox(height: 5),
            const Text(
              'Застрахователни услуги',
              style: TextStyle(fontSize: 13, color: _kTextMuted),
            ),
            const SizedBox(height: 52),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OnboardingDot(active: true),
                const SizedBox(width: 5),
                OnboardingDot(active: false),
                const SizedBox(width: 5),
                OnboardingDot(active: false),
              ],
            ),
            const SizedBox(height: 24),
            const Text(
              'Докосни за да продължиш',
              style: TextStyle(fontSize: 11, color: _kTextMuted),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _buildLogo() => Container(
    width: 72,
    height: 72,
    decoration: BoxDecoration(
      color: _kIndigo,
      borderRadius: BorderRadius.circular(20),
      boxShadow: [
        BoxShadow(color: _kIndigo.withAlpha(100), blurRadius: 24, offset: const Offset(0, 8)),
      ],
    ),
    child: const Center(
      child: Text(
        'Б',
        style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800),
      ),
    ),
  );

  // ─── Slide 1 — OCR Scan ────────────────────────────────────────────────────

  Widget _buildSlide1() => AirbnbSlide(
    key: const ValueKey('slide1'),
    phoneContent: const ScanDocumentContent(),
    title: 'Снимай талона за 10 секунди',
    bullets: const [
      'Насочи камерата към лицевата страна на талона',
      'Избягвай отблясъци — дръж под ъгъл при силна светлина',
      'Дръж телефона успоредно и стабилно',
      'Вземи всичко в кадър — ъглите са важни',
    ],
    infoIcon: Icons.lock_outline_rounded,
    infoText:
        'Данните се попълват автоматично и не се съхраняват без твоето съгласие.',
    onSkip: () => _advanceTo(4),
    onNext: () => _advanceTo(2),
    ctaLabel: 'Напред',
    dotIndex: 0,
  );

  // ─── Slide 2 — Offers ──────────────────────────────────────────────────────

  Widget _buildSlide2() => AirbnbSlide(
    key: const ValueKey('slide2'),
    phoneContent: const OffersPhoneContent(),
    title: 'Оферти от всички за секунди',
    bullets: const [
      'Виж офертите от водещите застрахователи наведнъж',
      'Сравни цени, покрития и рейтинги на едно място',
      'Купи онлайн — без посещение в офис',
      'Полицата пристига на имейл веднага след плащане',
    ],
    infoIcon: Icons.info_outline_rounded,
    infoText:
        'Не носим застрахователен риск — ти избираш, ти решаваш.',
    onSkip: () => _advanceTo(4),
    onNext: () => _advanceTo(3),
    ctaLabel: 'Напред',
    dotIndex: 1,
  );

  // ─── Interests ─────────────────────────────────────────────────────────────

  Widget _buildInterests() => _InterestsStep(
    key: const ValueKey('interests'),
    selected: _interests,
    onToggle: (key) => setState(() {
      if (_interests.contains(key)) {
        _interests.remove(key);
      } else {
        _interests.add(key);
      }
    }),
    onNext: () => _advanceTo(4),
  );

  // ─── Entry Gate ────────────────────────────────────────────────────────────

  Widget _buildEntryGate() => _EntryGate(
    key: const ValueKey('entry'),
    onAnonScan: widget.onAnonScan,
    onLogin: widget.onLogin,
    onRegister: widget.onRegister,
  );
}

// ─── Interests Step ────────────────────────────────────────────────────────────

class _InterestsStep extends StatelessWidget {
  const _InterestsStep({
    super.key,
    required this.selected,
    required this.onToggle,
    required this.onNext,
  });

  final Set<String> selected;
  final void Function(String) onToggle;
  final VoidCallback onNext;

  static const _items = [
    ('go', '🚗', 'ГО'),
    ('kasko', '🛡️', 'Каско'),
    ('travel', '✈️', 'Пътуване'),
    ('property', '🏠', 'Имущество'),
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 32),
          const Text(
            'Какво те интересува?',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: _kTextDark),
          ),
          const SizedBox(height: 8),
          const Text(
            'Избери видовете застраховки, за да персонализираме изживяването ти.',
            style: TextStyle(fontSize: 14, color: _kTextMuted, height: 1.5),
          ),
          const SizedBox(height: 24),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.4,
            children: _items
                .map(
                  (item) => _InterestCard(
                    emoji: item.$2,
                    label: item.$3,
                    selected: selected.contains(item.$1),
                    onTap: () => onToggle(item.$1),
                  ),
                )
                .toList(),
          ),
          const Spacer(),
          PrimaryButton(label: 'Продължи', onPressed: onNext),
          const SizedBox(height: 36),
        ],
      ),
    );
  }
}

class _InterestCard extends StatelessWidget {
  const _InterestCard({
    required this.emoji,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String emoji;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: selected ? _kIndigo.withAlpha(25) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? _kIndigo : Colors.transparent,
            width: 2,
          ),
          boxShadow: [
            BoxShadow(color: Colors.black.withAlpha(12), blurRadius: 8, offset: const Offset(0, 2)),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 28)),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: selected ? _kIndigo : _kTextDark,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Entry Gate ────────────────────────────────────────────────────────────────

class _EntryGate extends StatelessWidget {
  const _EntryGate({
    super.key,
    required this.onAnonScan,
    required this.onLogin,
    required this.onRegister,
  });

  final VoidCallback onAnonScan;
  final VoidCallback onLogin;
  final VoidCallback onRegister;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Spacer(),
          _buildHeader(),
          const SizedBox(height: 32),
          PrimaryButton(label: '📷  Сканирай без акаунт', onPressed: onAnonScan),
          const SizedBox(height: 12),
          OutlinedActionButton(label: 'Влез в профила си', onPressed: onLogin),
          const SizedBox(height: 4),
          Center(
            child: TextButton(
              onPressed: onRegister,
              child: const Text(
                'Нямаш акаунт? Регистрирай се',
                style: TextStyle(color: _kIndigo, fontSize: 13),
              ),
            ),
          ),
          const SizedBox(height: 36),
        ],
      ),
    );
  }

  Widget _buildHeader() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(color: _kIndigo, borderRadius: BorderRadius.circular(16)),
        child: const Center(
          child: Text(
            'Б',
            style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800),
          ),
        ),
      ),
      const SizedBox(height: 16),
      const Text(
        'Готов да започнеш?',
        style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: _kTextDark, height: 1.2),
      ),
      const SizedBox(height: 8),
      const Text(
        'Избери как искаш да продължиш.',
        style: TextStyle(fontSize: 14, color: _kTextMuted),
      ),
    ],
  );
}
