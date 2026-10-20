import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/api_client.dart';
import '../../core/network/socket_service.dart';
import '../game/active_room_screen.dart';
import '../game/teen_patti/teen_patti_table_screen.dart';
import '../game/sports_match/sports_match_table_screen.dart';

class LobbyScreen extends StatefulWidget {
  final UserProfileModel user;
  final VoidCallback onBalanceRefresh;

  const LobbyScreen({
    super.key,
    required this.user,
    required this.onBalanceRefresh,
  });

  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  List<RoomModel> _rooms = [];
  bool _loading = true;
  String? _error;
  String _filterGame = 'ALL';

  @override
  void initState() {
    super.initState();
    _fetchRooms();

    SocketService.on('lobby_rooms_updated', (data) {
      if (mounted && data != null && data is List) {
        setState(() {
          _rooms = data.map((r) => RoomModel.fromJson(r)).toList();
        });
      }
    });
  }

  Future<void> _fetchRooms() async {
    setState(() => _loading = true);
    try {
      final rooms = await ApiClient.getActiveRooms();
      if (mounted) {
        setState(() {
          _rooms = rooms;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _navigateToRoom(String roomId, {String? gameType}) {
    final room = _rooms.cast<RoomModel?>().firstWhere(
      (r) => r?.id == roomId,
      orElse: () => null,
    );
    final isTeenPatti = gameType == 'TEEN_PATTI' || room?.gameType == 'TEEN_PATTI';
    final isSportsMatch = gameType == 'SPORTS_MATCH' || room?.gameType == 'SPORTS_MATCH';

    final Widget targetScreen = isTeenPatti
        ? TeenPattiTableScreen(
            roomId: roomId,
            user: widget.user,
            onBalanceRefresh: widget.onBalanceRefresh,
          )
        : isSportsMatch
            ? SportsMatchTableScreen(
                roomId: roomId,
                user: widget.user,
                onBalanceRefresh: widget.onBalanceRefresh,
              )
            : ActiveRoomScreen(
                roomId: roomId,
                user: widget.user,
              );

    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => targetScreen),
    ).then((_) {
      _fetchRooms();
      widget.onBalanceRefresh();
    });
  }

  void _showCreateTableModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _CreateTableBottomSheet(
        user: widget.user,
        onRoomCreated: (room) {
          Navigator.of(ctx).pop();
          _navigateToRoom(room.id);
        },
      ),
    );
  }

  void _showJoinCodeModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _JoinCodeBottomSheet(
        user: widget.user,
        onRoomJoined: (room) {
          Navigator.of(ctx).pop();
          _navigateToRoom(room.id);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      body: RefreshIndicator(
        onRefresh: () async {
          await _fetchRooms();
          widget.onBalanceRefresh();
        },
        color: AppColors.emerald600,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Action Buttons (Create Table & Join Code)
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _showCreateTableModal,
                            icon: const Icon(Icons.add_circle_outline, size: 18, color: AppColors.white),
                            label: const Text(
                              'Create Table',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.white),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.emerald600,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _showJoinCodeModal,
                            icon: const Icon(Icons.tag, size: 18, color: AppColors.slate800),
                            label: const Text(
                              'Join Code',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.slate800),
                            ),
                            style: OutlinedButton.styleFrom(
                              backgroundColor: AppColors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              side: const BorderSide(color: AppColors.slate200),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Section Heading
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'ACTIVE TABLES',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                            color: AppColors.slate500,
                          ),
                        ),
                        Text(
                          '${_rooms.length} Online',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.emerald600),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Game Filter Chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _buildFilterTab('ALL', 'All Tables (${_rooms.length})'),
                          const SizedBox(width: 8),
                          _buildFilterTab(
                            'SPORTS_MATCH',
                            '🏏 Live Sports (${_rooms.where((r) => r.gameType == 'SPORTS_MATCH').length})',
                          ),
                          const SizedBox(width: 8),
                          _buildFilterTab(
                            'TEEN_PATTI',
                            '🃏 Teen Patti (${_rooms.where((r) => r.gameType == 'TEEN_PATTI').length})',
                          ),
                          const SizedBox(width: 8),
                          _buildFilterTab(
                            'GUESS_NUMBER',
                            '🎲 Dice Guess (${_rooms.where((r) => r.gameType == 'GUESS_NUMBER').length})',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            if (_loading && _rooms.isEmpty)
              const SliverFillRemaining(
                child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.emerald600),
                ),
              )
            else if (_error != null && _rooms.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 36, color: AppColors.red600),
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: AppColors.slate600)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _fetchRooms,
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald600),
                        child: const Text('Retry', style: TextStyle(color: AppColors.white)),
                      )
                    ],
                  ),
                ),
              )
            else if (_rooms.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            color: AppColors.slate100,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.casino_outlined, size: 28, color: AppColors.slate400),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'No Active Tables',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Create a new table or invite a player with a room code to get started.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: AppColors.slate500),
                        ),
                        const SizedBox(height: 20),
                        ElevatedButton(
                          onPressed: _showCreateTableModal,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.slate900,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                          child: const Text('Create First Table', style: TextStyle(color: AppColors.white)),
                        )
                      ],
                    ),
                  ),
                ),
              )
            else ...[
              Builder(
                builder: (context) {
                  final filtered = _filterGame == 'ALL'
                      ? _rooms
                      : _rooms.where((r) => r.gameType == _filterGame).toList();

                  if (filtered.isEmpty) {
                    return SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(
                        child: Text(
                          'No active ${_filterGame == 'TEEN_PATTI' ? 'Teen Patti' : _filterGame == 'SPORTS_MATCH' ? 'Live Sports' : 'Dice Guess'} tables right now.',
                          style: const TextStyle(color: AppColors.slate500, fontSize: 13),
                        ),
                      ),
                    );
                  }

                  return SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final room = filtered[index];
                          return _buildRoomCard(room);
                        },
                        childCount: filtered.length,
                      ),
                    ),
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildFilterTab(String type, String label) {
    final isSel = _filterGame == type;
    return InkWell(
      onTap: () => setState(() => _filterGame = type),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSel
              ? (type == 'TEEN_PATTI'
                  ? const Color(0xFF6B21A8)
                  : type == 'SPORTS_MATCH'
                      ? const Color(0xFF1E3A8A)
                      : AppColors.slate900)
              : AppColors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSel ? Colors.transparent : AppColors.slate200,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: isSel ? Colors.white : AppColors.slate700,
          ),
        ),
      ),
    );
  }

  Widget _buildRoomCard(RoomModel room) {
    final isPlayerInRoom = room.players.any((p) => p.userId == widget.user.id);
    final isFull = room.players.length >= room.maxPlayers;
    final totalPot = room.entryFee * room.maxPlayers;
    final isTeenPatti = room.gameType == 'TEEN_PATTI';
    final isSportsMatch = room.gameType == 'SPORTS_MATCH';
    final winnerPrize = isSportsMatch ? (room.entryFee * room.players.length) : (totalPot * 0.90);

    final matchTitle = room.customConfig?['matchTitle']?.toString() ??
        (room.customConfig != null && room.customConfig!['team1'] != null && room.customConfig!['team2'] != null
            ? '${room.customConfig!['team1']['name']} vs ${room.customConfig!['team2']['name']}'
            : 'Sports Match Pool');
    final team1Name = room.customConfig?['team1']?['name']?.toString() ?? 'Team 1';
    final team2Name = room.customConfig?['team2']?['name']?.toString() ?? 'Team 2';
    final team1Count = room.players.where((p) => p.guessNumber == 1).length;
    final team2Count = room.players.where((p) => p.guessNumber == 2).length;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isPlayerInRoom
              ? (isTeenPatti
                  ? const Color(0xFF9333EA)
                  : isSportsMatch
                      ? const Color(0xFF2563EB)
                      : AppColors.emerald600)
              : AppColors.slate200,
          width: isPlayerInRoom ? 1.5 : 1,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {
            if (isPlayerInRoom) {
              _navigateToRoom(room.id, gameType: room.gameType);
            } else if (!isFull) {
              if (isTeenPatti) {
                _showTeenPattiJoinDialog(room);
              } else if (isSportsMatch) {
                _showSportsJoinDialog(room);
              } else {
                _showQuickJoinDialog(room);
              }
            }
          },
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                          decoration: BoxDecoration(
                            color: isTeenPatti
                                ? const Color(0xFFFAF5FF)
                                : isSportsMatch
                                    ? const Color(0xFFEFF6FF)
                                    : AppColors.emerald50,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(
                              color: isTeenPatti
                                  ? const Color(0xFFD8B4FE)
                                  : isSportsMatch
                                      ? const Color(0xFFBFDBFE)
                                      : const Color(0xFFA7F3D0),
                            ),
                          ),
                          child: Text(
                            isTeenPatti
                                ? '🃏 3 PATTI'
                                : isSportsMatch
                                    ? '🏏 LIVE SPORTS'
                                    : '🎲 DICE GUESS',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: isTeenPatti
                                  ? const Color(0xFF7E22CE)
                                  : isSportsMatch
                                      ? const Color(0xFF1D4ED8)
                                      : AppColors.emerald700,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '#${room.roomCode}',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.slate900,
                          ),
                        ),
                        if (isPlayerInRoom) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: isSportsMatch ? const Color(0xFFDBEAFE) : AppColors.emerald100,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              'JOINED',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: isSportsMatch ? const Color(0xFF1E40AF) : AppColors.emerald800,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: room.status == 'WAITING' ? AppColors.emerald50 : AppColors.amber50,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        room.status,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: room.status == 'WAITING' ? AppColors.emerald700 : AppColors.amber800,
                        ),
                      ),
                    ),
                  ],
                ),

                if (isSportsMatch) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          matchTitle,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$team1Name ($team1Count) vs $team2Name ($team2Count backers)',
                          style: const TextStyle(fontSize: 11, color: AppColors.slate600, fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 12),

                // Table Stats Row
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isTeenPatti ? 'BOOT AMOUNT' : 'ENTRY STAKE',
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.slate400),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '₹${room.entryFee.toStringAsFixed(0)}',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: AppColors.slate900,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isSportsMatch ? 'TOTAL POOL' : 'POT PRIZE',
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.slate400),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            isSportsMatch
                                ? '₹${winnerPrize.toStringAsFixed(0)} (Live)'
                                : '₹${winnerPrize.toStringAsFixed(0)}',
                            style: TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: isSportsMatch ? const Color(0xFF1D4ED8) : AppColors.emerald600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'OCCUPANCY',
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.slate400),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            room.maxPlayers >= 100
                                ? '${room.players.length} / ∞ Players'
                                : '${room.players.length} / ${room.maxPlayers} Players',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.slate700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Button CTA
                SizedBox(
                  width: double.infinity,
                  height: 38,
                  child: ElevatedButton(
                    onPressed: isPlayerInRoom
                        ? () => _navigateToRoom(room.id, gameType: room.gameType)
                        : isFull
                            ? null
                            : () => isTeenPatti
                                ? _showTeenPattiJoinDialog(room)
                                : isSportsMatch
                                    ? _showSportsJoinDialog(room)
                                    : _showQuickJoinDialog(room),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isPlayerInRoom
                          ? AppColors.slate900
                          : isTeenPatti
                              ? const Color(0xFF7E22CE)
                              : isSportsMatch
                                  ? const Color(0xFF2563EB)
                                  : AppColors.emerald600,
                      disabledBackgroundColor: AppColors.slate100,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: Text(
                      isPlayerInRoom
                          ? 'Enter Active Table'
                          : isFull
                              ? 'Table Full'
                              : isSportsMatch
                                  ? 'Back a Team (₹${room.entryFee.toStringAsFixed(0)})'
                                  : 'Join Table (₹${room.entryFee.toStringAsFixed(0)})',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: isFull && !isPlayerInRoom ? AppColors.slate400 : AppColors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showSportsJoinDialog(RoomModel room) {
    int selectedTeam = 1;
    final team1Name = room.customConfig?['team1']?['name']?.toString() ?? 'Team 1';
    final team2Name = room.customConfig?['team2']?['name']?.toString() ?? 'Team 2';
    final matchTitle = room.customConfig?['matchTitle']?.toString() ?? '$team1Name vs $team2Name';
    final team1Count = room.players.where((p) => p.guessNumber == 1).length;
    final team2Count = room.players.where((p) => p.guessNumber == 2).length;

    bool joining = false;
    String? joinError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final chosenTeamName = selectedTeam == 1 ? team1Name : team2Name;
          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Row(
              children: [
                const Text('🏏 ', style: TextStyle(fontSize: 20)),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Back Your Team',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                      ),
                      Text(
                        matchTitle,
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.slate500),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFBFDBFE)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Entry Stake:', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
                          Text(
                            '₹${room.entryFee.toStringAsFixed(0)}',
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF1D4ED8)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Available Balance:', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
                          Text(
                            '₹${widget.user.balance.toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Current Backers:', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
                          Text(
                            '$team1Count for $team1Name | $team2Count for $team2Name',
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate700),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Which team will win this match?',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () => setDialogState(() => selectedTeam = 1),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                          decoration: BoxDecoration(
                            color: selectedTeam == 1 ? const Color(0xFFEFF6FF) : AppColors.white,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: selectedTeam == 1 ? const Color(0xFF2563EB) : AppColors.slate200,
                              width: selectedTeam == 1 ? 2 : 1,
                            ),
                          ),
                          child: Column(
                            children: [
                              if (selectedTeam == 1)
                                const Icon(Icons.check_circle, size: 18, color: Color(0xFF2563EB))
                              else
                                const Icon(Icons.radio_button_unchecked, size: 18, color: AppColors.slate400),
                              const SizedBox(height: 4),
                              Text(
                                team1Name,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: selectedTeam == 1 ? const Color(0xFF1D4ED8) : AppColors.slate800,
                                ),
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                '$team1Count backers',
                                style: const TextStyle(fontSize: 10, color: AppColors.slate500),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: InkWell(
                        onTap: () => setDialogState(() => selectedTeam = 2),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                          decoration: BoxDecoration(
                            color: selectedTeam == 2 ? const Color(0xFFFAF5FF) : AppColors.white,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: selectedTeam == 2 ? const Color(0xFF7E22CE) : AppColors.slate200,
                              width: selectedTeam == 2 ? 2 : 1,
                            ),
                          ),
                          child: Column(
                            children: [
                              if (selectedTeam == 2)
                                const Icon(Icons.check_circle, size: 18, color: Color(0xFF7E22CE))
                              else
                                const Icon(Icons.radio_button_unchecked, size: 18, color: AppColors.slate400),
                              const SizedBox(height: 4),
                              Text(
                                team2Name,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: selectedTeam == 2 ? const Color(0xFF7E22CE) : AppColors.slate800,
                                ),
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                '$team2Count backers',
                                style: const TextStyle(fontSize: 10, color: AppColors.slate500),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  '💡 Winning team backers divide 100% of the table pool equally.',
                  style: TextStyle(fontSize: 10, color: AppColors.slate500, fontStyle: FontStyle.italic),
                ),
                if (joinError != null) ...[
                  const SizedBox(height: 10),
                  Text(joinError!, style: const TextStyle(color: AppColors.red600, fontSize: 12)),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Cancel', style: TextStyle(color: AppColors.slate500)),
              ),
              ElevatedButton(
                onPressed: joining
                    ? null
                    : () async {
                        setDialogState(() {
                          joining = true;
                          joinError = null;
                        });
                        try {
                          final joinedRoom = await ApiClient.joinRoom(
                            userId: widget.user.id,
                            roomCode: room.roomCode,
                            guessNumber: selectedTeam,
                          );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          _navigateToRoom(joinedRoom.id, gameType: 'SPORTS_MATCH');
                        } catch (e) {
                          setDialogState(() {
                            joining = false;
                            joinError = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: Text('Back $chosenTeamName (₹${room.entryFee.toStringAsFixed(0)})', style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showTeenPattiJoinDialog(RoomModel room) {
    bool joining = false;
    String? joinError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Row(
              children: [
                const Text('🃏 ', style: TextStyle(fontSize: 20)),
                Text(
                  'Join Teen Patti #${room.roomCode}',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                ),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFAF5FF),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFE9D5FF)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Boot Stake:', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
                          Text(
                            '₹${room.entryFee.toStringAsFixed(0)}',
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF7E22CE)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Available Balance:', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
                          Text(
                            '₹${widget.user.balance.toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Seats Occupied:', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
                          Text(
                            '${room.players.length} / ${room.maxPlayers}',
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                if (joinError != null) ...[
                  const SizedBox(height: 12),
                  Text(joinError!, style: const TextStyle(color: AppColors.red600, fontSize: 12)),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Cancel', style: TextStyle(color: AppColors.slate500)),
              ),
              ElevatedButton(
                onPressed: joining
                    ? null
                    : () async {
                        setDialogState(() {
                          joining = true;
                          joinError = null;
                        });
                        try {
                          final joinedRoom = await ApiClient.joinRoom(
                            userId: widget.user.id,
                            roomCode: room.roomCode,
                          );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          _navigateToRoom(joinedRoom.id, gameType: 'TEEN_PATTI');
                        } catch (e) {
                          setDialogState(() {
                            joining = false;
                            joinError = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF7E22CE),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: const Text('Confirm & Take Seat', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showQuickJoinDialog(RoomModel room) {
    int chosenNumber = 1;
    final takenNumbers = room.players.map((p) => p.guessNumber).toSet();

    for (int i = 1; i <= 10; i++) {
      if (!takenNumbers.contains(i)) {
        chosenNumber = i;
        break;
      }
    }

    bool joining = false;
    String? joinError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            title: Text(
              'Join Table #${room.roomCode}',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Entry Fee: ₹${room.entryFee.toStringAsFixed(0)} (Balance: ₹${widget.user.balance.toStringAsFixed(2)})',
                  style: const TextStyle(fontSize: 13, color: AppColors.slate600),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Choose Your Lucky Number (1-10):',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate900),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: List.generate(10, (idx) {
                    final numVal = idx + 1;
                    final isTaken = takenNumbers.contains(numVal);
                    final isSelected = chosenNumber == numVal;

                    return ChoiceChip(
                      label: Text('$numVal'),
                      selected: isSelected,
                      onSelected: isTaken
                          ? null
                          : (sel) {
                              if (sel) setDialogState(() => chosenNumber = numVal);
                            },
                      backgroundColor: isTaken ? AppColors.slate100 : AppColors.white,
                      selectedColor: AppColors.emerald50,
                      labelStyle: TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w700,
                        color: isTaken
                            ? AppColors.slate400
                            : isSelected
                                ? AppColors.emerald700
                                : AppColors.slate900,
                      ),
                      side: BorderSide(
                        color: isSelected ? AppColors.emerald600 : AppColors.slate200,
                      ),
                    );
                  }),
                ),
                if (joinError != null) ...[
                  const SizedBox(height: 12),
                  Text(joinError!, style: const TextStyle(color: AppColors.red600, fontSize: 12)),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Cancel', style: TextStyle(color: AppColors.slate500)),
              ),
              ElevatedButton(
                onPressed: joining
                    ? null
                    : () async {
                        setDialogState(() {
                          joining = true;
                          joinError = null;
                        });
                        try {
                          final joinedRoom = await ApiClient.joinRoom(
                            userId: widget.user.id,
                            roomCode: room.roomCode,
                            guessNumber: chosenNumber,
                          );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          _navigateToRoom(joinedRoom.id);
                        } catch (e) {
                          setDialogState(() {
                            joining = false;
                            joinError = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.emerald600,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                ),
                child: const Text('Confirm & Join', style: TextStyle(color: AppColors.white)),
              ),
            ],
          );
        },
      ),
    );
  }
}

// Bottom sheet for Creating Table
class _CreateTableBottomSheet extends StatefulWidget {
  final UserProfileModel user;
  final Function(RoomModel room) onRoomCreated;

  const _CreateTableBottomSheet({required this.user, required this.onRoomCreated});

  @override
  State<_CreateTableBottomSheet> createState() => _CreateTableBottomSheetState();
}

class _CreateTableBottomSheetState extends State<_CreateTableBottomSheet> {
  String _selectedGameType = 'SPORTS_MATCH';
  double _entryFee = 100;
  int _maxPlayers = 10;
  int _chosenNumber = 7;
  bool _submitting = false;
  String? _error;

  // Sports Pool State
  List<Map<String, dynamic>> _sportsMatches = [];
  bool _loadingMatches = false;
  Map<String, dynamic>? _selectedMatch;
  String _createSportCategory = 'Cricket';
  final TextEditingController _searchController = TextEditingController();
  int _sportsPick = 1; // 1 = Team 1, 2 = Team 2
  int _sportsCapacity = 10; // 2, 4, 6, 10, 1000

  final List<double> _teenPattiStakes = [10, 20, 50, 100, 200, 500];
  final List<double> _diceStakes = [10, 25, 50, 100];
  final List<double> _sportsStakes = [10, 25, 50, 100, 200, 500, 1000];

  final List<Map<String, String>> _sportsCategories = [
    {'id': 'Cricket', 'name': 'Cricket', 'icon': '🏏'},
    {'id': 'Football', 'name': 'Football', 'icon': '⚽'},
    {'id': 'Basketball', 'name': 'Basketball', 'icon': '🏀'},
    {'id': 'Volleyball', 'name': 'Volleyball', 'icon': '🏐'},
    {'id': 'Tennis', 'name': 'Tennis', 'icon': '🎾'},
    {'id': 'ALL', 'name': 'All Sports', 'icon': '🌐'},
  ];

  final List<Map<String, dynamic>> _sportsCapacities = [
    {'label': '2 Players (1v1)', 'value': 2},
    {'label': '4 Players', 'value': 4},
    {'label': '6 Players', 'value': 6},
    {'label': '10 Players', 'value': 10},
    {'label': 'Unlimited (∞)', 'value': 1000},
  ];

  @override
  void initState() {
    super.initState();
    _loadMatches();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadMatches() async {
    setState(() => _loadingMatches = true);
    try {
      final matches = await ApiClient.getSportsMatches();
      if (mounted) {
        setState(() {
          _sportsMatches = matches.map((m) => Map<String, dynamic>.from(m as Map)).toList();
          _loadingMatches = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingMatches = false);
    }
  }

  List<Map<String, dynamic>> get _filteredMatches {
    final query = _searchController.text.trim().toLowerCase();
    final now = DateTime.now().millisecondsSinceEpoch;

    return _sportsMatches.where((m) {
      final status = m['status']?.toString();
      if (status == 'FINISHED' || status == 'CANCELLED') return false;

      final startTimeStr = m['startTime']?.toString();
      if (startTimeStr != null) {
        final parsed = DateTime.tryParse(startTimeStr);
        if (parsed != null && parsed.millisecondsSinceEpoch <= now) {
          return false;
        }
      }

      final sport = m['sport']?.toString().toLowerCase() ?? '';
      if (_createSportCategory != 'ALL' && sport != _createSportCategory.toLowerCase()) {
        return false;
      }

      if (query.isNotEmpty) {
        final name = m['name']?.toString().toLowerCase() ?? '';
        final shortName = m['shortName']?.toString().toLowerCase() ?? '';
        final league = m['league']?.toString().toLowerCase() ?? '';
        final t1 = m['team1']?['name']?.toString().toLowerCase() ?? '';
        final t1Short = m['team1']?['shortName']?.toString().toLowerCase() ?? '';
        final t2 = m['team2']?['name']?.toString().toLowerCase() ?? '';
        final t2Short = m['team2']?['shortName']?.toString().toLowerCase() ?? '';

        final corpus = '$name $shortName $league $t1 $t1Short $t2 $t2Short $t1 vs $t2 $t2 vs $t1 $t1 v $t2 $t2 v $t1';
        if (corpus.contains(query)) return true;

        final tokens = query.split(RegExp(r'\s+')).where((w) => !['vs', 'v', 'against', 'and'].contains(w)).toList();
        if (tokens.isEmpty) return true;
        final matchFound = tokens.every((tok) => corpus.contains(tok));
        if (!matchFound) return false;
      }

      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final isTeenPatti = _selectedGameType == 'TEEN_PATTI';
    final isSports = _selectedGameType == 'SPORTS_MATCH';
    final currentStakes = isSports ? _sportsStakes : (isTeenPatti ? _teenPattiStakes : _diceStakes);
    final maxPlayerOptions = isTeenPatti ? [2, 3, 4, 5, 6] : [2, 3, 4];

    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.88,
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.only(
          top: 20,
          left: 20,
          right: 20,
          bottom: MediaQuery.of(context).viewInsets.bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Create Game Table',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.slate900),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20, color: AppColors.slate500),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 14),

            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppColors.red50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                ),
                child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
              ),
            ],

            // ─── Game Selection Cards ───
            const Text(
              'Select Game',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                // Live Sports Card
                Expanded(
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        _selectedGameType = 'SPORTS_MATCH';
                        _entryFee = 100;
                        _sportsCapacity = 10;
                      });
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                      decoration: BoxDecoration(
                        color: isSports ? const Color(0xFFEFF6FF) : AppColors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isSports ? const Color(0xFF2563EB) : AppColors.slate200,
                          width: isSports ? 1.5 : 1,
                        ),
                      ),
                      child: Column(
                        children: [
                          const Text('🏏', style: TextStyle(fontSize: 20)),
                          const SizedBox(height: 4),
                          Text(
                            'Live Sports',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: isSports ? const Color(0xFF1D4ED8) : AppColors.slate800,
                            ),
                          ),
                          const Text('Cricket, etc.', style: TextStyle(fontSize: 9, color: AppColors.slate500)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Teen Patti Card
                Expanded(
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        _selectedGameType = 'TEEN_PATTI';
                        _entryFee = 20;
                        _maxPlayers = 6;
                      });
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                      decoration: BoxDecoration(
                        color: isTeenPatti ? const Color(0xFFFAF5FF) : AppColors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isTeenPatti ? const Color(0xFF9333EA) : AppColors.slate200,
                          width: isTeenPatti ? 1.5 : 1,
                        ),
                      ),
                      child: Column(
                        children: [
                          const Text('🃏', style: TextStyle(fontSize: 20)),
                          const SizedBox(height: 4),
                          Text(
                            'Teen Patti',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: isTeenPatti ? const Color(0xFF7E22CE) : AppColors.slate800,
                            ),
                          ),
                          const Text('3 Cards (2-6p)', style: TextStyle(fontSize: 9, color: AppColors.slate500)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Dice Guess Card
                Expanded(
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        _selectedGameType = 'GUESS_NUMBER';
                        _entryFee = 50;
                        _maxPlayers = 2;
                      });
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                      decoration: BoxDecoration(
                        color: (!isTeenPatti && !isSports) ? AppColors.emerald50 : AppColors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: (!isTeenPatti && !isSports) ? AppColors.emerald600 : AppColors.slate200,
                          width: (!isTeenPatti && !isSports) ? 1.5 : 1,
                        ),
                      ),
                      child: Column(
                        children: [
                          const Text('🎲', style: TextStyle(fontSize: 20)),
                          const SizedBox(height: 4),
                          Text(
                            'Dice Guess',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: (!isTeenPatti && !isSports) ? AppColors.emerald700 : AppColors.slate800,
                            ),
                          ),
                          const Text('Number (2-4p)', style: TextStyle(fontSize: 9, color: AppColors.slate500)),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // ─── Multi-Sport Picker & Search Section (SPORTS_MATCH only) ───
            if (isSports) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.slate200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Step 1: Horizontal Sport Categories
                    const Text(
                      '1. Choose Sport Category',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
                    ),
                    const SizedBox(height: 8),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: _sportsCategories.map((cat) {
                          final isCatSel = _createSportCategory == cat['id'];
                          return Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: InkWell(
                              onTap: () {
                                setState(() {
                                  _createSportCategory = cat['id']!;
                                  if (_selectedMatch != null &&
                                      cat['id'] != 'ALL' &&
                                      _selectedMatch!['sport']?.toString().toLowerCase() != cat['id']!.toLowerCase()) {
                                    _selectedMatch = null;
                                  }
                                });
                              },
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: isCatSel ? const Color(0xFF2563EB) : AppColors.white,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                    color: isCatSel ? const Color(0xFF2563EB) : AppColors.slate200,
                                  ),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(cat['icon']!, style: const TextStyle(fontSize: 12)),
                                    const SizedBox(width: 4),
                                    Text(
                                      cat['name']!,
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: isCatSel ? Colors.white : AppColors.slate700,
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
                    const SizedBox(height: 12),

                    // Step 2: Search for upcoming matches
                    const Text(
                      '2. Search Upcoming Matches',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _searchController,
                      onChanged: (_) => setState(() {}),
                      style: const TextStyle(fontSize: 12, color: AppColors.slate900),
                      decoration: InputDecoration(
                        hintText: 'Search ${_createSportCategory == 'ALL' ? 'all' : _createSportCategory} matches (e.g. IND vs AUS, teams)...',
                        hintStyle: const TextStyle(fontSize: 11, color: AppColors.slate400),
                        prefixIcon: const Icon(Icons.search, size: 16, color: AppColors.slate400),
                        suffixIcon: _searchController.text.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear, size: 14, color: AppColors.slate400),
                                onPressed: () {
                                  _searchController.clear();
                                  setState(() {});
                                },
                              )
                            : null,
                        filled: true,
                        fillColor: AppColors.white,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.slate200),
                        ),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 10),

                    // Step 3: Match Selection List
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Available Fixtures (${_filteredMatches.length})',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate700),
                        ),
                        if (_selectedMatch != null)
                          const Row(
                            children: [
                              Icon(Icons.check_circle, size: 12, color: AppColors.emerald600),
                              SizedBox(width: 3),
                              Text('Match Selected', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.emerald600)),
                            ],
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Container(
                      constraints: const BoxConstraints(maxHeight: 160),
                      decoration: BoxDecoration(
                        color: AppColors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.slate200),
                      ),
                      child: _loadingMatches
                          ? const Center(
                              child: Padding(
                                padding: EdgeInsets.all(16),
                                child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF2563EB)),
                              ),
                            )
                          : _filteredMatches.isEmpty
                              ? Center(
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Text(
                                      _searchController.text.isNotEmpty
                                          ? 'No matches found matching "${_searchController.text}"'
                                          : 'No scheduled fixtures found for $_createSportCategory.',
                                      style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                                      textAlign: TextAlign.center,
                                    ),
                                  ),
                                )
                              : ListView.separated(
                                  shrinkWrap: true,
                                  itemCount: _filteredMatches.length,
                                  separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.slate100),
                                  itemBuilder: (context, idx) {
                                    final m = _filteredMatches[idx];
                                    final isSel = _selectedMatch?['id'] == m['id'];
                                    final sport = m['sport']?.toString() ?? 'Sports';
                                    final sportIcon = sport == 'Cricket'
                                        ? '🏏'
                                        : sport == 'Football'
                                            ? '⚽'
                                            : sport == 'Basketball'
                                                ? '🏀'
                                                : sport == 'Volleyball'
                                                    ? '🏐'
                                                    : sport == 'Tennis'
                                                        ? '🎾'
                                                        : '🏆';

                                    final startTime = m['startTime'] != null ? DateTime.tryParse(m['startTime']) : null;
                                    final timeStr = startTime != null
                                        ? '${startTime.hour.toString().padLeft(2, '0')}:${startTime.minute.toString().padLeft(2, '0')}'
                                        : 'Upcoming';

                                    return InkWell(
                                      onTap: () => setState(() => _selectedMatch = m),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                        color: isSel ? const Color(0xFFEFF6FF) : Colors.transparent,
                                        child: Row(
                                          children: [
                                            Text(sportIcon, style: const TextStyle(fontSize: 16)),
                                            const SizedBox(width: 8),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    m['name']?.toString() ?? '',
                                                    style: TextStyle(
                                                      fontSize: 11,
                                                      fontWeight: isSel ? FontWeight.w700 : FontWeight.w600,
                                                      color: isSel ? const Color(0xFF1D4ED8) : AppColors.slate900,
                                                    ),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                  ),
                                                  Text(
                                                    m['league']?.toString() ?? sport,
                                                    style: const TextStyle(fontSize: 10, color: AppColors.slate400),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                  ),
                                                ],
                                              ),
                                            ),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                              decoration: BoxDecoration(
                                                color: const Color(0xFFEFF6FF),
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: Text(
                                                timeStr,
                                                style: const TextStyle(
                                                  fontFamily: 'monospace',
                                                  fontSize: 10,
                                                  fontWeight: FontWeight.w600,
                                                  color: Color(0xFF2563EB),
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 6),
                                            Icon(
                                              isSel ? Icons.check_circle : Icons.radio_button_unchecked,
                                              size: 16,
                                              color: isSel ? const Color(0xFF2563EB) : AppColors.slate300,
                                            ),
                                          ],
                                        ),
                                      ),
                                    );
                                  },
                                ),
                    ),

                    // Step 4: Choose Winner Pick (Team 1 vs Team 2)
                    if (_selectedMatch != null) ...[
                      Builder(
                        builder: (context) {
                          final team1Map = _selectedMatch!['team1'] as Map<String, dynamic>?;
                          final team2Map = _selectedMatch!['team2'] as Map<String, dynamic>?;
                          final team1Title = team1Map?['name']?.toString() ?? 'Team 1';
                          final team2Title = team2Map?['name']?.toString() ?? 'Team 2';

                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 12),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text(
                                    '3. Choose Winner Pick',
                                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                  ),
                                  InkWell(
                                    onTap: () => setState(() => _selectedMatch = null),
                                    child: const Text('Change Match', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF2563EB))),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Expanded(
                                    child: InkWell(
                                      onTap: () => setState(() => _sportsPick = 1),
                                      borderRadius: BorderRadius.circular(8),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                                        decoration: BoxDecoration(
                                          color: _sportsPick == 1 ? const Color(0xFF2563EB) : AppColors.white,
                                          borderRadius: BorderRadius.circular(8),
                                          border: Border.all(
                                            color: _sportsPick == 1 ? const Color(0xFF2563EB) : AppColors.slate200,
                                          ),
                                        ),
                                        child: Row(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            if (_sportsPick == 1)
                                              const Padding(
                                                padding: EdgeInsets.only(right: 4),
                                                child: Icon(Icons.check, size: 14, color: Colors.white),
                                              ),
                                            Flexible(
                                              child: Text(
                                                team1Title,
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w700,
                                                  color: _sportsPick == 1 ? Colors.white : AppColors.slate800,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: InkWell(
                                      onTap: () => setState(() => _sportsPick = 2),
                                      borderRadius: BorderRadius.circular(8),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                                        decoration: BoxDecoration(
                                          color: _sportsPick == 2 ? const Color(0xFF7E22CE) : AppColors.white,
                                          borderRadius: BorderRadius.circular(8),
                                          border: Border.all(
                                            color: _sportsPick == 2 ? const Color(0xFF7E22CE) : AppColors.slate200,
                                          ),
                                        ),
                                        child: Row(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            if (_sportsPick == 2)
                                              const Padding(
                                                padding: EdgeInsets.only(right: 4),
                                                child: Icon(Icons.check, size: 14, color: Colors.white),
                                              ),
                                            Flexible(
                                              child: Text(
                                                team2Title,
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w700,
                                                  color: _sportsPick == 2 ? Colors.white : AppColors.slate800,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          );
                        },
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // ─── Entry Stake ───
            Text(
              isTeenPatti ? 'Boot Stake (₹)' : 'Select Entry Stake (₹)',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: currentStakes.map((stake) {
                final isSel = _entryFee == stake;
                return ChoiceChip(
                  label: Text('₹${stake.toStringAsFixed(0)}'),
                  selected: isSel,
                  onSelected: (selected) {
                    if (selected) setState(() => _entryFee = stake);
                  },
                  backgroundColor: AppColors.white,
                  selectedColor: isSports
                      ? const Color(0xFFEFF6FF)
                      : isTeenPatti
                          ? const Color(0xFFF3E8FF)
                          : AppColors.emerald50,
                  labelStyle: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: isSel
                        ? (isSports
                            ? const Color(0xFF1D4ED8)
                            : isTeenPatti
                                ? const Color(0xFF7E22CE)
                                : AppColors.emerald700)
                        : AppColors.slate800,
                  ),
                  side: BorderSide(
                    color: isSel
                        ? (isSports
                            ? const Color(0xFF2563EB)
                            : isTeenPatti
                                ? const Color(0xFF9333EA)
                                : AppColors.emerald600)
                        : AppColors.slate200,
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),

            // ─── Player Capacity ───
            const Text(
              'Room Capacity',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
            ),
            const SizedBox(height: 8),
            if (isSports)
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _sportsCapacities.map((item) {
                    final val = item['value'] as int;
                    final isSel = _sportsCapacity == val;
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(item['label'] as String),
                        selected: isSel,
                        onSelected: (selected) {
                          if (selected) setState(() => _sportsCapacity = val);
                        },
                        backgroundColor: AppColors.white,
                        selectedColor: const Color(0xFFEFF6FF),
                        labelStyle: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: isSel ? const Color(0xFF1D4ED8) : AppColors.slate700,
                        ),
                        side: BorderSide(
                          color: isSel ? const Color(0xFF2563EB) : AppColors.slate200,
                        ),
                      ),
                    );
                  }).toList(),
                ),
              )
            else
              Row(
                children: maxPlayerOptions.map((count) {
                  final isSel = _maxPlayers == count;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text('$count Players'),
                      selected: isSel,
                      onSelected: (selected) {
                        if (selected) setState(() => _maxPlayers = count);
                      },
                      backgroundColor: AppColors.white,
                      selectedColor: isTeenPatti ? const Color(0xFFF3E8FF) : AppColors.emerald50,
                      labelStyle: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isSel
                            ? (isTeenPatti ? const Color(0xFF7E22CE) : AppColors.emerald700)
                            : AppColors.slate800,
                      ),
                      side: BorderSide(
                        color: isSel
                            ? (isTeenPatti ? const Color(0xFF9333EA) : AppColors.emerald600)
                            : AppColors.slate200,
                      ),
                    ),
                  );
                }).toList(),
              ),

            // ─── Secret Guess Number (Dice Guess ONLY) ───
            if (!isTeenPatti && !isSports) ...[
              const SizedBox(height: 16),
              const Text(
                'Your Number (1-10)',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: List.generate(10, (idx) {
                  final val = idx + 1;
                  final isSel = _chosenNumber == val;
                  return ChoiceChip(
                    label: Text('$val'),
                    selected: isSel,
                    onSelected: (selected) {
                      if (selected) setState(() => _chosenNumber = val);
                    },
                    backgroundColor: AppColors.white,
                    selectedColor: AppColors.emerald50,
                    labelStyle: TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w700,
                      color: isSel ? AppColors.emerald700 : AppColors.slate900,
                    ),
                    side: BorderSide(color: isSel ? AppColors.emerald600 : AppColors.slate200),
                  );
                }),
              ),
            ],

            const SizedBox(height: 24),

            // ─── Submit Button ───
            SizedBox(
              width: double.infinity,
              height: 46,
              child: ElevatedButton(
                onPressed: _submitting || (isSports && _selectedMatch == null)
                    ? null
                    : () async {
                        if (_entryFee > widget.user.balance) {
                          setState(() => _error = 'Insufficient balance (Available: ₹${widget.user.balance.toStringAsFixed(2)})');
                          return;
                        }

                        setState(() {
                          _submitting = true;
                          _error = null;
                        });

                        try {
                          Map<String, dynamic>? customConfig;
                          int targetMaxPlayers = _maxPlayers;
                          int? targetGuessNumber = _chosenNumber;

                          if (isTeenPatti) {
                            targetGuessNumber = null;
                          } else if (isSports) {
                            if (_selectedMatch == null) {
                              throw Exception('Please select an upcoming sports match.');
                            }
                            targetMaxPlayers = _sportsCapacity;
                            targetGuessNumber = _sportsPick;
                            customConfig = {
                              'matchId': _selectedMatch!['id'],
                              'sport': _selectedMatch!['sport'],
                              'league': _selectedMatch!['league'],
                              'matchTitle': _selectedMatch!['name'],
                              'startTime': _selectedMatch!['startTime'],
                              'team1': _selectedMatch!['team1'],
                              'team2': _selectedMatch!['team2'],
                              'isUnlimited': _sportsCapacity >= 100,
                              'chosenTeam': (_sportsPick == 1
                                  ? (_selectedMatch!['team1'] != null ? _selectedMatch!['team1']['name'] : null)
                                  : (_selectedMatch!['team2'] != null ? _selectedMatch!['team2']['name'] : null)),
                            };
                          }

                          final room = await ApiClient.createRoom(
                            userId: widget.user.id,
                            entryFee: _entryFee,
                            maxPlayers: targetMaxPlayers,
                            guessNumber: targetGuessNumber,
                            gameType: _selectedGameType,
                            customConfig: customConfig,
                          );
                          widget.onRoomCreated(room);
                        } catch (e) {
                          setState(() {
                            _submitting = false;
                            _error = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: isSports
                      ? const Color(0xFF2563EB)
                      : isTeenPatti
                          ? const Color(0xFF7E22CE)
                          : AppColors.emerald600,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                    : Text(
                        isSports && _selectedMatch == null
                            ? 'Select an upcoming match'
                            : 'Lock ₹${_entryFee.toStringAsFixed(0)} & Host Table',
                        style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.white),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Bottom sheet for Joining via Code
class _JoinCodeBottomSheet extends StatefulWidget {
  final UserProfileModel user;
  final Function(RoomModel room) onRoomJoined;

  const _JoinCodeBottomSheet({required this.user, required this.onRoomJoined});

  @override
  State<_JoinCodeBottomSheet> createState() => _JoinCodeBottomSheetState();
}

class _JoinCodeBottomSheetState extends State<_JoinCodeBottomSheet> {
  final _codeController = TextEditingController();
  int _chosenNumber = 5;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Join via Room Code',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20, color: AppColors.slate500),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: AppColors.red50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
              ),
              child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
            ),
          ],

          // Room Code Input
          const Text(
            'Room Code',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _codeController,
            textCapitalization: TextCapitalization.characters,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 18,
              fontWeight: FontWeight.w700,
              letterSpacing: 2,
            ),
            decoration: InputDecoration(
              hintText: 'e.g. R-1234',
              hintStyle: const TextStyle(fontSize: 14, color: AppColors.slate400, letterSpacing: 0),
              filled: true,
              fillColor: AppColors.slate50,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: AppColors.slate200),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Secret Guess Number
          const Text(
            'Pick (1 for Team 1 / India, 2 for Team 2 / Aus, or 1-10 for Dice)',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: List.generate(10, (idx) {
              final val = idx + 1;
              final isSel = _chosenNumber == val;
              return ChoiceChip(
                label: Text('$val'),
                selected: isSel,
                onSelected: (selected) {
                  if (selected) setState(() => _chosenNumber = val);
                },
                backgroundColor: AppColors.white,
                selectedColor: AppColors.emerald50,
                labelStyle: TextStyle(
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.w700,
                  color: isSel ? AppColors.emerald700 : AppColors.slate900,
                ),
                side: BorderSide(color: isSel ? AppColors.emerald600 : AppColors.slate200),
              );
            }),
          ),
          const SizedBox(height: 24),

          // Submit Button
          SizedBox(
            width: double.infinity,
            height: 46,
            child: ElevatedButton(
              onPressed: _submitting
                  ? null
                  : () async {
                      final code = _codeController.text.trim();
                      if (code.isEmpty) {
                        setState(() => _error = 'Please enter a valid room code');
                        return;
                      }

                      setState(() {
                        _submitting = true;
                        _error = null;
                      });

                      try {
                        final room = await ApiClient.joinRoom(
                          userId: widget.user.id,
                          roomCode: code,
                          guessNumber: _chosenNumber,
                        );
                        widget.onRoomJoined(room);
                      } catch (e) {
                        setState(() {
                          _submitting = false;
                          _error = e.toString();
                        });
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.emerald600,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: _submitting
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                  : const Text(
                      'Join Table',
                      style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.white),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
