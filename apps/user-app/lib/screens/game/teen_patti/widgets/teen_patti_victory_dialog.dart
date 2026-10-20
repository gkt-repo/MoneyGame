import 'package:flutter/material.dart';
import '../../../../models/teen_patti_models.dart';
import 'teen_patti_card_visual.dart';

class TeenPattiVictoryDialog extends StatelessWidget {
  final GameFinishedModel finishData;
  final String heroUserId;
  final VoidCallback onBackToLobby;

  const TeenPattiVictoryDialog({
    super.key,
    required this.finishData,
    required this.heroUserId,
    required this.onBackToLobby,
  });

  @override
  Widget build(BuildContext context) {
    final isMeWinner = finishData.winnerId == heroUserId;

    return Center(
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: 440,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF2C0B16), Color(0xFF19060E)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isMeWinner ? const Color(0xFFFFD54F) : const Color(0xFF64748B),
              width: 2,
            ),
            boxShadow: [
              BoxShadow(
                color: (isMeWinner ? const Color(0xFFFFB300) : Colors.black)
                    .withValues(alpha: 0.5),
                blurRadius: 24,
                spreadRadius: 4,
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Trophy Icon
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFFE082), Color(0xFFFF8F00)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.amber.withValues(alpha: 0.5),
                      blurRadius: 10,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: const Icon(Icons.emoji_events, size: 28, color: Color(0xFF451A03)),
              ),
              const SizedBox(height: 8),

              // Title
              Text(
                isMeWinner
                    ? '🎉 YOU WON THE HAND! 🎉'
                    : '🏆 ${finishData.winnerUsername} Won!',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  color: Color(0xFFFFD54F),
                  letterSpacing: 0.5,
                ),
              ),

              if (finishData.reason != null && finishData.reason!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    finishData.reason!,
                    style: const TextStyle(fontSize: 11, color: Color(0xFFFFE082)),
                  ),
                ),

              const SizedBox(height: 8),

              // Payout Banner
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF10B981), width: 1),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.stars, color: Color(0xFF10B981), size: 18),
                    const SizedBox(width: 6),
                    Text(
                      '+₹${finishData.winnerPrize.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF10B981),
                      ),
                    ),
                  ],
                ),
              ),

              // Showdown Hands Section
              if (finishData.showdown.isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text(
                  'SHOWDOWN REVEAL',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1,
                    color: Color(0xFFFFCA28),
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 16,
                  alignment: WrapAlignment.center,
                  children: finishData.showdown.map((s) {
                    final isShowdownWinner = s.userId == finishData.winnerId;
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isShowdownWinner
                            ? const Color(0xFFFFD54F).withValues(alpha: 0.15)
                            : Colors.white.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isShowdownWinner ? const Color(0xFFFFD54F) : Colors.white12,
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '${s.username}${s.userId == heroUserId ? ' (You)' : ''}',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: isShowdownWinner ? const Color(0xFFFFD54F) : Colors.white70,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: s.cards
                                .map((c) => Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 2),
                                      child: TeenPattiCardVisual(
                                        card: c,
                                        width: 24,
                                        height: 36,
                                      ),
                                    ))
                                .toList(),
                          ),
                          if (s.handResult != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Text(
                                s.handResult!.displayTitle,
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w900,
                                  color: isShowdownWinner
                                      ? const Color(0xFFFFD54F)
                                      : const Color(0xFF94A3B8),
                                ),
                              ),
                            ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ],

              const SizedBox(height: 14),

              // Back to Tables Button
              SizedBox(
                width: 180,
                height: 36,
                child: ElevatedButton(
                  onPressed: onBackToLobby,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFFB300),
                    foregroundColor: const Color(0xFF2A1202),
                    elevation: 4,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text(
                    'Back to Tables',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
