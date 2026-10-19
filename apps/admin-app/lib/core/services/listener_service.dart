import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../constants/api_constants.dart';
import '../network/admin_api_client.dart';

class ListenerStatus {
  final bool isPermissionGranted;
  final bool isBatteryOptimizationIgnored;
  final bool isListenerConnected;
  final DateTime? lastHeartbeatAt;
  final double lastNotificationAmount;
  final String lastNotificationUtr;
  final DateTime? lastNotificationTime;
  final String lastNotificationPackage;
  final String lastNotificationText;

  ListenerStatus({
    required this.isPermissionGranted,
    required this.isBatteryOptimizationIgnored,
    required this.isListenerConnected,
    this.lastHeartbeatAt,
    this.lastNotificationAmount = 0.0,
    this.lastNotificationUtr = '',
    this.lastNotificationTime,
    this.lastNotificationPackage = '',
    this.lastNotificationText = '',
  });

  bool get isReady => isPermissionGranted && isBatteryOptimizationIgnored;
}

class ListenerService {
  static const MethodChannel _channel = MethodChannel('com.moneygame.admin/listener');
  static Timer? _heartbeatTimer;
  static bool _initialized = false;

  /// Check if notification listener permission has been granted by user
  static Future<bool> isPermissionGranted() async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final res = await _channel.invokeMethod<bool>('isPermissionGranted');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Direct user to system settings to toggle notification access
  static Future<bool> openPermissionSettings() async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final res = await _channel.invokeMethod<bool>('openPermissionSettings');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Check if battery optimization is disabled (unrestricted background work)
  static Future<bool> isBatteryOptimizationIgnored() async {
    if (kIsWeb || !Platform.isAndroid) return true;
    try {
      final res = await _channel.invokeMethod<bool>('isBatteryOptimizationIgnored');
      return res ?? true;
    } catch (_) {
      return true;
    }
  }

  /// Request user to disable battery optimization for this app
  static Future<bool> requestIgnoreBatteryOptimization() async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final res = await _channel.invokeMethod<bool>('requestIgnoreBatteryOptimization');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Save server URL & webhook secret into native Android SharedPreferences
  static Future<bool> syncConfig({String? baseUrl, String? webhookSecret}) async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final targetUrl = baseUrl ?? ApiConstants.baseUrl;
      final res = await _channel.invokeMethod<bool>('saveConfig', {
        'baseUrl': targetUrl,
        'webhookSecret': webhookSecret,
      });
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Read active listener telemetry & status from native side
  static Future<ListenerStatus> getStatus() async {
    if (kIsWeb || !Platform.isAndroid) {
      return ListenerStatus(
        isPermissionGranted: false,
        isBatteryOptimizationIgnored: true,
        isListenerConnected: false,
      );
    }
    try {
      final raw = await _channel.invokeMapMethod<String, dynamic>('getListenerStatus');
      if (raw == null) {
        return ListenerStatus(
          isPermissionGranted: false,
          isBatteryOptimizationIgnored: true,
          isListenerConnected: false,
        );
      }

      final lastHb = raw['lastHeartbeatAt'] as num?;
      final lastNotifTime = raw['lastNotificationTime'] as num?;

      return ListenerStatus(
        isPermissionGranted: raw['isPermissionGranted'] == true,
        isBatteryOptimizationIgnored: raw['isBatteryOptimizationIgnored'] == true,
        isListenerConnected: raw['isListenerConnected'] == true,
        lastHeartbeatAt: (lastHb != null && lastHb > 0)
            ? DateTime.fromMillisecondsSinceEpoch(lastHb.toInt())
            : null,
        lastNotificationAmount: (raw['lastNotificationAmount'] as num?)?.toDouble() ?? 0.0,
        lastNotificationUtr: raw['lastNotificationUtr']?.toString() ?? '',
        lastNotificationTime: (lastNotifTime != null && lastNotifTime > 0)
            ? DateTime.fromMillisecondsSinceEpoch(lastNotifTime.toInt())
            : null,
        lastNotificationPackage: raw['lastNotificationPackage']?.toString() ?? '',
        lastNotificationText: raw['lastNotificationText']?.toString() ?? '',
      );
    } catch (_) {
      return ListenerStatus(
        isPermissionGranted: false,
        isBatteryOptimizationIgnored: true,
        isListenerConnected: false,
      );
    }
  }

  /// Trigger an immediate heartbeat transmission
  static Future<bool> sendHeartbeatNow() async {
    bool nativeSuccess = false;
    if (!kIsWeb && Platform.isAndroid) {
      try {
        await _channel.invokeMethod('sendHeartbeatNow');
        nativeSuccess = true;
      } catch (_) {}
    }

    // Also send through Admin API client to ensure database state is updated
    try {
      await AdminApiClient.sendHeartbeat(
        phoneModel: Platform.isAndroid ? 'Android Companion' : 'Flutter Client',
      );
      return true;
    } catch (_) {
      return nativeSuccess;
    }
  }

  /// Initialize background loop and sync configuration from server
  static Future<void> startAutoHeartbeat() async {
    if (_initialized) return;
    _initialized = true;

    // 1. Fetch server listener configuration and sync with Android native preferences
    try {
      final config = await AdminApiClient.getListenerConfig();
      if (config.webhookSecret.isNotEmpty) {
        await syncConfig(
          baseUrl: config.serverUrl.isNotEmpty ? config.serverUrl : ApiConstants.baseUrl,
          webhookSecret: config.webhookSecret,
        );
      }
    } catch (_) {}

    // 2. Dispatch immediate startup heartbeat
    await sendHeartbeatNow();

    // 3. Keep 45s heartbeat timer running while app is active
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 45), (_) {
      sendHeartbeatNow();
    });
  }

  /// Stop heartbeat timer on logout
  static void stopAutoHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _initialized = false;
  }
}
