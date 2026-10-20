import 'package:flutter/material.dart';

class TeenPattiActionBar extends StatelessWidget {
  final bool isMyTurn;
  final bool isSeen;
  final bool canShow;
  final bool canSideShow;
  final double currentChaalCost;
  final double blindCost;
  final double userBalance;
  final bool isSubmitting;
  final VoidCallback onPack;
  final VoidCallback onBlind;
  final VoidCallback onChaal;
  final VoidCallback onShow;
  final VoidCallback? onSideShow;
  final VoidCallback? onIncreaseBet;
  final VoidCallback? onDecreaseBet;

  const TeenPattiActionBar({
    super.key,
    required this.isMyTurn,
    required this.isSeen,
    required this.canShow,
    this.canSideShow = false,
    required this.currentChaalCost,
    required this.blindCost,
    required this.userBalance,
    required this.isSubmitting,
    required this.onPack,
    required this.onBlind,
    required this.onChaal,
    required this.onShow,
    this.onSideShow,
    this.onIncreaseBet,
    this.onDecreaseBet,
  });

  @override
  Widget build(BuildContext context) {
    final activeBetCost = isSeen ? currentChaalCost : blindCost;
    final hasEnoughBalance = userBalance >= activeBetCost;

    return Center(
      child: Container(
        height: 48,
        constraints: const BoxConstraints(maxWidth: 560),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // 1. PACK BUTTON
            _buildButton(
              label: 'PACK',
              isRed: true,
              enabled: isMyTurn && !isSubmitting,
              onTap: onPack,
              flex: 2,
            ),
            const SizedBox(width: 8),

            // 2. SHOW BUTTON
            _buildButton(
              label: 'SHOW',
              enabled: canShow && isMyTurn && !isSubmitting && userBalance >= activeBetCost,
              isGold: canShow && isMyTurn,
              onTap: onShow,
              flex: 2,
            ),
            const SizedBox(width: 8),

            // 3. SIDE SHOW BUTTON
            _buildButton(
              label: 'SIDE SHOW',
              enabled: canSideShow && isMyTurn && !isSubmitting,
              isGold: canSideShow && isMyTurn,
              onTap: onSideShow,
              flex: 2,
            ),
            const SizedBox(width: 8),

            // 4. MINUS (-) STEPPER
            _buildStepperButton(
              icon: Icons.remove,
              enabled: isMyTurn && !isSubmitting && onDecreaseBet != null,
              isOrange: false,
              onTap: onDecreaseBet,
            ),
            const SizedBox(width: 6),

            // 5. MAIN BET BUTTON (BLIND / CHAAL)
            _buildMainBetButton(
              label: isSeen ? 'CHAAL' : 'BLIND',
              amount: activeBetCost,
              enabled: isMyTurn && !isSubmitting && hasEnoughBalance,
              onTap: isSeen ? onChaal : onBlind,
              hasLowBal: isMyTurn && !hasEnoughBalance,
            ),
            const SizedBox(width: 6),

            // 6. PLUS (+) STEPPER
            _buildStepperButton(
              icon: Icons.add,
              isOrange: isMyTurn && onIncreaseBet != null,
              enabled: isMyTurn && !isSubmitting && onIncreaseBet != null,
              onTap: onIncreaseBet,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildButton({
    required String label,
    bool isRed = false,
    bool isGold = false,
    bool enabled = true,
    VoidCallback? onTap,
    int flex = 1,
  }) {
    Color startColor = const Color(0xFF475569);
    Color endColor = const Color(0xFF334155);

    if (isRed && enabled) {
      startColor = const Color(0xFFFF3D00);
      endColor = const Color(0xFFD84315);
    } else if (isGold && enabled) {
      startColor = const Color(0xFFFFB300);
      endColor = const Color(0xFFFF8F00);
    }

    return Expanded(
      flex: flex,
      child: Opacity(
        opacity: enabled ? 1.0 : 0.45,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: enabled ? onTap : null,
            borderRadius: BorderRadius.circular(10),
            child: Ink(
              height: 40,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: enabled
                      ? [startColor, endColor]
                      : [const Color(0xFF334155), const Color(0xFF1E293B)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isGold && enabled
                      ? const Color(0xFFFFE082)
                      : isRed && enabled
                          ? const Color(0xFFFF8A65)
                          : Colors.white24,
                  width: 1.2,
                ),
                boxShadow: enabled
                    ? [
                        BoxShadow(
                          color: (isRed ? Colors.red : isGold ? Colors.amber : Colors.black)
                              .withValues(alpha: 0.35),
                          blurRadius: 6,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : null,
              ),
              child: Center(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                    color: Colors.white,
                    shadows: [
                      Shadow(color: Colors.black54, blurRadius: 2, offset: Offset(0, 1)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStepperButton({
    required IconData icon,
    bool isOrange = false,
    bool enabled = true,
    VoidCallback? onTap,
  }) {
    return Opacity(
      opacity: enabled ? 1.0 : 0.35,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(8),
          child: Ink(
            width: 36,
            height: 40,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: (isOrange && enabled)
                    ? [const Color(0xFFFF9800), const Color(0xFFE65100)]
                    : [const Color(0xFF475569), const Color(0xFF334155)],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: (isOrange && enabled) ? const Color(0xFFFFE082) : Colors.white24,
                width: 1,
              ),
              boxShadow: (isOrange && enabled)
                  ? [
                      BoxShadow(
                        color: Colors.orange.withValues(alpha: 0.4),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: Icon(icon, color: Colors.white, size: 18),
          ),
        ),
      ),
    );
  }

  Widget _buildMainBetButton({
    required String label,
    required double amount,
    required bool enabled,
    required VoidCallback onTap,
    bool hasLowBal = false,
  }) {
    return Expanded(
      flex: 3,
      child: Opacity(
        opacity: enabled ? 1.0 : 0.4,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: enabled ? onTap : null,
            borderRadius: BorderRadius.circular(10),
            child: Ink(
              height: 40,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: hasLowBal
                      ? [const Color(0xFFB71C1C), const Color(0xFF7F0000)]
                      : [const Color(0xFFFF9800), const Color(0xFFE65100)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: hasLowBal ? const Color(0xFFEF5350) : const Color(0xFFFFE082),
                  width: 1.5,
                ),
                boxShadow: enabled
                    ? [
                        BoxShadow(
                          color: const Color(0xFFFF9800).withValues(alpha: 0.4),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : null,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    hasLowBal ? 'Low Balance' : label,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      color: Colors.white,
                      height: 1.0,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    amount.toStringAsFixed(0),
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      height: 1.0,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
