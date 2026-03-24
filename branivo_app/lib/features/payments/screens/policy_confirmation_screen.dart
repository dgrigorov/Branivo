import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class PolicyConfirmationRouteArgs {
  const PolicyConfirmationRouteArgs({
    required this.insurerName,
    required this.amount,
    required this.currency,
    required this.paymentIntentId,
  });

  final String insurerName;
  final double amount;
  final String currency;
  final String paymentIntentId;
}

class PolicyConfirmationScreen extends StatelessWidget {
  const PolicyConfirmationScreen({
    super.key,
    required this.insurerName,
    required this.amount,
    required this.currency,
    required this.paymentIntentId,
  });

  final String insurerName;
  final double amount;
  final String currency;
  final String paymentIntentId;

  int get _loyaltyPoints => (amount / 10).floor();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFAFAFA),
      body: SafeArea(
        child: Column(
          children: [
            _SuccessHeader(insurerName: insurerName),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    _PolicyDetailsCard(
                      insurerName: insurerName,
                      amount: amount,
                      currency: currency,
                      paymentIntentId: paymentIntentId,
                    ),
                    if (_loyaltyPoints > 0)
                      _LoyaltyBanner(points: _loyaltyPoints),
                    _ActionButtons(
                      onDownloadPdf: () => _onDownloadPdf(context),
                      onGoHome: () => context.go('/'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _onDownloadPdf(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('PDF ще бъде готов след потвърждение от застрахователя'),
      ),
    );
  }
}

class _SuccessHeader extends StatelessWidget {
  const _SuccessHeader({required this.insurerName});

  final String insurerName;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 40, 20, 32),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF6366F1), Color(0xFF0D9488)],
        ),
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Icon(Icons.check_rounded, size: 36, color: Colors.white),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Плащането е прието!',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Полицата от $insurerName се обработва',
            style: const TextStyle(
              fontSize: 14,
              color: Colors.white70,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _PolicyDetailsCard extends StatelessWidget {
  const _PolicyDetailsCard({
    required this.insurerName,
    required this.amount,
    required this.currency,
    required this.paymentIntentId,
  });

  final String insurerName;
  final double amount;
  final String currency;
  final String paymentIntentId;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 0),
      transform: Matrix4.translationValues(0, -16, 0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'ДЕТАЙЛИ НА ПОЛИЦАТА',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: Color(0xFF374151),
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 14),
            _DetailRow(label: 'Застраховател', value: insurerName),
            _DetailRow(
              label: 'Сума',
              value: '${amount.toStringAsFixed(2)} $currency',
            ),
            _DetailRow(label: 'Статус', value: 'В обработка'),
            _DetailRow(
              label: 'Референция',
              value: paymentIntentId.length > 20
                  ? '${paymentIntentId.substring(0, 20)}...'
                  : paymentIntentId,
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF111827),
            ),
          ),
        ],
      ),
    );
  }
}

class _LoyaltyBanner extends StatelessWidget {
  const _LoyaltyBanner({required this.points});

  final int points;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 4, 20, 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFED7AA)),
      ),
      child: Row(
        children: [
          const Text('🎉', style: TextStyle(fontSize: 24)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '+$points точки очаквани!',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF92400E),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Ще бъдат начислени след потвърждение',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFFB45309),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionButtons extends StatelessWidget {
  const _ActionButtons({
    required this.onDownloadPdf,
    required this.onGoHome,
  });

  final VoidCallback onDownloadPdf;
  final VoidCallback onGoHome;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FilledButton.icon(
            onPressed: onDownloadPdf,
            icon: const Icon(Icons.download_outlined),
            label: const Text('Изтегли PDF'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: onGoHome,
            child: const Text('Към начало'),
          ),
        ],
      ),
    );
  }
}
