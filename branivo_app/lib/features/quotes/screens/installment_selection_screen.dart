import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import '../data/quote_api_repository.dart';
import '../../payments/screens/payment_screen.dart';
import '../../../core/routing/app_router.dart';

class InstallmentSelectionRouteArgs {
  const InstallmentSelectionRouteArgs({
    required this.offer,
    required this.initialInstallmentCount,
  });

  final QuoteOffer offer;
  final int initialInstallmentCount;
}

const _storage = FlutterSecureStorage();

final _ordinals = ['1-ва вноска', '2-ра вноска', '3-та вноска', '4-та вноска'];

class InstallmentSelectionScreen extends StatefulWidget {
  const InstallmentSelectionScreen({
    super.key,
    required this.offer,
    required this.initialInstallmentCount,
  });

  final QuoteOffer offer;
  final int initialInstallmentCount;

  @override
  State<InstallmentSelectionScreen> createState() =>
      _InstallmentSelectionScreenState();
}

class _InstallmentSelectionScreenState
    extends State<InstallmentSelectionScreen> {
  late int _selectedCount;

  @override
  void initState() {
    super.initState();
    _selectedCount = widget.initialInstallmentCount;
  }

  QuotePaymentOption? get _selectedOption =>
      widget.offer.optionFor(_selectedCount);

  Future<void> _onContinue() async {
    final option = _selectedOption;
    final firstAmount = option?.firstInstallment?.amountBgn ??
        option?.totalBgn ??
        widget.offer.price ??
        0.0;

    final token = await _storage.read(key: 'access_token');
    if (!mounted) return;

    final args = PaymentRouteArgs(
      quoteId: widget.offer.id,
      insurerName: widget.offer.insurerName,
      amount: firstAmount,
      currency: widget.offer.currency,
      installmentCount: _selectedCount,
    );

    if (token != null && token.isNotEmpty) {
      context.push('/payment', extra: args);
    } else {
      context.push(
        '/auth-gate',
        extra: AuthGateRouteArgs(
          redirectPath: '/payment',
          redirectExtra: args,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.primary,
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Colors.white,
        title: const Text(
          'ГРАЖДАНСКА ОТГОВОРНОСТ',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 16,
            letterSpacing: 0.5,
          ),
        ),
        centerTitle: true,
        elevation: 0,
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              margin: const EdgeInsets.only(top: 8),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(20)),
                child: _buildBody(context),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'ЦЕНА И НАЧИН НА ПЛАЩАНЕ',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  widget.offer.insurerName,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                  ),
                ),
                const SizedBox(height: 28),
                for (final option in widget.offer.paymentOptions)
                  _buildOptionTile(context, option),
              ],
            ),
          ),
        ),
        _buildContinueButton(context),
      ],
    );
  }

  Widget _buildOptionTile(BuildContext context, QuotePaymentOption option) {
    final theme = Theme.of(context);
    final isSelected = _selectedCount == option.installmentCount;
    final label = option.installmentCount == 1
        ? '1 ВНОСКА'
        : '${option.installmentCount} ВНОСКИ';

    return GestureDetector(
      onTap: () => setState(() => _selectedCount = option.installmentCount),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          border: Border.all(
            color: isSelected
                ? theme.colorScheme.primary
                : theme.colorScheme.outline.withValues(alpha: 0.3),
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  _buildRadio(context, isSelected),
                  const SizedBox(width: 12),
                  Text(
                    label,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${option.totalBgn.toStringAsFixed(2)} лв.',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ],
              ),
            ),
            if (isSelected && option.installmentCount > 1) ...[
              const Divider(height: 1),
              _buildInstallmentBreakdown(context, option),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildRadio(BuildContext context, bool isSelected) {
    final theme = Theme.of(context);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: isSelected
              ? theme.colorScheme.primary
              : theme.colorScheme.outline,
          width: 2,
        ),
        color: isSelected ? theme.colorScheme.primary : Colors.transparent,
      ),
      child: isSelected
          ? const Icon(Icons.check, size: 14, color: Colors.white)
          : null,
    );
  }

  Widget _buildInstallmentBreakdown(
      BuildContext context, QuotePaymentOption option) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        children: [
          for (int i = 0; i < option.installments.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${_ordinals[i]}:',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.7),
                    ),
                  ),
                  Text(
                    '${option.installments[i].amountBgn.toStringAsFixed(2)} лв.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildContinueButton(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: FilledButton(
          onPressed: _onContinue,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(26),
            ),
            textStyle: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 15,
              letterSpacing: 0.8,
            ),
          ),
          child: const Text('ПРОДЪЛЖИ'),
        ),
      ),
    );
  }
}
