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
  String _statusFilter = 'ACTIVE';
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchRooms();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchRooms() async {
    setState(() => _loading = true);
    try {
      final list = await AdminApiClient.getRooms(
        status: _statusFilter,
        search: _searchController.text.trim().isNotEmpty ? _searchController.text.trim() : null,
      );
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

  Future<void> _showCancelDialog(AdminRoomModel room) async {
    final reasonController = TextEditingController();
    bool isSubmitting = false;
    String? dialogError;

    final totalRefund = room.players.fold<double>(
      0.0,
      (sum, p) => sum + (p.totalPaid > 0 ? p.totalPaid : room.entryFee),
    );

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: AppColors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.red50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.warning_amber_rounded, color: AppColors.red600, size: 24),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Cancel Table & Refund',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.slate900),
                    ),
                  ),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (dialogError != null) ...[
                      Container(
                        padding: const EdgeInsets.all(8),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: AppColors.red50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                        ),
                        child: Text(dialogError!, style: const TextStyle(color: AppColors.red700, fontSize: 12)),
                      ),
                    ],
                    Text(
                      'Are you sure you want to cancel Table #${room.roomCode}? All active gameplay will stop, and 100% of entry fees and in-game bets will be refunded to participant wallets.',
                      style: const TextStyle(fontSize: 13, color: AppColors.slate600, height: 1.4),
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.slate50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.slate200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('Total Refund Amount:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.slate700)),
                              Text('₹${totalRefund.toStringAsFixed(2)}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.emerald700, fontFamily: 'monospace')),
                            ],
                          ),
                          const Divider(height: 16),
                          const Text('Participant Breakdown:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate500)),
                          const SizedBox(height: 6),
                          ...room.players.map((p) {
                            final refundAmount = p.totalPaid > 0 ? p.totalPaid : room.entryFee;
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 2),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(p.username, style: const TextStyle(fontSize: 11, color: AppColors.slate800)),
                                  Text('₹${refundAmount.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate900, fontFamily: 'monospace')),
                                ],
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text('Reason (Optional):', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate700)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: reasonController,
                      style: const TextStyle(fontSize: 12),
                      decoration: InputDecoration(
                        hintText: 'e.g. Player disconnected, Stalled round',
                        hintStyle: const TextStyle(color: AppColors.slate400, fontSize: 12),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: isSubmitting ? null : () => Navigator.of(ctx).pop(),
                  child: const Text('Keep Table', style: TextStyle(color: AppColors.slate600, fontWeight: FontWeight.w600)),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.red600,
                    foregroundColor: AppColors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: isSubmitting
                      ? null
                      : () async {
                          setDialogState(() {
                            isSubmitting = true;
                            dialogError = null;
                          });
                          try {
                            final messenger = ScaffoldMessenger.of(context);
                            final res = await AdminApiClient.cancelRoom(
                              room.id,
                              reason: reasonController.text.trim().isNotEmpty ? reasonController.text.trim() : null,
                            );
                            if (ctx.mounted) {
                              Navigator.of(ctx).pop();
                            }
                            messenger.showSnackBar(
                              SnackBar(
                                content: Text(res['message'] ?? 'Table cancelled and funds refunded successfully'),
                                backgroundColor: AppColors.emerald700,
                              ),
                            );
                            _fetchRooms();
                          } catch (e) {
                            setDialogState(() {
                              isSubmitting = false;
                              dialogError = e.toString();
                            });
                          }
                        },
                  child: isSubmitting
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                      : const Text('Confirm Cancel & Refund', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _getGameTypeBadge(String gameType) {
    Color bg;
    Color fg;
    String label;
    IconData icon;

    switch (gameType) {
      case 'TEEN_PATTI':
        bg = AppColors.amber50;
        fg = AppColors.amber800;
        label = 'Teen Patti';
        icon = Icons.style;
        break;
      case 'SPORTS_MATCH':
        bg = AppColors.emerald50;
        fg = AppColors.emerald700;
        label = 'Sports Pool';
        icon = Icons.emoji_events;
        break;
      case 'GUESS_NUMBER':
      default:
        bg = AppColors.slate100;
        fg = AppColors.slate800;
        label = 'Guess Number';
        icon = Icons.casino;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: fg),
          const SizedBox(width: 3),
          Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: fg)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        title: const Text(
          'Game Tables & Controls',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.slate900),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, size: 20, color: AppColors.slate600),
            onPressed: _fetchRooms,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(96),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                child: SizedBox(
                  height: 38,
                  child: TextField(
                    controller: _searchController,
                    onSubmitted: (_) => _fetchRooms(),
                    style: const TextStyle(fontSize: 12),
                    decoration: InputDecoration(
                      hintText: 'Search room code or player username...',
                      hintStyle: const TextStyle(fontSize: 11, color: AppColors.slate400),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      prefixIcon: const Icon(Icons.search, size: 16, color: AppColors.slate400),
                      prefixIconConstraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 16),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                              onPressed: () {
                                _searchController.clear();
                                _fetchRooms();
                              },
                            )
                          : null,
                      filled: true,
                      fillColor: AppColors.slate50,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: AppColors.slate200),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: AppColors.slate200),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: AppColors.slate700),
                      ),
                    ),
                  ),
                ),
              ),
              Container(
                color: AppColors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['ACTIVE', 'ALL', 'WAITING', 'PLAYING', 'COUNTDOWN', 'ROLLING', 'COMPLETED', 'CANCELLED'].map((st) {
                      final isSelected = _statusFilter == st;
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(st),
                          selected: isSelected,
                          onSelected: (val) {
                            if (val) {
                              setState(() => _statusFilter = st);
                              _fetchRooms();
                            }
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
                : _rooms.isEmpty
                    ? const Center(
                        child: Text('No game tables match this status filter', style: TextStyle(color: AppColors.slate400, fontSize: 13)),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(14),
                        itemCount: _rooms.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (context, i) {
                          final room = _rooms[i];
                          final isFull = room.players.length >= room.maxPlayers;
                          final isCompleted = room.status == 'COMPLETED';
                          final isCancelled = room.status == 'CANCELLED';
                          final isActive = ['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'].contains(room.status);

                          return Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isCancelled
                                    ? AppColors.red600.withValues(alpha: 0.3)
                                    : isActive
                                        ? AppColors.slate300
                                        : AppColors.slate200,
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Top row: Code, Game Type & Status
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
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
                                        const SizedBox(width: 6),
                                        _getGameTypeBadge(room.gameType),
                                      ],
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: isCancelled
                                            ? AppColors.red50
                                            : isCompleted
                                                ? AppColors.slate100
                                                : isFull
                                                    ? AppColors.amber50
                                                    : AppColors.emerald50,
                                        borderRadius: BorderRadius.circular(6),
                                        border: Border.all(
                                          color: isCancelled
                                              ? AppColors.red600.withValues(alpha: 0.3)
                                              : isCompleted
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
                                          color: isCancelled
                                              ? AppColors.red700
                                              : isCompleted
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

                                // Stake, Pot & Player count
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      children: [
                                        const Text('Entry: ', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                                        Text('₹${room.entryFee.toStringAsFixed(2)}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.slate900)),
                                        const SizedBox(width: 10),
                                        const Text('Pot: ', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                                        Text('₹${room.totalPot.toStringAsFixed(2)}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.emerald700)),
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
                                              if (p.guessNumber != null) ...[
                                                const SizedBox(width: 4),
                                                Container(
                                                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                                  decoration: BoxDecoration(
                                                    color: AppColors.slate200,
                                                    borderRadius: BorderRadius.circular(3),
                                                  ),
                                                  child: Text(
                                                    '#${p.guessNumber}',
                                                    style: const TextStyle(fontFamily: 'monospace', fontSize: 9, fontWeight: FontWeight.bold, color: AppColors.slate900),
                                                  ),
                                                ),
                                              ],
                                              if (p.inGameStake > 0) ...[
                                                const SizedBox(width: 4),
                                                Text(
                                                  '+₹${p.inGameStake.toStringAsFixed(0)}',
                                                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.amber800, fontFamily: 'monospace'),
                                                ),
                                              ],
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

                                if (isCancelled) ...[
                                  const SizedBox(height: 8),
                                  Container(
                                    padding: const EdgeInsets.all(6),
                                    decoration: BoxDecoration(
                                      color: AppColors.red50,
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Row(
                                      children: [
                                        Icon(Icons.info_outline, size: 13, color: AppColors.red600),
                                        SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            'Table cancelled & 100% refunded to participants',
                                            style: TextStyle(fontSize: 10, color: AppColors.red700, fontWeight: FontWeight.w600),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],

                                // Admin Action Bar: Cancel Table Button (for active rooms)
                                if (isActive) ...[
                                  const SizedBox(height: 10),
                                  const Divider(height: 1),
                                  const SizedBox(height: 8),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: OutlinedButton.icon(
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: AppColors.red600,
                                        side: const BorderSide(color: AppColors.red600),
                                        visualDensity: VisualDensity.compact,
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                      ),
                                      icon: const Icon(Icons.cancel_outlined, size: 14),
                                      label: const Text('Cancel & Refund Table', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                                      onPressed: () => _showCancelDialog(room),
                                    ),
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
