import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/screens/lobby/lobby_screen.dart';

void main() {
  group('formatMatchDateTime timezone tests', () {
    test('handles null or invalid strings gracefully', () {
      expect(formatMatchDateTime(null), 'Upcoming');
      expect(formatMatchDateTime(''), 'Upcoming');
      expect(formatMatchDateTime('not-a-date'), 'Upcoming');
    });

    test('converts UTC time string to local device time', () {
      // Create a UTC time that corresponds to today
      final nowLocal = DateTime.now();
      // Suppose local time is today at 19:00:00
      final testTimeLocal = DateTime(nowLocal.year, nowLocal.month, nowLocal.day, 19, 0);
      final testTimeUtc = testTimeLocal.toUtc();
      final isoString = testTimeUtc.toIso8601String();

      final formatted = formatMatchDateTime(isoString);
      expect(formatted, 'Today, 19:00');
    });

    test('handles day rollover between UTC and local timezone correctly', () {
      final nowLocal = DateTime.now();
      final futureDateLocal = DateTime(nowLocal.year, 10, 24, 3, 0);
      final futureDateUtc = futureDateLocal.toUtc();
      final isoString = futureDateUtc.toIso8601String();

      final formatted = formatMatchDateTime(isoString);
      // In local time, this is 24 Oct, 03:00 (even though in UTC it may be 23 Oct, 21:30)
      final expectedHour = futureDateLocal.hour.toString().padLeft(2, '0');
      final expectedMinute = futureDateLocal.minute.toString().padLeft(2, '0');
      expect(formatted, contains('${futureDateLocal.day} Oct, $expectedHour:$expectedMinute'));
    });

    test('formats tomorrow correctly in local time', () {
      final nowLocal = DateTime.now();
      final tomorrowLocal = DateTime(nowLocal.year, nowLocal.month, nowLocal.day + 1, 14, 30);
      final tomorrowUtc = tomorrowLocal.toUtc();
      final isoString = tomorrowUtc.toIso8601String();

      final formatted = formatMatchDateTime(isoString);
      expect(formatted, 'Tomorrow, 14:30');
    });
  });
}
