import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/models/trading_models.dart';
import 'package:moneygame_user/screens/trading/trading_chart.dart';

void main() {
  testWidgets(
    'Chart supports empty history, candles, inspection, zoom and line switching',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final candles = [
        TradingCandle.fromJson({
          'time': 1800000000,
          'open': 60,
          'high': 65,
          'low': 58,
          'close': 62,
          'quotes': 4,
        }),
        TradingCandle.fromJson({
          'time': 1800000060,
          'open': 62,
          'high': 70,
          'low': 61,
          'close': 68,
          'quotes': 3,
        }),
      ];
      Widget chart(List<TradingCandle> data, bool line) => MaterialApp(
        home: Scaffold(
          body: TradingChart(candles: data, line: line, average: 600),
        ),
      );
      await tester.pumpWidget(chart([], false));
      expect(find.text('Waiting for price snapshots.'), findsOneWidget);
      await tester.pumpWidget(chart(candles, false));
      await tester.tapAt(const Offset(80, 100));
      await tester.pump();
      expect(
        find.textContaining('O 60.0 H 65.0 L 58.0 C 62.0'),
        findsOneWidget,
      );
      await tester.drag(find.byType(Slider), const Offset(90, 0));
      await tester.pump();
      await tester.pumpWidget(chart(candles, true));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(chart([candles.first], true));
      expect(tester.takeException(), isNull);
    },
  );

  test('A stale quote closes the mobile order ticket', () {
    final market = TradingMarket.fromJson({
      'id': 'test',
      'title': 'IND vs NZ',
      'team0': 'India',
      'team1': 'NZ',
      'source': 'SIMULATION',
      'status': 'OPEN',
      'reason': 'test',
      'mode': 'TEST',
      'pollingMs': 5000,
      'quote': {
        'price0': 600,
        'expiresAt': DateTime.now()
            .subtract(const Duration(seconds: 1))
            .toIso8601String(),
      },
    });
    expect(market.open, isFalse);
    expect(market.price(0), 600);
    expect(market.price(1), 400);
  });
}
