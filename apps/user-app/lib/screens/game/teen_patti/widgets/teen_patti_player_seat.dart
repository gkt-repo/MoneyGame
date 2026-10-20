import 'dart:math';
import 'package:flutter/material.dart';
import '../../../../models/teen_patti_models.dart';
import 'teen_patti_card_visual.dart';

class TeenPattiPlayerSeat extends StatelessWidget {
  final TeenPattiPlayerModel? player;
  final bool isHero;
  final bool isCurrentTurn;
  final double turnProgress; // 0.0 to 1.0 remaining
  final bool isDealer;
  final Animation<double>? heroFlipAnimation;
  final VoidCallback? onSeeCards;
  final List<PlayingCardModel>? heroCards;
  final double currentBet;
  final double userBalance;
  final bool cardsOnRight; // true for left-side seats, false for right-side seats
  final bool isDealing; // true while card distribution animation is running
  final bool isWinner; // true when this seat won the showdown
  final List<PlayingCardModel>? showdownCards;

  const TeenPattiPlayerSeat({
    super.key,
    required this.player,
    this.isHero = false,
    this.isCurrentTurn = false,
    this.turnProgress = 1.0,
    this.isDealer = false,
    this.heroFlipAnimation,
    this.onSeeCards,
    this.heroCards,
    this.currentBet = 0.0,
    this.userBalance = 0.0,
    this.cardsOnRight = true,
    this.isDealing = false,
    this.isWinner = false,
    this.showdownCards,
  });

  @override
  Widget build(BuildContext context) {
    if (player == null) {
      return _buildEmptySeat();
    }

    final isPacked = player!.isPacked;
    final isSeen = player!.isSeen;

    if (isHero) {
      return SizedBox(
        width: 150,
        height: 145,
        child: Opacity(
          opacity: isPacked ? 0.45 : 1.0,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              // 1. CARDS (In positive coordinates at top)
              Positioned(
                top: 0,
                child: Opacity(
                  opacity: isDealing ? 0.0 : 1.0,
                  child: _buildHeroCards(context),
                ),
              ),

              // 2. AVATAR WITH SWEEP TIMER (Centered below cards)
              Positioned(
                top: 56,
                child: _buildAvatarWithTimer(),
              ),

              // 3. DEALER BUTTON "D"
              if (isDealer)
                Positioned(
                  top: 60,
                  left: 20,
                  child: _buildDealerChip(),
                ),

              // 4. STATUS BADGE (BLIND / SEEN / PACKED)
              Positioned(
                top: 112,
                child: _buildStatusBadge(isPacked, isSeen),
              ),

              // 5. BALANCE CAPSULE (Below Avatar)
              Positioned(
                top: 126,
                child: _buildBalancePill(),
              ),

              // 6. BET CHIP BADGE
              if (currentBet > 0 && !isPacked)
                Positioned(
                  top: 48,
                  child: _buildBetChipBadge(),
                ),
            ],
          ),
        ),
      );
    }

    // Opponent Seats
    return SizedBox(
      width: 110,
      height: 80,
      child: Opacity(
        opacity: isPacked ? 0.45 : 1.0,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            // Opponent Cards (fanning inwards toward the table center)
            Positioned(
              top: 8,
              left: cardsOnRight ? 46 : null,
              right: cardsOnRight ? null : 46,
              child: Opacity(
                opacity: isDealing ? 0.0 : 1.0,
                child: _buildOpponentCards(),
              ),
            ),

            // Opponent Avatar
            Positioned(
              top: 6,
              left: cardsOnRight ? 2 : null,
              right: cardsOnRight ? null : 2,
              child: _buildAvatarWithTimer(),
            ),

            // Dealer chip
            if (isDealer)
              Positioned(
                top: 2,
                left: cardsOnRight ? 0 : null,
                right: cardsOnRight ? null : 0,
                child: _buildDealerChip(),
              ),

            // Status Badge
            Positioned(
              bottom: 2,
              left: cardsOnRight ? 4 : null,
              right: cardsOnRight ? null : 4,
              child: _buildStatusBadge(isPacked, isSeen),
            ),

            // Bet chip badge
            if (currentBet > 0 && !isPacked)
              Positioned(
                top: 2,
                left: cardsOnRight ? 54 : null,
                right: cardsOnRight ? null : 54,
                child: _buildBetChipBadge(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptySeat() {
    return Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.black.withValues(alpha: 0.3),
        border: Border.all(color: Colors.white24, width: 1),
      ),
      child: const Center(
        child: Icon(Icons.person_add_alt, size: 20, color: Colors.white38),
      ),
    );
  }

  Widget _buildDealerChip() {
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFE0EAFC), Color(0xFFCFDEF3)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        shape: BoxShape.circle,
        border: Border.all(color: const Color(0xFF1E88E5), width: 1.5),
        boxShadow: const [
          BoxShadow(color: Colors.black45, blurRadius: 4, offset: Offset(0, 2)),
        ],
      ),
      child: const Center(
        child: Text(
          'D',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w900,
            fontStyle: FontStyle.italic,
            color: Color(0xFF0D47A1),
          ),
        ),
      ),
    );
  }

  Widget _buildAvatarWithTimer() {
    final avatarSize = isHero ? 68.0 : 48.0;

    return Stack(
      alignment: Alignment.center,
      children: [
        // Radial Green/Yellow Sweeping Timer when it's this player's turn
        if (isCurrentTurn && !player!.isPacked)
          CustomPaint(
            size: Size(avatarSize + 12, avatarSize + 12),
            painter: _RadialSweepTimerPainter(
              progress: turnProgress,
              color: turnProgress > 0.4
                  ? const Color(0xFF76FF03)
                  : turnProgress > 0.15
                      ? const Color(0xFFFFD600)
                      : const Color(0xFFFF3D00),
            ),
          ),

        // Golden Metallic Outer Border
        Container(
          width: avatarSize,
          height: avatarSize,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [Color(0xFFFFE082), Color(0xFFFF8F00), Color(0xFFFFD54F)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(
                color: isWinner
                    ? const Color(0xFFFFD700).withValues(alpha: 0.85)
                    : isCurrentTurn
                        ? const Color(0xFF76FF03).withValues(alpha: 0.6)
                        : Colors.black.withValues(alpha: 0.5),
                blurRadius: isWinner ? 20 : (isCurrentTurn ? 12 : 6),
                spreadRadius: isWinner ? 3 : (isCurrentTurn ? 2 : 0),
              ),
            ],
          ),
          padding: const EdgeInsets.all(2.5),
          child: ClipOval(
            child: Container(
              color: const Color(0xFF1E293B),
              child: Center(
                child: Text(
                  player!.username.isNotEmpty
                      ? player!.username.substring(0, min(2, player!.username.length)).toUpperCase()
                      : 'P',
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: isHero ? 22 : 16,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ),

        // Winner Crown on top of avatar
        if (isWinner)
          Positioned(
            top: isHero ? -12 : -8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFFFD54F), Color(0xFFFF8F00)],
                ),
                borderRadius: BorderRadius.circular(6),
                boxShadow: const [
                  BoxShadow(color: Colors.black45, blurRadius: 4, offset: Offset(0, 1)),
                ],
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.emoji_events, size: 10, color: Color(0xFF261005)),
                  SizedBox(width: 2),
                  Text(
                    'WINNER',
                    style: TextStyle(
                      fontSize: 8,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF261005),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildHeroCards(BuildContext context) {
    final cards = heroCards ?? player?.cards;
    final isSeen = player?.isSeen == true;
    final isPacked = player?.isPacked == true;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        if (!isSeen && !player!.isPacked && onSeeCards != null) {
          onSeeCards!();
        }
      },
      child: SizedBox(
        width: 140,
        height: 74,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            // Hand evaluated title badge if seen
            if (isSeen && cards != null && cards.isNotEmpty)
              Positioned(
                top: -12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFFFFD54F), Color(0xFFFF8F00)],
                    ),
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: const [
                      BoxShadow(color: Colors.black54, blurRadius: 4, offset: Offset(0, 1)),
                    ],
                  ),
                  child: Text(
                    TeenPattiEvaluator.evaluateHandName(cards),
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF261005),
                    ),
                  ),
                ),
              ),

            // 3 Fanned Cards
            Positioned(
              top: 6,
              left: 10,
              child: Transform.rotate(
                angle: -0.14,
                child: _buildHeroSingleCard(cards, 0, isSeen),
              ),
            ),
            Positioned(
              top: 6,
              right: 10,
              child: Transform.rotate(
                angle: 0.14,
                child: _buildHeroSingleCard(cards, 2, isSeen),
              ),
            ),
            Positioned(
              top: 6,
              child: _buildHeroSingleCard(cards, 1, isSeen),
            ),

            // Orange "See" Button on top of middle card when blind
            if (!isSeen && !player!.isPacked)
              Positioned(
                top: 20,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    if (onSeeCards != null) onSeeCards!();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFFFB300), Color(0xFFFF8F00), Color(0xFFE65100)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.white, width: 1.5),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.orange.withValues(alpha: 0.6),
                          blurRadius: 8,
                          spreadRadius: 1,
                        ),
                        const BoxShadow(
                          color: Colors.black45,
                          blurRadius: 4,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: const Text(
                      'See',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        shadows: [
                          Shadow(color: Color(0xFFBF360C), blurRadius: 3, offset: Offset(0, 1)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

            // Stamped PACKED badge over Hero cards
            if (isPacked)
              Positioned(
                top: 22,
                child: _buildPackedStamp(width: 80),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildPackedStamp({required double width}) {
    return Transform.rotate(
      angle: -0.22,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
        decoration: BoxDecoration(
          color: const Color(0xFF7F1D1D).withValues(alpha: 0.95),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: const Color(0xFFEF4444), width: 1.5),
          boxShadow: const [
            BoxShadow(color: Colors.black54, blurRadius: 6, offset: Offset(0, 2)),
          ],
        ),
        child: const Text(
          'PACKED',
          style: TextStyle(
            color: Color(0xFFFCA5A5),
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.5,
          ),
        ),
      ),
    );
  }

  Widget _buildHeroSingleCard(List<PlayingCardModel>? cards, int index, bool isSeen) {
    final card = (cards != null && cards.length > index) ? cards[index] : null;

    if (heroFlipAnimation != null) {
      return FlippableTeenPattiCard(
        card: card,
        flipAnimation: heroFlipAnimation!,
        width: 44,
        height: 64,
      );
    }

    return TeenPattiCardVisual(
      card: card,
      isFaceDown: !isSeen || card == null,
      width: 44,
      height: 64,
    );
  }

  Widget _buildOpponentCards() {
    final effectiveCards = showdownCards ?? player?.cards;
    final hasRevealed = effectiveCards != null && effectiveCards.isNotEmpty;

    return SizedBox(
      width: 60,
      height: 38,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Positioned(
            left: 4,
            child: Transform.rotate(
              angle: -0.16,
              child: TeenPattiCardVisual(
                card: hasRevealed ? effectiveCards[0] : null,
                isFaceDown: !hasRevealed,
                width: 22,
                height: 32,
                elevation: 2,
              ),
            ),
          ),
          Positioned(
            right: 4,
            child: Transform.rotate(
              angle: 0.16,
              child: TeenPattiCardVisual(
                card: hasRevealed && effectiveCards.length > 2 ? effectiveCards[2] : null,
                isFaceDown: !hasRevealed,
                width: 22,
                height: 32,
                elevation: 2,
              ),
            ),
          ),
          Positioned(
            child: TeenPattiCardVisual(
              card: hasRevealed && effectiveCards.length > 1 ? effectiveCards[1] : null,
              isFaceDown: !hasRevealed,
              width: 22,
              height: 32,
              elevation: 3,
            ),
          ),

          // Stamped PACKED badge over opponent cards
          if (player?.isPacked == true)
            Positioned(
              top: 8,
              child: _buildPackedStamp(width: 50),
            ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(bool isPacked, bool isSeen) {
    Color bg = const Color(0xFF1E293B);
    String label = 'BLIND';

    if (isWinner) {
      bg = const Color(0xFFB45309);
      label = 'WINNER';
    } else if (isPacked) {
      bg = const Color(0xFF7F1D1D);
      label = 'PACKED';
    } else if (isSeen) {
      bg = const Color(0xFF0F172A);
      label = 'SEEN';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1.5),
      decoration: BoxDecoration(
        color: bg.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isPacked
              ? const Color(0xFFEF4444)
              : isSeen
                  ? const Color(0xFF38BDF8)
                  : const Color(0xFFA855F7),
          width: 1,
        ),
        boxShadow: const [
          BoxShadow(color: Colors.black45, blurRadius: 4, offset: Offset(0, 1)),
        ],
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: isHero ? 10 : 8,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.5,
          color: Colors.white,
        ),
      ),
    );
  }

  Widget _buildBalancePill() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B).withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFFD54F).withValues(alpha: 0.6), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset(
            'assets/game/teen_patti/gold_coin.png',
            width: 14,
            height: 14,
            errorBuilder: (context, error, stackTrace) => const Icon(
              Icons.monetization_on,
              size: 13,
              color: Color(0xFFFFD700),
            ),
          ),
          const SizedBox(width: 4),
          Text(
            userBalance.toStringAsFixed(0),
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBetChipBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFFFD54F), width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.circle, size: 8, color: Color(0xFFFFD700)),
          const SizedBox(width: 3),
          Text(
            currentBet.toStringAsFixed(0),
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

class _RadialSweepTimerPainter extends CustomPainter {
  final double progress;
  final Color color;

  _RadialSweepTimerPainter({required this.progress, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;

    // Glowing border arc
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round;

    final sweepAngle = 2 * pi * progress;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius - 2),
      -pi / 2,
      sweepAngle,
      false,
      paint,
    );

    // Subtle radial sector overlay
    final piePaint = Paint()
      ..color = color.withValues(alpha: 0.18)
      ..style = PaintingStyle.fill;

    final path = Path()
      ..moveTo(center.dx, center.dy)
      ..arcTo(
        Rect.fromCircle(center: center, radius: radius - 2),
        -pi / 2,
        sweepAngle,
        false,
      )
      ..close();

    canvas.drawPath(path, piePaint);
  }

  @override
  bool shouldRepaint(covariant _RadialSweepTimerPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.color != color;
}
