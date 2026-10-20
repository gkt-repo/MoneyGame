import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moneygame_user/models/teen_patti_models.dart';
import 'package:moneygame_user/screens/game/teen_patti/widgets/teen_patti_action_bar.dart';
import 'package:moneygame_user/screens/game/teen_patti/widgets/teen_patti_card_visual.dart';
import 'package:moneygame_user/screens/game/teen_patti/widgets/teen_patti_felt_table.dart';
import 'package:moneygame_user/screens/game/teen_patti/widgets/teen_patti_player_seat.dart';

void main() {
  group('Teen Patti Evaluator Tests', () {
    test('Identifies Trail (Trio)', () {
      final cards = [
        const PlayingCardModel(suit: CardSuit.spades, rank: 14, label: 'A'),
        const PlayingCardModel(suit: CardSuit.hearts, rank: 14, label: 'A'),
        const PlayingCardModel(suit: CardSuit.diamonds, rank: 14, label: 'A'),
      ];
      expect(TeenPattiEvaluator.evaluateHandName(cards), 'Trail (A)');
    });

    test('Identifies Pure Sequence', () {
      final cards = [
        const PlayingCardModel(suit: CardSuit.spades, rank: 14, label: 'A'),
        const PlayingCardModel(suit: CardSuit.spades, rank: 13, label: 'K'),
        const PlayingCardModel(suit: CardSuit.spades, rank: 12, label: 'Q'),
      ];
      expect(TeenPattiEvaluator.evaluateHandName(cards), 'Pure Sequence');
    });

    test('Identifies Sequence (Run)', () {
      final cards = [
        const PlayingCardModel(suit: CardSuit.hearts, rank: 9, label: '9'),
        const PlayingCardModel(suit: CardSuit.spades, rank: 8, label: '8'),
        const PlayingCardModel(suit: CardSuit.diamonds, rank: 7, label: '7'),
      ];
      expect(TeenPattiEvaluator.evaluateHandName(cards), 'Sequence (Run)');
    });

    test('Identifies Color (Flush)', () {
      final cards = [
        const PlayingCardModel(suit: CardSuit.hearts, rank: 14, label: 'A'),
        const PlayingCardModel(suit: CardSuit.hearts, rank: 10, label: '10'),
        const PlayingCardModel(suit: CardSuit.hearts, rank: 4, label: '4'),
      ];
      expect(TeenPattiEvaluator.evaluateHandName(cards), 'Color (Flush)');
    });

    test('Identifies Pair', () {
      final cards = [
        const PlayingCardModel(suit: CardSuit.clubs, rank: 10, label: '10'),
        const PlayingCardModel(suit: CardSuit.diamonds, rank: 10, label: '10'),
        const PlayingCardModel(suit: CardSuit.spades, rank: 4, label: '4'),
      ];
      expect(TeenPattiEvaluator.evaluateHandName(cards), 'Pair of 10s');
    });

    test('Identifies High Card', () {
      final cards = [
        const PlayingCardModel(suit: CardSuit.clubs, rank: 9, label: '9'),
        const PlayingCardModel(suit: CardSuit.spades, rank: 8, label: '8'),
        const PlayingCardModel(suit: CardSuit.diamonds, rank: 3, label: '3'),
      ];
      expect(TeenPattiEvaluator.evaluateHandName(cards), 'High Card (9)');
    });
  });

  group('Teen Patti Widgets Tests', () {
    testWidgets('TeenPattiCardVisual renders front card rank and suit', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TeenPattiCardVisual(
              card: PlayingCardModel(suit: CardSuit.hearts, rank: 14, label: 'A'),
              isFaceDown: false,
            ),
          ),
        ),
      );

      expect(find.text('A'), findsNWidgets(2)); // Top-left and bottom-right
      expect(find.text('♥'), findsNWidgets(2)); // Corner and center
    });

    testWidgets('TeenPattiFeltTable renders boot stakes text', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 800,
              height: 400,
              child: TeenPattiFeltTable(
                bootAmount: 20,
                currentChaalAmount: 20,
                pot: 120,
              ),
            ),
          ),
        ),
      );

      expect(find.textContaining('Boot: 20'), findsOneWidget);
    });

    testWidgets('TeenPattiPlayerSeat renders See button and registers tap', (tester) async {
      bool seeCardsTapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: TeenPattiPlayerSeat(
                player: const TeenPattiPlayerModel(
                  userId: 'user1',
                  username: 'Player1',
                  seatIndex: 0,
                  isSeen: false,
                ),
                isHero: true,
                isCurrentTurn: true,
                onSeeCards: () {
                  seeCardsTapped = true;
                },
              ),
            ),
          ),
        ),
      );

      // Verify "See" text is visible on Hero seat
      final seeFinder = find.text('See');
      expect(seeFinder, findsOneWidget);

      // Tap the See button
      await tester.tap(seeFinder);
      await tester.pump();

      expect(seeCardsTapped, isTrue);
    });

    testWidgets('TeenPattiActionBar handles Increase Bet and Chaal tap', (tester) async {
      bool increaseBetTapped = false;
      bool chaalTapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TeenPattiActionBar(
              isMyTurn: true,
              isSeen: true,
              canShow: false,
              canSideShow: false,
              currentChaalCost: 40,
              blindCost: 20,
              userBalance: 500,
              isSubmitting: false,
              onPack: () {},
              onBlind: () {},
              onChaal: () {
                chaalTapped = true;
              },
              onShow: () {},
              onIncreaseBet: () {
                increaseBetTapped = true;
              },
              onDecreaseBet: null, // Disabled at 1x
            ),
          ),
        ),
      );

      // Verify Chaal 40 is rendered
      expect(find.text('CHAAL'), findsOneWidget);
      expect(find.text('40'), findsOneWidget);

      // Tap plus (+) to increase bet
      final plusFinder = find.byIcon(Icons.add);
      expect(plusFinder, findsOneWidget);
      await tester.tap(plusFinder);
      await tester.pump();
      expect(increaseBetTapped, isTrue);

      // Tap Chaal button
      final chaalFinder = find.text('CHAAL');
      await tester.tap(chaalFinder);
      await tester.pump();
      expect(chaalTapped, isTrue);
    });

    testWidgets('TeenPattiActionBar enables and handles Side Show tap', (tester) async {
      bool sideShowTapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TeenPattiActionBar(
              isMyTurn: true,
              isSeen: true,
              canShow: false,
              canSideShow: true,
              currentChaalCost: 40,
              blindCost: 20,
              userBalance: 500,
              isSubmitting: false,
              onPack: () {},
              onBlind: () {},
              onChaal: () {},
              onShow: () {},
              onSideShow: () {
                sideShowTapped = true;
              },
            ),
          ),
        ),
      );

      final sideShowFinder = find.text('SIDE SHOW');
      expect(sideShowFinder, findsOneWidget);

      await tester.tap(sideShowFinder);
      await tester.pump();
      expect(sideShowTapped, isTrue);
    });
  });
}
