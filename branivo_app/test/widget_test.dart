import 'package:flutter_test/flutter_test.dart';
import 'package:branivo_app/main.dart';

void main() {
  testWidgets('App renders without errors', (WidgetTester tester) async {
    await tester.pumpWidget(const BranivoApp());
    expect(find.byType(BranivoApp), findsOneWidget);
  });
}
