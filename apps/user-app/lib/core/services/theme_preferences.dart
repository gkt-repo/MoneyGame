import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ThemePreferences extends ValueNotifier<ThemeMode> {
  ThemePreferences() : super(ThemeMode.light);

  static final instance = ThemePreferences();
  static const _key = 'mg_theme_mode';
  static const _storage = FlutterSecureStorage();
  int _revision = 0;

  Future<void> load() async {
    final revision = _revision;
    final saved = await _storage.read(key: _key);
    if (revision == _revision) {
      value = saved == 'dark' ? ThemeMode.dark : ThemeMode.light;
    }
  }

  Future<void> setDarkMode(bool enabled) async {
    final previous = value;
    final revision = ++_revision;
    value = enabled ? ThemeMode.dark : ThemeMode.light;
    try {
      await _storage.write(key: _key, value: enabled ? 'dark' : 'light');
    } catch (_) {
      if (_revision == revision) value = previous;
      rethrow;
    }
  }
}
