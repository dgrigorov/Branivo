import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:branivo_app/core/routing/app_router.dart';
import 'package:branivo_app/features/auth/bloc/auth_bloc.dart';
import 'package:branivo_app/features/auth/screens/login_screen.dart';
import 'package:branivo_app/features/vehicles/data/repositories/vehicles_repository.dart';
import 'package:branivo_app/features/vehicles/data/repositories/vehicle_api_repository.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_api_repository.dart';
import 'package:branivo_app/features/vehicles/screens/vehicle_list_screen.dart';
import 'package:branivo_app/features/ocr/screens/ocr_wizard_screen.dart';
import 'package:branivo_app/features/fleet/data/repositories/fleet_repository.dart';
import 'package:branivo_app/features/fleet/screens/fleet_dashboard_screen.dart';
import 'package:branivo_app/features/fleet/screens/driver_dashboard_screen.dart';
import 'package:branivo_app/features/anonymous_session/data/repositories/anonymous_session_repository.dart';
import 'package:branivo_app/features/policies/data/repositories/policy_repository.dart';

class MockDio extends Mock implements Dio {}

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

/// Minimal stub for AuthBloc that does not require real Dio/storage dependencies
class _StubAuthBloc extends Fake implements AuthBloc {
  @override
  AuthState get state => AuthInitialState();

  @override
  Stream<AuthState> get stream => const Stream.empty();

  @override
  void add(AuthEvent event) {}

  @override
  Future<void> close() async {}
}

void main() {
  late MockDio mockDio;
  late MockFlutterSecureStorage mockStorage;
  late VehiclesRepository vehiclesRepo;
  late VehicleApiRepository vehicleApiRepo;
  late OcrApiRepository ocrRepo;
  late FleetRepository fleetRepo;
  late AnonymousSessionRepository anonSessionRepo;
  late PolicyRepository policyRepo;

  setUp(() {
    mockDio = MockDio();
    mockStorage = MockFlutterSecureStorage();
    vehiclesRepo = VehiclesRepository(dio: mockDio);
    vehicleApiRepo = VehicleApiRepository(dio: mockDio, storage: mockStorage);
    ocrRepo = OcrApiRepository(dio: mockDio);
    fleetRepo = FleetRepository(dio: mockDio);
    anonSessionRepo = AnonymousSessionRepository(dio: mockDio);
    policyRepo = PolicyRepository(dio: mockDio);

    // Stub mockDio.get for vehicles — returns empty list
    when(() => mockDio.get<List<dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
          cancelToken: any(named: 'cancelToken'),
          onReceiveProgress: any(named: 'onReceiveProgress'),
        )).thenAnswer((_) async => Response<List<dynamic>>(
          data: [],
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/v1/vehicles'),
        ));

    // Stub mockStorage.read — no stored token (unauthenticated for drawer)
    when(() => mockStorage.read(
          key: any(named: 'key'),
          iOptions: any(named: 'iOptions'),
          aOptions: any(named: 'aOptions'),
          lOptions: any(named: 'lOptions'),
          wOptions: any(named: 'wOptions'),
        )).thenAnswer((_) async => null);
  });

  Widget buildApp(GoRouter router) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<VehiclesRepository>.value(value: vehiclesRepo),
        RepositoryProvider<VehicleApiRepository>.value(value: vehicleApiRepo),
        RepositoryProvider<OcrApiRepository>.value(value: ocrRepo),
        RepositoryProvider<FleetRepository>.value(value: fleetRepo),
        RepositoryProvider<AnonymousSessionRepository>.value(
            value: anonSessionRepo),
        RepositoryProvider<PolicyRepository>.value(value: policyRepo),
      ],
      child: BlocProvider<AuthBloc>.value(
        value: _StubAuthBloc(),
        child: MaterialApp.router(routerConfig: router),
      ),
    );
  }

  group('AppRouter', () {
    testWidgets('root route (/) renders VehicleListScreen', (tester) async {
      final router = GoRouter(
        initialLocation: '/',
        routes: AppRouter.router.configuration.routes,
      );

      await tester.pumpWidget(buildApp(router));
      // Use pump instead of pumpAndSettle — screens with Camera never fully settle
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(VehicleListScreen), findsOneWidget);
    });

    testWidgets('/vehicles/scan renders OcrWizardScreen', (tester) async {
      final router = GoRouter(
        initialLocation: '/vehicles/scan',
        initialExtra: OcrWizardRouteArgs(
          sessionToken: 'test-session-token',
          onComplete: (_) {},
          onManualEntry: () {},
        ),
        routes: AppRouter.router.configuration.routes,
      );

      await tester.pumpWidget(buildApp(router));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(OcrWizardScreen), findsOneWidget);
    });

    testWidgets('/login route renders LoginScreen', (tester) async {
      final router = GoRouter(
        initialLocation: '/login',
        routes: AppRouter.router.configuration.routes,
      );

      await tester.pumpWidget(buildApp(router));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets('/fleet with driver role renders DriverDashboardScreen',
        (tester) async {
      final router = GoRouter(
        initialLocation: '/fleet',
        initialExtra: const FleetRouteArgs(userRole: 'driver'),
        routes: AppRouter.router.configuration.routes,
      );

      await tester.pumpWidget(buildApp(router));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(DriverDashboardScreen), findsOneWidget);
      expect(find.byType(FleetDashboardScreen), findsNothing);
    });

    testWidgets('/fleet with fleet_admin role renders FleetDashboardScreen',
        (tester) async {
      final router = GoRouter(
        initialLocation: '/fleet',
        initialExtra: const FleetRouteArgs(userRole: 'fleet_admin'),
        routes: AppRouter.router.configuration.routes,
      );

      await tester.pumpWidget(buildApp(router));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(FleetDashboardScreen), findsOneWidget);
      expect(find.byType(DriverDashboardScreen), findsNothing);
    });

    testWidgets('/fleet with broker_admin role renders FleetDashboardScreen',
        (tester) async {
      final router = GoRouter(
        initialLocation: '/fleet',
        initialExtra: const FleetRouteArgs(userRole: 'broker_admin'),
        routes: AppRouter.router.configuration.routes,
      );

      await tester.pumpWidget(buildApp(router));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(FleetDashboardScreen), findsOneWidget);
    });

    testWidgets('/fleet/driver route renders DriverDashboardScreen',
        (tester) async {
      final router = GoRouter(
        initialLocation: '/fleet/driver',
        routes: AppRouter.router.configuration.routes,
      );

      await tester.pumpWidget(buildApp(router));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(DriverDashboardScreen), findsOneWidget);
    });
  });
}
