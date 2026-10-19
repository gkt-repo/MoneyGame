import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';
import '../users/user_profile_screen.dart';

class RoomsScreen extends StatefulWidget {
  const RoomsScreen({super.key});

  @override
  State<RoomsScreen> createState() => _RoomsScreenState();
}

class _RoomsScreenState extends State<RoomsScreen> {
  List<AdminRoomModel> _rooms = [];
  bool _loading = true;
  String? _error;
  String _statusFilter = 'ALL';

  @override
  void initState() {
    super.initState();
    _fetchRooms();
  }

  Future<void> _fetchRooms() async {
    setState(() => _loading = true);
    try {
      final list = await AdminApiClient.getRooms();
      if (mounted) {
        setState(() {
          _rooms = list;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openUserProfile(String userId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => UserProfileScreen(userId: userId, onUserUpdated: _fetchRooms),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _rooms.where((r) {
      if (_statusFilter == 'ALL') return true;
      return r.status == _statusFilter;
    }).toList();

    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        title: const Text(
          'Active Game Tables',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.slate900),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, size: 20, color: AppColors.slate600),
            onPressed: _fetchRooms,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(49),
          child: Column(
            children: [
              Container(
                color: AppColors.white,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['ALL', 'WAITING', 'COUNTDOWN', 'ROLLING', 'COMPLETED'].map((st) {
                      final isSelected = _statusFilter == st;
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(st),
                          selected: isSelected,
                          onSelected: (val) {
                            if (val) setState(() => _statusFilter = st);
                          },
                          labelStyle: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: isSelected ? AppColors.white : AppColors.slate700,
                          ),
                          selectedColor: AppColors.slate900,
                          backgroundColor: AppColors.slate100,
                          elevation: 0,
                          visualDensity: VisualDensity.compact,
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
              Container(color: AppColors.slate200, height: 1),
            ],
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchRooms,
        child: _loading && _rooms.isEmpty
            ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900))
            : _error != null && _rooms.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(_error!, style: const TextStyle(color: AppColors.red600)),
                        const SizedBox(height: 10),
                        ElevatedButton(onPressed: _fetchRooms, child: const Text('Retry')),
                      ],
                    ),
                  )
                : filtered.isEmpty
                    ? const Center(
                        child: Text('No game tables match this status filter', style: TextStyle(color: AppColors.slate400, fontSize: 13)),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(14),
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (context, i) {
                          final room = filtered[i];
                          final isFull = room.players.length >= room.maxPlayers;
                          final isCompleted = room.status == 'COMPLETED';

                          return Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.slate200),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Top row: Code & Status
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: AppColors.slate900,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        'CODE: ${room.roomCode}',
                                        style: const TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.white),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: isCompleted
                                            ? AppColors.slate100
                                            : isFull
                                                ? AppColors.amber50
                                                : AppColors.emerald50,
                                        borderRadius: BorderRadius.circular(6),
                                        border: Border.all(
                                          color: isCompleted
                                              ? AppColors.slate300
                                              : isFull
                                                  ? AppColors.amber600.withValues(alpha: 0.3)
                                                  : AppColors.emerald600.withValues(alpha: 0.3),
                                        ),
                                      ),
                                      child: Text(
                                        room.status,
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800,
                                          color: isCompleted
                                              ? AppColors.slate700
                                              : isFull
                                                  ? AppColors.amber800
                                                  : AppColors.emerald700,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),

                                // Stake & Player count
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      children: [
                                        const Text('Entry Stake: ', style: TextStyle(fontSize: 12, color: AppColors.slate500)),
                                        Text('₹${room.entryFee.toStringAsFixed(2)}', style: const TextStyle(fontFamily: 'monospace', fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.slate900)),
                                      ],
                                    ),
                                    Row(
                                      children: [
                                        const Icon(Icons.people_outline, size: 14, color: AppColors.slate500),
                                        const SizedBox(width: 4),
                                        Text('${room.players.length} / ${room.maxPlayers}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate700)),
                                      ],
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                const Divider(height: 1),
                                const SizedBox(height: 8),

                                // Players Joined List
                                const Text('Players in Room:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate500)),
                                const SizedBox(height: 6),
                                if (room.players.isEmpty)
                                  const Text('Waiting for players to join...', style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: AppColors.slate400))
                                else
                                  Wrap(
                                    spacing: 6,
                                    runSpacing: 6,
                                    children: room.players.map((p) {
                                      final isRoomWinner = room.winnerId == p.userId;

                                      return InkWell(
                                        onTap: () => _openUserProfile(p.userId),
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: isRoomWinner ? AppColors.emerald50 : AppColors.slate50,
                                            borderRadius: BorderRadius.circular(6),
                                            border: Border.all(color: isRoomWinner ? AppColors.emerald600 : AppColors.slate200),
                                          ),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              if (isRoomWinner) ...[
                                                const Icon(Icons.emoji_events, size: 12, color: AppColors.emerald600),
                                                const SizedBox(width: 4),
                                              ],
                                              Text(
                                                p.username,
                                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate800),
                                              ),
                                              const SizedBox(width: 6),
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                                decoration: BoxDecoration(
                                                  color: AppColors.slate200,
                                                  borderRadius: BorderRadius.circular(3),
                                                ),
                                                child: Text(
                                                  '#${p.guessNumber}',
                                                  style: const TextStyle(fontFamily: 'monospace', fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.slate900),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      );
                                    }).toList(),
                                  ),

                                if (room.winningNumber != null) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    'Winning Roll: #${room.winningNumber}',
                                    style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.emerald700),
                                  ),
                                ],
                              ],
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
