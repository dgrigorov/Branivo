import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/policies/bloc/policy_wallet_bloc.dart';
import 'package:branivo_app/features/policies/data/models/policy_document.dart';
import 'package:branivo_app/features/policies/data/repositories/policy_repository.dart';
import 'package:branivo_app/features/policies/presentation/screens/policy_wallet_screen.dart';

class MockPolicyRepository extends Mock implements PolicyRepository {}

PolicyDocument makeMockPolicy({
  String id = 'policy-id-1',
  String policyNumber = 'TEST-001',
}) {
  return PolicyDocument(
    policyId: id,
    policyNumber: policyNumber,
    status: 'active',
    premiumAmount: 500.0,
    currency: 'BGN',
    cachedAt: DateTime.now(),
  );
}

Widget buildTestWidget(PolicyWalletBloc bloc) {
  return MaterialApp(
    home: BlocProvider.value(
      value: bloc,
      child: const PolicyWalletScreen(),
    ),
  );
}

/// Helper: pump widget, trigger initState, advance clock to allow async to complete.
Future<void> pumpAndAwait(WidgetTester tester, Widget widget) async {
  await tester.pumpWidget(widget);
  await tester.pump(); // trigger initState → Loading
  await tester.pump(const Duration(milliseconds: 50)); // advance clock, resolve futures
  await tester.pump(); // render final state
}

void main() {
  late MockPolicyRepository mockRepo;

  setUp(() {
    mockRepo = MockPolicyRepository();
    // Default: getShipment returns null (no shipment)
    when(() => mockRepo.getShipment(any())).thenAnswer((_) async => null);
  });

  group('PolicyWalletScreen', () {
    testWidgets('renders loading indicator while fetching', (tester) async {
      // Use a Completer (no timer) to keep the future pending indefinitely
      final completer = Completer<List<PolicyDocument>>();
      when(() => mockRepo.getPolicies()).thenAnswer((_) => completer.future);
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await tester.pumpWidget(buildTestWidget(bloc));
      await tester.pump(); // trigger initState → Loading state

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Resolve before test ends to avoid pending microtask warnings
      completer.complete([]);
    });

    testWidgets('renders policy list when loaded', (tester) async {
      final policies = [
        makeMockPolicy(id: 'p1', policyNumber: 'POL-001'),
        makeMockPolicy(id: 'p2', policyNumber: 'POL-002'),
      ];
      when(() => mockRepo.getPolicies()).thenAnswer((_) async => policies);
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await pumpAndAwait(tester, buildTestWidget(bloc));

      expect(find.text('POL-001'), findsOneWidget);
      expect(find.text('POL-002'), findsOneWidget);
    });

    testWidgets('renders download buttons for each policy', (tester) async {
      when(() => mockRepo.getPolicies())
          .thenAnswer((_) async => [makeMockPolicy()]);
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await pumpAndAwait(tester, buildTestWidget(bloc));

      expect(find.text('Отвори Полица'), findsOneWidget);
      expect(find.text('Отвори Зелена карта'), findsOneWidget);
    });

    testWidgets('renders empty state when no policies', (tester) async {
      when(() => mockRepo.getPolicies()).thenAnswer((_) async => []);
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await pumpAndAwait(tester, buildTestWidget(bloc));

      expect(find.text('Нямате активни полици.'), findsOneWidget);
    });

    testWidgets('renders error state on fetch failure', (tester) async {
      when(() => mockRepo.getPolicies())
          .thenThrow(Exception('Network error'));
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await pumpAndAwait(tester, buildTestWidget(bloc));

      expect(find.text('Неуспешно зареждане на полиците'), findsOneWidget);
    });

    testWidgets('offline fallback: renders cached policies', (tester) async {
      final cachedPolicy = makeMockPolicy(policyNumber: 'CACHED-001');
      when(() => mockRepo.getPolicies())
          .thenAnswer((_) async => [cachedPolicy]);
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await pumpAndAwait(tester, buildTestWidget(bloc));

      expect(find.text('CACHED-001'), findsOneWidget);
    });

    testWidgets('URL launch button is present for each policy', (tester) async {
      final policies = [
        makeMockPolicy(id: 'p1', policyNumber: 'POL-001'),
        makeMockPolicy(id: 'p2', policyNumber: 'POL-002'),
      ];
      when(() => mockRepo.getPolicies()).thenAnswer((_) async => policies);
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await pumpAndAwait(tester, buildTestWidget(bloc));

      expect(find.text('Отвори Полица'), findsNWidgets(2));
      expect(find.text('Отвори Зелена карта'), findsNWidgets(2));
    });

    testWidgets('renders shipment tracking info when shipment exists',
        (tester) async {
      final policy = makeMockPolicy(id: 'p1', policyNumber: 'POL-SHIP-001');
      when(() => mockRepo.getPolicies()).thenAnswer((_) async => [policy]);
      when(() => mockRepo.getShipment('p1')).thenAnswer(
        (_) async => {
          'shipmentId': 'ship-1',
          'provider': 'speedy',
          'trackingNumber': 'SPEEDY-XYZ',
          'estimatedDeliveryDate': '2026-03-25',
          'status': 'dispatched',
          'createdAt': '2026-03-22T10:00:00.000Z',
        },
      );
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await pumpAndAwait(tester, buildTestWidget(bloc));

      expect(find.text('Доставка на стикер'), findsOneWidget);
      expect(find.textContaining('SPEEDY-XYZ'), findsOneWidget);
      expect(find.textContaining('2026-03-25'), findsOneWidget);
    });

    testWidgets('renders manual handling message when provider is manual',
        (tester) async {
      final policy = makeMockPolicy(id: 'p1', policyNumber: 'POL-MANUAL-001');
      when(() => mockRepo.getPolicies()).thenAnswer((_) async => [policy]);
      when(() => mockRepo.getShipment('p1')).thenAnswer(
        (_) async => {
          'shipmentId': 'ship-2',
          'provider': 'manual',
          'trackingNumber': null,
          'estimatedDeliveryDate': null,
          'status': 'pending',
          'createdAt': '2026-03-22T10:00:00.000Z',
        },
      );
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await pumpAndAwait(tester, buildTestWidget(bloc));

      expect(
        find.text('Доставката ще бъде обработена ръчно от брокера.'),
        findsOneWidget,
      );
    });

    testWidgets('renders offline fallback message when no shipment (null)',
        (tester) async {
      final policy = makeMockPolicy(id: 'p1');
      when(() => mockRepo.getPolicies()).thenAnswer((_) async => [policy]);
      when(() => mockRepo.getShipment('p1')).thenAnswer((_) async => null);
      final bloc = PolicyWalletBloc(policyRepository: mockRepo);
      addTearDown(bloc.close);

      await pumpAndAwait(tester, buildTestWidget(bloc));

      // With null shipment, the shipment section still renders (containsKey returns true,
      // shipment is null → shows unavailable message)
      expect(
        find.text('Информация за доставката не е налична.'),
        findsOneWidget,
      );
    });
  });
}
