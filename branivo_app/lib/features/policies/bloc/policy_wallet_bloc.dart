import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import '../data/repositories/policy_repository.dart';
import '../data/models/policy_document.dart';
import 'policy_wallet_event.dart';
import 'policy_wallet_state.dart';

class PolicyWalletBloc extends Bloc<PolicyWalletEvent, PolicyWalletState> {
  final PolicyRepository _policyRepository;

  PolicyWalletBloc({required PolicyRepository policyRepository})
      : _policyRepository = policyRepository,
        super(const PolicyWalletInitial()) {
    on<PolicyWalletLoadRequested>(_onLoadRequested);
    on<PolicyDocumentOpenRequested>(_onDocumentOpenRequested);
  }

  Future<void> _onLoadRequested(
    PolicyWalletLoadRequested event,
    Emitter<PolicyWalletState> emit,
  ) async {
    emit(const PolicyWalletLoading());
    try {
      final policies = await _policyRepository.getPolicies();

      // Fetch shipment info for all policies in parallel
      final shipmentEntries = await Future.wait(
        policies.map((p) async {
          final shipment = await _policyRepository.getShipment(p.policyId);
          return MapEntry(p.policyId, shipment);
        }),
      );
      final shipments = Map<String, Map<String, dynamic>?>.fromEntries(
        shipmentEntries,
      );

      emit(PolicyWalletLoaded(policies: policies, shipments: shipments));
    } catch (_) {
      emit(const PolicyWalletError(message: 'Неуспешно зареждане на полиците'));
    }
  }

  Future<void> _onDocumentOpenRequested(
    PolicyDocumentOpenRequested event,
    Emitter<PolicyWalletState> emit,
  ) async {
    final currentState = state;
    List<PolicyDocument> policies = [];
    Map<String, Map<String, dynamic>?> shipments = const {};
    if (currentState is PolicyWalletLoaded) {
      policies = currentState.policies;
      shipments = currentState.shipments;
    }

    emit(PolicyDocumentOpening(
      policies: policies,
      openingPolicyId: '${event.policyId}-${event.documentType}',
      shipments: shipments,
    ));

    try {
      final urls = await _policyRepository.getDocumentUrls(event.policyId);
      final url = event.documentType == 'policy'
          ? urls.policyPdfUrl
          : urls.greenCardUrl;

      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
      emit(PolicyWalletLoaded(policies: policies, shipments: shipments));
    } catch (_) {
      emit(PolicyWalletLoaded(policies: policies, shipments: shipments));
    }
  }
}
