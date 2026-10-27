import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/network/api_client.dart';
import 'package:moneygame_user/screens/game/widgets/card_waiting_hall.dart';

RoomModel room({
  String gameType = 'TEEN_PATTI',
  int capacity = 6,
  int players = 2,
  String status = 'WAITING',
  int? countdown,
}) {
  return RoomModel.fromJson({
    'id': 'table-1',
    'roomCode': 'ABC123',
    'gameType': gameType,
    'entryFee': 10,
    'maxPlayers': capacity,
    'status': status,
    'countdown': countdown,
    'players': List.generate(
      players,
      (i) => {
        'id': 'seat-$i',
        'userId': 'user-$i',
        'seatIndex': i,
        'user': {'username': 'Player $i', 'displayName': 'Player $i'},
      },
    ),
  });
}

Future<void> showHall(WidgetTester tester, RoomModel room) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: CardWaitingHall(room: room, userId: 'user-0'),
      ),
    ),
  );
}

void main() {
  testWidgets(
    'Teen Patti waits for the configured capacity and identifies joined players',
    (tester) async {
      await showHall(tester, room());
      expect(find.text('Waiting hall'), findsOneWidget);
      expect(find.text('Waiting for 4 more players'), findsOneWidget);
      expect(find.text('Player 0 (You)'), findsOneWidget);
      expect(find.text('Waiting for player…'), findsNWidgets(4));
      expect(find.text('2 / 6 players  ·  ₹10 boot'), findsOneWidget);
      expect(
        find.text(
          'Once every seat is filled, a 5-second countdown will begin.',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    '29 shows four seats, teams, and the server countdown on a narrow phone',
    (tester) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await showHall(
        tester,
        room(gameType: 'TWENTY_NINE', capacity: 4, players: 3),
      );
      expect(find.text('Waiting for 1 more player'), findsOneWidget);
      expect(find.text('Seat 1 · Team A'), findsOneWidget);
      expect(find.text('Seat 2 · Team B'), findsOneWidget);
      for (final seconds in [5, 4, 3, 2, 1, 0]) {
        await showHall(
          tester,
          room(
            gameType: 'TWENTY_NINE',
            capacity: 4,
            players: 4,
            status: 'COUNTDOWN',
            countdown: seconds,
          ),
        );
        expect(find.text('Waiting for player…'), findsNothing);
        if (seconds > 0) {
          expect(find.text('$seconds'), findsOneWidget);
          expect(find.text('All players are here!'), findsOneWidget);
        } else {
          expect(find.text('Opening match board…'), findsOneWidget);
        }
        expect(tester.takeException(), isNull);
      }
    },
  );

  testWidgets('Cancellation shows the refund outcome instead of a countdown', (
    tester,
  ) async {
    await showHall(tester, room(status: 'CANCELLED'));
    expect(find.text('Table cancelled'), findsOneWidget);
    expect(
      find.text('Entries have been refunded. You can return to the tables.'),
      findsOneWidget,
    );
    expect(find.text('All players are here!'), findsNothing);
  });
}
