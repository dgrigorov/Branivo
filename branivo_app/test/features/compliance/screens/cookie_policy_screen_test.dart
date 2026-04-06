import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:branivo_app/features/compliance/data/cookie_policy_service.dart';
import 'package:branivo_app/features/compliance/presentation/screens/cookie_policy_screen.dart';

class MockCookiePolicyService extends Mock implements CookiePolicyService {}

void main() {
  late MockCookiePolicyService mockService;

  setUp(() {
    mockService = MockCookiePolicyService();
  });

  Widget buildWidget() {
    return MaterialApp(
      home: CookiePolicyScreen(cookiePolicyService: mockService),
    );
  }

  group('CookiePolicyScreen', () {
    testWidgets('shows loading indicator while fetching', (tester) async {
      final completer = Completer<CookiePolicyData>();
      when(() => mockService.fetchPublished(lang: any(named: 'lang')))
          .thenAnswer((_) => completer.future);

      await tester.pumpWidget(buildWidget());
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      completer.complete(const CookiePolicyData(
        version: 1,
        content: '# Cookie Policy',
        language: 'bg',
      ));
      await tester.pumpAndSettle();
    });

    testWidgets('displays policy content after successful fetch', (tester) async {
      const content = '# Политика за бисквитките\n\nТекст на политиката.';
      when(() => mockService.fetchPublished(lang: any(named: 'lang')))
          .thenAnswer(
        (_) async => const CookiePolicyData(
          version: 1,
          content: content,
          language: 'bg',
        ),
      );

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(find.textContaining('Политика за бисквитките'), findsWidgets);
    });

    testWidgets('displays error message when fetch fails', (tester) async {
      when(() => mockService.fetchPublished(lang: any(named: 'lang')))
          .thenAnswer((_) async => Future<CookiePolicyData>.error(
                Exception('Network error'),
              ));

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Cookie Policy не е налична'),
        findsOneWidget,
      );
    });

    testWidgets('has AppBar with Cookie Policy title', (tester) async {
      when(() => mockService.fetchPublished(lang: any(named: 'lang')))
          .thenAnswer(
        (_) async => const CookiePolicyData(
          version: 1,
          content: '# Policy',
          language: 'bg',
        ),
      );

      await tester.pumpWidget(buildWidget());
      await tester.pump();

      expect(find.text('Cookie Policy'), findsAtLeast(1));
    });
  });
}
