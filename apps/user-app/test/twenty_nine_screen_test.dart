import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/core/network/api_client.dart';
import 'package:moneygame_user/core/services/room_invitations.dart';
import 'package:moneygame_user/screens/game/twenty_nine/twenty_nine_table_screen.dart';

void main() {
  testWidgets('29 renders distinct team scores and sends server-legal discards with the action sequence', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 932));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final user = UserProfileModel.fromJson({'id': 'p0', 'username': 'Me'});
    final hand = [
      {'suit': 'HEARTS', 'rank': 11, 'label': 'J'},
      {'suit': 'CLUBS', 'rank': 7, 'label': '7'},
    ];
    final state = <String, dynamic>{
      'roomId': 'room', 'sequence': 12, 'phase': 'PLAYING', 'rulesVersion': 'single-deal-v1',
      'currentTurnUserId': 'p0', 'contractorUserId': 'p0', 'contract': 16,
      'isTrumpRevealed': true, 'trumpSuit': 'HEARTS', 'trumpRevealedByUserId': 'p1',
      'team0Points': 10, 'team1Points': 18,
      'currentTrick': {'trickIndex': 2, 'leadSuit': 'SPADES', 'cards': [], 'points': 0},
      'players': {for (var i = 0; i < 4; i++) 'p$i': {
        'userId': 'p$i', 'seatIndex': i, 'teamIndex': i % 2,
        'cardCount': 2, if (i == 0) 'cards': hand, if (i == 0) 'legalCards': hand,
      }},
    };
    final room = RoomModel.fromJson({
      'id': 'room', 'roomCode': 'R-KEEP', 'gameType': 'TWENTY_NINE', 'entryFee': 1.02,
      'status': 'PLAYING', 'maxPlayers': 4, 'gameState': state,
      'players': [for (var i = 0; i < 4; i++) {'id': 'seat$i', 'userId': 'p$i', 'seatIndex': i, 'user': {'username': 'Player $i'}}],
    });
    Map<String, dynamic>? sent;
    await tester.pumpWidget(MaterialApp(home: TwentyNineTableScreen(roomId: 'room', user: user,
      onBalanceRefresh: () {}, loadRoom: (_) async => room,
      submitAction: (id, action, data) async { expect(action, 'PLAY_CARD'); sent = data; },
    )));
    await tester.pumpAndSettle();
    expect(find.text('10 pts'), findsOneWidget);
    expect(find.text('18 pts'), findsOneWidget);
    expect(find.text('#R-KEEP'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('29-card-CLUBS-7')));
    await tester.pump();
    expect(sent?['expectedSequence'], 12);
    expect(sent?['actionId'], isNotEmpty);
    expect(sent?['card'], {'suit': 'CLUBS', 'rank': 7, 'label': '7'});
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  test('development share text points to the website and gives login/code instructions', () {
    expect(RoomInvitations.message('R-123'), contains('https://mgame-1.web.app'));
    expect(RoomInvitations.message('R-123'), contains('Log in'));
    expect(RoomInvitations.message('R-123'), contains('R-123'));
    expect(RoomInvitations.message('R-123'), isNot(contains('.apk')));
  });
}
