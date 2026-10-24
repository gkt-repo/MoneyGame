import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/models/trading_models.dart';
import 'package:moneygame_user/screens/trading/trading_chart.dart';

void main() {
  testWidgets(
    'Chart supports candle inspection and independent price/time axis gestures',
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
      Widget chart(List<TradingCandle> data) => MaterialApp(
        home: Scaffold(body: TradingChart(candles: data, average: 60)),
      );
      await tester.pumpWidget(chart([]));
      expect(find.text('Waiting for price snapshots.'), findsOneWidget);
      await tester.pumpWidget(chart(candles));
      await tester.tapAt(const Offset(80, 100));
      await tester.pump(const Duration(milliseconds: 350));
      expect(
        find.textContaining(RegExp(r'O 60\.0.*H 65\.0.*L 58\.0.*C 62\.0')),
        findsOneWidget,
      );
      final semantics = tester.ensureSemantics();
      try {
        expect(find.byType(Slider), findsNothing);
        await tester.drag(
          find.byKey(const ValueKey('trading-price-axis')),
          const Offset(0, -80),
        );
        await tester.pump();
        expect(
          find.bySemanticsLabel(RegExp(r'Price axis.*Zoom 1\.00')),
          findsNothing,
        );
        expect(
          find.bySemanticsLabel(RegExp(r'Time axis.*Zoom 1\.00')),
          findsOneWidget,
        );
        await tester.drag(
          find.byKey(const ValueKey('trading-time-axis')),
          const Offset(100, 0),
        );
        await tester.pump();
        expect(
          find.bySemanticsLabel(RegExp(r'Time axis.*Zoom 1\.00')),
          findsNothing,
        );
        await tester.pump(const Duration(milliseconds: 350));
        await tester.pumpWidget(chart([candles.first]));
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
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
