import 'package:flutter/material.dart';
import '../data/quote_api_repository.dart';

class OfferCard extends StatelessWidget {
  const OfferCard({
    super.key,
    required this.offer,
    required this.isRecommended,
    this.onSelect,
  });

  final QuoteOffer offer;
  final bool isRecommended;
  final VoidCallback? onSelect;

  bool get _isUnavailable =>
      offer.status == 'error' || offer.status == 'timeout';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      label: isRecommended
          ? 'Препоръчана оферта от ${offer.insurerName}'
          : 'Оферта от ${offer.insurerName}',
      child: FocusableActionDetector(
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) => onSelect?.call(),
          ),
        },
        child: GestureDetector(
          onTap: _isUnavailable ? null : onSelect,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              border: Border.all(
                color: isRecommended
                    ? theme.colorScheme.primary
                    : _isUnavailable
                        ? theme.colorScheme.outline.withValues(alpha: 0.3)
                        : theme.colorScheme.outline,
                width: isRecommended ? 2 : 1,
              ),
              borderRadius: BorderRadius.circular(12),
              color: _isUnavailable
                  ? theme.colorScheme.surface.withValues(alpha: 0.5)
                  : theme.colorScheme.surface,
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: _isUnavailable ? _buildUnavailable(context) : _buildContent(context),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              offer.insurerName,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            if (isRecommended)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '⭐ Препоръчано',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onPrimary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          offer.price != null
              ? '${offer.price!.toStringAsFixed(2)} ${offer.currency}'
              : 'Цената не е налична',
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.bold,
            color: theme.colorScheme.primary,
          ),
        ),
      ],
    );
  }

  Widget _buildUnavailable(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(
          Icons.info_outline,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
        ),
        const SizedBox(width: 8),
        Text(
          '${offer.insurerName} — Временно недостъпен',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
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
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      height: 100,
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(12),
      ),
    );
  }
}
