import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
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

  void _retry() {
    context.read<PolicyWalletBloc>().add(const PolicyWalletLoadRequested());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFAFAFA),
      appBar: AppBar(
        title: const Text('Моите полици'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF111827),
        elevation: 0,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: 1,
        onTap: (index) {
          if (index == 0) context.go('/');
          if (index == 2) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Профилът ще бъде достъпен скоро')),
            );
          }
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'Начало',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.folder_outlined),
            activeIcon: Icon(Icons.folder),
            label: 'Полици',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'Профил',
          ),
        ],
      ),
      body: BlocBuilder<PolicyWalletBloc, PolicyWalletState>(
        builder: (context, state) {
          if (state is PolicyWalletLoading || state is PolicyWalletInitial) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is PolicyWalletError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.cloud_off_outlined,
                        size: 56, color: Colors.grey.shade400),
                    const SizedBox(height: 16),
                    Text(
                      'Временен проблем',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: const Color(0xFF374151),
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Не успяхме да заредим полиците. Провери интернет връзката.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: Colors.grey.shade600, fontSize: 14),
                    ),
                    const SizedBox(height: 24),
                    OutlinedButton.icon(
                      onPressed: _retry,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Опитай пак'),
                    ),
                  ],
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
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF2FF),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(
                        Icons.folder_open_outlined,
                        size: 36,
                        color: Color(0xFF4F46E5),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Нямате полици',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF111827),
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Когато закупиш застраховка, тя ще се покаже тук.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: Colors.grey.shade500, fontSize: 14),
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: () => context.go('/'),
                      icon: const Icon(Icons.add),
                      label: const Text('Добави полица'),
                    ),
                  ],
                ),
              ),
            );
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
