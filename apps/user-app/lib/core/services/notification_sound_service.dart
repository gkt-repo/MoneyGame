import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';

class NotificationSoundService {
  static final NotificationSoundService _instance = NotificationSoundService._internal();
  factory NotificationSoundService() => _instance;
  NotificationSoundService._internal();

  AudioPlayer? _player;
  bool _initialized = false;

  Future<void> _init() async {
    if (_initialized) return;
    try {
      _player = AudioPlayer();
      await _player?.setPlayerMode(PlayerMode.lowLatency);
      _initialized = true;
    } catch (_) {}
  }

  /// Triggers phone notification ring, chime audio, and haptic feedback
  Future<void> playNotificationRing() async {
    try {
      // 1. Device hardware alert sound and vibration
      await SystemSound.play(SystemSoundType.alert);
      await HapticFeedback.heavyImpact();
    } catch (_) {}

    try {
      // 2. Play custom harmonic notification chime
      await _init();
      if (_player != null) {
        await _player!.stop();
        await _player!.play(
          AssetSource('audio/notification_chime.wav'),
          volume: 1.0,
        );
      }
    } catch (_) {
      // Graceful fallback if audio asset cannot be decoded
    }
  }

  void dispose() {
    _player?.dispose();
    _player = null;
    _initialized = false;
  }
}
