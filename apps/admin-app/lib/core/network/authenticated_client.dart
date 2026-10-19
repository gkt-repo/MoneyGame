import 'dart:convert';
import 'package:dio/dio.dart';

class AuthenticatedClient {
  final String Function() baseUrl;
  final String refreshPath;
  final Future<String?> Function() readAccessToken;
  final Future<String?> Function() readRefreshToken;
  final Future<void> Function({required String accessToken, required String refreshToken}) saveTokens;
  final Future<void> Function() clearSession;
  final Dio dio;
  final Dio refreshDio;
  Future<String?>? _refreshing;

  AuthenticatedClient({
    required this.baseUrl, required this.refreshPath,
    required this.readAccessToken, required this.readRefreshToken,
    required this.saveTokens, required this.clearSession,
    Dio? client, Dio? refreshClient,
  }) : dio = client ?? Dio(), refreshDio = refreshClient ?? Dio() {
    for (final client in [dio, refreshDio]) {
      client.options.connectTimeout = const Duration(seconds: 30);
      client.options.receiveTimeout = const Duration(seconds: 30);
      client.options.headers['Content-Type'] = 'application/json';
    }
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        options.baseUrl = baseUrl();
        try {
          if (!_publicAuth(options.path)) {
            final token = await validAccessToken();
            if (token != null) options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        } catch (error) {
          handler.reject(DioException(requestOptions: options, error: error));
        }
      },
      onError: (error, handler) async {
        final options = error.requestOptions;
        final data = error.response?.data;
        if (error.response?.statusCode == 401 && !_publicAuth(options.path)) {
          if (data is Map && data['code'] == 'TOKEN_EXPIRED' && options.extra['sessionRetried'] != true) {
            try {
              final current = await readAccessToken();
              final token = await validAccessToken(forceRefresh: options.headers['Authorization'] == 'Bearer $current');
              if (token != null) {
                options.extra['sessionRetried'] = true;
                options.headers['Authorization'] = 'Bearer $token';
                handler.resolve(await dio.fetch<dynamic>(options));
                return;
              }
            } on DioException catch (retryError) {
              handler.next(retryError);
              return;
            } catch (_) {
              handler.next(error);
              return;
            }
          }
          await clearSession();
        }
        handler.next(error);
      },
    ));
  }

  bool _publicAuth(String path) => ['/login', '/register', '/forgot-password', '/reset-password'].any(path.endsWith);

  Future<String?> validAccessToken({bool forceRefresh = false}) async {
    final token = await readAccessToken();
    if (token == null) return null;
    try {
      final payload = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(token.split('.')[1]))));
      if (!forceRefresh && (payload['exp'] as num) * 1000 > DateTime.now().millisecondsSinceEpoch + 30000) return token;
    } catch (_) { /* Refresh expired or malformed access tokens. */ }
    return _refreshing ??= _refresh().whenComplete(() => _refreshing = null);
  }

  Future<String?> _refresh() async {
    final refreshToken = await readRefreshToken();
    if (refreshToken == null) { await clearSession(); return null; }
    try {
      refreshDio.options.baseUrl = baseUrl();
      final response = await refreshDio.post<dynamic>(refreshPath, data: {'refreshToken': refreshToken});
      if (await readRefreshToken() != refreshToken) return readAccessToken();
      await saveTokens(accessToken: response.data['accessToken'], refreshToken: response.data['refreshToken']);
      return response.data['accessToken'] as String;
    } on DioException catch (error) {
      if (error.response?.statusCode == 401) await clearSession();
      rethrow;
    }
  }
}
