import '../data/models/policy_document.dart';

abstract class PolicyWalletState {
  const PolicyWalletState();
}

class PolicyWalletInitial extends PolicyWalletState {
  const PolicyWalletInitial();
}

class PolicyWalletLoading extends PolicyWalletState {
  const PolicyWalletLoading();
}

class PolicyWalletLoaded extends PolicyWalletState {
  final List<PolicyDocument> policies;
  final bool isOffline;

  const PolicyWalletLoaded({
    required this.policies,
    this.isOffline = false,
  });
}

class PolicyWalletError extends PolicyWalletState {
  final String message;

  const PolicyWalletError({required this.message});
}

class PolicyDocumentOpening extends PolicyWalletState {
  final List<PolicyDocument> policies;
  final String openingPolicyId;

  const PolicyDocumentOpening({
    required this.policies,
    required this.openingPolicyId,
  });
}
