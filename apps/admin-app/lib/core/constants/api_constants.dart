import 'dart:io';
import 'package:flutter/foundation.dart';

class ApiConstants {
  static const String _customUrl = String.fromEnvironment('API_URL');

  static String get baseUrl {
    if (_customUrl.isNotEmpty) {
      return _customUrl;
    }
    if (kIsWeb) {
      return 'http://localhost:4000';
    }
    if (Platform.isAndroid) {
      // 10.0.2.2 points to host machine on Android emulator
      // Use 127.0.0.1 if running with 'adb reverse tcp:4000 tcp:4000'
      return 'http://10.0.2.2:4000';
    }
    return 'http://localhost:4000';
  }

  static String get socketUrl {
    return baseUrl;
  }
}
