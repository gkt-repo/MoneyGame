import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';

class CardWaitingHall extends StatelessWidget {
  final RoomModel room;
  final String userId;
  final int? countdown;

  const CardWaitingHall({
    super.key,
    required this.room,
    required this.userId,
    this.countdown,
  });

  @override
  Widget build(BuildContext context) {
    final remaining = (room.maxPlayers - room.players.length).clamp(
      0,
      room.maxPlayers,
    );
    final starting = room.status == 'COUNTDOWN' || countdown != null;
    final cancelled = room.status == 'CANCELLED';
    final isTwentyNine = room.gameType == 'TWENTY_NINE';
    final count = countdown ?? room.countdown;
    const purple = Color(0xFFC4B5FD);

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF4C1D95), Color(0xFF0F172A)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  Text(
                    isTwentyNine ? '29 CARD GAME · 2 vs 2' : 'TEEN PATTI',
                    style: const TextStyle(
                      color: purple,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Waiting hall',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Semantics(
                    liveRegion: true,
                    label: starting && count != null && count > 0
                        ? 'Match starts in $count seconds'
                        : null,
                    child: Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.08),
                        border: Border.all(
                          color: purple.withValues(alpha: 0.5),
                          width: 4,
                        ),
                      ),
                      alignment: Alignment.center,
                      child: starting && count != null && count > 0
                          ? Text(
                              '$count',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 48,
                                fontWeight: FontWeight.bold,
                              ),
                            )
                          : const Icon(
                              Icons.people_alt_outlined,
                              color: purple,
                              size: 40,
                            ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    cancelled
                        ? 'Table cancelled'
                        : starting
                        ? count == 0
                              ? 'Opening match board…'
                              : 'All players are here!'
                        : remaining > 0
                        ? 'Waiting for $remaining more player${remaining == 1 ? '' : 's'}'
                        : 'Getting the table ready…',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    cancelled
                        ? 'Entries have been refunded. You can return to the tables.'
                        : starting
                        ? 'Your match will begin automatically after the countdown.'
                        : 'Once every seat is filled, a 5-second countdown will begin.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Color(0xFFCBD5E1),
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    '${room.players.length} / ${room.maxPlayers} players  ·  ₹${room.entryFee.toStringAsFixed(0)} ${isTwentyNine ? 'entry' : 'boot'}',
                    style: const TextStyle(color: purple),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Table #${room.roomCode}',
                    style: const TextStyle(color: purple, fontSize: 12),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            ...List.generate(room.maxPlayers, (index) {
              final matches = room.players.where((p) => p.seatIndex == index);
              final player = matches.isEmpty ? null : matches.first;
              final name = player == null
                  ? ''
                  : player.displayName.isNotEmpty
                  ? player.displayName
                  : player.username;
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: player == null
                        ? const Color(0xFFE2E8F0)
                        : const Color(0xFFDDD6FE),
                  ),
                ),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFFEDE9FE),
                    child: player == null
                        ? const Icon(Icons.schedule, color: Color(0xFF7C3AED))
                        : Text(
                            name.isEmpty ? 'P' : name[0].toUpperCase(),
                            style: const TextStyle(color: Color(0xFF7C3AED)),
                          ),
                  ),
                  title: Text(
                    player == null
                        ? 'Waiting for player…'
                        : '$name${player.userId == userId ? ' (You)' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    'Seat ${index + 1}${isTwentyNine ? ' · Team ${index.isEven ? 'A' : 'B'}' : ''}',
                  ),
                  trailing: player == null
                      ? null
                      : const Icon(
                          Icons.check_circle_outline,
                          color: Color(0xFF059669),
                          semanticLabel: 'Joined',
                        ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
