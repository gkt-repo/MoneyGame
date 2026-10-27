import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/network/api_client.dart';
import 'package:moneygame_user/core/network/socket_service.dart';
import 'package:moneygame_user/core/services/room_invitations.dart';
import 'package:moneygame_user/main.dart';
import 'package:moneygame_user/screens/auth/auth_screen.dart';

Future<void> pushLink(WidgetTester tester, String link) =>
    tester.binding.defaultBinaryMessenger.handlePlatformMessage('flutter/navigation',
      const JSONMethodCodec().encodeMethodCall(MethodCall('pushRouteInformation', {'location': link})), (_) {});

void main() {
  test('shared room links preserve the code and reject foreign or malformed targets', () {
    const code = 'R-A1234567';
    expect(RoomInvitations.link(code), 'https://mgame-1.web.app/join/$code');
    for (final link in [RoomInvitations.link(code), '/join/$code', 'moneygame://join/$code']) {
      expect(RoomInvitations.targetFromLink(link), code);
    }
    expect(RoomInvitations.targetFromLink('/join/inv_Abcd1234'), 'inv_Abcd1234');
    for (final link in ['https://evil.test/join/$code', '//evil.test/join/$code',
      'https://mgame-1.web.app.evil.test/join/$code', '/join/a%2Fb', '/join/',
      '/join/$code/extra', 'https://user@mgame-1.web.app/join/$code',
      'https://mgame-1.web.app:444/join/$code']) {
      expect(RoomInvitations.targetFromLink(link), isNull, reason: link);
    }
  });

  for (final coldStart in [true, false]) {
    testWidgets('${coldStart ? 'cold' : 'warm'} invitation survives login and prefills the join sheet', (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      await tester.binding.setSurfaceSize(const Size(430, 932));
      tester.binding.platformDispatcher.defaultRouteNameTestValue = coldStart
          ? 'https://mgame-1.web.app/join/R-12345678' : '/';
      addTearDown(() {
        SocketService.disconnect();
        tester.binding.platformDispatcher.clearDefaultRouteNameTestValue();
        tester.binding.setSurfaceSize(null);
      });
      await tester.pumpWidget(const MoneyGameUserApp());
      await tester.pumpAndSettle();
      if (!coldStart) {
        await pushLink(tester, 'moneygame://join/R-12345678');
        await tester.pump();
      }
      expect(find.byType(AuthScreen), findsOneWidget);
      // Opening an invitation must not bypass login or submit a paid join.
      expect(find.text('R-12345678'), findsNothing);
      tester.widget<AuthScreen>(find.byType(AuthScreen)).onAuthSuccess(
        UserProfileModel.fromJson({'id': 'link-user', 'username': 'Link user'}),
      );
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.byWidgetPredicate((widget) => widget is EditableText &&
          widget.controller.text == 'R-12345678'), findsOneWidget);
      // A second link while logged in replaces the old preview, not the session.
      await pushLink(tester, 'https://mgame-1.web.app/join/R-87654321');
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.byWidgetPredicate((widget) => widget is EditableText &&
          widget.controller.text == 'R-87654321'), findsOneWidget);
      expect(find.byType(AuthScreen), findsNothing);
      await tester.pumpWidget(const SizedBox());
      SocketService.disconnect();
      await tester.pump(const Duration(seconds: 1));
      expect(tester.takeException(), isNull);
    });
  }
}
