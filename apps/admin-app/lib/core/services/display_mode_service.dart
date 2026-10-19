import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_displaymode/flutter_displaymode.dart';

class DisplayModeService {
  const DisplayModeService._();

  /// Forces the device display refresh rate to 120 FPS / 120 Hz by default.
  ///
  /// On Android:
  /// - Queries supported display modes matching the active resolution.
  /// - Sets the preferred display mode to 120 Hz if supported.
  /// - If an exact 120 Hz mode is not available, falls back to the highest
  ///   available refresh rate mode on the device.
  ///
  /// On iOS / macOS / Web / Desktop:
  /// - iOS automatically enables ProMotion up to 120 Hz when
  ///   `CADisableMinimumFrameDurationOnPhone` is set to true in Info.plist.
  /// - No-op on platforms without programmatic display mode controls.
  static Future<void> force120Hz() async {
    if (kIsWeb || !Platform.isAndroid) {
      return;
    }

    try {
      final List<DisplayMode> modes = await FlutterDisplayMode.supported;
      if (modes.isEmpty) {
        return;
      }

      final DisplayMode active = await FlutterDisplayMode.active;

      // Filter modes with the same resolution as current active mode
      final List<DisplayMode> sameResolutionModes = modes.where((DisplayMode m) =>
        m.width == active.width && m.height == active.height,
      ).toList();

      final List<DisplayMode> candidates = sameResolutionModes.isNotEmpty
          ? sameResolutionModes
          : modes.where((DisplayMode m) => m != DisplayMode.auto).toList();

      if (candidates.isEmpty) {
        await FlutterDisplayMode.setHighRefreshRate();
        return;
      }

      // Look specifically for 120 Hz mode (~119.0 to 121.0 Hz)
      DisplayMode? targetMode;
      for (final DisplayMode mode in candidates) {
        if ((mode.refreshRate - 120.0).abs() <= 1.5) {
          targetMode = mode;
          break;
        }
      }

      // If no exact 120 Hz mode, select the highest available refresh rate
      if (targetMode == null) {
        candidates.sort((DisplayMode a, DisplayMode b) =>
            b.refreshRate.compareTo(a.refreshRate));
        targetMode = candidates.first;
      }

      await FlutterDisplayMode.setPreferredMode(targetMode);
    } catch (e) {
      debugPrint('DisplayModeService: Could not force 120Hz refresh rate: $e');
    }
  }

  /// Returns the currently active display refresh rate, or null if unsupported.
  static Future<double?> getActiveRefreshRate() async {
    if (kIsWeb || !Platform.isAndroid) return null;
    try {
      final DisplayMode active = await FlutterDisplayMode.active;
      return active.refreshRate;
    } catch (_) {
      return null;
    }
  }
}
