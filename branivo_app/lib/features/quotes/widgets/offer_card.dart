import 'package:flutter/material.dart';
import '../data/quote_api_repository.dart';

const _kInstallmentOrdinals = ['1-ва', '2-ра', '3-та', '4-та'];

class OfferCard extends StatelessWidget {
  const OfferCard({
    super.key,
    required this.offer,
    required this.isRecommended,
    this.selectedInstallmentCount = 1,
    this.onSelect,
  });

  final QuoteOffer offer;
  final bool isRecommended;
  final int selectedInstallmentCount;
  final VoidCallback? onSelect;

  bool get _isUnavailable =>
      offer.status == 'error' || offer.status == 'timeout';

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: !_isUnavailable,
      label: isRecommended
          ? 'Препоръчана оферта от ${offer.insurerName}'
          : 'Оферта от ${offer.insurerName}',
      child: InkWell(
        onTap: _isUnavailable ? null : onSelect,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: _isUnavailable
              ? _buildUnavailable(context)
              : _buildContent(context),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    final theme = Theme.of(context);
    final option = offer.optionFor(selectedInstallmentCount);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      offer.insurerName,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (isRecommended) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'Препоръчано',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onPrimary,
                          fontWeight: FontWeight.bold,
                          fontSize: 10,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              if (option != null && selectedInstallmentCount > 1)
                _buildInstallmentRows(context, option)
              else
                _buildTotalPrice(context, option),
            ],
          ),
        ),
        const SizedBox(width: 12),
        FilledButton(
          onPressed: onSelect,
          style: FilledButton.styleFrom(
            padding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            textStyle: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
          ),
          child: const Text('ИЗБЕРИ'),
        ),
      ],
    );
  }

  Widget _buildInstallmentRows(
      BuildContext context, QuotePaymentOption option) {
    final theme = Theme.of(context);
    final items = option.installments;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (int i = 0; i < items.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Text(
              '${_kInstallmentOrdinals[i]}: ${items[i].amountBgn.toStringAsFixed(2)} лв.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.75),
              ),
            ),
          ),
        const SizedBox(height: 4),
        Text(
          '${option.totalBgn.toStringAsFixed(2)} лв. общо',
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.bold,
            color: theme.colorScheme.primary,
          ),
        ),
      ],
    );
  }

  Widget _buildTotalPrice(BuildContext context, QuotePaymentOption? option) {
    final theme = Theme.of(context);
    final total = option?.totalBgn ?? offer.price;
    return Text(
      total != null
          ? '${total.toStringAsFixed(2)} лв.'
          : 'Цената не е налична',
      style: theme.textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.bold,
        color: theme.colorScheme.primary,
      ),
    );
  }

  Widget _buildUnavailable(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(
          Icons.info_outline,
          size: 18,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.35),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            '${offer.insurerName} — Временно недостъпен',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
            ),
          ),
        ),
      ],
    );
  }
}

class OfferCardSkeleton extends StatelessWidget {
  const OfferCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                    height: 14, width: 140, color: Colors.grey[200]),
                const SizedBox(height: 8),
                Container(
                    height: 18, width: 100, color: Colors.grey[200]),
              ],
            ),
          ),
          Container(
            height: 36,
            width: 80,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              borderRadius: BorderRadius.circular(20),
            ),
          ),
        ],
      ),
    );
  }
}
