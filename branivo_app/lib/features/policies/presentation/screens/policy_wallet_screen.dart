import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../bloc/policy_wallet_bloc.dart';
import '../../bloc/policy_wallet_event.dart';
import '../../bloc/policy_wallet_state.dart';
import '../../data/models/policy_document.dart';

class PolicyWalletScreen extends StatefulWidget {
  const PolicyWalletScreen({super.key});

  @override
  State<PolicyWalletScreen> createState() => _PolicyWalletScreenState();
}

class _PolicyWalletScreenState extends State<PolicyWalletScreen> {
  @override
  void initState() {
    super.initState();
    context.read<PolicyWalletBloc>().add(const PolicyWalletLoadRequested());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Моите полици')),
      body: BlocBuilder<PolicyWalletBloc, PolicyWalletState>(
        builder: (context, state) {
          if (state is PolicyWalletLoading || state is PolicyWalletInitial) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is PolicyWalletError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  state.message,
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            );
          }

          List<PolicyDocument> policies = [];
          String? openingId;
          Map<String, Map<String, dynamic>?> shipments = const {};

          if (state is PolicyWalletLoaded) {
            policies = state.policies;
            shipments = state.shipments;
          } else if (state is PolicyDocumentOpening) {
            policies = state.policies;
            openingId = state.openingPolicyId;
            shipments = state.shipments;
          }

          if (policies.isEmpty) {
            return const Center(child: Text('Нямате активни полици.'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: policies.length,
            itemBuilder: (context, index) {
              final policy = policies[index];
              final shipment = shipments[policy.policyId];
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            policy.policyNumber,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.green.shade100,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              policy.status,
                              style: TextStyle(
                                color: Colors.green.shade700,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${policy.premiumAmount} ${policy.currency}',
                        style: const TextStyle(color: Colors.grey),
                      ),
                      if (policy.coverageStartDate != null &&
                          policy.coverageEndDate != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          '${policy.coverageStartDate!.toIso8601String().substring(0, 10)} — '
                          '${policy.coverageEndDate!.toIso8601String().substring(0, 10)}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                      // Sticker delivery tracking section
                      if (shipments.containsKey(policy.policyId)) ...[
                        const SizedBox(height: 8),
                        _buildShipmentSection(shipment),
                      ],
                      const SizedBox(height: 4),
                      const Text(
                        'Линкът е валиден 15 мин',
                        style: TextStyle(fontSize: 11, color: Colors.grey),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          ElevatedButton(
                            onPressed: openingId == '${policy.policyId}-policy'
                                ? null
                                : () {
                                    context.read<PolicyWalletBloc>().add(
                                          PolicyDocumentOpenRequested(
                                            policyId: policy.policyId,
                                            documentType: 'policy',
                                          ),
                                        );
                                  },
                            child: openingId == '${policy.policyId}-policy'
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Text('Отвори Полица'),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.green,
                            ),
                            onPressed:
                                openingId == '${policy.policyId}-green-card'
                                    ? null
                                    : () {
                                        context.read<PolicyWalletBloc>().add(
                                              PolicyDocumentOpenRequested(
                                                policyId: policy.policyId,
                                                documentType: 'green-card',
                                              ),
                                            );
                                      },
                            child:
                                openingId == '${policy.policyId}-green-card'
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Text(
                                        'Отвори Зелена карта',
                                        style: TextStyle(color: Colors.white),
                                      ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildShipmentSection(Map<String, dynamic>? shipment) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue.shade100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Доставка на стикер',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 12,
              color: Colors.blue.shade800,
            ),
          ),
          const SizedBox(height: 4),
          if (shipment == null)
            const Text(
              'Информация за доставката не е налична.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            )
          else if (shipment['provider'] == 'manual')
            Text(
              'Доставката ще бъде обработена ръчно от брокера.',
              style: TextStyle(fontSize: 12, color: Colors.amber.shade800),
            )
          else ...[
            Text(
              'Статус: ${_shipmentStatusLabel(shipment['status'] as String? ?? '')}',
              style: const TextStyle(fontSize: 12),
            ),
            Text(
              'Куриер: ${_providerLabel(shipment['provider'] as String? ?? '')}',
              style: const TextStyle(fontSize: 12),
            ),
            if (shipment['trackingNumber'] != null)
              Text(
                'Tracking №: ${shipment['trackingNumber'] as String}',
                style: const TextStyle(fontSize: 12),
              ),
            if (shipment['estimatedDeliveryDate'] != null)
              Text(
                'Очаквана доставка: ${shipment['estimatedDeliveryDate'] as String}',
                style: const TextStyle(fontSize: 12),
              ),
          ],
        ],
      ),
    );
  }

  String _shipmentStatusLabel(String status) {
    switch (status) {
      case 'pending':
        return 'Изчакване';
      case 'dispatched':
        return 'Изпратен';
      case 'delivered':
        return 'Доставен';
      case 'failed':
        return 'Неуспешен';
      default:
        return status;
    }
  }

  String _providerLabel(String provider) {
    switch (provider) {
      case 'speedy':
        return 'Speedy';
      case 'econt':
        return 'Econt';
      default:
        return 'Ръчна обработка';
    }
  }
}
