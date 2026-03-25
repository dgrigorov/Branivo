import 'dart:async';
import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'onboarding_widgets.dart';

const _kIndigo = Color(0xFF6366F1);
const _kDark = Color(0xFF1E293B);
const _kBg = Color(0xFFF8FAFC);
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

  void _markSeen() {
    final box = Hive.box<dynamic>('onboarding');
    box.put('seen', true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBg,
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
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: _kTextDark,
              ),
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
        BoxShadow(
          color: _kIndigo.withAlpha(100),
          blurRadius: 24,
          offset: const Offset(0, 8),
        ),
      ],
    ),
    child: const Center(
      child: Text(
        'Б',
        style: TextStyle(
          color: Colors.white,
          fontSize: 32,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
  );

  Widget _buildSlide1() => SlideLayout(
    key: const ValueKey('slide1'),
    onSkip: () => _advanceTo(4),
    onNext: () => _advanceTo(2),
    dotIndex: 0,
    child: _Slide1Content(),
  );

  Widget _buildSlide2() => SlideLayout(
    key: const ValueKey('slide2'),
    onSkip: () => _advanceTo(4),
    onNext: () => _advanceTo(3),
    dotIndex: 1,
    child: _Slide2Content(),
  );

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

  Widget _buildEntryGate() => _EntryGate(
    key: const ValueKey('entry'),
    onAnonScan: widget.onAnonScan,
    onLogin: widget.onLogin,
    onRegister: widget.onRegister,
  );
}

// ─── Slide 1 content ──────────────────────────────────────────────────────────

class _Slide1Content extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildCard(),
        const SizedBox(height: 20),
        const Text(
          'Оферта за 30 секунди',
          style: TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w800,
            color: _kTextDark,
            height: 1.25,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Снимай талона на колата си и получи оферти '
          'от водещите застрахователи веднага.',
          style: TextStyle(fontSize: 14, color: _kTextMuted, height: 1.55),
        ),
      ],
    );
  }

  Widget _buildCard() => Container(
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: _kDark,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      children: [
        const Text('🚗', style: TextStyle(fontSize: 44)),
        const SizedBox(height: 10),
        const Text(
          'Намерихме Toyota Corolla 2019',
          style: TextStyle(color: Colors.white60, fontSize: 13),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: _kIndigo.withAlpha(60),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Text(
            '⚡ 30 секунди',
            style: TextStyle(
              color: Color(0xFFA5B4FC),
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );
}

// ─── Slide 2 content ──────────────────────────────────────────────────────────

class _Slide2Content extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildCard(),
        const SizedBox(height: 20),
        const Text(
          'Плати за секунди',
          style: TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w800,
            color: _kTextDark,
            height: 1.25,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Apple Pay, Google Pay или карта — '
          'плати веднага и получи полицата на имейл.',
          style: TextStyle(fontSize: 14, color: _kTextMuted, height: 1.55),
        ),
      ],
    );
  }

  Widget _buildCard() => Container(
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: _kDark,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      children: [
        const Text('💳', style: TextStyle(fontSize: 44)),
        const SizedBox(height: 10),
        const Text(
          'Плащане с Apple Pay',
          style: TextStyle(color: Colors.white60, fontSize: 13),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: const Color(0xFF10B981).withAlpha(60),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Text(
            '✓ Потвърдено',
            style: TextStyle(
              color: Color(0xFF6EE7B7),
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );
}

// ─── Interests step ───────────────────────────────────────────────────────────

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
      key: const ValueKey('interests'),
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 32),
          const Text(
            'Какво те интересува?',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: _kTextDark,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Избери видовете застраховки, за да персонализираме изживяването ти.',
            style: TextStyle(fontSize: 14, color: _kTextMuted, height: 1.5),
          ),
          const SizedBox(height: 24),
          _buildGrid(),
          const Spacer(),
          PrimaryButton(label: 'Продължи', onPressed: onNext),
          const SizedBox(height: 36),
        ],
      ),
    );
  }

  Widget _buildGrid() => GridView.count(
    crossAxisCount: 2,
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    mainAxisSpacing: 12,
    crossAxisSpacing: 12,
    childAspectRatio: 1.4,
    children: _items
        .map((item) => _InterestCard(
              emoji: item.$2,
              label: item.$3,
              selected: selected.contains(item.$1),
              onTap: () => onToggle(item.$1),
            ))
        .toList(),
  );
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
            BoxShadow(
              color: Colors.black.withAlpha(12),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
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

// ─── Entry gate ───────────────────────────────────────────────────────────────

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
          PrimaryButton(
            label: '📷  Сканирай без акаунт',
            onPressed: onAnonScan,
          ),
          const SizedBox(height: 12),
          OutlinedActionButton(
            label: 'Влез в профила си',
            onPressed: onLogin,
          ),
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
        decoration: BoxDecoration(
          color: _kIndigo,
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Center(
          child: Text(
            'Б',
            style: TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
      const SizedBox(height: 16),
      const Text(
        'Готов да започнеш?',
        style: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w800,
          color: _kTextDark,
          height: 1.2,
        ),
      ),
      const SizedBox(height: 8),
      const Text(
        'Избери как искаш да продължиш.',
        style: TextStyle(fontSize: 14, color: _kTextMuted),
      ),
    ],
  );
}
