import 'package:audioplayers/audioplayers.dart';

class TeenPattiAudioService {
  static final TeenPattiAudioService _instance = TeenPattiAudioService._internal();
  factory TeenPattiAudioService() => _instance;
  TeenPattiAudioService._internal();

  bool enabled = true;
  final AudioPlayer _sfxPlayer = AudioPlayer();

  Future<void> init() async {
    try {
      await _sfxPlayer.setPlayerMode(PlayerMode.lowLatency);
    } catch (_) {}
  }

  void toggleSound() {
    enabled = !enabled;
  }

  Future<void> playCardDeal() async {
    if (!enabled) return;
    try {
      await _sfxPlayer.stop();
      await _sfxPlayer.play(AssetSource('game/teen_patti/audio/card_deal.mp3'), volume: 0.85);
    } catch (_) {}
  }

  Future<void> playCardFlip() async {
    if (!enabled) return;
    try {
      await _sfxPlayer.stop();
      await _sfxPlayer.play(AssetSource('game/teen_patti/audio/card_flip.mp3'), volume: 1.0);
    } catch (_) {}
  }

  Future<void> playChipToss() async {
    if (!enabled) return;
    try {
      await _sfxPlayer.stop();
      await _sfxPlayer.play(AssetSource('game/teen_patti/audio/chip_toss.mp3'), volume: 0.9);
    } catch (_) {}
  }

  Future<void> playTimerTick() async {
    if (!enabled) return;
    try {
      await _sfxPlayer.stop();
      await _sfxPlayer.play(AssetSource('game/teen_patti/audio/timer_tick.mp3'), volume: 0.6);
    } catch (_) {}
  }

  Future<void> playFold() async {
    if (!enabled) return;
    try {
      await _sfxPlayer.stop();
      await _sfxPlayer.play(AssetSource('game/teen_patti/audio/fold.mp3'), volume: 0.8);
    } catch (_) {}
  }

  Future<void> playWin() async {
    if (!enabled) return;
    try {
      await _sfxPlayer.stop();
      await _sfxPlayer.play(AssetSource('game/teen_patti/audio/win.mp3'), volume: 1.0);
    } catch (_) {}
  }

  void dispose() {
    try {
      _sfxPlayer.dispose();
    } catch (_) {}
  }
}
