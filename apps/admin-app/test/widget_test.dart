import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_admin/main.dart';

void main() {
  testWidgets('Admin app launches smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const MoneyGameAdminApp());
    expect(find.byType(MoneyGameAdminApp), findsOneWidget);
  });
}
