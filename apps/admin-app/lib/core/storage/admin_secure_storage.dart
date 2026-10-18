import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AdminSecureStorage {
  static const _storage = FlutterSecureStorage();

  static const _keyAccessToken = 'mg_admin_access_token';
  static const _keyRefreshToken = 'mg_admin_refresh_token';
  static const _keyAdminProfile = 'mg_admin_profile';

  static Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _keyAccessToken, value: accessToken);
    await _storage.write(key: _keyRefreshToken, value: refreshToken);
  }

  static Future<String?> getAccessToken() async {
    return _storage.read(key: _keyAccessToken);
  }

  static Future<String?> getRefreshToken() async {
    return _storage.read(key: _keyRefreshToken);
  }

  static Future<void> saveAdminProfile(String profileJson) async {
    await _storage.write(key: _keyAdminProfile, value: profileJson);
  }

  static Future<String?> getAdminProfile() async {
    return _storage.read(key: _keyAdminProfile);
  }

  static const _keyCustomBaseUrl = 'mg_admin_custom_base_url';

  static Future<void> saveCustomBaseUrl(String url) async {
    await _storage.write(key: _keyCustomBaseUrl, value: url);
  }

  static Future<String?> getCustomBaseUrl() async {
    return _storage.read(key: _keyCustomBaseUrl);
  }

  static Future<void> clearSession() async {
    await _storage.delete(key: _keyAccessToken);
    await _storage.delete(key: _keyRefreshToken);
    await _storage.delete(key: _keyAdminProfile);
  }
}
