import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/screens/trading/trading_screen.dart';

void main() {
  testWidgets(
    'Phone trading screen funds, confirms a buy and restores its server balance',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final now = DateTime.now();
      final market = <String, dynamic>{
        'id': 'fixture',
        'title': 'IND vs NZ',
        'team0': 'India',
        'team1': 'NZ',
        'source': 'SIMULATION',
        'status': 'OPEN',
        'mode': 'TEST',
        'reason': 'Fixture match',
        'pollingMs': 5000,
        'feedReceivedAt': now.toIso8601String(),
        'quote': {
          'id': 'q1',
          'price0': 600,
          'publishedAt': now.toIso8601String(),
          'expiresAt': now.add(const Duration(minutes: 5)).toIso8601String(),
          'state': {
            'runs': 151,
            'wickets': 5,
            'balls': 108,
            'totalBalls': 120,
            'innings': 2,
            'target': 181,
            'description': 'Need 30 from 12',
          },
        },
      };
      var balance = 0, deposit = 0, shares = 0, orders = 0, withdrawals = 0;
      final requestIds = <String>[];
      Future<dynamic> request(String path, {Map<String, dynamic>? body}) async {
        if (path == '/markets') return [market];
        if (path.contains('/candles')) {
          return [
            {
              'time': now.millisecondsSinceEpoch ~/ 1000,
              'open': 60,
              'high': 60,
              'low': 60,
              'close': 60,
              'quotes': 1,
            },
          ];
        }
        if (path.endsWith('/fund')) {
          deposit += body!['amount'] as int;
          balance += body['amount'] as int;
          requestIds.add(body['requestId'] as String);
          return {'success': true};
        }
        if (path.endsWith('/orders')) {
          expect(body!['quoteId'], 'q1');
          final exit = body['side'] == 'SELL';
          shares += (exit ? -1 : 1) * (body['quantity'] as int);
          balance += (exit ? 1 : -1) * (body['quantity'] as int) * 600;
          orders++;
          requestIds.add(body['requestId'] as String);
          return {'success': true};
        }
        return {
          'market': market,
          'account': {
            'deposit': deposit,
            'balance': balance,
            'equity': balance + shares * 600,
            'net': 0,
            'realized': 0,
            'positions': shares == 0
                ? []
                : [
                    {
                      'outcome': 0,
                      'quantity': shares,
                      'cost': shares * 600,
                      'averagePrice': 600,
                      'value': shares * 600,
                      'unrealized': 0,
                    },
                  ],
            'receipt': market['status'] == 'SETTLED'
                ? {
                    'payout': 100000,
                    'principal': 100000,
                    'reward': 0,
                    'reason': 'Match ended',
                  }
                : null,
          },
          'executions': [],
          'pool': {
            'participants': 1,
            'deposits': deposit,
            'losses': 0,
            'gains': 0,
            'estimatedPrincipal': deposit,
            'estimatedReward': 0,
            'provisional': true,
          },
        };
      }

      await tester.pumpWidget(
        MaterialApp(
          home: TradingScreen(
            userId: 'fixture-user',
            request: request,
            onWithdraw: () => withdrawals++,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Buy India'), findsNothing);
      expect(
        tester
            .widget<OutlinedButton>(find.widgetWithText(OutlinedButton, '0 cr'))
            .onPressed,
        isNull,
      );
      await tester.tap(find.byType(DropdownButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('IND vs NZ').last);
      await tester.pumpAndSettle();
      expect(find.text('Buy India'), findsOneWidget);
      expect(find.text('IND'), findsOneWidget);
      expect(find.text('NZ'), findsOneWidget);
      expect(find.text('60.00'), findsOneWidget);
      expect(find.text('40.00'), findsOneWidget);
      await tester.tap(find.byTooltip('Withdraw'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Credits stay locked'), findsOneWidget);
      expect(find.text('Continue to withdrawal'), findsNothing);
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, '0 cr'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add test credits'));
      await tester.pumpAndSettle();
      expect(deposit, 100000);
      expect(balance, 100000);
      await tester.tap(find.text('Buy India'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm buy'));
      await tester.pumpAndSettle();
      expect(orders, 1);
      expect(balance, 94000);
      expect(shares, 10);
      expect(requestIds.toSet().length, 2);
      expect(find.text('Sell India'), findsNothing);
      expect(find.text('1 min candles · Auto'), findsOneWidget);
      await tester.tap(find.text('My positions').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Exit position'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm exit'));
      await tester.pumpAndSettle();
      expect(orders, 2);
      expect(shares, 0);
      expect(balance, 100000);
      expect(find.text('No open positions'), findsOneWidget);
      market['status'] = 'SETTLED';
      // Even after a result, test funds must never offer cash withdrawal.
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<OutlinedButton>(find.widgetWithText(OutlinedButton, '0 cr'))
            .onPressed,
        isNull,
      );
      await tester.tap(find.byTooltip('Withdraw'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('cannot be withdrawn as money'),
        findsOneWidget,
      );
      expect(find.text('Continue to withdrawal'), findsNothing);
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      market['mode'] = 'CASH';
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Withdraw'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('₹1,000.00 returned to your wallet'),
        findsOneWidget,
      );
      await tester.tap(find.text('Continue to withdrawal'));
      await tester.pumpAndSettle();
      expect(withdrawals, 1);
      expect(
        orders,
        2,
        reason: 'Withdrawal navigation cannot create another trade or payout',
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    },
  );
}
