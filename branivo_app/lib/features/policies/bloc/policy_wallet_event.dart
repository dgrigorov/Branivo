abstract class PolicyWalletEvent {
  const PolicyWalletEvent();
}

class PolicyWalletLoadRequested extends PolicyWalletEvent {
  const PolicyWalletLoadRequested();
}

class PolicyDocumentOpenRequested extends PolicyWalletEvent {
  final String policyId;
  final String documentType; // 'policy' or 'green-card'

  const PolicyDocumentOpenRequested({
    required this.policyId,
    required this.documentType,
  });
}
