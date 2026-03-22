import 'package:flutter/material.dart';
import '../data/models/bulk_quote_models.dart';

class FleetBulkPurchaseResultDialog extends StatelessWidget {
  final BulkPurchaseResponse result;

  const FleetBulkPurchaseResultDialog({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    final allSucceeded = result.summary.failed == 0;
    final allFailed = result.summary.succeeded == 0;

    final titleText = allSucceeded
        ? 'Всички полици са закупени'
        : allFailed
            ? 'Закупуването е неуспешно'
            : 'Частично успешно закупуване';

    final titleColor = allSucceeded
        ? Colors.green.shade700
        : allFailed
            ? Colors.red.shade700
            : Colors.orange.shade700;

    final titleIcon = allSucceeded
        ? Icons.check_circle
        : allFailed
            ? Icons.cancel
            : Icons.warning;

    return AlertDialog(
      title: Row(
        children: [
          Icon(titleIcon, color: titleColor, size: 24),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              titleText,
              style: TextStyle(
                color: titleColor,
                fontSize: 17,
              ),
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Успешни: ${result.summary.succeeded} / ${result.summary.total}',
              style: const TextStyle(fontSize: 14, color: Colors.black87),
            ),
            if (result.summary.failed > 0)
              Text(
                'Неуспешни: ${result.summary.failed}',
                style: TextStyle(fontSize: 14, color: Colors.red.shade700),
              ),
            if (result.succeeded.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text(
                'Закупени полици',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
              const SizedBox(height: 8),
              ...result.succeeded.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.check,
                        color: Colors.green,
                        size: 16,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          '${item.vehicleId} — ${item.paymentId}',
                          style: const TextStyle(fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            if (result.failed.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text(
                'Неуспешни',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
              const SizedBox(height: 8),
              ...result.failed.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.close, color: Colors.red, size: 16),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          '${item.vehicleId}: ${item.error}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.red,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Затвори'),
        ),
      ],
    );
  }
}
