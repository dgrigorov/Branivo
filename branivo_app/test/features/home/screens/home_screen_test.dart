import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';

import 'package:branivo_app/features/home/screens/home_screen.dart';
import 'package:branivo_app/features/policies/bloc/policy_wallet_bloc.dart';
import 'package:branivo_app/features/policies/bloc/policy_wallet_event.dart';
import 'package:branivo_app/features/policies/bloc/policy_wallet_state.dart';
import 'package:branivo_app/features/policies/data/models/policy_document.dart';
import 'package:branivo_app/features/anonymous_session/data/repositories/anonymous_session_repository.dart';

class MockDio extends Mock implements Dio {}

class _FakePolicyWalletBloc extends Fake implements PolicyWalletBloc {
  final PolicyWalletState _state;

  _FakePolicyWalletBloc([PolicyWalletState? state])
      : _state = state ?? const PolicyWalletInitial();

  @override
  PolicyWalletState get state => _state;

  @override
  Stream<PolicyWalletState> get stream => const Stream.empty();

  @override
  void add(PolicyWalletEvent event) {}

  @override
  Future<void> close() async {}
}

Widget _buildWidget(_FakePolicyWalletBloc bloc, AnonymousSessionRepository repo) {
  return MultiRepositoryProvider(
    providers: [
      RepositoryProvider<AnonymousSessionRepository>.value(value: repo),
    ],
    child: BlocProvider<PolicyWalletBloc>.value(
      value: bloc,
      child: const MaterialApp(home: HomeScreen()),
    ),
  );
}

void main() {
  late MockDio mockDio;
  late AnonymousSessionRepository anonRepo;

  setUp(() {
    mockDio = MockDio();
    anonRepo = AnonymousSessionRepository(dio: mockDio);
  });

  group('HomeScreen', () {
    testWidgets('renders app brand name in topbar', (tester) async {
      await tester.pumpWidget(_buildWidget(_FakePolicyWalletBloc(), anonRepo));
      await tester.pump();

      // Brand name is configurable via AppConfig.brandName (defaults to 'Branivo')
      expect(find.text('Branivo'), findsOneWidget);
    });

    testWidgets('renders hero headline', (tester) async {
      await tester.pumpWidget(_buildWidget(_FakePolicyWalletBloc(), anonRepo));
      await tester.pump();

      expect(find.text('Застрахови колата си за минути'), findsOneWidget);
    });

    testWidgets('renders Сканирай талона CTA button', (tester) async {
      await tester.pumpWidget(_buildWidget(_FakePolicyWalletBloc(), anonRepo));
      await tester.pump();

      expect(find.text('Сканирай талона'), findsOneWidget);
    });

    testWidgets('renders bottom navigation with 3 items', (tester) async {
      await tester.pumpWidget(_buildWidget(_FakePolicyWalletBloc(), anonRepo));
      await tester.pump();

      expect(find.byType(BottomNavigationBar), findsOneWidget);
      expect(find.text('Начало'), findsOneWidget);
      expect(find.text('Полици'), findsOneWidget);
      expect(find.text('Профил'), findsOneWidget);
    });

    testWidgets('shows zero active policies when no policies loaded', (tester) async {
      await tester.pumpWidget(_buildWidget(_FakePolicyWalletBloc(), anonRepo));
      await tester.pump();

      expect(find.text('0'), findsOneWidget);
      expect(find.text('Активни полици'), findsOneWidget);
    });

    testWidgets('shows active policy count from loaded state', (tester) async {
      final policy = PolicyDocument(
        policyId: 'p-001',
        policyNumber: 'GO-2025-00001',
        status: 'active',
        premiumAmount: 450,
        currency: 'BGN',
        cachedAt: DateTime.now(),
      );
      final loadedBloc = _FakePolicyWalletBloc(
        PolicyWalletLoaded(policies: [policy], shipments: const {}),
      );

      await tester.pumpWidget(_buildWidget(loadedBloc, anonRepo));
      await tester.pump();

      expect(find.text('1'), findsOneWidget);
    });

    testWidgets('shows empty policies card when no policies', (tester) async {
      await tester.pumpWidget(_buildWidget(_FakePolicyWalletBloc(), anonRepo));
      await tester.pump();

      expect(find.text('Добави полица'), findsOneWidget);
    });

    testWidgets('shows policy mini card when policies are loaded', (tester) async {
      final policy = PolicyDocument(
        policyId: 'p-001',
        policyNumber: 'GO-2025-00001',
        status: 'active',
        premiumAmount: 450,
        currency: 'BGN',
        cachedAt: DateTime.now(),
      );
      final loadedBloc = _FakePolicyWalletBloc(
        PolicyWalletLoaded(policies: [policy], shipments: const {}),
      );

      await tester.pumpWidget(_buildWidget(loadedBloc, anonRepo));
      await tester.pump();

      expect(find.text('GO-2025-00001'), findsOneWidget);
      expect(find.text('Активна'), findsOneWidget);
    });

    testWidgets('shows — for days until renewal when all policies are expired',
        (tester) async {
      final expiredPolicy = PolicyDocument(
        policyId: 'p-002',
        policyNumber: 'GO-2025-00002',
        status: 'active',
        premiumAmount: 300,
        currency: 'BGN',
        cachedAt: DateTime.now(),
        // coverageEndDate in the past
        coverageEndDate: DateTime.now().subtract(const Duration(days: 5)),
      );
      final loadedBloc = _FakePolicyWalletBloc(
        PolicyWalletLoaded(policies: [expiredPolicy], shipments: const {}),
      );

      await tester.pumpWidget(_buildWidget(loadedBloc, anonRepo));
      await tester.pump();

      expect(find.text('—'), findsOneWidget);
    });

    testWidgets('shows localized Bulgarian status for non-active policy',
        (tester) async {
      final expiredPolicy = PolicyDocument(
        policyId: 'p-003',
        policyNumber: 'GO-2025-00003',
        status: 'expired',
        premiumAmount: 300,
        currency: 'BGN',
        cachedAt: DateTime.now(),
      );
      final loadedBloc = _FakePolicyWalletBloc(
        PolicyWalletLoaded(policies: [expiredPolicy], shipments: const {}),
      );

      await tester.pumpWidget(_buildWidget(loadedBloc, anonRepo));
      await tester.pump();

      expect(find.text('Изтекла'), findsOneWidget);
      expect(find.text('expired'), findsNothing);
    });
  });
}
