import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:branivo_app/features/compliance/data/privacy_policy_service.dart';
import 'package:branivo_app/features/compliance/presentation/screens/privacy_policy_screen.dart';

class MockPrivacyPolicyService extends Mock implements PrivacyPolicyService {}

void main() {
  late MockPrivacyPolicyService mockService;

  setUp(() {
    mockService = MockPrivacyPolicyService();
  });

  Widget buildWidget() {
    return MaterialApp(
      home: PrivacyPolicyScreen(privacyPolicyService: mockService),
    );
  }

  group('PrivacyPolicyScreen', () {
    testWidgets('shows loading indicator while fetching', (tester) async {
      final completer = Completer<PrivacyPolicyData>();
      when(() => mockService.fetchPublished(lang: any(named: 'lang')))
          .thenAnswer((_) => completer.future);

      await tester.pumpWidget(buildWidget());
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Complete to avoid pending Future at teardown
      completer.complete(const PrivacyPolicyData(
        version: 1,
        content: '# Policy',
        language: 'bg',
      ));
      await tester.pumpAndSettle();
    });

    testWidgets('displays policy content after successful fetch', (tester) async {
      const content = '# Политика за поверителност\n\nТекст на политиката.';
      when(() => mockService.fetchPublished(lang: any(named: 'lang')))
          .thenAnswer(
        (_) async => const PrivacyPolicyData(
          version: 1,
          content: content,
          language: 'bg',
        ),
      );

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(find.textContaining('Политика за поверителност'), findsWidgets);
    });

    testWidgets('displays error message when fetch fails', (tester) async {
      when(() => mockService.fetchPublished(lang: any(named: 'lang')))
          .thenAnswer((_) async => Future<PrivacyPolicyData>.error(
                Exception('Network error'),
              ));

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(
        find.textContaining('не е достъпна'),
        findsOneWidget,
      );
    });

    testWidgets('has AppBar with correct title', (tester) async {
      when(() => mockService.fetchPublished(lang: any(named: 'lang')))
          .thenAnswer(
        (_) async => const PrivacyPolicyData(
          version: 1,
          content: '# Policy',
          language: 'bg',
        ),
      );

      await tester.pumpWidget(buildWidget());
      await tester.pump();

      expect(find.text('Политика за поверителност'), findsAtLeast(1));
    });
  });
}
