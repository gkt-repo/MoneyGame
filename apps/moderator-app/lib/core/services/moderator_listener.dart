import 'dart:io';
import 'package:flutter/services.dart';
import '../network/moderator_api.dart';

class ModeratorListener {
  static const channel = MethodChannel('com.moneygame.moderator/listener');
  static Future<Map<String, dynamic>> status() async {
    if (!Platform.isAndroid) return {};
    return Map<String, dynamic>.from(
      await channel.invokeMethod('getListenerStatus') ?? {},
    );
  }

  static Future<void> connect() async {
    if (!Platform.isAndroid) return;
    final config = await ModeratorApi.request('/admin/listener-config');
    await channel.invokeMethod('saveConfig', {
      'baseUrl': ModeratorApi.baseUrl,
      'webhookSecret': config['webhookSecret'],
      'accountId': config['account']['id'],
    });
    await channel.invokeMethod('sendHeartbeatNow');
  }

  static Future<void> stop() async {
    if (Platform.isAndroid) await channel.invokeMethod('clearConfig');
  }

  static Future<void> permission() =>
      channel.invokeMethod('openPermissionSettings');
  static Future<void> battery() =>
      channel.invokeMethod('requestIgnoreBatteryOptimization');
}
