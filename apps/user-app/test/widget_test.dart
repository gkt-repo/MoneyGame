import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/main.dart';

void main() {
  testWidgets('App launches smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const MoneyGameUserApp());
    expect(find.byType(MoneyGameUserApp), findsOneWidget);
  });
}
