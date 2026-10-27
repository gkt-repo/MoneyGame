import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/network/api_client.dart';
import 'package:moneygame_user/core/network/socket_service.dart';
import 'package:moneygame_user/screens/home_screen.dart';
import 'package:moneygame_user/screens/lobby/games_stage.dart';
import 'package:moneygame_user/screens/profile/personal_profile_screen.dart';

void main() {
  testWidgets('Game pills fit a small phone with larger text', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 568));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    String? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Scaffold(
            body: GamesStage(
              selected: 'TWENTY_NINE',
              onSelect: (value) => selected = value,
              onCreate: () {},
              onJoin: () {},
              onOpenTrading: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('Teen Patti'));
    await tester.tap(find.text('Teen Patti'));
    expect(selected, 'TEEN_PATTI');
  });

  testWidgets(
    'Home has two tabs, game pills, and one profile action leading to wallet controls',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() {
        SocketService.disconnect();
        tester.binding.setSurfaceSize(null);
      });
      if (Platform.environment['MONEYGAME_PREVIEW_FONT']
          case final String path) {
        await tester.runAsync(() async {
          final fonts = FontLoader('Roboto')
            ..addFont(File(path).readAsBytes().then(ByteData.sublistView));
          await fonts.load();
          final icons = FontLoader('MaterialIcons')
            ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
          await icons.load();
        });
      }
      final boundary = GlobalKey();
      final user = UserProfileModel.fromJson({
        'id': 'profile-user',
        'username': 'Alex',
        'email': 'alex@example.test',
        'wallet': {'balance': 123.45, 'lockedBalance': 20},
      });
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: ThemeData(fontFamily: 'Roboto'),
            home: HomeScreen(user: user, onLogout: () {}),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Join Tables'), findsOneWidget);
      expect(find.text('Games'), findsOneWidget);
      expect(tester.widget<AppBar>(find.byType(AppBar)).actions!.length, 1);
      await tester.tap(find.text('Games'));
      await tester.pumpAndSettle();
      expect(find.text('Create room'), findsOneWidget);
      expect(find.text('Join room'), findsOneWidget);
      await tester.tap(find.text('Teen Patti'));
      await tester.pumpAndSettle();
      expect(find.text('Read the table. Play your hand.'), findsOneWidget);
      if (Platform.environment['MONEYGAME_PREVIEW'] == '1') {
        await tester.runAsync(() async {
          final image =
              await (boundary.currentContext!.findRenderObject()
                      as RenderRepaintBoundary)
                  .toImage(pixelRatio: 2);
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await File(
            '/tmp/moneygame-games-preview.png',
          ).writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }
      await tester.tap(find.text('Dice Guess'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Create room'));
      await tester.pumpAndSettle();
      final selectedStakes = tester
          .widgetList<ChoiceChip>(find.byType(ChoiceChip))
          .where((chip) => chip.selected);
      expect(
        selectedStakes.any(
          (chip) => chip.label is Text && (chip.label as Text).data == '₹50',
        ),
        isTrue,
      );
      Navigator.of(tester.element(find.byType(BottomSheet))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('My profile'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.text('My profile'), findsOneWidget);
      expect(find.text('₹123.45'), findsOneWidget);
      expect(find.text('Deposit'), findsOneWidget);
      expect(find.text('Withdraw'), findsOneWidget);
      expect(find.text('Transaction history'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      SocketService.disconnect();
      await tester.pump(const Duration(seconds: 1));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'History keeps earlier rows and loads every page with the returned cursor',
    (tester) async {
      final requested = <String?>[];
      TransactionModel row(String id) => TransactionModel(
        id: id,
        userId: 'u',
        amount: 10,
        type: 'DEPOSIT',
        description: 'Deposit $id',
        createdAt: DateTime(2026),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: TransactionHistoryScreen(
            loadPage: ({String? cursor}) async {
              requested.add(cursor);
              return cursor == null
                  ? (items: [row('first')], nextCursor: 'next')
                  : (items: [row('last')], nextCursor: null);
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Deposit first'), findsOneWidget);
      await tester.tap(find.text('Load older transactions'));
      await tester.pumpAndSettle();
      expect(requested, [null, 'next']);
      expect(find.text('Deposit first'), findsOneWidget);
      expect(find.text('Deposit last'), findsOneWidget);
      expect(find.text('Load older transactions'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
