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

          if (state is PolicyWalletLoaded) {
            policies = state.policies;
          } else if (state is PolicyDocumentOpening) {
            policies = state.policies;
            openingId = state.openingPolicyId;
          }

          if (policies.isEmpty) {
            return const Center(child: Text('Нямате активни полици.'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: policies.length,
            itemBuilder: (context, index) {
              final policy = policies[index];
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
}
