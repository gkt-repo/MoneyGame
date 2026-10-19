import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/services/display_mode_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('DisplayModeService Tests', () {
    test('force120Hz executes without errors on default test environment', () async {
      await expectLater(DisplayModeService.force120Hz(), completes);
    });

    test('getActiveRefreshRate returns null safely when not on Android device', () async {
      final rate = await DisplayModeService.getActiveRefreshRate();
      expect(rate, isNull);
    });
  });
}
