import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:branivo_app/core/routing/app_router.dart';
import 'package:branivo_app/features/auth/bloc/auth_bloc.dart';
import 'package:branivo_app/features/vehicles/data/repositories/vehicles_repository.dart';
import 'package:branivo_app/features/vehicles/data/repositories/vehicle_api_repository.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_repository.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_api_repository.dart';
import 'package:branivo_app/features/quotes/data/quote_api_repository.dart';
import 'package:branivo_app/features/policies/data/repositories/policy_repository.dart';
import 'package:branivo_app/features/anonymous_session/data/repositories/anonymous_session_repository.dart';
import 'package:branivo_app/features/fleet/data/repositories/fleet_repository.dart';
import 'package:branivo_app/features/payments/data/payment_api_repository.dart';
import 'package:branivo_app/features/registration/data/repositories/client_auth_repository.dart';

class MockDio extends Mock implements Dio {}

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

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
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('hive_test_');
    Hive.init(tempDir.path);
    await Hive.openBox<dynamic>('onboarding');
    await Hive.openBox<dynamic>('policies');
    await Hive.openBox<dynamic>('tenant_theme');
  });

  tearDownAll(() async {
    await Hive.close();
    await tempDir.delete(recursive: true);
  });

  testWidgets('App renders without errors', (WidgetTester tester) async {
    final mockDio = MockDio();
    final mockStorage = MockFlutterSecureStorage();

    await tester.pumpWidget(
      MultiRepositoryProvider(
        providers: [
          RepositoryProvider<VehiclesRepository>(
            create: (_) => VehiclesRepository(dio: mockDio),
          ),
          RepositoryProvider<VehicleApiRepository>(
            create: (_) => VehicleApiRepository(dio: mockDio, storage: mockStorage),
          ),
          RepositoryProvider<OcrRepository>(
            create: (_) => OcrApiRepository(dio: mockDio),
          ),
          RepositoryProvider<QuoteApiRepository>(
            create: (_) => QuoteApiRepository(dio: mockDio),
          ),
          RepositoryProvider<PolicyRepository>(
            create: (_) => PolicyRepository(dio: mockDio),
          ),
          RepositoryProvider<AnonymousSessionRepository>(
            create: (_) => AnonymousSessionRepository(dio: mockDio),
          ),
          RepositoryProvider<FleetRepository>(
            create: (_) => FleetRepository(dio: mockDio),
          ),
          RepositoryProvider<PaymentApiRepository>(
            create: (_) => PaymentApiRepository(dio: mockDio),
          ),
          RepositoryProvider<ClientAuthRepository>(
            create: (_) => ClientAuthRepository(dio: mockDio, storage: mockStorage),
          ),
        ],
        child: BlocProvider<AuthBloc>.value(
          value: _StubAuthBloc(),
          child: MaterialApp.router(
            routerConfig: AppRouter.router,
            title: 'Branivo',
          ),
        ),
      ),
    );

    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
