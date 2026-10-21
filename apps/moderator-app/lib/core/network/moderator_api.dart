import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'authenticated_client.dart';

class ModeratorApi {
  static const storage = FlutterSecureStorage();
  static String baseUrl = const String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );
  static final session = AuthenticatedClient(
    baseUrl: () => '$baseUrl/api',
    refreshPath: '/admin/auth/refresh-token',
    readAccessToken: () => storage.read(key: 'access'),
    readRefreshToken: () => storage.read(key: 'refresh'),
    saveTokens: ({required accessToken, required refreshToken}) async {
      await storage.write(key: 'access', value: accessToken);
      await storage.write(key: 'refresh', value: refreshToken);
    },
    clearSession: clear,
  );
  static Future<void> clear() async {
    await storage.delete(key: 'access');
    await storage.delete(key: 'refresh');
  }

  static Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? data,
  }) async {
    try {
      return (await session.dio.request<dynamic>(
        path,
        data: data,
        options: Options(method: method),
      )).data;
    } on DioException catch (e) {
      final body = e.response?.data;
      throw Exception(
        body is Map
            ? body['error'] ?? 'Request failed'
            : 'Unable to reach server. Please retry.',
      );
    }
  }

  static Future<Map<String, dynamic>> login(
    String url,
    String username,
    String password,
  ) async {
    final uri = Uri.tryParse(url.trim());
    if (uri == null ||
        !['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment) {
      throw Exception('Enter a valid server URL');
    }
    if (uri.scheme != 'https' &&
        !['localhost', '127.0.0.1', '10.0.2.2'].contains(uri.host)) {
      throw Exception('Use HTTPS for a remote server');
    }
    baseUrl = url
        .trim()
        .replaceAll(RegExp(r'/+$'), '')
        .replaceAll(RegExp(r'/api$'), '');
    final result = await request(
      '/admin/auth/login',
      method: 'POST',
      data: {'identifier': username.trim(), 'password': password},
    );
    final user = Map<String, dynamic>.from(result['admin'] ?? result['user']);
    if (user['role'] != 'MODERATOR') {
      throw Exception('Use a moderator account supplied by Super Admin');
    }
    await storage.write(key: 'access', value: result['tokens']['accessToken']);
    await storage.write(
      key: 'refresh',
      value: result['tokens']['refreshToken'],
    );
    await storage.write(key: 'server', value: baseUrl);
    return user;
  }

  static Future<Map<String, dynamic>> me() async {
    final result = await request('/admin/auth/me');
    return Map<String, dynamic>.from(result['admin']);
  }
}
