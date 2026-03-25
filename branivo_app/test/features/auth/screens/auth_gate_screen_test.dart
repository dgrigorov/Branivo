import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:branivo_app/features/auth/screens/auth_gate_screen.dart';

void main() {
  Widget buildTestWidget({
    String redirectPath = '/payment',
    Object? redirectExtra,
  }) {
    return MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/auth-gate',
        routes: [
          GoRoute(
            path: '/auth-gate',
            builder: (context, state) => AuthGateScreen(
              redirectPath: redirectPath,
              redirectExtra: redirectExtra,
            ),
          ),
          GoRoute(
            path: '/login',
            builder: (context, state) => const Scaffold(
              body: Text('Login Screen'),
            ),
          ),
          GoRoute(
            path: '/registration',
            builder: (context, state) => const Scaffold(
              body: Text('Registration Screen'),
            ),
          ),
        ],
      ),
    );
  }

  testWidgets('renders header text', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('Една стъпка преди плащане'), findsOneWidget);
  });

  testWidgets('renders both auth options', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('Имам акаунт'), findsOneWidget);
    expect(find.text('Нов съм тук'), findsOneWidget);
    expect(find.text('Продължи като гост'), findsNothing);
  });

  testWidgets('tapping "Имам акаунт" navigates to /login', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Имам акаунт'));
    await tester.pumpAndSettle();

    expect(find.text('Login Screen'), findsOneWidget);
  });

  testWidgets('tapping "Нов съм тук" navigates to /registration',
      (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Нов съм тук'));
    await tester.pumpAndSettle();

    expect(find.text('Registration Screen'), findsOneWidget);
  });

  testWidgets('renders privacy note at bottom', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('Данните ти са защитени и криптирани.'), findsOneWidget);
  });
}
