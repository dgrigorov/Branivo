import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:branivo_app/features/compliance/data/cookie_consent_service.dart';
import 'package:branivo_app/features/compliance/data/cookie_policy_service.dart';
import 'package:branivo_app/features/compliance/presentation/widgets/cookie_consent_sheet.dart';

class MockCookieConsentService extends Mock implements CookieConsentService {}

class MockCookiePolicyService extends Mock implements CookiePolicyService {}

void main() {
  late MockCookieConsentService mockConsentService;
  late MockCookiePolicyService mockPolicyService;

  setUp(() {
    mockConsentService = MockCookieConsentService();
    mockPolicyService = MockCookiePolicyService();

    // Default: no prior consent stored
    when(() => mockConsentService.getCurrentConsent()).thenReturn({
      'necessary': true,
      'analytics': false,
      'marketing': false,
      'functional': false,
      'consentedAt': null,
    });
    when(
      () => mockConsentService.saveConsent(
        analytics: any(named: 'analytics'),
        marketing: any(named: 'marketing'),
        functional: any(named: 'functional'),
      ),
    ).thenAnswer((_) async {});
  });

  Widget buildSheet() {
    return MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () {
              showModalBottomSheet<void>(
                context: context,
                isDismissible: false,
                enableDrag: false,
                isScrollControlled: true,
                builder: (_) => CookieConsentSheet(
                  cookieConsentService: mockConsentService,
                  cookiePolicyService: mockPolicyService,
                ),
              );
            },
            child: const Text('Open Sheet'),
          ),
        ),
      ),
    );
  }

  Future<void> openSheet(WidgetTester tester) async {
    await tester.pumpWidget(buildSheet());
    await tester.tap(find.text('Open Sheet'));
    await tester.pumpAndSettle();
  }

  group('CookieConsentSheet', () {
    testWidgets('shows title and cookie type toggles', (tester) async {
      await openSheet(tester);

      expect(find.text('Настройки на бисквитките'), findsOneWidget);
      expect(find.text('Необходими'), findsOneWidget);
      expect(find.text('Аналитични'), findsOneWidget);
      expect(find.text('Маркетингови'), findsOneWidget);
      expect(find.text('Функционални'), findsOneWidget);
    });

    testWidgets('shows Приеми всички and Запази избора ми buttons',
        (tester) async {
      await openSheet(tester);

      expect(find.text('Приеми всички'), findsOneWidget);
      expect(find.text('Запази избора ми'), findsOneWidget);
    });

    testWidgets('Необходими toggle is disabled (always on)', (tester) async {
      await openSheet(tester);

      final tiles = tester.widgetList<SwitchListTile>(
        find.byType(SwitchListTile),
      );
      final necessaryTile = tiles.first;
      expect(necessaryTile.value, isTrue);
      expect(necessaryTile.onChanged, isNull);
    });

    testWidgets('tapping Приеми всички calls saveConsent with all true',
        (tester) async {
      await openSheet(tester);

      await tester.tap(find.text('Приеми всички'));
      await tester.pumpAndSettle();

      verify(
        () => mockConsentService.saveConsent(
          analytics: true,
          marketing: true,
          functional: true,
        ),
      ).called(1);
    });

    testWidgets('tapping Запази избора ми calls saveConsent with current selection',
        (tester) async {
      await openSheet(tester);

      // Toggle analytics on
      final switches = find.byType(Switch);
      // First switch = Необходими (disabled), second = Аналитични
      await tester.tap(switches.at(1));
      await tester.pump();

      await tester.tap(find.text('Запази избора ми'));
      await tester.pumpAndSettle();

      verify(
        () => mockConsentService.saveConsent(
          analytics: true,
          marketing: false,
          functional: false,
        ),
      ).called(1);
    });

    testWidgets('loads current consent preferences on open', (tester) async {
      when(() => mockConsentService.getCurrentConsent()).thenReturn({
        'necessary': true,
        'analytics': true,
        'marketing': true,
        'functional': false,
        'consentedAt': '2026-04-06T00:00:00.000Z',
      });

      await openSheet(tester);

      final tiles = tester.widgetList<SwitchListTile>(
        find.byType(SwitchListTile),
      ).toList();

      // analytics (index 1) should be true
      expect(tiles[1].value, isTrue);
      // marketing (index 2) should be true
      expect(tiles[2].value, isTrue);
      // functional (index 3) should be false
      expect(tiles[3].value, isFalse);
    });
  });
}
