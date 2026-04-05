import 'dart:developer';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../../../core/routing/app_router.dart';
import '../../../core/config/app_config.dart';
import '../../../core/widgets/app_toast.dart';
import '../../anonymous_session/data/repositories/anonymous_session_repository.dart';
import '../../policies/bloc/policy_wallet_bloc.dart';
import '../../policies/bloc/policy_wallet_event.dart';
import '../../policies/bloc/policy_wallet_state.dart';
import '../../policies/data/models/policy_document.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _creatingSession = false;

  @override
  void initState() {
    super.initState();
    context.read<PolicyWalletBloc>().add(const PolicyWalletLoadRequested());
  }

  Future<void> _startOcrFlow() async {
    if (_creatingSession) return;
    setState(() => _creatingSession = true);
    try {
      final repo = context.read<AnonymousSessionRepository>();
      final sessionToken = await repo.createSession();
      if (!mounted) return;
      context.push(
        '/vehicles/scan',
        extra: OcrWizardRouteArgs(
          sessionToken: sessionToken,
          onComplete: (fields) {
            final vin = fields['vin']?.value ?? '';
            final plate = fields['license_plate']?.value ?? '';
            context.go(
              '/vehicles/validate',
              extra: VehicleValidateRouteArgs(
                vin: vin,
                licensePlate: plate,
                sessionToken: sessionToken,
                ocrFields: fields,
              ),
            );
          },
          onManualEntry: () {
            context.go(
              '/vehicles/validate',
              extra: VehicleValidateRouteArgs(
                vin: '',
                licensePlate: '',
                sessionToken: sessionToken,
              ),
            );
          },
        ),
      );
    } catch (e) {
      log('Failed to create session', error: e, name: 'home');
      if (mounted) {
        AppToast.error(context, 'Грешка при стартиране на сканиране. Опитайте пак.');
      }
    } finally {
      if (mounted) setState(() => _creatingSession = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFAFAFA),
      body: SafeArea(
        child: BlocBuilder<PolicyWalletBloc, PolicyWalletState>(
          builder: (context, state) {
            final policies = state is PolicyWalletLoaded
                ? state.policies
                : <PolicyDocument>[];
            return CustomScrollView(
              slivers: [
                SliverToBoxAdapter(child: _HomeTopBar()),
                SliverToBoxAdapter(
                  child: _HeroCta(
                    onScan: _startOcrFlow,
                    isLoading: _creatingSession,
                  ),
                ),
                SliverToBoxAdapter(child: _StatsRow(policies: policies)),
                SliverToBoxAdapter(
                  child: _PolicySection(
                    policies: policies,
                    onScan: _startOcrFlow,
                  ),
                ),
              ],
            );
          },
        ),
      ),
      bottomNavigationBar: const _HomeBottomNav(selectedIndex: 0),
    );
  }
}

class _HomeTopBar extends StatelessWidget {
  const _HomeTopBar();

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            AppConfig.brandName,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: primary,
                  fontWeight: FontWeight.bold,
                ),
          ),
          CircleAvatar(
            radius: 16,
            backgroundColor: primary.withValues(alpha: 0.12),
            child: Icon(
              Icons.person_outline,
              size: 18,
              color: primary,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroCta extends StatelessWidget {
  const _HeroCta({required this.onScan, required this.isLoading});

  final VoidCallback onScan;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Застрахови колата си за минути',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF111827),
                ),
          ),
          const SizedBox(height: 6),
          Text(
            'Сравни офертите на водещите застрахователи',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFF6B7280),
                ),
          ),
          const SizedBox(height: 16),
          Semantics(
            button: true,
            label: 'Сканирай талон',
            child: GestureDetector(
              onTap: isLoading ? null : onScan,
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: primary,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: primary.withValues(alpha: 0.35),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: isLoading
                    ? const Center(
                        child: SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        ),
                      )
                    : _HeroCtaContent(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroCtaContent extends StatelessWidget {
  const _HeroCtaContent();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Icon(Icons.camera_alt_outlined, size: 28, color: Colors.white),
        const SizedBox(height: 6),
        Text(
          'Сканирай талона',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 2),
        Text(
          'Насочи камерата към талона на колата',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Colors.white70,
              ),
        ),
      ],
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.policies});

  final List<PolicyDocument> policies;

  int get _activePoliciesCount =>
      policies.where((p) => p.status == 'active').length;

  int? get _daysUntilRenewal {
    final now = DateTime.now();
    final active = policies
        .where(
          (p) =>
              p.status == 'active' &&
              p.coverageEndDate != null &&
              p.coverageEndDate!.isAfter(now),
        )
        .toList()
      ..sort((a, b) => a.coverageEndDate!.compareTo(b.coverageEndDate!));
    if (active.isEmpty) return null;
    return active.first.coverageEndDate!.difference(now).inDays;
  }

  @override
  Widget build(BuildContext context) {
    final days = _daysUntilRenewal;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: _StatCard(
              value: '$_activePoliciesCount',
              label: 'Активни полици',
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _StatCard(
              value: days != null ? '$days дни' : '—',
              label: 'До подновяване',
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFF1F5F9)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF9CA3AF),
                ),
          ),
        ],
      ),
    );
  }
}

class _PolicySection extends StatelessWidget {
  const _PolicySection({required this.policies, required this.onScan});

  final List<PolicyDocument> policies;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Моите полици',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF374151),
                    ),
              ),
              TextButton(
                onPressed: () => context.go('/policies'),
                child: const Text('Виж всички'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (policies.isEmpty)
            _EmptyPoliciesCard(onScan: onScan)
          else
            ...policies.take(3).map((p) => _PolicyMiniCard(policy: p)),
        ],
      ),
    );
  }
}

class _EmptyPoliciesCard extends StatelessWidget {
  const _EmptyPoliciesCard({required this.onScan});

  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onScan,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFF1F5F9)),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: Theme.of(context)
                    .colorScheme
                    .primary
                    .withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                Icons.add_circle_outline,
                size: 20,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Добави полица',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF111827),
                    ),
                  ),
                  Text(
                    'Сканирай талона, за да започнеш',
                    style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _localizeStatus(String status) => switch (status) {
      'active' => 'Активна',
      'pending' => 'В изчакване',
      'expired' => 'Изтекла',
      'cancelled' => 'Анулирана',
      _ => status,
    };

class _PolicyMiniCard extends StatelessWidget {
  const _PolicyMiniCard({required this.policy});

  final PolicyDocument policy;

  @override
  Widget build(BuildContext context) {
    final isActive = policy.status == 'active';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFF1F5F9)),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(
              child: Text('🚗', style: TextStyle(fontSize: 16)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  policy.policyNumber,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF111827),
                  ),
                ),
                Text(
                  policy.coverageEndDate != null
                      ? 'До ${policy.coverageEndDate!.day.toString().padLeft(2, '0')}.${policy.coverageEndDate!.month.toString().padLeft(2, '0')}.${policy.coverageEndDate!.year}'
                      : '${policy.premiumAmount.toStringAsFixed(0)} ${policy.currency}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF9CA3AF),
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: isActive
                  ? const Color(0xFFECFDF5)
                  : const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              _localizeStatus(policy.status),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: isActive
                    ? const Color(0xFF10B981)
                    : const Color(0xFF6B7280),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeBottomNav extends StatelessWidget {
  const _HomeBottomNav({required this.selectedIndex});

  final int selectedIndex;

  @override
  Widget build(BuildContext context) {
    return BottomNavigationBar(
      currentIndex: selectedIndex,
      onTap: (index) {
        if (index == 1) context.go('/policies');
        if (index == 2) _showProfileSheet(context);
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
    );
  }

  void _showProfileSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ProfileSheet(onLogout: () async {
        Navigator.of(context).pop();
        await _logout(context);
      }),
    );
  }

  Future<void> _logout(BuildContext context) async {
    const storage = FlutterSecureStorage();
    await storage.deleteAll();
    if (context.mounted) context.go('/login');
  }
}

class _ProfileSheet extends StatelessWidget {
  const _ProfileSheet({required this.onLogout});

  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: const CircleAvatar(
                backgroundColor: Color(0xFFEEF2FF),
                child: Icon(Icons.person_outline, color: Color(0xFF4F46E5)),
              ),
              title: const Text(
                'Профил',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: const Text('Управление на акаунта'),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.logout_rounded, color: Colors.red),
              title: const Text(
                'Изход',
                style: TextStyle(color: Colors.red, fontWeight: FontWeight.w600),
              ),
              onTap: onLogout,
            ),
          ],
        ),
      ),
    );
  }
}
