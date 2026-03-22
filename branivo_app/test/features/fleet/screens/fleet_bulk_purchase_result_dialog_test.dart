import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:branivo_app/features/fleet/data/models/bulk_quote_models.dart';
import 'package:branivo_app/features/fleet/screens/fleet_bulk_purchase_result_dialog.dart';

BulkPurchaseResponse makeResponse({
  List<BulkPurchaseSuccessItem> succeeded = const [],
  List<BulkPurchaseFailedItem> failed = const [],
}) {
  return BulkPurchaseResponse(
    succeeded: succeeded,
    failed: failed,
    summary: BulkPurchaseSummary(
      total: succeeded.length + failed.length,
      succeeded: succeeded.length,
      failed: failed.length,
    ),
  );
}

Widget buildTestWidget(BulkPurchaseResponse result) {
  return MaterialApp(
    home: Scaffold(
      body: Builder(
        builder: (context) => TextButton(
          onPressed: () => showDialog<void>(
            context: context,
            builder: (_) => FleetBulkPurchaseResultDialog(result: result),
          ),
          child: const Text('Open'),
        ),
      ),
    ),
  );
}

void main() {
  group('FleetBulkPurchaseResultDialog', () {
    testWidgets('shows success title when all purchases succeeded',
        (tester) async {
      final result = makeResponse(
        succeeded: [
          const BulkPurchaseSuccessItem(
            vehicleId: 'fv-1',
            quoteId: 'q-1',
            clientSecret: 'pi_secret',
            paymentId: 'pi_123',
          ),
        ],
      );

      await tester.pumpWidget(buildTestWidget(result));
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.text('Всички полици са закупени'), findsOneWidget);
      expect(find.text('Успешни: 1 / 1'), findsOneWidget);
    });

    testWidgets('shows failed title when all purchases failed', (tester) async {
      final result = makeResponse(
        failed: [
          const BulkPurchaseFailedItem(
            vehicleId: 'fv-1',
            quoteId: 'q-1',
            error: 'Quote is not available',
          ),
        ],
      );

      await tester.pumpWidget(buildTestWidget(result));
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.text('Закупуването е неуспешно'), findsOneWidget);
      expect(find.textContaining('Quote is not available'), findsOneWidget);
    });

    testWidgets('shows partial title when some purchases failed', (tester) async {
      final result = makeResponse(
        succeeded: [
          const BulkPurchaseSuccessItem(
            vehicleId: 'fv-1',
            quoteId: 'q-1',
            clientSecret: 'pi_secret',
            paymentId: 'pi_123',
          ),
        ],
        failed: [
          const BulkPurchaseFailedItem(
            vehicleId: 'fv-2',
            quoteId: 'q-2',
            error: 'Stripe unavailable',
          ),
        ],
      );

      await tester.pumpWidget(buildTestWidget(result));
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.text('Частично успешно закупуване'), findsOneWidget);
      expect(find.text('Успешни: 1 / 2'), findsOneWidget);
      expect(find.textContaining('Stripe unavailable'), findsOneWidget);
    });

    testWidgets('dialog can be dismissed by pressing Затвори', (tester) async {
      final result = makeResponse(
        succeeded: [
          const BulkPurchaseSuccessItem(
            vehicleId: 'fv-1',
            quoteId: 'q-1',
            clientSecret: 'pi_secret',
            paymentId: 'pi_123',
          ),
        ],
      );

      await tester.pumpWidget(buildTestWidget(result));
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.text('Всички полици са закупени'), findsOneWidget);

      await tester.tap(find.text('Затвори'));
      await tester.pumpAndSettle();

      expect(find.text('Всички полици са закупени'), findsNothing);
    });
  });
}
