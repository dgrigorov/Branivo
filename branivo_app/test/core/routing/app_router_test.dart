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

  setUp(() {
    mockDio = MockDio();
    mockStorage = MockFlutterSecureStorage();
    vehiclesRepo = VehiclesRepository(dio: mockDio, storage: mockStorage);
    vehicleApiRepo = VehicleApiRepository(dio: mockDio, storage: mockStorage);
    ocrRepo = OcrApiRepository(dio: mockDio);
  });

  Widget buildApp(GoRouter router) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<VehiclesRepository>.value(value: vehiclesRepo),
        RepositoryProvider<VehicleApiRepository>.value(value: vehicleApiRepo),
        RepositoryProvider<OcrApiRepository>.value(value: ocrRepo),
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
  });
}
