import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'colors.dart';

extension AppThemeContext on BuildContext {
  AppPalette get palette => AppPalette(Theme.of(this).brightness);
}

class AppPalette {
  final Brightness brightness;
  const AppPalette(this.brightness);
  bool get isDark => brightness == Brightness.dark;
  Color get canvas => isDark ? const Color(0xFF242428) : AppColors.canvas;
  Color get surface => isDark ? const Color(0xFF303035) : Colors.white;
  Color get elevated => isDark ? const Color(0xFF3A3A42) : AppColors.slate100;
  Color get ink => isDark ? const Color(0xFFF3F1F8) : AppColors.ink;
  Color get muted => isDark ? const Color(0xFFB6B3C1) : AppColors.muted;
  Color get outline => isDark ? const Color(0xFF4B4854) : AppColors.outline;
  Color get accent => isDark ? const Color(0xFF6EE7B7) : AppColors.emerald700;
  Color get selected => isDark ? const Color(0xFF163E2E) : AppColors.emerald50;

  /// Brings older screens' explicit colors into the shared palette.
  Color adapt(Color light) {
    final value = light.toARGB32();
    if (const {
      0xFFF3F0FC,
      0xFFF5F7F6,
      0xFFF8FAFC,
      0xFFF5F5F5,
    }.contains(value)) {
      return canvas;
    }
    if (!isDark) return light;
    switch (value) {
      case 0xFFFFFFFF:
        return surface;
      case 0xFFF1F5F9:
        return elevated;
      case 0xFFDCE4DF:
      case 0xFFE2E8F0:
      case 0xFFCBD5E1:
        return outline;
      case 0xFF000000:
      case 0xFF020617:
      case 0xFF0F172A:
      case 0xFF1B2422:
      case 0xFF1E293B:
      case 0xFF252525:
      case 0xFF334155:
        return ink;
      case 0xFF475569:
      case 0xFF61716A:
      case 0xFF64748B:
      case 0xFF94A3B8:
      case 0x8A000000:
      case 0x73000000:
      case 0x61000000:
        return muted;
    }
    final hsl = HSLColor.fromColor(light);
    if (hsl.lightness > .8) {
      return Color.lerp(surface, light, .1)!;
    }
    if (hsl.lightness < .5 && hsl.saturation > .25) {
      return hsl.withLightness(.72).toColor();
    }
    return light;
  }
}

class AppTheme {
  static final _buttonTextStyle = Typography.material2021().black.labelLarge!
      .copyWith(fontSize: 14, fontWeight: FontWeight.w600);

  static ThemeData get light => ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: const AppPalette(Brightness.light).canvas,
    colorScheme: const ColorScheme.light(
      primary: AppColors.emerald600,
      onPrimary: AppColors.white,
      secondary: AppColors.slate800,
      onSecondary: AppColors.white,
      surface: AppColors.white,
      onSurface: AppColors.slate900,
      error: AppColors.red600,
      onError: AppColors.white,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      iconTheme: IconThemeData(color: AppColors.slate900),
      titleTextStyle: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: AppColors.slate900,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.emerald600,
        foregroundColor: AppColors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: _buttonTextStyle.copyWith(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.slate900,
        side: const BorderSide(color: AppColors.slate200),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: _buttonTextStyle,
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.slate200),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.slate200,
      thickness: 1,
      space: 1,
    ),
  );

  static ThemeData get dark {
    const palette = AppPalette(Brightness.dark);
    final scheme =
        ColorScheme.fromSeed(
          seedColor: AppColors.emerald600,
          brightness: Brightness.dark,
        ).copyWith(
          surface: palette.surface,
          onSurface: palette.ink,
          primary: palette.accent,
          onPrimary: const Color(0xFF073B28),
          outline: palette.outline,
        );
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: palette.canvas,
      appBarTheme: AppBarTheme(
        backgroundColor: palette.canvas,
        foregroundColor: palette.ink,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.light,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.emerald700,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: _buttonTextStyle,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: palette.ink,
          side: BorderSide(color: palette.outline),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: _buttonTextStyle,
        ),
      ),
      cardTheme: CardThemeData(color: palette.surface, elevation: 0),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: palette.surface,
        modalBackgroundColor: palette.surface,
      ),
      dialogTheme: DialogThemeData(backgroundColor: palette.surface),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: palette.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: palette.outline),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: palette.surface,
        indicatorColor: palette.selected,
      ),
      dividerColor: palette.outline,
    );
  }
}
