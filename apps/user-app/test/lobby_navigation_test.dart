import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/network/api_client.dart';
import 'package:moneygame_user/screens/lobby/games_stage.dart';
import 'package:moneygame_user/screens/lobby/lobby_screen.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('Twenty-five games scroll independently of the room actions', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final games = <LobbyGame>[
      ...roomGames,
      for (var i = 1; i <= 20; i++)
        (
          id: 'EXTRA_$i',
          name: 'Game $i',
          subtitle: 'Additional game $i',
          icon: Icons.sports_esports_outlined,
        ),
    ];
    var selected = 'TWENTY_NINE';
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => GamesStage(
              selected: selected,
              games: games,
              onSelect: (game) => update(() => selected = game),
              onCreate: () {},
              onJoin: () {},
              onOpenTrading: () {},
            ),
          ),
        ),
      ),
    );
    final actions = find.byKey(const ValueKey('game-actions'));
    final stackCard = find.byKey(const ValueKey('game-tile-TEEN_PATTI'));
    expect(tester.getSize(stackCard).height, lessThan(80));
    expect(
      tester.getSize(stackCard).width,
      greaterThan(tester.getSize(actions).width),
    );
    final originalPosition = tester.getTopLeft(actions);
    final scrollable = find.descendant(
      of: find.byKey(const PageStorageKey('game-stack')),
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      find.text('Game 20'),
      350,
      scrollable: scrollable,
    );
    await tester.pumpAndSettle();
    await Scrollable.ensureVisible(
      tester.element(find.text('Game 20')),
      alignment: .5,
    );
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(actions), originalPosition);
    expect(find.text('Create room').hitTestable(), findsOneWidget);
    await tester.tap(find.text('Game 20'));
    await tester.pumpAndSettle();
    expect(selected, 'EXTRA_20');
    expect(find.text('Additional game 20'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  final user = UserProfileModel.fromJson({'id': 'me', 'username': 'Alex'});
  RoomModel room(String code, String game, {int? mySeat}) =>
      RoomModel.fromJson({
        'id': code,
        'roomCode': code,
        'gameType': game,
        'entryFee': 10,
        'maxPlayers': 4,
        'status': 'WAITING',
        'players': [
          {
            'id': '$code-host',
            'userId': mySeat == 0 ? 'me' : 'other',
            'seatIndex': 0,
            'user': {'username': 'Host'},
          },
          if (mySeat != null && mySeat != 0)
            {
              'id': '$code-member',
              'userId': 'me',
              'seatIndex': mySeat,
              'user': {'username': 'Alex'},
            },
        ],
      });
  final rooms = [
    room('CREATED', 'TWENTY_NINE', mySeat: 0),
    room('JOINED', 'TEEN_PATTI', mySeat: 1),
    room('PUBLIC', 'GUESS_NUMBER'),
  ];

  testWidgets('My Table separates joined and created tables across games', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LobbyScreen(
          user: user,
          onBalanceRefresh: () {},
          section: LobbySection.myTable,
          loadRooms: () async => rooms,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Joined'), findsOneWidget);
    expect(find.text('Created'), findsOneWidget);
    expect(find.text('#JOINED'), findsOneWidget);
    expect(find.text('#CREATED'), findsNothing);
    expect(find.text('#PUBLIC'), findsNothing);
    await tester.tap(find.text('Created'));
    await tester.pumpAndSettle();
    expect(find.text('#CREATED'), findsOneWidget);
    expect(find.text('#JOINED'), findsNothing);
    expect(find.text('#PUBLIC'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('Join Tables uses an arrow selector without a My Table section', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LobbyScreen(
          user: user,
          onBalanceRefresh: () {},
          loadRooms: () async => rooms,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('YOUR TABLE'), findsNothing);
    expect(find.text('Resume Active Table'), findsNothing);
    expect(find.text('Joined'), findsNothing);
    expect(find.text('Created'), findsNothing);
    expect(find.text('#CREATED'), findsOneWidget);
    expect(find.text('#JOINED'), findsNothing);
    await tester.tap(find.byIcon(Icons.keyboard_arrow_down_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Teen Patti').last);
    await tester.pumpAndSettle();
    expect(find.text('#JOINED'), findsOneWidget);
    expect(find.text('#CREATED'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });
}
