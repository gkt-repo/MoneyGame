import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/models/twenty_nine_models.dart';

void main() {
  group('Twenty Nine Card Models Test', () {
    test('PlayingCardModel parses correctly and computes points', () {
      final jack = PlayingCardModel(suit: CardSuit.SPADES, rank: CardRank.JACK);
      expect(jack.points, 3);
      expect(jack.isRed, false);
      expect(jack.suitSymbol, '♠');
      expect(jack.rankLabel, 'J');

      final nine = PlayingCardModel(suit: CardSuit.HEARTS, rank: CardRank.NINE);
      expect(nine.points, 2);
      expect(nine.isRed, true);
      expect(nine.suitSymbol, '♥');
      expect(nine.rankLabel, '9');

      final ace = PlayingCardModel(suit: CardSuit.DIAMONDS, rank: CardRank.ACE);
      expect(ace.points, 1);
      expect(ace.isRed, true);
      expect(ace.rankLabel, 'A');

      final ten = PlayingCardModel(suit: CardSuit.CLUBS, rank: CardRank.TEN);
      expect(ten.points, 1);
      expect(ten.isRed, false);
      expect(ten.rankLabel, '10');

      final king = PlayingCardModel(suit: CardSuit.SPADES, rank: CardRank.KING);
      expect(king.points, 0);
      expect(king.rankLabel, 'K');

      final queen = PlayingCardModel(suit: CardSuit.SPADES, rank: CardRank.QUEEN);
      expect(queen.points, 0);
      expect(queen.rankLabel, 'Q');

      final eight = PlayingCardModel(suit: CardSuit.SPADES, rank: CardRank.EIGHT);
      expect(eight.points, 0);
      expect(eight.rankLabel, '8');

      final seven = PlayingCardModel(suit: CardSuit.SPADES, rank: CardRank.SEVEN);
      expect(seven.points, 0);
      expect(seven.rankLabel, '7');
    });

    test('TwentyNineGameStateModel parses from JSON', () {
      final json = {
        'phase': 'BIDDING',
        'currentTurnUserId': 'user_1',
        'highestBid': 16,
        'highestBidderUserId': 'user_1',
        'trumpRevealed': false,
        'team1Points': 0,
        'team2Points': 0,
        'completedTricks': [],
        'players': {
          'user_1': {
            'userId': 'user_1',
            'seatIndex': 0,
            'teamIndex': 0,
            'cardsCount': 4,
            'cards': [
              {'suit': 'SPADES', 'rank': 'JACK'},
              {'suit': 'HEARTS', 'rank': 'ACE'},
            ],
          },
        },
      };

      final state = TwentyNineGameStateModel.fromJson(json);
      expect(state.phase, TwentyNinePhase.BIDDING);
      expect(state.currentTurnUserId, 'user_1');
      expect(state.highestBid, 16);
      expect(state.trumpRevealed, false);
      expect(state.players.containsKey('user_1'), true);
      expect(state.players['user_1']!.cards.length, 2);
      expect(state.players['user_1']!.cards[0].rank, CardRank.JACK);
    });

    test('PlayingCardModel parses real server card payloads with numeric ranks and label', () {
      final serverJack = PlayingCardModel.fromJson({'suit': 'SPADES', 'rank': 11, 'label': 'J'});
      expect(serverJack.rank, CardRank.JACK);
      expect(serverJack.numericRank, 11);
      expect(serverJack.label, 'J');
      expect(serverJack.points, 3);
      final json = serverJack.toJson();
      expect(json['suit'], 'SPADES');
      expect(json['rank'], 11);
      expect(json['label'], 'J');
    });

    test('TwentyNineGameStateModel parses real server game state payload', () {
      final serverPayload = {
        'phase': 'TRUMP_SELECTION',
        'contractorUserId': 'p1',
        'contract': 17,
        'isTrumpRevealed': true,
        'team0Points': 10,
        'team1Points': 18,
        'winnerPrizePerPlayer': 90.0,
        'winningUserIds': ['p1', 'p3'],
        'canRevealTrump': true,
        'players': {
          'p1': {
            'userId': 'p1',
            'username': 'Player 1',
            'seatIndex': 0,
            'teamIndex': 0,
            'cardCount': 8,
            'cards': [
              {'suit': 'SPADES', 'rank': 11, 'label': 'J'},
            ],
            'legalCards': [
              {'suit': 'SPADES', 'rank': 11, 'label': 'J'},
            ],
          },
        },
      };

      final state = TwentyNineGameStateModel.fromJson(serverPayload);
      expect(state.phase, TwentyNinePhase.TRUMP_SELECTION);
      expect(state.contractorUserId, 'p1');
      expect(state.bidWinnerUserId, 'p1');
      expect(state.contract, 17);
      expect(state.finalContract, 17);
      expect(state.isTrumpRevealed, true);
      expect(state.trumpRevealed, true);
      expect(state.team0Points, 10);
      expect(state.team1Points, 18);
      expect(state.team2Points, 18);
      expect(state.winnerPrizePerPlayer, 90.0);
      expect(state.payoutPerWinner, 90.0);
      expect(state.canRevealTrump, true);
      expect(state.players['p1']!.cards[0].rank, CardRank.JACK);
      expect(state.players['p1']!.legalCards[0].rank, CardRank.JACK);
    });
  });
}
