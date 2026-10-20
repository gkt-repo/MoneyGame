import 'dart:math';
import 'package:flutter/material.dart';
import '../../../../models/teen_patti_models.dart';

class TeenPattiCardVisual extends StatelessWidget {
  final PlayingCardModel? card;
  final bool isFaceDown;
  final double width;
  final double height;
  final double elevation;

  const TeenPattiCardVisual({
    super.key,
    this.card,
    this.isFaceDown = false,
    this.width = 46,
    this.height = 68,
    this.elevation = 4,
  });

  @override
  Widget build(BuildContext context) {
    if (isFaceDown || card == null) {
      return _buildCardBack();
    }
    return _buildCardFront();
  }

  Widget _buildCardBack() {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFFC0392B),
        borderRadius: BorderRadius.circular(width * 0.1),
        border: Border.all(color: Colors.white, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: elevation,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(width * 0.08),
        child: Image.asset(
          'assets/game/teen_patti/card_back.png',
          width: width,
          height: height,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) => _fallbackCardBack(),
        ),
      ),
    );
  }

  Widget _fallbackCardBack() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFD32F2F), Color(0xFF8E0000)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Center(
        child: Container(
          width: width * 0.7,
          height: height * 0.7,
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFFFD54F), width: 1),
            borderRadius: BorderRadius.circular(3),
          ),
          child: const Center(
            child: Text(
              '♠',
              style: TextStyle(color: Color(0xFFFFD54F), fontSize: 14),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCardFront() {
    final isRed = card!.isRed;
    final color = isRed ? const Color(0xFFD32F2F) : const Color(0xFF1E293B);
    final suitSymbol = card!.symbol;

    return Container(
      width: width,
      height: height,
      padding: EdgeInsets.all(width * 0.07),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(width * 0.1),
        border: Border.all(color: const Color(0xFFCBD5E1), width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: elevation,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Top-Left Rank & Suit
          Align(
            alignment: Alignment.topLeft,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  card!.label,
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: (width * 0.35).clamp(10.0, 18.0),
                    fontWeight: FontWeight.w900,
                    height: 0.9,
                    color: color,
                  ),
                ),
                Text(
                  suitSymbol,
                  style: TextStyle(
                    fontSize: (width * 0.28).clamp(9.0, 15.0),
                    height: 0.9,
                    color: color,
                  ),
                ),
              ],
            ),
          ),

          // Center Large Suit Icon
          Text(
            suitSymbol,
            style: TextStyle(
              fontSize: (width * 0.46).clamp(14.0, 26.0),
              color: color,
              height: 1,
            ),
          ),

          // Bottom-Right Inverted Rank
          Align(
            alignment: Alignment.bottomRight,
            child: Transform.rotate(
              angle: pi,
              child: Text(
                card!.label,
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: (width * 0.30).clamp(9.0, 16.0),
                  fontWeight: FontWeight.w900,
                  height: 0.9,
                  color: color,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 3D Flippable card widget supporting interactive or triggered 3D perspective flip
class FlippableTeenPattiCard extends StatelessWidget {
  final PlayingCardModel? card;
  final Animation<double> flipAnimation; // 0.0 = face down, 1.0 = face up
  final double width;
  final double height;

  const FlippableTeenPattiCard({
    super.key,
    required this.card,
    required this.flipAnimation,
    this.width = 54,
    this.height = 80,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: flipAnimation,
      builder: (context, child) {
        final val = flipAnimation.value;
        final angle = val * pi;
        final isUnder = val > 0.5;

        return Transform(
          alignment: Alignment.center,
          transform: Matrix4.identity()
            ..setEntry(3, 2, 0.002) // 3D Perspective
            ..rotateY(angle),
          child: isUnder
              ? Transform(
                  alignment: Alignment.center,
                  transform: Matrix4.identity()..rotateY(pi),
                  child: TeenPattiCardVisual(
                    card: card,
                    isFaceDown: false,
                    width: width,
                    height: height,
                  ),
                )
              : TeenPattiCardVisual(
                  card: card,
                  isFaceDown: true,
                  width: width,
                  height: height,
                ),
        );
      },
    );
  }
}
