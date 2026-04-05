import 'package:flutter/material.dart';
import '../services/biometric_auth_service.dart';

const _kDarkCard = Color(0xFF1A2D3A);
const _kBlueMid = Color(0xFF3EA8E5);

/// Shows a Revolut-style bottom sheet prompting the user to enable biometric login.
/// Only shown once — after that, [BiometricAuthService.wasPromptShown] returns true.
Future<void> showBiometricSetupSheet(
  BuildContext context,
  BiometricAuthService service,
) async {
  await service.markPromptShown();
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _BiometricSetupSheet(service: service),
  );
}

class _BiometricSetupSheet extends StatefulWidget {
  const _BiometricSetupSheet({required this.service});

  final BiometricAuthService service;

  @override
  State<_BiometricSetupSheet> createState() => _BiometricSetupSheetState();
}

class _BiometricSetupSheetState extends State<_BiometricSetupSheet> {
  bool _loading = false;

  Future<void> _enable() async {
    setState(() => _loading = true);
    try {
      await widget.service.enable();
      if (mounted) Navigator.of(context).pop();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 36),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildHandle(),
          const SizedBox(height: 28),
          _buildIcon(),
          const SizedBox(height: 20),
          _buildTexts(),
          const SizedBox(height: 32),
          _buildEnableButton(),
          const SizedBox(height: 12),
          _buildSkipButton(),
        ],
      ),
    );
  }

  Widget _buildHandle() => Container(
        width: 36,
        height: 4,
        decoration: BoxDecoration(
          color: Colors.grey.shade300,
          borderRadius: BorderRadius.circular(2),
        ),
      );

  Widget _buildIcon() => Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          color: _kBlueMid.withAlpha(20),
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.fingerprint,
          size: 44,
          color: _kBlueMid,
        ),
      );

  Widget _buildTexts() => Column(
        children: [
          const Text(
            'Влизай само с докосване',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: _kDarkCard,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'Активирай Face ID или пръстов отпечатък\nза по-бързо и сигурно влизане.',
            style: TextStyle(
              fontSize: 14,
              color: _kDarkCard.withAlpha(140),
              height: 1.5,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      );

  Widget _buildEnableButton() => SizedBox(
        width: double.infinity,
        height: 54,
        child: ElevatedButton(
          onPressed: _loading ? null : _enable,
          style: ElevatedButton.styleFrom(
            backgroundColor: _kBlueMid,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: _loading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : const Text(
                  'Активирай',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
        ),
      );

  Widget _buildSkipButton() => SizedBox(
        width: double.infinity,
        height: 48,
        child: TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(
            'Не сега',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: _kDarkCard.withAlpha(160),
            ),
          ),
        ),
      );
}
