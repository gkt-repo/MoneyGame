import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:moneygame_moderator/main.dart';
import 'package:moneygame_moderator/core/network/moderator_api.dart';

class FakeServer implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  String role = 'MODERATOR';
  bool claimed = false;
  bool floatReady = true;
  final access =
      'e30.${base64Url.encode(utf8.encode(jsonEncode({'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 900})))}.signature';
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    if (options.path == '/admin/withdrawals/claim') claimed = true;
    final user = {'id': 'moderator-1', 'username': 'desk_one', 'role': role};
    final bodies = <String, dynamic>{
      '/admin/auth/login': {
        'admin': user,
        'tokens': {'accessToken': access, 'refreshToken': 'refresh'},
      },
      '/admin/auth/me': {'admin': user},
      '/admin/moderator-status': {'account': {
        'upiId': 'desk@bank', 'floatReady': floatReady, 'poolStatus': 'AVAILABLE',
        'issuedCount': 2, 'todayTxCount': 2, 'dailyLimit': 15,
        'currentBalance': 7000, 'reservedPayouts': 2000, 'availableBalance': 5000,
        'totalDeposited': 25000, 'totalPaidOut': 18000,
      }},
      '/admin/deposits': {'deposits': []},
      '/admin/withdrawals': {
        'withdrawals': [
          {
            'id': 'payout-1',
            'userId': 'player',
            'amount': 100,
            'upiId': 'player@bank',
            'status': claimed ? 'PROCESSING' : 'PENDING',
            'assignedModeratorId': 'moderator-1',
            'processingById': claimed ? 'moderator-1' : null,
          },
        ],
      },
      '/admin/feedback': {'feedbacks': []},
      '/admin/withdrawals/claim': {'success': true},
    };
    return ResponseBody.fromString(
      jsonEncode(bodies[options.path] ?? {}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FakeServer server;
  setUp(() {
    server = FakeServer();
    ModeratorApi.session.dio.httpClientAdapter = server;
    FlutterSecureStorage.setMockInitialValues({
      'access': server.access,
      'refresh': 'refresh',
    });
  });
  test(
    'moderator login stores its own session and rejects privileged accounts',
    () async {
      final user = await ModeratorApi.login(
        'https://example.test',
        'desk_one',
        'password',
      );
      expect(user['role'], 'MODERATOR');
      expect(await ModeratorApi.storage.read(key: 'access'), server.access);
      await ModeratorApi.clear();
      server.role = 'SUPER_ADMIN';
      await expectLater(
        ModeratorApi.login('https://example.test', 'admin', 'password'),
        throwsException,
      );
      expect(await ModeratorApi.storage.read(key: 'access'), isNull);
    },
  );
  test(
    'remote plaintext endpoints are rejected before transmitting credentials',
    () async {
      await expectLater(
        ModeratorApi.login('http://example.test', 'desk', 'password'),
        throwsException,
      );
      expect(server.requests, isEmpty);
    },
  );
  testWidgets(
    'workspace only exposes operational tabs and requires taking a payout',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ModeratorHome(
            user: const {'id': 'moderator-1', 'username': 'desk_one'},
            onLogout: () async {},
            enableRealtime: false,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Deposits'), findsOneWidget);
      expect(find.text('Payouts'), findsOneWidget);
      expect(find.text('Support'), findsOneWidget);
      expect(find.text('Users'), findsNothing);
      expect(find.text('Overview'), findsNothing);
      await tester.tap(find.text('Payouts'));
      await tester.pumpAndSettle();
      expect(find.text('Available float: ₹5000.00'), findsOneWidget);
      expect(find.text('Current: ₹7000.00 | Reserved: ₹2000.00'), findsOneWidget);
      expect(find.text('Copy UPI & Pay'), findsNothing);
      expect(find.text('Take payout'), findsOneWidget);
      expect(find.text('Mark paid'), findsNothing);
      await tester.tap(find.text('Take payout'));
      await tester.pumpAndSettle();
      expect(
        server.requests
            .where((r) => r.path == '/admin/withdrawals/claim')
            .single
            .data,
        {'withdrawalId': 'payout-1'},
      );
      expect(find.text('Copy UPI & Pay'), findsOneWidget);
      expect(find.text('Mark paid'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
