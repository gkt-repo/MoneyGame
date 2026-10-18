import 'dart:io';
import 'package:flutter/foundation.dart';

class ApiConstants {
  static const String _customUrl = String.fromEnvironment('API_URL');
  static String? _runtimeOverride;

  static void setRuntimeUrl(String url) {
    _runtimeOverride = url.trim();
  }

  static String get baseUrl {
    if (_runtimeOverride != null && _runtimeOverride!.isNotEmpty) {
      return _runtimeOverride!;
    }
    if (_customUrl.isNotEmpty) {
      return _customUrl;
    }
    if (kIsWeb) {
      return 'http://localhost:4000';
    }
    if (Platform.isAndroid) {
      // Direct connection to Oracle Cloud production VM
      return 'http://132.226.186.196:4000';
    }
    return 'http://localhost:4000';
  }

  static String get socketUrl {
    return baseUrl;
  }
}
