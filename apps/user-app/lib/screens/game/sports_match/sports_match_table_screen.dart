import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/constants/colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/socket_service.dart';
import '../../lobby/lobby_screen.dart';

class SportsMatchTableScreen extends StatefulWidget {
  final String roomId;
  final UserProfileModel user;
  final VoidCallback? onBalanceRefresh;

  const SportsMatchTableScreen({
    super.key,
    required this.roomId,
    required this.user,
    this.onBalanceRefresh,
  });

  @override
  State<SportsMatchTableScreen> createState() => _SportsMatchTableScreenState();
}

class _SportsMatchTableScreenState extends State<SportsMatchTableScreen> {
  RoomModel? _room;
  bool _loading = true;
  String? _error;
  Timer? _pollTimer;
  final List<MapEntry<String, dynamic Function(dynamic)>> _socketListeners = [];

  List<Map<String, dynamic>> _liveMatches = [];

  void _listenSocket(String event, dynamic Function(dynamic) handler) {
    _socketListeners.add(MapEntry(event, handler));
    SocketService.on(event, handler);
  }

  @override
  void initState() {
    super.initState();
    _loadRoom();
    _fetchMatches();
    _setupSockets();
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) => _loadRoom(silent: true));
  }

  Future<void> _fetchMatches() async {
    try {
      final matches = await ApiClient.getSportsMatches();
      if (mounted) {
        setState(() {
          _liveMatches = matches.map((m) => Map<String, dynamic>.from(m as Map)).toList();
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    for (final listener in _socketListeners) {
      SocketService.off(listener.key, listener.value);
    }
    SocketService.leaveRoom(widget.roomId);
    super.dispose();
  }

  void _setupSockets() {
    SocketService.joinRoom(widget.roomId);

    _listenSocket('room_updated', (data) {
      if (!mounted) return;
      if (data is Map<String, dynamic>) {
        setState(() => _room = RoomModel.fromJson(data));
      }
    });

    _listenSocket('game_finished', (data) {
      if (!mounted) return;
      _loadRoom(silent: true);
      widget.onBalanceRefresh?.call();
    });
  }

  Future<void> _loadRoom({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final room = await ApiClient.getRoomDetails(widget.roomId);
      if (mounted) {
        setState(() {
          _room = room;
          _error = null;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _cancelPool() async {
    try {
      await ApiClient.cancelRoom(widget.roomId);
      await _loadRoom();
      widget.onBalanceRefresh?.call();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.red600),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _room == null) {
      return const Scaffold(
        backgroundColor: AppColors.slate50,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.emerald600),
        ),
      );
    }

    if (_error != null && _room == null) {
      return Scaffold(
        backgroundColor: AppColors.slate50,
        appBar: AppBar(title: const Text('Sports Match Pool')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_error!, style: const TextStyle(color: AppColors.red600)),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => _loadRoom(),
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald600),
                child: const Text('Retry', style: TextStyle(color: AppColors.white)),
              ),
            ],
          ),
        ),
      );
    }

    final room = _room!;
    final config = room.customConfig is Map<String, dynamic> ? room.customConfig as Map<String, dynamic> : {};
    final rawTeam1 = config['team1'] as Map<String, dynamic>? ?? {};
    final rawTeam2 = config['team2'] as Map<String, dynamic>? ?? {};
    String rawTitle = config['matchTitle'] as String? ?? '';
    String t1Name = rawTeam1['name']?.toString() ?? '';
    String t2Name = rawTeam2['name']?.toString() ?? '';

    final matchId = config['matchId']?.toString();
    if (matchId != null && matchId.isNotEmpty && _liveMatches.isNotEmpty) {
      final found = _liveMatches.firstWhere((m) => m['id']?.toString() == matchId, orElse: () => {});
      if (found.isNotEmpty) {
        if (rawTitle.isEmpty) rawTitle = found['name']?.toString() ?? '';
        if (t1Name.isEmpty || t1Name.toLowerCase() == 'team 1') t1Name = found['team1']?['name']?.toString() ?? t1Name;
        rawTeam1['shortName'] ??= found['team1']?['shortName'];
        rawTeam1['logo'] ??= found['team1']?['logo'];
        if (t2Name.isEmpty || t2Name.toLowerCase() == 'team 2') t2Name = found['team2']?['name']?.toString() ?? t2Name;
        rawTeam2['shortName'] ??= found['team2']?['shortName'];
        rawTeam2['logo'] ??= found['team2']?['logo'];
        config['startTime'] ??= found['startTime'];
      }
    }

    final isGeneric = t1Name.isEmpty ||
        t2Name.isEmpty ||
        t1Name.toLowerCase() == 'team 1' ||
        t2Name.toLowerCase() == 'team 2' ||
        rawTitle.isEmpty ||
        rawTitle.toLowerCase() == 'team 1 vs team 2';

    if (isGeneric && _liveMatches.isNotEmpty) {
      final idx = room.roomCode.hashCode.abs() % _liveMatches.length;
      final fallback = _liveMatches[idx];
      rawTitle = fallback['name']?.toString() ?? rawTitle;
      t1Name = fallback['team1']?['name']?.toString() ?? t1Name;
      rawTeam1['shortName'] = fallback['team1']?['shortName'] ?? rawTeam1['shortName'];
      rawTeam1['logo'] = fallback['team1']?['logo'] ?? rawTeam1['logo'];
      t2Name = fallback['team2']?['name']?.toString() ?? t2Name;
      rawTeam2['shortName'] = fallback['team2']?['shortName'] ?? rawTeam2['shortName'];
      rawTeam2['logo'] = fallback['team2']?['logo'] ?? rawTeam2['logo'];
      config['startTime'] ??= fallback['startTime'];
    }

    if ((t1Name.isEmpty || t2Name.isEmpty) && rawTitle.contains(' vs ')) {
      final parts = rawTitle.split(' vs ');
      if (t1Name.isEmpty && parts.isNotEmpty) t1Name = parts[0].trim();
      if (t2Name.isEmpty && parts.length > 1) t2Name = parts[1].trim();
    }
    if (t1Name.isEmpty) t1Name = 'Team 1';
    if (t2Name.isEmpty) t2Name = 'Team 2';

    final team1 = {
      ...rawTeam1,
      'name': t1Name,
      'shortName': rawTeam1['shortName'] ?? t1Name,
    };
    final team2 = {
      ...rawTeam2,
      'name': t2Name,
      'shortName': rawTeam2['shortName'] ?? t2Name,
    };
    final sport = config['sport'] as String? ?? 'Sports';
    final league = config['league'] as String? ?? 'Live Sports Pool';
    final matchTitle = rawTitle.isNotEmpty ? rawTitle : '$t1Name vs $t2Name';

    final totalPot = room.entryFee * room.players.length;
    final team1Players = room.players.where((p) => p.guessNumber == 1).toList();
    final team2Players = room.players.where((p) => p.guessNumber == 2).toList();

    final myPlayer = room.players.cast<RoomPlayerModel?>().firstWhere(
      (p) => p?.userId == widget.user.id,
      orElse: () => null,
    );
    final myPick = myPlayer?.guessNumber;
    final isSoloHost = room.players.isNotEmpty && room.players.first.userId == widget.user.id && room.players.length == 1;

    final isCompleted = room.status == 'COMPLETED';
    final isCancelled = room.status == 'CANCELLED';
    final isLocked = room.status == 'PLAYING' || isCompleted || isCancelled;
    final didIWin = isCompleted && myPick != null && myPick == room.winningNumber;

    final team1Payout = team1Players.isNotEmpty ? (totalPot / team1Players.length).toStringAsFixed(2) : totalPot.toStringAsFixed(2);
    final team2Payout = team2Players.isNotEmpty ? (totalPot / team2Players.length).toStringAsFixed(2) : totalPot.toStringAsFixed(2);

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: Text(
          'Table #${room.roomCode}',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.white),
        ),
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: AppColors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          if (room.status == 'WAITING' && isSoloHost)
            IconButton(
              icon: const Icon(Icons.cancel_outlined, color: AppColors.red600),
              tooltip: 'Cancel table and refund entry',
              onPressed: _cancelPool,
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Status & League Banner
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Text(sport == 'Cricket' ? '🏏' : sport == 'Football' ? '⚽' : '🏆', style: const TextStyle(fontSize: 16)),
                      const SizedBox(width: 8),
                      Text(league, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate300)),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: isCompleted
                          ? AppColors.emerald600.withValues(alpha: 0.2)
                          : isCancelled
                          ? AppColors.red600.withValues(alpha: 0.2)
                          : isLocked
                          ? const Color(0xFF6366F1).withValues(alpha: 0.2)
                          : AppColors.slate700,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      isCompleted ? 'COMPLETED' : isCancelled ? 'CANCELLED / REFUNDED' : isLocked ? 'LOCKED / IN PLAY' : 'OPEN FOR JOIN',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: isCompleted ? const Color(0xFF34D399) : isCancelled ? AppColors.red600 : isLocked ? const Color(0xFFA5B4FC) : AppColors.slate300,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Scoreboard Arena Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                boxShadow: [
                  BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 10, offset: const Offset(0, 4)),
                ],
              ),
              child: Column(
                children: [
                  Text(matchTitle, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.white), textAlign: TextAlign.center),
                  if (config['startTime'] != null) ...[
                    const SizedBox(height: 8),
                    MatchCountdownClock(
                      startTimeStr: config['startTime']?.toString(),
                      roomStatus: room.status,
                    ),
                  ],
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      // Team 1
                      Expanded(
                        child: Column(
                          children: [
                            Container(
                              width: 50,
                              height: 50,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: const Color(0xFF6366F1).withValues(alpha: 0.2),
                                border: Border.all(color: const Color(0xFF6366F1), width: 1.5),
                              ),
                              child: Center(
                                child: (team1['logo'] != null &&
                                        (team1['logo'].toString().startsWith('http://') ||
                                            team1['logo'].toString().startsWith('https://')))
                                    ? ClipOval(
                                        child: Image.network(
                                          team1['logo'].toString(),
                                          width: 44,
                                          height: 44,
                                          fit: BoxFit.contain,
                                          errorBuilder: (context, error, stackTrace) => Text(
                                            team1['shortName'] ?? team1['name']?.substring(0, 2) ?? 'T1',
                                            style: const TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                          ),
                                        ),
                                      )
                                    : Text(
                                        team1['shortName'] ?? team1['name']?.substring(0, 2) ?? 'T1',
                                        style: const TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                      ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(team1['name'] ?? 'Team 1', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.white), textAlign: TextAlign.center, maxLines: 1),
                            const SizedBox(height: 4),
                            Text('${team1Players.length} picks', style: const TextStyle(fontSize: 11, color: Color(0xFFA5B4FC), fontWeight: FontWeight.w600)),
                            const SizedBox(height: 2),
                            Text('Pays ₹$team1Payout', style: const TextStyle(fontSize: 10, color: Color(0xFF34D399), fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),

                      // VS Badge
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withValues(alpha: 0.05),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                        ),
                        child: const Text('VS', style: TextStyle(color: Color(0xFF818CF8), fontSize: 11, fontWeight: FontWeight.w900)),
                      ),

                      // Team 2
                      Expanded(
                        child: Column(
                          children: [
                            Container(
                              width: 50,
                              height: 50,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: const Color(0xFFA855F7).withValues(alpha: 0.2),
                                border: Border.all(color: const Color(0xFFA855F7), width: 1.5),
                              ),
                              child: Center(
                                child: (team2['logo'] != null &&
                                        (team2['logo'].toString().startsWith('http://') ||
                                            team2['logo'].toString().startsWith('https://')))
                                    ? ClipOval(
                                        child: Image.network(
                                          team2['logo'].toString(),
                                          width: 44,
                                          height: 44,
                                          fit: BoxFit.contain,
                                          errorBuilder: (context, error, stackTrace) => Text(
                                            team2['shortName'] ?? team2['name']?.substring(0, 2) ?? 'T2',
                                            style: const TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                          ),
                                        ),
                                      )
                                    : Text(
                                        team2['shortName'] ?? team2['name']?.substring(0, 2) ?? 'T2',
                                        style: const TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                      ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(team2['name'] ?? 'Team 2', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.white), textAlign: TextAlign.center, maxLines: 1),
                            const SizedBox(height: 4),
                            Text('${team2Players.length} picks', style: const TextStyle(fontSize: 11, color: Color(0xFFE9D5FF), fontWeight: FontWeight.w600)),
                            const SizedBox(height: 2),
                            Text('Pays ₹$team2Payout', style: const TextStyle(fontSize: 10, color: Color(0xFF34D399), fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Winner Announcement or User Status
            if (isCompleted) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: didIWin ? AppColors.emerald600.withValues(alpha: 0.2) : Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: didIWin ? AppColors.emerald500 : Colors.white.withValues(alpha: 0.1)),
                ),
                child: Row(
                  children: [
                    Text(didIWin ? '🎉' : '🏆', style: const TextStyle(fontSize: 24)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            didIWin ? 'Congratulations! You Won!' : 'Match Settled',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: didIWin ? const Color(0xFF6EE7B7) : AppColors.white),
                          ),
                          Text(
                            'Winner: ${room.winningNumber == 1 ? team1['name'] : room.winningNumber == 2 ? team2['name'] : 'Decided Outcome'}',
                            style: const TextStyle(fontSize: 12, color: AppColors.slate300),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
            ],

            // Financial Summary Card
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  Column(
                    children: [
                      const Text('Entry Fee', style: TextStyle(fontSize: 11, color: AppColors.slate400)),
                      const SizedBox(height: 2),
                      Text('₹${room.entryFee.toStringAsFixed(0)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.white, fontFamily: 'monospace')),
                    ],
                  ),
                  Container(width: 1, height: 30, color: Colors.white.withValues(alpha: 0.1)),
                  Column(
                    children: [
                      const Text('Total Pool', style: TextStyle(fontSize: 11, color: AppColors.slate400)),
                      const SizedBox(height: 2),
                      Text('₹${totalPot.toStringAsFixed(2)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF34D399), fontFamily: 'monospace')),
                    ],
                  ),
                  Container(width: 1, height: 30, color: Colors.white.withValues(alpha: 0.1)),
                  Column(
                    children: [
                      const Text('Participants', style: TextStyle(fontSize: 11, color: AppColors.slate400)),
                      const SizedBox(height: 2),
                      Text('${room.players.length} / ${room.maxPlayers >= 100 ? '∞' : room.maxPlayers}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.white)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Backed Team Info
            if (myPick != null) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: myPick == 1 ? const Color(0xFF6366F1).withValues(alpha: 0.15) : const Color(0xFFA855F7).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: myPick == 1 ? const Color(0xFF6366F1) : const Color(0xFFA855F7)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.check_circle_rounded, size: 18, color: myPick == 1 ? const Color(0xFF818CF8) : const Color(0xFFC084FC)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'You backed: ${myPick == 1 ? team1['name'] : team2['name']}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: myPick == 1 ? const Color(0xFFA5B4FC) : const Color(0xFFE9D5FF),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
            ],

            // Participants List
            const Text(
              'Participants',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.white),
            ),
            const SizedBox(height: 8),
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: room.players.length,
              separatorBuilder: (_, __) => const SizedBox(height: 6),
              itemBuilder: (context, index) {
                final p = room.players[index];
                final isMe = p.userId == widget.user.id;
                final pickName = p.guessNumber == 1 ? team1['name'] : team2['name'];

                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: isMe ? Colors.white.withValues(alpha: 0.1) : const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: isMe ? const Color(0xFF6366F1) : Colors.white.withValues(alpha: 0.05)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 12,
                            backgroundColor: const Color(0xFF334155),
                            child: Text(
                              p.username.isNotEmpty ? p.username[0].toUpperCase() : '?',
                              style: const TextStyle(fontSize: 10, color: AppColors.white, fontWeight: FontWeight.bold),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            p.username + (isMe ? ' (You)' : ''),
                            style: TextStyle(fontSize: 12, fontWeight: isMe ? FontWeight.bold : FontWeight.w500, color: AppColors.white),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: p.guessNumber == 1 ? const Color(0xFF6366F1).withValues(alpha: 0.2) : const Color(0xFFA855F7).withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          pickName ?? 'Picked',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: p.guessNumber == 1 ? const Color(0xFFA5B4FC) : const Color(0xFFE9D5FF),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
