import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/screens/trading/trading_screen.dart';

void main() {
  testWidgets(
    'Paused match stays visible, cutoff permits exits, history paginates',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      await tester.binding.setSurfaceSize(const Size(360, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final now = DateTime.now();
      final quote = <String, dynamic>{
        'id': 'quote',
        'price0': 899,
        'publishedAt': now.toIso8601String(),
        'expiresAt': now.subtract(const Duration(minutes: 1)).toIso8601String(),
        'state': {
          'format': 'ODI',
          'innings': 2,
          'batting': 1,
          'runs': 118,
          'wickets': 2,
          'balls': 159,
          'totalBalls': 300,
          'target': 329,
          'description': 'Zimbabwe 118/2',
        },
      };
      final market = <String, dynamic>{
        'id': 'live',
        'title': 'India Women v Zimbabwe Women',
        'team0': 'India Women',
        'team1': 'Zimbabwe Women',
        'source': 'ESPN',
        'mode': 'CASH',
        'status': 'SUSPENDED',
        'rulesVersion': 'pooled-capped-v2',
        'pollingMs': 60000,
        'reason': 'Waiting for a changed score; last quote expired',
        'quote': quote,
      };
      final paths = <String>[];
      Future<dynamic> request(String path, {Map<String, dynamic>? body}) async {
        paths.add(path);
        if (path.startsWith('/history')) {
          final more = path.contains('cursor=');
          return {
            'items': [
              {
                'id': more ? 'two' : 'one',
                'side': more ? 'SELL' : 'BUY',
                'outcomeName': 'Zimbabwe Women',
                'marketTitle': market['title'],
                'mode': 'CASH',
                'createdAt': '2026-10-25T14:00:00Z',
                'quantity': 50,
                'price': 300,
                'total': 15000,
              },
            ],
            'nextCursor': more ? null : 'one',
          };
        }
        if (path == '/markets' || path == '/markets?view=positions') {
          return [market];
        }
        if (path.contains('/candles')) {
          return [
            {
              'time': now.millisecondsSinceEpoch ~/ 1000,
              'open': 89.9,
              'high': 89.9,
              'low': 89.9,
              'close': 89.9,
              'quotes': 1,
            },
          ];
        }
        return {
          'market': market,
          'walletAvailable': 100000,
          'account': {
            'deposit': 15000,
            'balance': 0,
            'equity': 5050,
            'net': -9950,
            'realized': 0,
            'positions': [
              {
                'outcome': 1,
                'quantity': 50,
                'cost': 15000,
                'value': 5050,
                'averagePrice': 300,
                'unrealized': -9950,
              },
            ],
            'receipt': null,
          },
          'pool': {},
          'executions': [],
        };
      }

      await tester.pumpWidget(
        MaterialApp(
          home: TradingScreen(userId: 'visibility', request: request),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('India Women v Zimbabwe Women').last);
      await tester.pumpAndSettle();
      expect(find.textContaining('Trading paused:'), findsOneWidget);
      expect(find.textContaining('Approaching 90%'), findsOneWidget);
      expect(find.text('ODI · Over candles · Auto'), findsOneWidget);
      await tester.tap(find.text('My positions').first);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Exit position'),
            )
            .onPressed,
        isNull,
      );
      await tester.ensureVisible(
        find.byKey(const ValueKey('position-chart-1')),
      );
      await tester.tap(find.byKey(const ValueKey('position-chart-1')));
      await tester.pumpAndSettle();
      expect(find.text('ODI · Over candles · Auto'), findsOneWidget);
      expect(
        tester
            .widget<DropdownButton<String>>(find.byType(DropdownButton<String>))
            .value,
        'live',
      );
      expect(
        paths.lastWhere((p) => p.contains('/candles')),
        contains('outcome=1'),
      );
      expect(find.textContaining('Trading paused:'), findsOneWidget);
      await tester.tap(find.text('My positions').first);
      await tester.pumpAndSettle();
      quote['price0'] = 901;
      quote['expiresAt'] = now.add(const Duration(hours: 1)).toIso8601String();
      market['status'] = 'OPEN';
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Exit position'),
            )
            .onPressed,
        isNotNull,
      );
      await tester.ensureVisible(
        find.byKey(const ValueKey('position-chart-1')),
      );
      await tester.tap(find.byKey(const ValueKey('position-chart-1')));
      await tester.pumpAndSettle();
      expect(
        paths.lastWhere((p) => p.contains('/candles')),
        contains('outcome=1'),
      );
      expect(find.text('New buys paused'), findsOneWidget);
      expect(find.byType(DropdownButton<String>), findsOneWidget);
      await tester.tap(find.text('History').first);
      await tester.pumpAndSettle();
      expect(find.text('Buy · Zimbabwe Women'), findsOneWidget);
      expect(find.byType(DropdownButton<String>), findsNothing);
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('Exit · Zimbabwe Women'), findsOneWidget);
      expect(find.text('Load more'), findsNothing);
      expect(paths.contains('/history?cursor=one'), isTrue);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    },
  );
}
