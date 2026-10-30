import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/constants/app_theme.dart';
import 'package:moneygame_user/core/network/api_client.dart';
import 'package:moneygame_user/core/network/socket_service.dart';
import 'package:moneygame_user/core/services/theme_preferences.dart';
import 'package:moneygame_user/core/storage/secure_storage_service.dart';
import 'package:moneygame_user/main.dart';
import 'package:moneygame_user/screens/home_screen.dart';
import 'package:moneygame_user/screens/profile/personal_profile_screen.dart';

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    ThemePreferences.instance.value = ThemeMode.light;
  });

  test('Appearance is restored and survives logout', () async {
    final preferences = ThemePreferences();
    final restored = ThemePreferences();
    addTearDown(preferences.dispose);
    addTearDown(restored.dispose);
    await preferences.setDarkMode(true);
    await SecureStorageService.clearSession();
    await restored.load();
    expect(restored.value, ThemeMode.dark);
    await preferences.setDarkMode(false);
    await restored.load();
    expect(restored.value, ThemeMode.light);
  });

  testWidgets('The app applies dark mode to the root theme', (tester) async {
    await tester.pumpWidget(const MoneyGameUserApp());
    await tester.pumpAndSettle();
    await ThemePreferences.instance.setDarkMode(true);
    await tester.pumpAndSettle();
    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.themeMode, ThemeMode.dark);
    expect(app.darkTheme!.brightness, Brightness.dark);
    await ThemePreferences.instance.setDarkMode(false);
    await tester.pumpAndSettle();
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
      ThemeMode.light,
    );
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    ThemePreferences.instance.value = ThemeMode.light;
    expect(tester.takeException(), isNull);
  });

  testWidgets('Profile toggle updates the profile and home immediately', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() {
      SocketService.disconnect();
      ThemePreferences.instance.value = ThemeMode.light;
      tester.binding.setSurfaceSize(null);
    });
    final user = UserProfileModel.fromJson({
      'id': 'appearance-user',
      'username': 'Alex',
      'wallet': {'balance': 123.45},
    });
    if (Platform.environment['MONEYGAME_PREVIEW_FONT'] case final String path) {
      await tester.runAsync(() async {
        await (FontLoader(
          'Roboto',
        )..addFont(File(path).readAsBytes().then(ByteData.sublistView))).load();
        await (FontLoader(
          'MaterialIcons',
        )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      });
    }
    final boundary = GlobalKey();
    Future<void> capture(String name) async {
      if (Platform.environment['MONEYGAME_PREVIEW'] != '1') return;
      await tester.runAsync(() async {
        final image =
            await (boundary.currentContext!.findRenderObject()
                    as RenderRepaintBoundary)
                .toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File(
          '/tmp/moneygame-$name-preview.png',
        ).writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }

    await tester.pumpWidget(
      RepaintBoundary(
        key: boundary,
        child: ValueListenableBuilder<ThemeMode>(
          valueListenable: ThemePreferences.instance,
          builder: (context, mode, child) => MaterialApp(
            themeMode: mode,
            theme: AppTheme.light,
            darkTheme: AppTheme.dark,
            home: HomeScreen(user: user, onLogout: () {}),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('My profile'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Dark mode'));
    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    expect(ThemePreferences.instance.value, ThemeMode.dark);
    expect(
      tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
      isTrue,
    );
    expect(
      Theme.of(tester.element(find.byType(PersonalProfileScreen))).brightness,
      Brightness.dark,
    );
    final profileScaffold = tester.widget<Scaffold>(
      find.descendant(
        of: find.byType(PersonalProfileScreen),
        matching: find.byType(Scaffold),
      ),
    );
    expect(
      profileScaffold.backgroundColor,
      const AppPalette(Brightness.dark).surface,
    );
    await capture('profile-dark');
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(
      tester.widget<Scaffold>(find.byType(Scaffold)).backgroundColor,
      const AppPalette(Brightness.dark).canvas,
    );
    await capture('games-dark');
    await tester.tap(find.text('Join Tables'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
