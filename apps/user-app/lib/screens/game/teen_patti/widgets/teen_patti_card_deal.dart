import 'dart:math';
import 'dart:ui' show lerpDouble;
import 'package:flutter/material.dart';

/// Single flying card trajectory configuration during card distribution
class _DealingCardFlight {
  final int seatIndex; // 0 = Hero, 1-4 = Opponents
  final int cardIndex; // 0, 1, 2 (the 3 cards per hand)
  final Offset start;
  final Offset end;
  final double startAngle;
  final double endAngle;
  final double startScale;
  final double endScale;
  final double startTime; // 0.0 - 1.0
  final double flightDuration; // fraction of total animation

  const _DealingCardFlight({
    required this.seatIndex,
    required this.cardIndex,
    required this.start,
    required this.end,
    required this.startAngle,
    required this.endAngle,
    required this.startScale,
    required this.endScale,
    required this.startTime,
    required this.flightDuration,
  });
}

/// Overlay that renders realistic 3D card distribution from the dealer
/// to all active seats around the felt table.
class TeenPattiCardDealOverlay extends StatelessWidget {
  final AnimationController controller;
  final int activeSeatsCount;
  final VoidCallback? onComplete;

  const TeenPattiCardDealOverlay({
    super.key,
    required this.controller,
    this.activeSeatsCount = 5,
    this.onComplete,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, child) {
        if (!controller.isAnimating && controller.value == 0.0) {
          return const SizedBox.shrink();
        }

        // Keep overlay visible until complete, then dismiss
        if (controller.isCompleted) {
          return const SizedBox.shrink();
        }

        final size = MediaQuery.of(context).size;
        final w = size.width;
        final h = size.height;

        // Dealer position (origin of deck)
        final dealerPos = Offset(w * 0.5, h * 0.155);

        // Precalculate target seats positions
        final heroCardY = h - 54 - 145 + 36;
        final heroTargets = [
          Offset(w * 0.5 - 28, heroCardY),
          Offset(w * 0.5, heroCardY),
          Offset(w * 0.5 + 28, heroCardY),
        ];
        final heroAngles = [-0.14, 0.0, 0.14];

        // Opponent seats target coordinates
        final opponentCardTargets = [
          // Seat 1: Bottom Left (fan to right)
          [
            Offset(w * 0.16 + 20, h * 0.58 - 10),
            Offset(w * 0.16 + 32, h * 0.58 - 10),
            Offset(w * 0.16 + 44, h * 0.58 - 10),
          ],
          // Seat 2: Top Left (fan to right)
          [
            Offset(w * 0.18 + 20, h * 0.18 - 10),
            Offset(w * 0.18 + 32, h * 0.18 - 10),
            Offset(w * 0.18 + 44, h * 0.18 - 10),
          ],
          // Seat 3: Top Right (fan to left)
          [
            Offset(w * 0.82 - 44, h * 0.18 - 10),
            Offset(w * 0.82 - 32, h * 0.18 - 10),
            Offset(w * 0.82 - 20, h * 0.18 - 10),
          ],
          // Seat 4: Bottom Right (fan to left)
          [
            Offset(w * 0.84 - 44, h * 0.58 - 10),
            Offset(w * 0.84 - 32, h * 0.58 - 10),
            Offset(w * 0.84 - 20, h * 0.58 - 10),
          ],
        ];

        final opponentAngles = [
          [-0.15, 0.0, 0.15],
          [-0.15, 0.0, 0.15],
          [-0.15, 0.0, 0.15],
          [-0.15, 0.0, 0.15],
        ];

        // Number of seats to deal to (Hero is 0, Opponents are 1..activeSeatsCount-1)
        final seatCount = (activeSeatsCount < 2) ? 5 : activeSeatsCount.clamp(2, 5);

        // Sequence: 3 rounds of dealing, 1 card to each seat per round
        final flights = <_DealingCardFlight>[];
        int dealIndex = 0;
        final totalCards = 3 * seatCount;
        const flightDurationFraction = 0.24; // 24% of total time per card flight
        final availableLaunchTime = 1.0 - flightDurationFraction;

        for (int round = 0; round < 3; round++) {
          for (int s = 0; s < seatCount; s++) {
            final startFraction = (totalCards > 1)
                ? (dealIndex / totalCards) * availableLaunchTime
                : 0.0;

            if (s == 0) {
              // Hero
              flights.add(_DealingCardFlight(
                seatIndex: 0,
                cardIndex: round,
                start: dealerPos,
                end: heroTargets[round],
                startAngle: -0.05,
                endAngle: heroAngles[round],
                startScale: 0.40,
                endScale: 1.0,
                startTime: startFraction,
                flightDuration: flightDurationFraction,
              ));
            } else {
              // Opponent (s - 1)
              final oppIdx = (s - 1) % 4;
              flights.add(_DealingCardFlight(
                seatIndex: s,
                cardIndex: round,
                start: dealerPos,
                end: opponentCardTargets[oppIdx][round],
                startAngle: (oppIdx < 2) ? -0.3 : 0.3,
                endAngle: opponentAngles[oppIdx][round],
                startScale: 0.35,
                endScale: 0.55,
                startTime: startFraction,
                flightDuration: flightDurationFraction,
              ));
            }
            dealIndex++;
          }
        }

        final t = controller.value;

        return IgnorePointer(
          child: Stack(
            children: [
              // Dealer deck glowing aura at top
              Positioned(
                left: dealerPos.dx - 25,
                top: dealerPos.dy - 15,
                width: 50,
                height: 30,
                child: Opacity(
                  opacity: (1.0 - t * 0.8).clamp(0.0, 1.0),
                  child: Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFFFD700).withValues(alpha: 0.5),
                          blurRadius: 18,
                          spreadRadius: 4,
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Flying Card Particles
              for (final flight in flights) _buildFlightCard(flight, t),
            ],
          ),
        );
      },
    );
  }

  Widget _buildFlightCard(_DealingCardFlight flight, double t) {
    if (t < flight.startTime) {
      return const SizedBox.shrink();
    }

    final elapsed = (t - flight.startTime) / flight.flightDuration;
    final progress = elapsed.clamp(0.0, 1.0);

    // Eased trajectory curve
    final curveVal = Curves.easeOutCubic.transform(progress);

    // Coordinates along flight path
    final curX = lerpDouble(flight.start.dx, flight.end.dx, curveVal)!;
    // Parabolic arc for 3D flight trajectory over felt table
    final arcApex = -35.0 * sin(curveVal * pi);
    final curY = lerpDouble(flight.start.dy, flight.end.dy, curveVal)! + arcApex;

    final scale = lerpDouble(flight.startScale, flight.endScale, curveVal)!;
    final angle = lerpDouble(flight.startAngle, flight.endAngle, curveVal)!;

    // Card dimensions
    final cardW = 44.0 * scale;
    final cardH = 64.0 * scale;

    // 3D elevation shadow during mid-air flight
    final shadowElevation = sin(curveVal * pi) * 12.0 + 2.0;
    final shadowOffsetY = sin(curveVal * pi) * 8.0 + 2.0;

    return Positioned(
      left: curX - cardW / 2,
      top: curY - cardH / 2,
      child: Transform.rotate(
        angle: angle,
        child: Container(
          width: cardW,
          height: cardH,
          decoration: BoxDecoration(
            color: const Color(0xFFC0392B),
            borderRadius: BorderRadius.circular(cardW * 0.1),
            border: Border.all(color: Colors.white, width: max(1.0, 1.5 * scale)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.5),
                blurRadius: shadowElevation,
                offset: Offset(0, shadowOffsetY),
              ),
              if (progress < 0.9)
                BoxShadow(
                  color: const Color(0xFFFFD54F).withValues(alpha: 0.35 * (1.0 - progress)),
                  blurRadius: 6,
                  spreadRadius: 1,
                ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(cardW * 0.08),
            child: Image.asset(
              'assets/game/teen_patti/card_back.png',
              width: cardW,
              height: cardH,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFFD32F2F), Color(0xFF8E0000)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Center(
                  child: Text(
                    '♠',
                    style: TextStyle(
                      color: const Color(0xFFFFD54F),
                      fontSize: 14 * scale,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
