import 'package:flutter/material.dart';
import '../../../core/widgets/app_toast.dart';
import '../data/models/bulk_quote_models.dart';
import '../data/repositories/fleet_repository.dart';
import 'fleet_bulk_purchase_result_dialog.dart';

class FleetBulkQuoteScreen extends StatefulWidget {
  final List<String> vehicleIds;
  final FleetRepository repository;

  const FleetBulkQuoteScreen({
    super.key,
    required this.vehicleIds,
    required this.repository,
  });

  @override
  State<FleetBulkQuoteScreen> createState() => _FleetBulkQuoteScreenState();
}

class _FleetBulkQuoteScreenState extends State<FleetBulkQuoteScreen> {
  late Future<BulkQuoteResponse> _quotesFuture;
  final Map<String, String> _selectedOffers = {};

  @override
  void initState() {
    super.initState();
    _quotesFuture = widget.repository.bulkGetQuotes(widget.vehicleIds);
  }

  void _selectOffer(String vehicleId, String quoteId) {
    setState(() {
      _selectedOffers[vehicleId] = quoteId;
    });
  }

  Future<void> _handlePurchase() async {
    final items = _selectedOffers.entries
        .map((e) => BulkPurchaseItem(vehicleId: e.key, quoteId: e.value))
        .toList();

    try {
      final result = await widget.repository.bulkPurchase(items);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => FleetBulkPurchaseResultDialog(result: result),
      );
    } catch (e) {
      if (!mounted) return;
      AppToast.error(context, 'Грешка: ${e.toString()}');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Оферти за флота')),
      body: FutureBuilder<BulkQuoteResponse>(
        future: _quotesFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Зареждане на оферти...'),
                ],
              ),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Грешка: ${snapshot.error}',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            );
          }

          final response = snapshot.data!;
          final hasSelectableOffers = response.results.any(
            (r) => r.status != BulkVehicleQuoteStatus.failed,
          );

          return Column(
            children: [
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: response.results.length,
                  itemBuilder: (context, index) {
                    return _buildVehicleSection(response.results[index]);
                  },
                ),
              ),
              if (hasSelectableOffers)
                _buildPurchaseBar(),
            ],
          );
        },
      ),
    );
  }

  Widget _buildVehicleSection(VehicleQuoteResult result) {
    final statusColor = result.status == BulkVehicleQuoteStatus.success
        ? Colors.green
        : result.status == BulkVehicleQuoteStatus.partial
            ? Colors.orange
            : Colors.red;

    final statusIcon = result.status == BulkVehicleQuoteStatus.success
        ? Icons.check_circle
        : result.status == BulkVehicleQuoteStatus.partial
            ? Icons.warning
            : Icons.cancel;

    final successOffers = result.offers
        .where((o) => o.status == QuoteOffer.statusSuccess && o.price != null)
        .toList();

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(statusIcon, color: statusColor, size: 20),
                const SizedBox(width: 8),
                Text(
                  result.licensePlate,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${result.make} ${result.model}',
                  style: const TextStyle(color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (successOffers.isEmpty)
              const Text(
                'Няма налични оферти',
                style: TextStyle(color: Colors.grey, fontSize: 13),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: successOffers.map((offer) {
                  final isSelected =
                      _selectedOffers[result.vehicleId] == offer.id;
                  return GestureDetector(
                    onTap: () => _selectOffer(result.vehicleId, offer.id),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? Colors.blue.shade50
                            : Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isSelected
                              ? Colors.blue
                              : Colors.grey.shade300,
                          width: isSelected ? 2 : 1,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                offer.insurerName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                              if (offer.isRecommended) ...[
                                const SizedBox(width: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 1,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.blue.shade100,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    'Препоръчана',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: Colors.blue.shade800,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${offer.price?.toStringAsFixed(2)} ${offer.currency}',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildPurchaseBar() {
    final count = _selectedOffers.length;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: Text(
                count > 0
                    ? '$count МПС с избрана оферта'
                    : 'Изберете оферта за всяко МПС',
                style: TextStyle(
                  color: count > 0 ? Colors.black87 : Colors.grey,
                ),
              ),
            ),
            ElevatedButton(
              onPressed: count > 0 ? _handlePurchase : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue.shade600,
                foregroundColor: Colors.white,
              ),
              child: Text('Закупи${count > 0 ? ' ($count)' : ''}'),
            ),
          ],
        ),
      ),
    );
  }
}
