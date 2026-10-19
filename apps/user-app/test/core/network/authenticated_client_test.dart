import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/network/authenticated_client.dart';

String token(int seconds) => 'e30.${base64Url.encode(utf8.encode(jsonEncode({'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + seconds}))).replaceAll('=', '')}.signature';

class Adapter implements HttpClientAdapter {
  final Future<ResponseBody> Function(RequestOptions) respond;
  Adapter(this.respond);
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) => respond(options);
  @override
  void close({bool force = false}) {}
}
ResponseBody response(int status, Map<String, dynamic> data) => ResponseBody.fromString(jsonEncode(data), status, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});

class Session {
  String? access = token(-60);
  String? refresh = 'refresh-old';
  int cleared = 0;
  late final AuthenticatedClient client;
  Session(Future<ResponseBody> Function(RequestOptions) refreshResponse, Future<ResponseBody> Function(RequestOptions) normalResponse) {
    final normal = Dio()..httpClientAdapter = Adapter(normalResponse);
    final refresher = Dio()..httpClientAdapter = Adapter(refreshResponse);
    client = AuthenticatedClient(
      baseUrl: () => 'http://test.invalid', refreshPath: '/auth/refresh-token',
      readAccessToken: () async => access,
      readRefreshToken: () async => refresh,
      saveTokens: ({required String accessToken, required String refreshToken}) async { access = accessToken; refresh = refreshToken; },
      clearSession: () async { access = null; refresh = null; cleared++; },
      client: normal, refreshClient: refresher,
    );
  }
}
void main() {
  test('concurrent requests share a refresh and carry the new access token', () async {
    int refreshes = 0;
    final fresh = token(900);
    final session = Session((_) async {
      refreshes++;
      await Future<void>.delayed(const Duration(milliseconds: 10));
      return response(200, {'accessToken': fresh, 'refreshToken': 'refresh-new'});
    }, (options) async {
      expect(options.headers['Authorization'], 'Bearer $fresh');
      return response(200, {'success': true});
    });
    await Future.wait(List.generate(3, (_) => session.client.dio.get<dynamic>('/wallet')));
    expect(refreshes, 1); expect(session.cleared, 0); expect(session.refresh, 'refresh-new');
  });
  test('TOKEN_EXPIRED response refreshes and retries the original request once', () async {
    int requests = 0;
    final session = Session((_) async => response(200, {'accessToken': token(1800), 'refreshToken': 'refresh-new'}), (_) async {
      requests++;
      return requests == 1 ? response(401, {'code': 'TOKEN_EXPIRED'}) : response(200, {'success': true});
    });
    session.access = token(900);
    await session.client.dio.get<dynamic>('/wallet');
    expect(requests, 2); expect(session.cleared, 0);
  });
  test('revoked refresh tokens clear the session', () async {
    final session = Session((_) async => response(401, {'error': 'Revoked'}), (_) async => response(200, {}));
    await expectLater(session.client.dio.get<dynamic>('/wallet'), throwsA(isA<DioException>()));
    expect(session.access, isNull); expect(session.refresh, isNull);
  });
  test('temporary refresh failure preserves the session', () async {
    final session = Session((_) async => response(503, {'error': 'Unavailable'}), (_) async => response(200, {}));
    await expectLater(session.client.dio.get<dynamic>('/wallet'), throwsA(isA<DioException>()));
    expect(session.refresh, 'refresh-old'); expect(session.cleared, 0);
  });
  test('a pending refresh cannot restore a logged-out session', () async {
    final entered = Completer<void>(); final release = Completer<void>();
    final session = Session((_) async {
      entered.complete(); await release.future;
      return response(200, {'accessToken': token(900), 'refreshToken': 'refresh-new'});
    }, (_) async => response(200, {}));
    final pending = session.client.validAccessToken();
    await entered.future; session.access = null; session.refresh = null; release.complete();
    expect(await pending, isNull); expect(session.access, isNull);
  });
}
