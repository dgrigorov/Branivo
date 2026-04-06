import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:branivo_app/features/compliance/data/tos_service.dart';
import 'package:branivo_app/features/compliance/presentation/screens/tos_acceptance_screen.dart';

class MockTosService extends Mock implements TosService {}

const _tosVersion = TosVersionData(
  id: 'eeeeeeee-0000-0000-0000-000000000005',
  version: 2,
  content: '# Общи Условия\n\nТекст на условията.',
  language: 'bg',
);

void main() {
  late MockTosService mockService;
  late bool accepted;

  setUp(() {
    mockService = MockTosService();
    accepted = false;
  });

  Widget buildWidget() {
    return MaterialApp(
      home: TosAcceptanceScreen(
        tosService: mockService,
        tosVersion: _tosVersion,
        onAccepted: () => accepted = true,
      ),
    );
  }

  group('TosAcceptanceScreen', () {
    testWidgets('shows ToS content and accept button', (tester) async {
      await tester.pumpWidget(buildWidget());
      await tester.pump();

      expect(find.textContaining('Общи Условия'), findsWidgets);
      expect(find.textContaining('Прочетох и приемам'), findsOneWidget);
    });

    testWidgets('shows version number in content area', (tester) async {
      await tester.pumpWidget(buildWidget());
      await tester.pump();

      expect(find.textContaining('Версия 2'), findsOneWidget);
    });

    testWidgets('calls onAccepted after successful accept', (tester) async {
      when(() => mockService.accept(tosVersionId: any(named: 'tosVersionId')))
          .thenAnswer((_) async {});

      await tester.pumpWidget(buildWidget());
      await tester.pump();

      await tester.tap(find.textContaining('Прочетох и приемам'));
      await tester.pumpAndSettle();

      expect(accepted, isTrue);
      verify(
        () => mockService.accept(tosVersionId: _tosVersion.id),
      ).called(1);
    });

    testWidgets('shows loading indicator while accepting', (tester) async {
      final completer = Completer<void>();
      when(() => mockService.accept(tosVersionId: any(named: 'tosVersionId')))
          .thenAnswer((_) => completer.future);

      await tester.pumpWidget(buildWidget());
      await tester.pump();

      await tester.tap(find.textContaining('Прочетох и приемам'));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      completer.complete();
      await tester.pumpAndSettle();
    });

    testWidgets('shows error message when accept fails', (tester) async {
      when(() => mockService.accept(tosVersionId: any(named: 'tosVersionId')))
          .thenThrow(Exception('Network error'));

      await tester.pumpWidget(buildWidget());
      await tester.pump();

      await tester.tap(find.textContaining('Прочетох и приемам'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Не можахме да запишем'), findsOneWidget);
      expect(accepted, isFalse);
    });

    testWidgets('back navigation is blocked (PopScope canPop=false)',
        (tester) async {
      await tester.pumpWidget(buildWidget());
      await tester.pump();

      final popScope = tester.widget<PopScope>(find.byType(PopScope));
      expect(popScope.canPop, isFalse);
    });
  });
}
