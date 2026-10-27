import 'dart:async';
import 'package:url_launcher/url_launcher.dart';
import '../../core/services/room_invitations.dart';
import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/api_client.dart';
import '../../core/network/socket_service.dart';
import '../game/active_room_screen.dart';
import '../game/teen_patti/teen_patti_table_screen.dart';
import '../game/sports_match/sports_match_table_screen.dart';
import '../game/twenty_nine/twenty_nine_table_screen.dart';
import '../profile/profile_dialogs.dart';

class LobbyScreen extends StatefulWidget {
  final UserProfileModel user;
  final VoidCallback onBalanceRefresh;
  final String? pendingInvitation;
  final VoidCallback? onInvitationOpened;

  const LobbyScreen({
    super.key,
    required this.user,
    required this.onBalanceRefresh,
    this.pendingInvitation,
    this.onInvitationOpened,
  });

  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  List<RoomModel> _rooms = [];
  bool _loading = true;
  String? _error;
  String _filterGame = 'ALL';
  String _filterStake = 'ALL';
  String _filterSeats = 'ALL';
  List<Map<String, dynamic>> _liveSportsMatches = [];

  @override
  void initState() {
    super.initState();
    _fetchRooms();
    _fetchSportsMatches();

    SocketService.on('lobby_rooms_updated', _onLobbyUpdate);
    _openPendingInvitation();
  }

  @override
  void didUpdateWidget(covariant LobbyScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.pendingInvitation != oldWidget.pendingInvitation) _openPendingInvitation();
  }

  void _openPendingInvitation() {
    final target = widget.pendingInvitation;
    if (target == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || widget.pendingInvitation != target) return;
      widget.onInvitationOpened?.call();
      _showJoinCodeModal(initialCode: target);
    });
  }

  void _onLobbyUpdate(dynamic _) { if (mounted) _fetchRooms(); }

  @override
  void dispose() {
    SocketService.off('lobby_rooms_updated', _onLobbyUpdate);
    super.dispose();
  }

  Future<void> _fetchSportsMatches() async {
    try {
      final matches = await ApiClient.getSportsMatches();
      if (mounted) {
        setState(() {
          _liveSportsMatches = matches.map((m) => Map<String, dynamic>.from(m as Map)).toList();
        });
      }
    } catch (_) {}
  }

  Map<String, dynamic> _resolveSportsMatch(RoomModel room) => resolveSportsMatch(room, _liveSportsMatches);

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
      _fetchSportsMatches();
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
    final isTwentyNine = gameType == 'TWENTY_NINE' || room?.gameType == 'TWENTY_NINE';
    final isTeenPatti = gameType == 'TEEN_PATTI' || room?.gameType == 'TEEN_PATTI';
    final isSportsMatch = gameType == 'SPORTS_MATCH' || room?.gameType == 'SPORTS_MATCH';

    final Widget targetScreen = isTwentyNine
        ? TwentyNineTableScreen(
            roomId: roomId,
            user: widget.user,
            onBalanceRefresh: widget.onBalanceRefresh,
          )
        : isTeenPatti
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
          _navigateToRoom(room.id, gameType: room.gameType);
        },
      ),
    );
  }

  void _showJoinCodeModal({String? initialCode}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _JoinCodeBottomSheet(
        initialCode: initialCode,
        user: widget.user,
        liveSportsMatches: _liveSportsMatches,
        onRoomJoined: (room) {
          _navigateToRoom(room.id, gameType: room.gameType);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    RoomModel? activeUserRoom;
    try {
      activeUserRoom = _rooms.firstWhere(
        (r) => ['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'].contains(r.status) && r.players.any((p) => p.userId == widget.user.id),
      );
    } catch (_) {
      activeUserRoom = null;
    }

    final filtered = _rooms.where((r) {
      if (_filterGame != 'ALL' && r.gameType != _filterGame) return false;
      if (_filterStake == 'LOW' && r.entryFee > 50) return false;
      if (_filterStake == 'MID' && (r.entryFee <= 50 || r.entryFee > 200)) return false;
      if (_filterStake == 'HIGH' && r.entryFee <= 200) return false;
      if (_filterSeats == 'AVAILABLE' && r.players.length >= r.maxPlayers) return false;
      return true;
    }).toList();

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
                    // Resume Game Hero Card (if user has active game)
                    if (activeUserRoom != null) _buildResumeHero(activeUserRoom),

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
                              'Play with Friends',
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
                    const SizedBox(height: 18),

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
                          '${filtered.length} Tables',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.emerald600),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // Game Filter Chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _buildFilterTab('ALL', 'All Tables (${_rooms.length})'),
                          const SizedBox(width: 8),
                          _buildFilterTab(
                            'TWENTY_NINE',
                            '🃏 29 Cards (${_rooms.where((r) => r.gameType == 'TWENTY_NINE').length})',
                          ),
                          const SizedBox(width: 8),
                          _buildFilterTab(
                            'SPORTS_MATCH',
                            '🏏 Live Sports (${_rooms.where((r) => r.gameType == 'SPORTS_MATCH').length})',
                          ),
                          const SizedBox(width: 8),
                          _buildFilterTab(
                            'TEEN_PATTI',
                            '🎴 Teen Patti (${_rooms.where((r) => r.gameType == 'TEEN_PATTI').length})',
                          ),
                          const SizedBox(width: 8),
                          _buildFilterTab(
                            'GUESS_NUMBER',
                            '🎲 Dice Guess (${_rooms.where((r) => r.gameType == 'GUESS_NUMBER').length})',
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Secondary Filter Chips (Stakes & Seats)
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _buildSecondaryFilterChip('Stake: All', _filterStake == 'ALL', () => setState(() => _filterStake = 'ALL')),
                          const SizedBox(width: 6),
                          _buildSecondaryFilterChip('Low (≤ ₹50)', _filterStake == 'LOW', () => setState(() => _filterStake = 'LOW')),
                          const SizedBox(width: 6),
                          _buildSecondaryFilterChip('Mid (₹51-200)', _filterStake == 'MID', () => setState(() => _filterStake = 'MID')),
                          const SizedBox(width: 6),
                          _buildSecondaryFilterChip('High (> ₹200)', _filterStake == 'HIGH', () => setState(() => _filterStake = 'HIGH')),
                          const SizedBox(width: 10),
                          Container(width: 1, height: 16, color: AppColors.slate300),
                          const SizedBox(width: 10),
                          _buildSecondaryFilterChip(
                            'Open Seats Only',
                            _filterSeats == 'AVAILABLE',
                            () => setState(() => _filterSeats = _filterSeats == 'AVAILABLE' ? 'ALL' : 'AVAILABLE'),
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
                  if (filtered.isEmpty) {
                    return const SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(
                        child: Text(
                          'No active tables match the selected filters.',
                          style: TextStyle(color: AppColors.slate500, fontSize: 13),
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
                          return _buildRoomCard(room, index);
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

  Widget _buildResumeHero(RoomModel room) {
    final gameTitle = room.gameType == 'TWENTY_NINE'
        ? '🃏 29 Card Game'
        : room.gameType == 'TEEN_PATTI'
            ? '🎴 Teen Patti'
            : room.gameType == 'SPORTS_MATCH'
                ? '🏏 Live Sports Pool'
                : '🎲 Dice Guess';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1E1B4B), Color(0xFF312E81)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF4338CA).withValues(alpha: 0.25),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFFE0E7FF).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.play_circle_fill, size: 13, color: Color(0xFFA5B4FC)),
                    SizedBox(width: 4),
                    Text(
                      'ACTIVE GAME IN PROGRESS',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFFA5B4FC), letterSpacing: 0.5),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: room.status == 'PLAYING' ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  room.status == 'PLAYING' ? 'LIVE' : 'WAITING',
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            gameTitle,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white),
          ),
          const SizedBox(height: 3),
          Text(
            'Room #${room.roomCode} • Stake ₹${room.entryFee.toStringAsFixed(2)} • ${room.players.length}/${room.maxPlayers >= 1000 ? '∞' : room.maxPlayers} Seated',
            style: const TextStyle(fontSize: 12, color: Color(0xFFC7D2FE)),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 36,
            child: ElevatedButton.icon(
              onPressed: () => _navigateToRoom(room.id, gameType: room.gameType),
              icon: const Icon(Icons.arrow_forward_rounded, size: 16, color: Color(0xFF1E1B4B)),
              label: const Text('Resume Active Table', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: Color(0xFF1E1B4B))),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFA5B4FC),
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSecondaryFilterChip(String label, bool isSelected, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFE2E8F0) : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: isSelected ? const Color(0xFF94A3B8) : const Color(0xFFCBD5E1),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? const Color(0xFF0F172A) : const Color(0xFF64748B),
          ),
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
              ? (type == 'TWENTY_NINE'
                  ? const Color(0xFF4338CA)
                  : type == 'TEEN_PATTI'
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

  Widget _buildRoomCard(RoomModel room, int index) {
    final isPlayerInRoom = room.players.any((p) => p.userId == widget.user.id);
    final isFull = room.players.length >= room.maxPlayers;
    final totalPot = room.entryFee * room.maxPlayers;
    final isTwentyNine = room.gameType == 'TWENTY_NINE';
    final isTeenPatti = room.gameType == 'TEEN_PATTI';
    final isSportsMatch = room.gameType == 'SPORTS_MATCH';
    final winnerPrize = isSportsMatch ? (room.entryFee * room.players.length) : (totalPot * 0.90);

    // Resolve dynamic match & team names from room's actual customConfig or active fixtures
    final sportsData = isSportsMatch ? _resolveSportsMatch(room) : null;
    final team1Name = sportsData?['team1Name'] as String? ?? 'Team 1';
    final team2Name = sportsData?['team2Name'] as String? ?? 'Team 2';
    final team1Label = sportsData?['team1Label'] as String? ?? team1Name;
    final team2Label = sportsData?['team2Label'] as String? ?? team2Name;
    final team1Logo = sportsData?['team1Logo'] as String?;
    final team2Logo = sportsData?['team2Logo'] as String?;
    final matchTitle = sportsData?['matchTitle'] as String? ?? '$team1Name vs $team2Name';
    final startTimeStr = sportsData?['startTime'] as String?;

    final team1Count = room.players.where((p) => p.guessNumber == 1).length;
    final team2Count = room.players.where((p) => p.guessNumber == 2).length;
    final totalSportsPicks = team1Count + team2Count;
    final team1Percent = totalSportsPicks == 0 ? 50 : ((team1Count / totalSportsPicks) * 100).round();
    final team2Percent = 100 - team1Percent;

    final isMatchLocked = isSportsMatch && (
      room.status == 'PLAYING' ||
      room.status == 'COMPLETED' ||
      (startTimeStr != null && DateTime.tryParse(startTimeStr)?.toLocal().isBefore(DateTime.now()) == true)
    );

    // Distinguish cards with styling
    final isEven = index % 2 == 0;
    final cardBgColor = isTwentyNine
        ? const Color(0xFFF5F3FF)
        : isTeenPatti
            ? const Color(0xFFFAF5FF)
            : isSportsMatch
                ? (isEven ? const Color(0xFFFAF5FF) : const Color(0xFFEFF6FF))
                : (isEven ? const Color(0xFFF0FDF4) : const Color(0xFFF8FAFC));
    final cardBorderColor = isTwentyNine
        ? const Color(0xFF6366F1)
        : isTeenPatti
            ? const Color(0xFFC084FC)
            : isSportsMatch
                ? (isEven ? const Color(0xFFC084FC) : const Color(0xFF3B82F6))
                : (isEven ? const Color(0xFF34D399) : const Color(0xFF3B82F6));

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: cardBgColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: cardBorderColor,
          width: 1.5,
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
            } else if (!isFull && !isMatchLocked) {
              if (isTwentyNine) {
                _showTwentyNineJoinDialog(room);
              } else if (isTeenPatti) {
                _showTeenPattiJoinDialog(room);
              } else if (isSportsMatch) {
                _showSportsJoinDialog(room);
              } else {
                _showQuickJoinDialog(room);
              }
            }
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (isPlayerInRoom && room.status == 'WAITING')
                  Align(alignment: Alignment.centerRight, child: TextButton.icon(icon: const Icon(Icons.share, size: 16), label: const Text('Invite friends'), onPressed: () => RoomInvitations.show(context, room, widget.user.id, _fetchRooms))),
                // Header row: Room code + JOINED on left, Countdown timer or Locked on right
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Text(
                          '#${room.roomCode}',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        if (room.isPrivate) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: const Color(0xFFCBD5E1)),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.lock_outline, size: 10, color: Color(0xFF64748B)),
                                SizedBox(width: 3),
                                Text('PRIVATE', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF64748B))),
                              ],
                            ),
                          ),
                        ],
                        if (isPlayerInRoom) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFFDBEAFE),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'JOINED',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF2563EB),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (isSportsMatch)
                      MatchCountdownClock(
                        startTimeStr: startTimeStr,
                        roomStatus: room.status,
                      )
                    else if (room.status != 'WAITING')
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: const Color(0xFFCBD5E1)),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.lock_outline_rounded, size: 12, color: Color(0xFF64748B)),
                            SizedBox(width: 4),
                            Text(
                              'Locked',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF475569),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),

                if (isTwentyNine) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: const Color(0xFFDDD6FE)),
                    ),
                    child: const Row(
                      children: [
                        Text('🃏 ', style: TextStyle(fontSize: 12)),
                        Expanded(
                          child: Text(
                            '2v2 Partnership • Team A (Seats 0, 2) vs Team B (Seats 1, 3)',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF4338CA)),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (room.players.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: room.players.map((p) {
                        return GestureDetector(
                          onTap: () => showPublicProfileModal(context, p.userId),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(getAvatarEmoji(p.avatar), style: const TextStyle(fontSize: 11)),
                                const SizedBox(width: 4),
                                Text(
                                  p.displayName.isNotEmpty ? p.displayName : p.username,
                                  style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: Color(0xFF1E293B)),
                                ),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ],

                if (isSportsMatch) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.white,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Text('🏏 ', style: TextStyle(fontSize: 12)),
                            Expanded(
                              child: Text(
                                matchTitle,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF0F172A),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        // Team picks label row with percentage
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                buildTeamLogo(team1Logo, const Color(0xFF2563EB), size: 16),
                                const SizedBox(width: 5),
                                Text(
                                  '$team1Label: $team1Percent%',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF2563EB),
                                  ),
                                ),
                              ],
                            ),
                            Row(
                              children: [
                                Text(
                                  '$team2Label: $team2Percent%',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF9333EA),
                                  ),
                                ),
                                const SizedBox(width: 5),
                                buildTeamLogo(team2Logo, const Color(0xFF9333EA), size: 16),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        // Horizontal proportion bar showing picks distribution
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: Container(
                            height: 6,
                            width: double.infinity,
                            color: const Color(0xFFE2E8F0),
                            child: (team1Count + team2Count == 0)
                                ? Row(
                                    children: [
                                      Expanded(child: Container(color: const Color(0xFF2563EB))),
                                      const SizedBox(width: 1.5),
                                      Expanded(child: Container(color: const Color(0xFF9333EA))),
                                    ],
                                  )
                                : Row(
                                    children: [
                                      if (team1Count > 0)
                                        Expanded(
                                          flex: ((team1Count / (team1Count + team2Count)) * 1000).round(),
                                          child: Container(color: const Color(0xFF2563EB)),
                                        ),
                                      if (team1Count > 0 && team2Count > 0)
                                        const SizedBox(width: 1.5),
                                      if (team2Count > 0)
                                        Expanded(
                                          flex: ((team2Count / (team1Count + team2Count)) * 1000).round(),
                                          child: Container(color: const Color(0xFF9333EA)),
                                        ),
                                    ],
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 10),

                // Table Stats Row with vertical dividers
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isTeenPatti ? 'BOOT AMOUNT' : 'ENTRY STAKE',
                            style: const TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF64748B),
                              letterSpacing: 0.3,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '₹${room.entryFee.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      width: 1,
                      height: 24,
                      color: const Color(0xFFE2E8F0),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(left: 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              isTwentyNine
                                  ? 'WINNER / PARTNER'
                                  : isSportsMatch
                                      ? 'TOTAL POOL'
                                      : 'POT PRIZE',
                              style: const TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF64748B),
                                letterSpacing: 0.3,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              isTwentyNine
                                  ? '₹${(winnerPrize / 2).toStringAsFixed(0)}'
                                  : '₹${winnerPrize.toStringAsFixed(0)}',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: isSportsMatch ? const Color(0xFF2563EB) : AppColors.emerald600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Container(
                      width: 1,
                      height: 24,
                      color: const Color(0xFFE2E8F0),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(left: 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'OCCUPANCY',
                              style: TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF64748B),
                                letterSpacing: 0.3,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              isTwentyNine
                                  ? '${room.players.length} / 4 (2v2)'
                                  : room.maxPlayers >= 100
                                      ? '${room.players.length} / ∞ Players'
                                      : '${room.players.length} / ${room.maxPlayers} Players',
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF0F172A),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Button CTA
                SizedBox(
                  width: double.infinity,
                  height: 28,
                  child: ElevatedButton(
                    onPressed: isPlayerInRoom
                        ? () => _navigateToRoom(room.id, gameType: room.gameType)
                        : (isFull || isMatchLocked)
                            ? null
                            : () => isTwentyNine
                                ? _showTwentyNineJoinDialog(room)
                                : isTeenPatti
                                    ? _showTeenPattiJoinDialog(room)
                                    : isSportsMatch
                                        ? _showSportsJoinDialog(room)
                                        : _showQuickJoinDialog(room),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isTwentyNine ? const Color(0xFF4338CA) : const Color(0xFF0F172A),
                      disabledBackgroundColor: const Color(0xFFF1F5F9),
                      elevation: 0,
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    child: Text(
                      isPlayerInRoom
                          ? 'Enter Active Table'
                          : isFull
                              ? 'Table Full'
                              : isMatchLocked
                                  ? 'Locked'
                                  : isTwentyNine
                                      ? 'Join 29 Cards (₹${room.entryFee.toStringAsFixed(2)})'
                                      : isSportsMatch
                                          ? 'Back a Team (₹${room.entryFee.toStringAsFixed(2)})'
                                          : 'Join Table (₹${room.entryFee.toStringAsFixed(2)})',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: (isFull || isMatchLocked) && !isPlayerInRoom ? AppColors.slate400 : AppColors.white,
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

  void _showTwentyNineJoinDialog(RoomModel room) {
    bool joining = false;
    String? joinError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final isBalanceSufficient = widget.user.balance >= room.entryFee;
          final totalDistributable = (room.entryFee * 4) * 0.90;
          final prizePerPartner = totalDistributable / 2;

          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Row(
              children: [
          TextButton(onPressed: () => launchUrl(Uri.parse('https://mgame-1.web.app/rules/29.html')), child: const Text('29 · single deal · Read house rules')),
                const Text('🃏 ', style: TextStyle(fontSize: 20)),
                Expanded(
                  child: Text(
                    'Join 29 Cards #${room.roomCode}',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
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
                    color: const Color(0xFFF5F3FF),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFDDD6FE)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Entry Fee:', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
                          Text(
                            '₹${room.entryFee.toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF4338CA)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Winning Partner Prize:', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
                          Text(
                            '₹${prizePerPartner.toStringAsFixed(2)} each',
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.emerald700),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Wallet Balance:', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
                          Text(
                            '₹${widget.user.balance.toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: isBalanceSufficient ? AppColors.emerald600 : AppColors.red600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.slate50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.slate200),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Rules & Partnerships:',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate800),
                      ),
                      SizedBox(height: 4),
                      Text(
                        '• 4 players in 2 fixed teams (Team A: Seats 0 & 2, Team B: Seats 1 & 3).\n'
                        '• Bidding from 16 to 28 points. High bidder picks secret trump.\n'
                        '• 8 tricks played; contractor team must make bid points to win.',
                        style: TextStyle(fontSize: 11, color: AppColors.slate600, height: 1.3),
                      ),
                    ],
                  ),
                ),
                if (room.players.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  const Text('Seated Players:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate700)),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: room.players.map((p) {
                      return GestureDetector(
                        onTap: () => showPublicProfileModal(context, p.userId),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.white,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: AppColors.slate200),
                          ),
                          child: Text(
                            '${getAvatarEmoji(p.avatar)} ${p.displayName.isNotEmpty ? p.displayName : p.username}',
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate800),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
                if (joinError != null) ...[
                  const SizedBox(height: 10),
                  Text(joinError!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Cancel', style: TextStyle(color: AppColors.slate600)),
              ),
              ElevatedButton(
                onPressed: (!isBalanceSufficient || joining)
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
                          if (mounted) {
                            if (ctx.mounted) Navigator.of(ctx).pop();
                            _navigateToRoom(joinedRoom.id, gameType: 'TWENTY_NINE');
                          }
                        } catch (e) {
                          setDialogState(() {
                            joining = false;
                            joinError = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4338CA),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: joining
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(
                        'Lock ₹${room.entryFee.toStringAsFixed(2)} & Join',
                        style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showSportsJoinDialog(RoomModel room) {
    int selectedTeam = 1;
    final sportsData = _resolveSportsMatch(room);
    final team1Name = sportsData['team1Name'] as String;
    final team2Name = sportsData['team2Name'] as String;
    final team1Logo = sportsData['team1Logo'] as String?;
    final team2Logo = sportsData['team2Logo'] as String?;
    final matchTitle = sportsData['matchTitle'] as String;
    final startTimeStr = sportsData['startTime'] as String?;
    final team1Count = room.players.where((p) => p.guessNumber == 1).length;
    final team2Count = room.players.where((p) => p.guessNumber == 2).length;
    final totalModalPicks = team1Count + team2Count;
    final t1Percent = totalModalPicks == 0 ? 50 : ((team1Count / totalModalPicks) * 100).round();
    final t2Percent = 100 - t1Percent;

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
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF1E3A8A)),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                MatchCountdownClock(
                  startTimeStr: startTimeStr,
                  roomStatus: room.status,
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
                            '₹${room.entryFee.toStringAsFixed(2)}',
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
                            '$t1Percent% for $team1Name | $t2Percent% for $team2Name',
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
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  buildTeamLogo(team1Logo, const Color(0xFF2563EB), size: 20),
                                  const SizedBox(width: 6),
                                  if (selectedTeam == 1)
                                    const Icon(Icons.check_circle, size: 16, color: Color(0xFF2563EB))
                                  else
                                    const Icon(Icons.radio_button_unchecked, size: 16, color: AppColors.slate400),
                                ],
                              ),
                              const SizedBox(height: 6),
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
                                '$t1Percent% chosen',
                                style: const TextStyle(fontSize: 10, color: AppColors.slate500, fontWeight: FontWeight.w600),
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
                            color: selectedTeam == 2 ? const Color(0xFFFEF3C7) : AppColors.white,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: selectedTeam == 2 ? const Color(0xFFD97706) : AppColors.slate200,
                              width: selectedTeam == 2 ? 2 : 1,
                            ),
                          ),
                          child: Column(
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  buildTeamLogo(team2Logo, const Color(0xFFD97706), size: 20),
                                  const SizedBox(width: 6),
                                  if (selectedTeam == 2)
                                    const Icon(Icons.check_circle, size: 16, color: Color(0xFFD97706))
                                  else
                                    const Icon(Icons.radio_button_unchecked, size: 16, color: AppColors.slate400),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                team2Name,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: selectedTeam == 2 ? const Color(0xFF92400E) : AppColors.slate800,
                                ),
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                '$t2Percent% chosen',
                                style: const TextStyle(fontSize: 10, color: AppColors.slate500, fontWeight: FontWeight.w600),
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
                child: Text('Back $chosenTeamName (₹${room.entryFee.toStringAsFixed(2)})', style: const TextStyle(fontWeight: FontWeight.w700)),
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
                            '₹${room.entryFee.toStringAsFixed(2)}',
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
                  'Entry Fee: ₹${room.entryFee.toStringAsFixed(2)} (Balance: ₹${widget.user.balance.toStringAsFixed(2)})',
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

Map<String, dynamic> resolveSportsMatch(RoomModel room, [List<Map<String, dynamic>> liveMatches = const []]) {
  String team1Name = room.customConfig?['team1']?['name']?.toString() ?? '';
  String team2Name = room.customConfig?['team2']?['name']?.toString() ?? '';
  String? team1Short = room.customConfig?['team1']?['shortName']?.toString();
  String? team2Short = room.customConfig?['team2']?['shortName']?.toString();
  String matchTitle = room.customConfig?['matchTitle']?.toString() ?? '';
  String? team1Logo = room.customConfig?['team1']?['logo']?.toString();
  String? team2Logo = room.customConfig?['team2']?['logo']?.toString();
  String? startTimeStr = room.customConfig?['startTime']?.toString();

  final matchId = room.customConfig?['matchId']?.toString();
  if (matchId != null && matchId.isNotEmpty && liveMatches.isNotEmpty) {
    final found = liveMatches.firstWhere((m) => m['id']?.toString() == matchId, orElse: () => {});
    if (found.isNotEmpty) {
      if (matchTitle.isEmpty) matchTitle = found['name']?.toString() ?? '';
      if (team1Name.isEmpty || team1Name.toLowerCase() == 'team 1') team1Name = found['team1']?['name']?.toString() ?? team1Name;
      team1Short ??= found['team1']?['shortName']?.toString();
      team1Logo ??= found['team1']?['logo']?.toString();
      if (team2Name.isEmpty || team2Name.toLowerCase() == 'team 2') team2Name = found['team2']?['name']?.toString() ?? team2Name;
      team2Short ??= found['team2']?['shortName']?.toString();
      team2Logo ??= found['team2']?['logo']?.toString();
      startTimeStr ??= found['startTime']?.toString();
    }
  }

  final isGeneric = team1Name.isEmpty ||
      team2Name.isEmpty ||
      team1Name.toLowerCase() == 'team 1' ||
      team2Name.toLowerCase() == 'team 2' ||
      matchTitle.isEmpty ||
      matchTitle.toLowerCase() == 'team 1 vs team 2';

  if (isGeneric && liveMatches.isNotEmpty) {
    final idx = room.roomCode.hashCode.abs() % liveMatches.length;
    final fallback = liveMatches[idx];
    matchTitle = fallback['name']?.toString() ?? matchTitle;
    team1Name = fallback['team1']?['name']?.toString() ?? team1Name;
    team1Short = fallback['team1']?['shortName']?.toString() ?? team1Short;
    team1Logo = fallback['team1']?['logo']?.toString() ?? team1Logo;
    team2Name = fallback['team2']?['name']?.toString() ?? team2Name;
    team2Short = fallback['team2']?['shortName']?.toString() ?? team2Short;
    team2Logo = fallback['team2']?['logo']?.toString() ?? team2Logo;
    startTimeStr = fallback['startTime']?.toString() ?? startTimeStr;
  }

  if ((team1Name.isEmpty || team2Name.isEmpty) && matchTitle.contains(' vs ')) {
    final parts = matchTitle.split(' vs ');
    if (team1Name.isEmpty && parts.isNotEmpty) team1Name = parts[0].trim();
    if (team2Name.isEmpty && parts.length > 1) team2Name = parts[1].trim();
  }
  if (team1Name.isEmpty) team1Name = 'Team 1';
  if (team2Name.isEmpty) team2Name = 'Team 2';
  if (matchTitle.isEmpty) matchTitle = '$team1Name vs $team2Name';

  final team1Label = (team1Short != null && team1Short.isNotEmpty) ? team1Short : team1Name;
  final team2Label = (team2Short != null && team2Short.isNotEmpty) ? team2Short : team2Name;

  return {
    'matchTitle': matchTitle,
    'team1Name': team1Name,
    'team2Name': team2Name,
    'team1Label': team1Label,
    'team2Label': team2Label,
    'team1Logo': team1Logo,
    'team2Logo': team2Logo,
    'startTime': startTimeStr,
  };
}

String formatMatchDateTime(String? startTimeStr) {
  if (startTimeStr == null) return 'Upcoming';
  final parsed = DateTime.tryParse(startTimeStr);
  if (parsed == null) return 'Upcoming';
  final dt = parsed.toLocal();
  final now = DateTime.now();
  final isToday = dt.year == now.year && dt.month == now.month && dt.day == now.day;
  final tomorrow = DateTime(now.year, now.month, now.day + 1);
  final isTomorrow = dt.year == tomorrow.year && dt.month == tomorrow.month && dt.day == tomorrow.day;

  final hour = dt.hour.toString().padLeft(2, '0');
  final minute = dt.minute.toString().padLeft(2, '0');
  final timeStr = '$hour:$minute';

  if (isToday) {
    return 'Today, $timeStr';
  } else if (isTomorrow) {
    return 'Tomorrow, $timeStr';
  } else {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final monthStr = months[dt.month - 1];
    return '${dt.day} $monthStr, $timeStr';
  }
}

class MatchCountdownClock extends StatefulWidget {
  final String? startTimeStr;
  final String roomStatus;

  const MatchCountdownClock({
    super.key,
    required this.startTimeStr,
    required this.roomStatus,
  });

  @override
  State<MatchCountdownClock> createState() => _MatchCountdownClockState();
}

class _MatchCountdownClockState extends State<MatchCountdownClock> {
  Timer? _timer;
  Duration _remaining = Duration.zero;
  DateTime? _targetTime;

  @override
  void initState() {
    super.initState();
    _initTarget();
    _startTimer();
  }

  @override
  void didUpdateWidget(covariant MatchCountdownClock oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.startTimeStr != widget.startTimeStr || oldWidget.roomStatus != widget.roomStatus) {
      _initTarget();
    }
  }

  void _initTarget() {
    if (widget.startTimeStr != null && widget.startTimeStr!.trim().isNotEmpty) {
      _targetTime = DateTime.tryParse(widget.startTimeStr!)?.toLocal();
    } else {
      _targetTime = null;
    }
    _calculateRemaining();
  }

  void _calculateRemaining() {
    if (_targetTime == null) {
      _remaining = Duration.zero;
      return;
    }
    _remaining = _targetTime!.difference(DateTime.now());
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        _calculateRemaining();
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_targetTime == null) {
      if (widget.roomStatus == 'PLAYING' || widget.roomStatus == 'COMPLETED') {
        return _buildBadge('Locked', Icons.lock_outline_rounded, isLocked: true);
      }
      return _buildBadge('Upcoming', Icons.alarm, isLocked: false);
    }

    final isPast = _remaining.isNegative || _remaining == Duration.zero;

    if (isPast || widget.roomStatus == 'PLAYING' || widget.roomStatus == 'COMPLETED') {
      return _buildBadge(
        'Locked',
        Icons.lock_outline_rounded,
        isLocked: true,
      );
    }

    final days = _remaining.inDays;
    final hours = _remaining.inHours % 24;
    final minutes = _remaining.inMinutes % 60;
    final seconds = _remaining.inSeconds % 60;

    String text;
    if (days > 0) {
      text = 'Locks in ${days}d ${hours}h';
    } else if (hours > 0) {
      final hStr = hours.toString().padLeft(2, '0');
      final mStr = minutes.toString().padLeft(2, '0');
      final sStr = seconds.toString().padLeft(2, '0');
      text = 'Locks in $hStr:$mStr:$sStr';
    } else {
      final mStr = minutes.toString().padLeft(2, '0');
      final sStr = seconds.toString().padLeft(2, '0');
      text = 'Locks in $mStr:$sStr';
    }

    return _buildBadge(text, Icons.alarm, isLocked: false);
  }

  Widget _buildBadge(String label, IconData icon, {required bool isLocked}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
      decoration: BoxDecoration(
        color: isLocked ? const Color(0xFFF1F5F9) : const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: isLocked ? const Color(0xFFCBD5E1) : const Color(0xFFFCD34D),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 13,
            color: isLocked ? const Color(0xFF64748B) : const Color(0xFFD97706),
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: isLocked ? const Color(0xFF475569) : const Color(0xFF92400E),
            ),
          ),
        ],
      ),
    );
  }
}

Widget buildTeamLogo(String? logoUrl, Color fallbackColor, {double size = 14}) {
  if (logoUrl != null && (logoUrl.startsWith('http://') || logoUrl.startsWith('https://'))) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(size / 2),
      child: Image.network(
        logoUrl,
        width: size,
        height: size,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) => Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: fallbackColor, shape: BoxShape.circle),
        ),
      ),
    );
  }
  return Container(
    width: 8,
    height: 8,
    decoration: BoxDecoration(color: fallbackColor, shape: BoxShape.circle),
  );
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
  bool _isPrivate = false;
  String? _error;

  // Sports Pool State
  List<Map<String, dynamic>> _sportsMatches = [];
  bool _loadingMatches = false;
  Map<String, dynamic>? _selectedMatch;
  String _createSportCategory = 'Cricket';
  final TextEditingController _searchController = TextEditingController();
  int _sportsPick = 1; // 1 = Team 1, 2 = Team 2
  int _sportsCapacity = 10; // 2, 4, 6, 10, 1000

  final List<double> _twentyNineStakes = [25, 50, 100, 250, 500];
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

  String _formatMatchDateTime(String? startTimeStr) => formatMatchDateTime(startTimeStr);

  List<Map<String, dynamic>> get _filteredMatches {
    final query = _searchController.text.trim().toLowerCase();
    final now = DateTime.now().millisecondsSinceEpoch;

    final list = _sportsMatches.where((m) {
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

    list.sort((a, b) {
      final aLive = a['status'] == 'LIVE';
      final bLive = b['status'] == 'LIVE';
      if (aLive && !bLive) return -1;
      if (!aLive && bLive) return 1;

      final tA = a['startTime'] != null ? DateTime.tryParse(a['startTime'].toString())?.millisecondsSinceEpoch ?? 9999999999999 : 9999999999999;
      final tB = b['startTime'] != null ? DateTime.tryParse(b['startTime'].toString())?.millisecondsSinceEpoch ?? 9999999999999 : 9999999999999;
      return tA.compareTo(tB);
    });

    return list;
  }

  @override
  Widget build(BuildContext context) {
    final isTwentyNine = _selectedGameType == 'TWENTY_NINE';
    final isTeenPatti = _selectedGameType == 'TEEN_PATTI';
    final isSports = _selectedGameType == 'SPORTS_MATCH';
    final currentStakes = isSports
        ? _sportsStakes
        : isTwentyNine
            ? _twentyNineStakes
            : (isTeenPatti ? _teenPattiStakes : _diceStakes);
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
                      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                      decoration: BoxDecoration(
                        color: isSports ? const Color(0xFFEFF6FF) : AppColors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isSports ? const Color(0xFF2563EB) : AppColors.slate200,
                          width: isSports ? 1.5 : 1,
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('🏏', style: TextStyle(fontSize: 16)),
                          const SizedBox(height: 2),
                          Text(
                            'Live Sports',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              color: isSports ? const Color(0xFF1D4ED8) : AppColors.slate800,
                            ),
                          ),
                          const Text('Cricket', style: TextStyle(fontSize: 8, color: AppColors.slate500)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                // 29 Cards Card
                Expanded(
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        _selectedGameType = 'TWENTY_NINE';
                        _entryFee = 50;
                        _maxPlayers = 4;
                      });
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                      decoration: BoxDecoration(
                        color: isTwentyNine ? const Color(0xFFF5F3FF) : AppColors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isTwentyNine ? const Color(0xFF4338CA) : AppColors.slate200,
                          width: isTwentyNine ? 1.5 : 1,
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('🃏', style: TextStyle(fontSize: 16)),
                          const SizedBox(height: 2),
                          Text(
                            '29 Cards',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              color: isTwentyNine ? const Color(0xFF4338CA) : AppColors.slate800,
                            ),
                          ),
                          const Text('4p (2v2)', style: TextStyle(fontSize: 8, color: AppColors.slate500)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
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
                      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                      decoration: BoxDecoration(
                        color: isTeenPatti ? const Color(0xFFFAF5FF) : AppColors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isTeenPatti ? const Color(0xFF9333EA) : AppColors.slate200,
                          width: isTeenPatti ? 1.5 : 1,
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('🎴', style: TextStyle(fontSize: 16)),
                          const SizedBox(height: 2),
                          Text(
                            'Teen Patti',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              color: isTeenPatti ? const Color(0xFF7E22CE) : AppColors.slate800,
                            ),
                          ),
                          const Text('3 Cards', style: TextStyle(fontSize: 8, color: AppColors.slate500)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
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
                      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                      decoration: BoxDecoration(
                        color: (!isTeenPatti && !isSports && !isTwentyNine) ? AppColors.emerald50 : AppColors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: (!isTeenPatti && !isSports && !isTwentyNine) ? AppColors.emerald600 : AppColors.slate200,
                          width: (!isTeenPatti && !isSports && !isTwentyNine) ? 1.5 : 1,
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('🎲', style: TextStyle(fontSize: 16)),
                          const SizedBox(height: 2),
                          Text(
                            'Dice Guess',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              color: (!isTeenPatti && !isSports && !isTwentyNine) ? AppColors.emerald700 : AppColors.slate800,
                            ),
                          ),
                          const Text('Number', style: TextStyle(fontSize: 8, color: AppColors.slate500)),
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
                      constraints: const BoxConstraints(maxHeight: 260),
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

                                    final timeStr = _formatMatchDateTime(m['startTime']?.toString());

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
            else if (isTwentyNine)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF5F3FF),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFDDD6FE)),
                ),
                child: const Row(
                  children: [
                    Text('👥 ', style: TextStyle(fontSize: 14)),
                    Text(
                      'Fixed 4 Players (2v2 Partnership)',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF4338CA)),
                    ),
                  ],
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
            if (!isTeenPatti && !isSports && !isTwentyNine) ...[
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

            // ─── Private Table Toggle ───
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: _isPrivate ? const Color(0xFFF1F5F9) : AppColors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.slate200),
              ),
              child: Row(
                children: [
                  Icon(_isPrivate ? Icons.lock : Icons.lock_open, size: 20, color: _isPrivate ? const Color(0xFF4338CA) : AppColors.slate500),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Private Table',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                        ),
                        Text(
                          _isPrivate
                              ? 'Hidden from lobby. Join only via room code or invite link.'
                              : 'Visible to everyone in public lobby.',
                          style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                        ),
                      ],
                    ),
                  ),
                  Switch(
                    value: _isPrivate,
                    onChanged: (val) => setState(() => _isPrivate = val),
                    activeColor: const Color(0xFF4338CA),
                  ),
                ],
              ),
            ),

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
                          int targetMaxPlayers = isTwentyNine ? 4 : _maxPlayers;
                          int? targetGuessNumber = (isTeenPatti || isTwentyNine) ? null : _chosenNumber;

                          if (isSports) {
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
                            isPrivate: _isPrivate,
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
                  backgroundColor: isTwentyNine
                      ? const Color(0xFF4338CA)
                      : isSports
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
                            : 'Lock ₹${_entryFee.toStringAsFixed(2)} & Host Table',
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
  final String? initialCode;
  final UserProfileModel user;
  final Function(RoomModel room) onRoomJoined;
  final List<Map<String, dynamic>> liveSportsMatches;

  const _JoinCodeBottomSheet({
    this.initialCode,
    required this.user,
    required this.onRoomJoined,
    this.liveSportsMatches = const [],
  });

  @override
  State<_JoinCodeBottomSheet> createState() => _JoinCodeBottomSheetState();
}

class _JoinCodeBottomSheetState extends State<_JoinCodeBottomSheet> {
  final _codeController = TextEditingController();
  int _step = 1;
  RoomModel? _targetRoom;
  String? _invitationToken;
  RoomPreviewModel? _invitationPreview;
  int _chosenNumber = 1;
  int _chosenSportsTeam = 1;
  bool _lookingUp = false;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final target = widget.initialCode;
    if (target != null) {
      _codeController.text = target.startsWith('R-') ? target : RoomInvitations.link(target);
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) _handleLookupCode(); });
    }
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _handleLookupCode() async {
    final input = _codeController.text.trim();
    final linkedTarget = RoomInvitations.targetFromLink(input);
    final raw = linkedTarget?.startsWith('R-') == true ? linkedTarget! : input;
    if (raw.isEmpty) {
      setState(() => _error = 'Please enter a valid room code or invite link');
      return;
    }

    String tokenCandidate = raw;
    if (tokenCandidate.contains('/join/')) {
      tokenCandidate = tokenCandidate.split('/join/').last.split('?').first.split('#').first.trim();
    }

    if (tokenCandidate.toLowerCase().startsWith('inv_') ||
        tokenCandidate.toLowerCase().startsWith('inv-') ||
        raw.contains('/join/')) {
      setState(() {
        _lookingUp = true;
        _error = null;
      });
      try {
        final preview = await ApiClient.getInvitationPreview(tokenCandidate);
        if (mounted) {
          setState(() {
            _lookingUp = false;
            _invitationToken = tokenCandidate;
            _invitationPreview = preview;
            _chosenNumber = List.generate(10, (i) => i + 1).firstWhere((n) => !preview.takenNumbers.contains(n), orElse: () => 1);
            _step = 3;
          });
        }
      } catch (e) {
        if (mounted) {
          setState(() {
            _lookingUp = false;
            _error = e.toString();
          });
        }
      }
      return;
    }

    final code = raw.toUpperCase();

    setState(() {
      _lookingUp = true;
      _error = null;
    });

    try {
      final room = await ApiClient.getRoomByCode(code);
      if (!mounted) return;

      if (room.status == 'COMPLETED' || room.status == 'CANCELLED') {
        throw 'This room has already ${room.status.toLowerCase()}.';
      }

      final isAlreadyIn = room.players.any((p) => p.userId == widget.user.id);
      if (isAlreadyIn) {
        if (mounted) Navigator.of(context).pop();
        widget.onRoomJoined(room);
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        throw 'This room is already full (${room.players.length}/${room.maxPlayers}).';
      }

      int initialPick = 1;
      if (room.gameType == 'GUESS_NUMBER') {
        final taken = room.players.map((p) => p.guessNumber).whereType<int>().toSet();
        for (int i = 1; i <= 10; i++) {
          if (!taken.contains(i)) {
            initialPick = i;
            break;
          }
        }
      }

      setState(() {
        _lookingUp = false;
        _targetRoom = room;
        _chosenNumber = initialPick;
        _chosenSportsTeam = 1;
        _step = 2;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _lookingUp = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _handleConfirmJoin() async {
    if (_targetRoom == null) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final pick = _targetRoom!.gameType == 'SPORTS_MATCH'
          ? _chosenSportsTeam
          : _targetRoom!.gameType == 'GUESS_NUMBER'
              ? _chosenNumber
              : null;

      final room = await ApiClient.joinRoom(
        userId: widget.user.id,
        roomCode: _targetRoom!.roomCode,
        guessNumber: pick,
      );
      if (mounted) Navigator.of(context).pop();
      widget.onRoomJoined(room);
    } catch (e) {
      setState(() {
        _submitting = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _handleJoinInvitation() async {
    if (_invitationToken == null) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final pick = _invitationPreview?.gameType == 'SPORTS_MATCH'
          ? _chosenSportsTeam
          : _invitationPreview?.gameType == 'GUESS_NUMBER'
              ? _chosenNumber
              : null;

      final room = await ApiClient.joinByInvitation(
        invitationToken: _invitationToken!,
        guessNumber: pick,
      );
      if (mounted) Navigator.of(context).pop();
      widget.onRoomJoined(room);
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = e.toString();
        });
      }
    }
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
          if (_step == 1) ...[
            // STEP 1: Ask ONLY Room Code
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
                hintText: 'e.g. R-1234 or inv-...',
                hintStyle: const TextStyle(fontSize: 14, color: AppColors.slate400, letterSpacing: 0),
                filled: true,
                fillColor: AppColors.slate50,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: AppColors.slate200),
                ),
              ),
              onSubmitted: (_) => _handleLookupCode(),
            ),
            const SizedBox(height: 6),
            const Text(
              'Enter room code or paste invitation link shared by the host.',
              style: TextStyle(fontSize: 11, color: AppColors.slate500),
            ),
            const SizedBox(height: 20),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      side: const BorderSide(color: AppColors.slate200),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Cancel', style: TextStyle(color: AppColors.slate700, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _lookingUp ? null : _handleLookupCode,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.emerald600,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: _lookingUp
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                        : const Text('Next', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.white)),
                  ),
                ),
              ],
            ),
          ] else if (_targetRoom != null) ...[
            // STEP 2: Ask Next Info depending on Room Type
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back, size: 20, color: AppColors.slate700),
                      onPressed: () => setState(() {
                        _step = 1;
                        _error = null;
                      }),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _targetRoom!.gameType == 'SPORTS_MATCH'
                              ? 'Back Your Team'
                              : _targetRoom!.gameType == 'GUESS_NUMBER'
                                  ? 'Pick Lucky Number'
                                  : 'Table Confirmation',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                        ),
                        Text(
                          'Room #${_targetRoom!.roomCode}',
                          style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: AppColors.slate500),
                        ),
                      ],
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20, color: AppColors.slate500),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 12),

            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: AppColors.red50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                ),
                child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
              ),
            ],

            // Room Summary Card
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.slate50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.slate200),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _targetRoom!.gameType == 'SPORTS_MATCH'
                            ? '🏏 Live Sports Pool'
                            : _targetRoom!.gameType == 'GUESS_NUMBER'
                                ? '🎲 Dice Guess'
                                : _targetRoom!.gameType == 'TWENTY_NINE'
                                    ? '🃏 29 Card Game'
                                    : '🃏 Teen Patti',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Players: ${_targetRoom!.players.length} / ${_targetRoom!.maxPlayers == 1000 ? 'Unlimited' : _targetRoom!.maxPlayers}',
                        style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                      ),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Text('Entry Stake', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                      Text(
                        '₹${_targetRoom!.entryFee.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.emerald700, fontFamily: 'monospace'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Sports Match Team Selection
            if (_targetRoom!.gameType == 'SPORTS_MATCH') ...[
              Builder(builder: (context) {
                final sportsData = resolveSportsMatch(_targetRoom!, widget.liveSportsMatches);
                final t1Name = sportsData['team1Name'] as String;
                final t2Name = sportsData['team2Name'] as String;
                final t1Logo = sportsData['team1Logo'] as String?;
                final t2Logo = sportsData['team2Logo'] as String?;
                final matchTitle = sportsData['matchTitle'] as String;
                final startTimeStr = sportsData['startTime'] as String?;
                final t1Picks = _targetRoom!.players.where((p) => p.guessNumber == 1).length;
                final t2Picks = _targetRoom!.players.where((p) => p.guessNumber == 2).length;
                final totalCodePicks = t1Picks + t2Picks;
                final t1CodePercent = totalCodePicks == 0 ? 50 : ((t1Picks / totalCodePicks) * 100).round();
                final t2CodePercent = 100 - t1CodePercent;

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text('🏏 ', style: TextStyle(fontSize: 14)),
                        Expanded(
                          child: Text(
                            matchTitle,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF1E3A8A)),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        MatchCountdownClock(
                          startTimeStr: startTimeStr,
                          roomStatus: _targetRoom!.status,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Which team will win this match?',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: () => setState(() => _chosenSportsTeam = 1),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                              decoration: BoxDecoration(
                                color: _chosenSportsTeam == 1 ? AppColors.emerald50 : AppColors.white,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: _chosenSportsTeam == 1 ? AppColors.emerald600 : AppColors.slate200,
                                  width: _chosenSportsTeam == 1 ? 2 : 1,
                                ),
                              ),
                              child: Column(
                                children: [
                                  buildTeamLogo(t1Logo, const Color(0xFF2563EB), size: 22),
                                  const SizedBox(height: 6),
                                  Text(
                                    t1Name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                      color: _chosenSportsTeam == 1 ? AppColors.emerald700 : AppColors.slate900,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '$t1CodePercent% chosen',
                                    style: const TextStyle(fontSize: 10, color: AppColors.slate500, fontWeight: FontWeight.w600),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: InkWell(
                            onTap: () => setState(() => _chosenSportsTeam = 2),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                              decoration: BoxDecoration(
                                color: _chosenSportsTeam == 2 ? const Color(0xFFFEF3C7) : AppColors.white,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: _chosenSportsTeam == 2 ? const Color(0xFFD97706) : AppColors.slate200,
                                  width: _chosenSportsTeam == 2 ? 2 : 1,
                                ),
                              ),
                              child: Column(
                                children: [
                                  buildTeamLogo(t2Logo, const Color(0xFFD97706), size: 22),
                                  const SizedBox(height: 6),
                                  Text(
                                    t2Name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                      color: _chosenSportsTeam == 2 ? const Color(0xFF92400E) : AppColors.slate900,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '$t2CodePercent% chosen',
                                    style: const TextStyle(fontSize: 10, color: AppColors.slate500, fontWeight: FontWeight.w600),
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
              }),
            ],

            // Dice Guess Number Selection
            if (_targetRoom!.gameType == 'GUESS_NUMBER') ...[
              const Text(
                'Choose Your Lucky Number (1-10):',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 8),
              Builder(builder: (context) {
                final taken = _targetRoom!.players.map((p) => p.guessNumber).whereType<int>().toSet();
                return Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: List.generate(10, (idx) {
                    final val = idx + 1;
                    final isTaken = taken.contains(val);
                    final isSel = _chosenNumber == val;

                    return ChoiceChip(
                      label: Text(
                        '$val',
                        style: TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w700,
                          decoration: isTaken ? TextDecoration.lineThrough : null,
                          color: isTaken
                              ? AppColors.slate400
                              : isSel
                                  ? AppColors.emerald700
                                  : AppColors.slate900,
                        ),
                      ),
                      selected: isSel && !isTaken,
                      onSelected: isTaken
                          ? null
                          : (selected) {
                              if (selected) setState(() => _chosenNumber = val);
                            },
                      backgroundColor: isTaken ? AppColors.slate100 : AppColors.white,
                      selectedColor: AppColors.emerald50,
                      side: BorderSide(
                        color: isTaken
                            ? AppColors.slate200
                            : isSel
                                ? AppColors.emerald600
                                : AppColors.slate200,
                      ),
                    );
                  }),
                );
              }),
            ],

            // Teen Patti Confirmation
            if (_targetRoom!.gameType == 'TEEN_PATTI') ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.slate50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'Confirming will lock your boot stake and seat you at this Teen Patti table.',
                  style: TextStyle(fontSize: 12, color: AppColors.slate700),
                ),
              ),
            ],

            // 29 Card Game Confirmation
            if (_targetRoom!.gameType == 'TWENTY_NINE') ...[
              TextButton(onPressed: () => launchUrl(Uri.parse('https://mgame-1.web.app/rules/29.html')), child: const Text('Single deal · Read house rules')),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF5F3FF),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFDDD6FE)),
                ),
                child: const Text(
                  '🃏 29 Card Game (Partnership 2v2)\n\n'
                  '• Team A (Seats 0, 2) vs Team B (Seats 1, 3)\n'
                  '• Confirming will lock your entry stake and seat you at this table.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF4338CA), height: 1.4),
                ),
              ),
            ],

            const SizedBox(height: 20),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => setState(() {
                      _step = 1;
                      _error = null;
                    }),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      side: const BorderSide(color: AppColors.slate200),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Back', style: TextStyle(color: AppColors.slate700, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _handleConfirmJoin,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _targetRoom!.gameType == 'TWENTY_NINE' ? const Color(0xFF4338CA) : AppColors.emerald600,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: _submitting
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                        : Text(
                            'Lock ₹${_targetRoom!.entryFee.toStringAsFixed(2)} & Join',
                            style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.white),
                          ),
                  ),
                ),
              ],
            ),
          ] else if (_step == 3 && _invitationPreview != null) ...[
            if (!_invitationPreview!.available)
              Text('This table cannot be joined: ${_invitationPreview!.unavailabilityReason ?? _invitationPreview!.status}. Ask the host for a new invitation.'),
            if (_invitationPreview!.rulesSummary != null) ...[
              Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_invitationPreview!.rulesSummary!)),
              TextButton(onPressed: () => launchUrl(Uri.parse('https://mgame-1.web.app/rules/29.html')), child: const Text('Read single-deal-v1 rules')),
            ],
            // STEP 3: Invitation Preview
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back, size: 20, color: AppColors.slate700),
                      onPressed: () => setState(() {
                        _step = 1;
                        _error = null;
                      }),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Table Invitation',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                        ),
                        Text(
                          'Room #${_invitationPreview!.roomCode}',
                          style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: AppColors.slate500),
                        ),
                      ],
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20, color: AppColors.slate500),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 12),

            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: AppColors.red50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                ),
                child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
              ),
            ],

            // Summary card
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.slate200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _invitationPreview!.gameType == 'TWENTY_NINE'
                            ? '🃏 29 Card Game'
                            : _invitationPreview!.gameType == 'TEEN_PATTI'
                                ? '🎴 Teen Patti'
                                : _invitationPreview!.gameType == 'SPORTS_MATCH'
                                    ? '🏏 Live Sports'
                                    : '🎲 Dice Guess',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                      ),
                      if (_invitationPreview!.isPrivate)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEDE9FE),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text('PRIVATE TABLE', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Color(0xFF4338CA))),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Host: @${_invitationPreview!.hostUsername}', style: const TextStyle(fontSize: 12, color: AppColors.slate600)),
                      Text('Stake: ₹${_invitationPreview!.entryFee.toStringAsFixed(2)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.emerald700, fontFamily: 'monospace')),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Seats: ${_invitationPreview!.occupiedSeats} / ${_invitationPreview!.maxPlayers} (${_invitationPreview!.availableSeats} available)',
                    style: const TextStyle(fontSize: 12, color: AppColors.slate600),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            if (_invitationPreview!.players.isNotEmpty) ...[
              const Text('Seated Players:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate700)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: _invitationPreview!.players.map((p) {
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.slate100,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '${getAvatarEmoji(p.avatar)} ${p.displayName.isNotEmpty ? p.displayName : p.username}',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate800),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 14),
            ],

            if (_invitationPreview!.gameType == 'GUESS_NUMBER') ...[
              const Text(
                'Choose Your Lucky Number (1-10):',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: List.generate(10, (idx) {
                  final val = idx + 1;
                  final isSel = _chosenNumber == val;
                  return ChoiceChip(
                    label: Text(
                      '$val',
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w700,
                        color: isSel ? AppColors.emerald700 : AppColors.slate900,
                      ),
                    ),
                    selected: isSel,
                    onSelected: (selected) {
                      if (selected) setState(() => _chosenNumber = val);
                    },
                    backgroundColor: AppColors.white,
                    selectedColor: AppColors.emerald50,
                    side: BorderSide(
                      color: isSel ? AppColors.emerald600 : AppColors.slate200,
                    ),
                  );
                }),
              ),
              const SizedBox(height: 12),
            ],

            if (_invitationPreview!.gameType == 'SPORTS_MATCH') ...[
              const Text(
                'Select Your Team:',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: () => setState(() => _chosenSportsTeam = 1),
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                        decoration: BoxDecoration(
                          color: _chosenSportsTeam == 1 ? AppColors.emerald50 : AppColors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: _chosenSportsTeam == 1 ? AppColors.emerald600 : AppColors.slate200,
                            width: _chosenSportsTeam == 1 ? 2 : 1,
                          ),
                        ),
                        child: Center(
                          child: Text(_invitationPreview!.teams.isNotEmpty ? _invitationPreview!.teams[0] : 'Team 1', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.slate900)),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: InkWell(
                      onTap: () => setState(() => _chosenSportsTeam = 2),
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                        decoration: BoxDecoration(
                          color: _chosenSportsTeam == 2 ? const Color(0xFFFEF3C7) : AppColors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: _chosenSportsTeam == 2 ? const Color(0xFFD97706) : AppColors.slate200,
                            width: _chosenSportsTeam == 2 ? 2 : 1,
                          ),
                        ),
                        child: Center(
                          child: Text(_invitationPreview!.teams.length > 1 ? _invitationPreview!.teams[1] : 'Team 2', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.slate900)),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],

            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.slate50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'Joining will lock ₹${_invitationPreview!.entryFee.toStringAsFixed(2)} from your balance and seat you immediately.',
                style: const TextStyle(fontSize: 11, color: AppColors.slate600),
              ),
            ),
            const SizedBox(height: 16),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => setState(() {
                      _step = 1;
                      _error = null;
                    }),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      side: const BorderSide(color: AppColors.slate200),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Back', style: TextStyle(color: AppColors.slate700, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _submitting || !_invitationPreview!.available ? null : _handleJoinInvitation,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF4338CA),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: _submitting
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text(
                            'Lock ₹${_invitationPreview!.entryFee.toStringAsFixed(2)} & Join',
                            style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
                          ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
