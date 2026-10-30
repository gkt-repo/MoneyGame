import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/constants/app_theme.dart';
import 'lobby_motion.dart';

typedef LobbyGame = ({String id, String name, String subtitle, IconData icon});

const List<LobbyGame> roomGames = [
  (id: 'SEEP', name: 'Seep', subtitle: 'Build houses. Capture spades. Play 1v1 or 2v2.', icon: Icons.home_work_outlined),
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

class GamesStage extends StatefulWidget {
  final String selected;
  final ValueChanged<String> onSelect;
  final VoidCallback onCreate, onJoin, onOpenTrading;
  final List<LobbyGame> games;

  const GamesStage({
    super.key,
    required this.selected,
    required this.onSelect,
    required this.onCreate,
    required this.onJoin,
    required this.onOpenTrading,
    this.games = roomGames,
  });

  @override
  State<GamesStage> createState() => _GamesStageState();
}

class _GamesStageState extends State<GamesStage> {
  final _gameScrollController = ScrollController();

  @override
  void dispose() {
    _gameScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final games = widget.games;
    final choice = games.firstWhere(
      (game) => game.id == widget.selected,
      orElse: () => games.first,
    );
    final motion = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 200);

    return ColoredBox(
      color: context.palette.adapt(AppColors.canvas),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 4,
                  child: LayoutBuilder(
                    builder: (context, constraints) => SingleChildScrollView(
                      primary: false,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: constraints.maxHeight,
                        ),
                        child: Column(
                          key: const ValueKey('game-actions'),
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            FilledButton(
                              onPressed: choice.id == 'CRICTRADE'
                                  ? widget.onOpenTrading
                                  : widget.onCreate,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.emerald700,
                                foregroundColor: Colors.white,
                                minimumSize: const Size(0, 48),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 14,
                                ),
                                shape: const StadiumBorder(),
                                textStyle: Theme.of(context)
                                    .textTheme
                                    .labelLarge
                                    ?.copyWith(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                              ),
                              child: Text(
                                choice.id == 'CRICTRADE'
                                    ? 'Open market'
                                    : 'Create room',
                                textAlign: TextAlign.center,
                              ),
                            ),
                            if (choice.id != 'CRICTRADE') ...[
                              const SizedBox(height: 12),
                              OutlinedButton(
                                onPressed: widget.onJoin,
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: context.palette.ink,
                                  backgroundColor: context.palette.surface,
                                  side: BorderSide(
                                    color: context.palette.outline,
                                  ),
                                  minimumSize: const Size(0, 48),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 14,
                                  ),
                                  shape: const StadiumBorder(),
                                  textStyle: Theme.of(context)
                                      .textTheme
                                      .labelLarge
                                      ?.copyWith(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                ),
                                child: const Text(
                                  'Join room',
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  flex: 6,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          'Choose a game',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: context.palette.adapt(AppColors.ink),
                          ),
                        ),
                      ),
                      Flexible(
                        child: Scrollbar(
                          controller: _gameScrollController,
                          thumbVisibility: true,
                          child: ListView.separated(
                            key: const PageStorageKey('game-stack'),
                            controller: _gameScrollController,
                            primary: false,
                            shrinkWrap: true,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 8,
                            ),
                            itemCount: games.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: 10),
                            itemBuilder: (context, index) {
                              final game = games[index];
                              final active = game.id == choice.id;
                              return Semantics(
                                selected: active,
                                child: LobbyPressMotion(
                                  child: AnimatedContainer(
                                    duration: motion,
                                    decoration: BoxDecoration(
                                      color: active
                                          ? AppColors.emerald700
                                          : context.palette.surface,
                                      borderRadius: BorderRadius.circular(32),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.black.withValues(
                                            alpha: context.palette.isDark
                                                ? .16
                                                : .05,
                                          ),
                                          blurRadius: 16,
                                          offset: const Offset(0, 6),
                                        ),
                                      ],
                                      border: Border.all(
                                        color: active
                                            ? AppColors.emerald700
                                            : context.palette.outline,
                                      ),
                                    ),
                                    child: Material(
                                      color: Colors.transparent,
                                      borderRadius: BorderRadius.circular(32),
                                      clipBehavior: Clip.antiAlias,
                                      child: InkWell(
                                        onTap: () => widget.onSelect(game.id),
                                        child: ConstrainedBox(
                                          key: ValueKey('game-tile-${game.id}'),
                                          constraints: const BoxConstraints(
                                            minHeight: 68,
                                          ),
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 12,
                                              vertical: 10,
                                            ),
                                            child: Row(
                                              children: [
                                                Container(
                                                  width: 36,
                                                  height: 36,
                                                  decoration: BoxDecoration(
                                                    shape: BoxShape.circle,
                                                    color: active
                                                        ? Colors.white
                                                              .withValues(
                                                                alpha: .15,
                                                              )
                                                        : context
                                                              .palette
                                                              .selected,
                                                  ),
                                                  child: Icon(
                                                    game.icon,
                                                    color: active
                                                        ? Colors.white
                                                        : context
                                                              .palette
                                                              .accent,
                                                    size: 20,
                                                  ),
                                                ),
                                                const SizedBox(width: 10),
                                                Expanded(
                                                  child: Text(
                                                    game.name,
                                                    style: TextStyle(
                                                      fontSize: 12,
                                                      fontWeight:
                                                          FontWeight.w600,
                                                      color: active
                                                          ? Colors.white
                                                          : context.palette.ink,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
