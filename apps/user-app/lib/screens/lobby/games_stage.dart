import 'dart:math' as math;
import 'package:flutter/material.dart';

const roomGames = [
  (
    id: 'TWENTY_NINE',
    name: '29 Cards',
    subtitle: 'Four players. Two teams. One winning hand.',
    icon: Icons.style_outlined,
  ),
  (
    id: 'TEEN_PATTI',
    name: 'Teen Patti',
    subtitle: 'Read the table. Play your hand.',
    icon: Icons.filter_3_outlined,
  ),
  (
    id: 'GUESS_NUMBER',
    name: 'Dice Guess',
    subtitle: 'Choose your number and take a seat.',
    icon: Icons.casino_outlined,
  ),
  (
    id: 'SPORTS_MATCH',
    name: 'Sports Pool',
    subtitle: 'Pick a match. Back your team.',
    icon: Icons.sports_cricket_outlined,
  ),
  (
    id: 'CRICTRADE',
    name: 'CricTrade',
    subtitle: 'Explore live cricket markets.',
    icon: Icons.candlestick_chart_outlined,
  ),
];

class GamesStage extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onSelect;
  final VoidCallback onCreate, onJoin, onOpenTrading;
  const GamesStage({
    super.key,
    required this.selected,
    required this.onSelect,
    required this.onCreate,
    required this.onJoin,
    required this.onOpenTrading,
  });
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final height = math.max(
        500.0 * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0),
        constraints.maxHeight,
      );
      final choice = roomGames.firstWhere(
        (g) => g.id == selected,
        orElse: () => roomGames.first,
      );
      final motion = MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 280);
      return SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: height),
          child: IntrinsicHeight(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                children: [
                  Expanded(
                    flex: 5,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          'THE GAME ROOM',
                          style: TextStyle(
                            fontSize: 10,
                            letterSpacing: 2.4,
                            color: Colors.black54,
                          ),
                        ),
                        const SizedBox(height: 20),
                        AnimatedSwitcher(
                          duration: motion,
                          child: Align(
                            key: ValueKey(choice.id),
                            alignment: Alignment.centerLeft,
                            child: Text(
                              choice.name,
                              style: const TextStyle(
                                fontSize: 34,
                                height: 1.08,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -1.5,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),
                        Text(
                          choice.subtitle,
                          style: const TextStyle(
                            color: Colors.black54,
                            height: 1.6,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 32),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: choice.id == 'CRICTRADE'
                                ? onOpenTrading
                                : onCreate,
                            style: FilledButton.styleFrom(
                              backgroundColor: Colors.black,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 17),
                            ),
                            child: Text(
                              choice.id == 'CRICTRADE'
                                  ? 'Open market'
                                  : 'Create room',
                            ),
                          ),
                        ),
                        if (choice.id != 'CRICTRADE') ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton(
                              onPressed: onJoin,
                              style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.black,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 17,
                                ),
                              ),
                              child: const Text('Join room'),
                            ),
                          ),
                        ],
                        const SizedBox(height: 26),
                        const Text(
                          'Select a game on the right',
                          style: TextStyle(color: Colors.black45, fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 18),
                  Expanded(
                    flex: 5,
                    child: SizedBox(
                      height: height * .8,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: roomGames.map((g) {
                          final active = g.id == choice.id;
                          final pillHeight =
                              78.0 +
                              40 *
                                  (MediaQuery.textScalerOf(context).scale(1) -
                                          1)
                                      .clamp(0.0, 2.0);
                          return Semantics(
                            button: true,
                            selected: active,
                            label: g.name,
                            child: GestureDetector(
                              onTap: () => onSelect(g.id),
                              child: AnimatedContainer(
                                duration: motion,
                                curve: Curves.easeOutCubic,
                                width: math.min(
                                  190.0,
                                  constraints.maxWidth * .42,
                                ),
                                height: pillHeight,
                                transformAlignment: Alignment.center,
                                transform: Matrix4.diagonal3Values(
                                  active ? 1.04 : 1,
                                  active ? 1.04 : 1,
                                  1,
                                ),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(60),
                                  color: active
                                      ? const Color(0xff141414)
                                      : const Color(0xfff5f5f5),
                                  border: Border.all(
                                    color: active
                                        ? Colors.black
                                        : const Color(0xffe4e4e4),
                                  ),
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      g.icon,
                                      color: active
                                          ? Colors.white
                                          : Colors.black54,
                                      size: 25,
                                    ),
                                    const SizedBox(height: 5),
                                    Text(
                                      g.name,
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w600,
                                        color: active
                                            ? Colors.white
                                            : Colors.black87,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}
