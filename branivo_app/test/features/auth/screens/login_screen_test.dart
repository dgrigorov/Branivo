import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:branivo_app/features/auth/bloc/auth_bloc.dart';
import 'package:branivo_app/features/auth/screens/login_screen.dart';
import 'package:branivo_app/features/auth/screens/two_fa_screen.dart';

class MockDio extends Mock implements Dio {}

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

// Fake AuthBloc that exposes a state stream for testing
class FakeAuthBloc extends Fake implements AuthBloc {
  FakeAuthBloc(this._state);

  final AuthState _state;

  @override
  AuthState get state => _state;

  @override
  Stream<AuthState> get stream => Stream.value(_state);

  @override
  void add(AuthEvent event) {}

  @override
  Future<void> close() async {}
}

void main() {
  setUpAll(() {
    registerFallbackValue(RequestOptions(path: ''));
  });

  group('LoginScreen', () {
    Widget buildWithState(AuthState state) => MaterialApp(
          home: BlocProvider<AuthBloc>.value(
            value: FakeAuthBloc(state),
            child: const LoginScreen(),
          ),
        );

    testWidgets('renders email and password fields', (tester) async {
      await tester.pumpWidget(buildWithState(AuthInitialState()));

      expect(find.widgetWithText(TextFormField, 'Email'), findsOneWidget);
      expect(find.widgetWithText(TextFormField, 'Password'), findsOneWidget);
      expect(find.text('Sign in'), findsWidgets);
    });

    testWidgets('shows error message on AuthErrorState', (tester) async {
      await tester.pumpWidget(
        buildWithState(AuthErrorState(message: 'Invalid credentials')),
      );
      await tester.pump();

      expect(find.text('Invalid credentials'), findsOneWidget);
    });

    testWidgets('shows loading indicator on AuthLoadingState', (tester) async {
      await tester.pumpWidget(buildWithState(AuthLoadingState()));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });

  group('TwoFAScreen', () {
    Widget buildTwoFAScreen(AuthState state) => MaterialApp(
          home: BlocProvider<AuthBloc>.value(
            value: FakeAuthBloc(state),
            child: TwoFAScreen(tempToken: 'test-temp-token'),
          ),
        );

    testWidgets('renders 2FA title and code input', (tester) async {
      await tester.pumpWidget(buildTwoFAScreen(AuthInitialState()));

      expect(find.text('Two-Factor Authentication'), findsOneWidget);
      expect(find.text('Authentication code'), findsOneWidget);
    });

    testWidgets('shows error on AuthErrorState', (tester) async {
      await tester.pumpWidget(
        buildTwoFAScreen(AuthErrorState(message: 'Invalid 2FA code')),
      );
      await tester.pump();

      expect(find.text('Invalid 2FA code'), findsOneWidget);
    });
  });
}
