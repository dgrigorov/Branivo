import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:branivo_app/core/routing/app_router.dart';
import 'package:branivo_app/features/auth/bloc/auth_bloc.dart';
import 'package:branivo_app/features/vehicles/data/repositories/vehicles_repository.dart';
import 'package:branivo_app/features/vehicles/data/repositories/vehicle_api_repository.dart';
import 'package:branivo_app/features/ocr/data/repositories/ocr_api_repository.dart';

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
  testWidgets('App renders without errors', (WidgetTester tester) async {
    final mockDio = MockDio();
    final mockStorage = MockFlutterSecureStorage();

    await tester.pumpWidget(
      MultiRepositoryProvider(
        providers: [
          RepositoryProvider<VehiclesRepository>(
            create: (_) =>
                VehiclesRepository(dio: mockDio),
          ),
          RepositoryProvider<VehicleApiRepository>(
            create: (_) =>
                VehicleApiRepository(dio: mockDio, storage: mockStorage),
          ),
          RepositoryProvider<OcrApiRepository>(
            create: (_) => OcrApiRepository(dio: mockDio),
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
