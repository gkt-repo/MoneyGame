import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/network/api_client.dart';
import 'package:moneygame_user/screens/game/seep/seep_table_screen.dart';

Map<String, dynamic> card(int rank) => {
  'id': 'SPADES-$rank',
  'rank': rank,
  'suit': 'SPADES',
  'label': '$rank',
};
Map<String, dynamic> state({int count = 2, String phase = 'PLAYING'}) => {
  'roomId': 'seep-table',
  'sequence': 3,
  'phase': phase,
  'maxPlayers': count,
  'currentTurnUserId': 'p0',
  'turnExpiresAt': DateTime.now().millisecondsSinceEpoch + 30000,
  'dealNumber': 1,
  'stockCount': count == 2 ? 24 : 0,
  'bid': 9,
  'bidOptions': [9, 10],
  'teams': List.generate(
    2,
    (_) => {'points': 0, 'cardPoints': 0, 'sweepPoints': 0},
  ),
  'players': {
    for (var i = 0; i < count; i++)
      'p$i': {
        'userId': 'p$i',
        'username': 'Player $i',
        'seatIndex': i,
        'teamIndex': i % 2,
        'cardCount': i == 0 ? 4 : 12,
        if (i == 0) 'cards': [card(4), card(9), card(10), card(12)],
      },
  },
  'floor': phase == 'BIDDING'
      ? []
      : [
          {
            'id': 'floor-5',
            'isHouse': false,
            'cards': [card(5)],
            'value': 5,
          },
          {
            'id': 'house-12',
            'isHouse': true,
            'value': 12,
            'cemented': true,
            'cards': [card(6), card(6)],
            'owners': ['p1'],
          },
        ],
  'legalMoves': [
    {
      'id': 'capture-9',
      'cardId': 'SPADES-9',
      'type': 'CAPTURE',
      'label': 'Capture 1 cards',
      'floorIds': ['floor-5'],
    },
  ],
};

RoomModel room(Map<String, dynamic> game) => RoomModel(
  id: 'seep-table',
  roomCode: 'R-SEEP',
  gameType: 'SEEP',
  entryFee: 25,
  maxPlayers: game['maxPlayers'] as int,
  status: 'PLAYING',
  players: [],
  gameState: game,
);
final user = UserProfileModel(
  id: 'p0',
  username: 'Player 0',
  role: 'USER',
  status: 'ACTIVE',
);

void main() {
  for (final count in [2, 4]) {
    testWidgets(
      '$count player table renders on a small phone and submits a sequenced legal move',
      (tester) async {
        tester.view.physicalSize = const Size(360, 780);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final game = state(count: count);
        Map<String, dynamic>? sent;
        await tester.pumpWidget(
          MaterialApp(
            home: SeepTableScreen(
              roomId: 'seep-table',
              user: user,
              onBalanceRefresh: () {},
              loadRoom: (_) async => room(game),
              submitAction: (_, action, payload) async {
                expect(action, 'PLAY_MOVE');
                sent = payload;
              },
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 700));
        expect(find.text('Your side'), findsOneWidget);
        expect(
          find.text(
            count == 4 ? 'PARTNERSHIP · OPPOSITE SEATS' : 'HEAD TO HEAD',
          ),
          findsOneWidget,
        );
        expect(
          find.text('Your turn · choose a card, then a move'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(find.bySemanticsLabel('9 of SPADES'));
        await tester.tap(find.bySemanticsLabel('9 of SPADES'));
        await tester.pump(const Duration(milliseconds: 250));
        await tester.ensureVisible(find.text('Capture 1 cards'));
        await tester.tap(find.text('Capture 1 cards'));
        await tester.pump();
        await tester.ensureVisible(find.text('Play · Capture 1 cards'));
        await tester.tap(find.text('Play · Capture 1 cards'));
        await tester.pump();
        expect(sent?['expectedSequence'], 3);
        expect(sent?['moveId'], 'capture-9');
        expect(sent?['actionId'], startsWith('p0-'));
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('bid options and rules are available with reduced motion', (
    tester,
  ) async {
    final game = state(phase: 'BIDDING');
    Map<String, dynamic>? sent;
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: SeepTableScreen(
            roomId: 'seep-table',
            user: user,
            onBalanceRefresh: () {},
            loadRoom: (_) async => room(game),
            submitAction: (_, action, payload) async {
              expect(action, 'BID');
              sent = payload;
            },
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.ensureVisible(find.text('Bid 9'));
    await tester.tap(find.text('Bid 9'));
    await tester.pump();
    expect(sent?['bid'], 9);
    await tester.tap(find.byTooltip('Seep rules'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('How to play Seep'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
