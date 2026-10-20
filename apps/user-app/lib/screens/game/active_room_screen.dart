import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/constants/colors.dart';
import '../../core/network/api_client.dart';
import '../../core/network/socket_service.dart';
import 'teen_patti/teen_patti_table_screen.dart';

class ActiveRoomScreen extends StatefulWidget {
  final String roomId;
  final UserProfileModel user;

  const ActiveRoomScreen({
    super.key,
    required this.roomId,
    required this.user,
  });

  @override
  State<ActiveRoomScreen> createState() => _ActiveRoomScreenState();
}

class _ActiveRoomScreenState extends State<ActiveRoomScreen> {
  RoomModel? _room;
  bool _loading = true;
  String? _error;

  int? _countdown;
  bool _isRolling = false;
  int? _rollTickNumber;

  Map<String, dynamic>? _gameFinishedData;
  Timer? _fallbackPollTimer;
  final List<MapEntry<String, dynamic Function(dynamic)>> _socketListeners = [];

  void _listenSocket(String event, dynamic Function(dynamic) handler) {
    _socketListeners.add(MapEntry(event, handler));
    SocketService.on(event, handler);
  }

  @override
  void initState() {
    super.initState();
    _initRoom();
  }

  @override
  void dispose() {
    _fallbackPollTimer?.cancel();
    SocketService.leaveRoom(widget.roomId);
    for (final entry in _socketListeners) {
      SocketService.off(entry.key, entry.value);
    }
    _socketListeners.clear();
    super.dispose();
  }

  Future<void> _initRoom() async {
    await _loadRoom();
    if (!mounted) return;

    // Join WebSocket channel for real-time multiplayer updates
    SocketService.joinRoom(widget.roomId);
    _listenSocket('connect', (_) {
      SocketService.joinRoom(widget.roomId);
      _loadRoom();
    });

    _listenSocket('room_updated', (data) {
      if (mounted && data != null) {
        if (data['id'] != null && data['id'] != widget.roomId) return;
        setState(() {
          _room = RoomModel.fromJson(data);
        });
      }
    });

    _listenSocket('game_countdown', (data) {
      if (mounted && data != null && data['countdown'] != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        setState(() {
          _countdown = (data['countdown'] as num).toInt();
        });
      }
    });

    _listenSocket('roll_started', (data) {
      if (mounted) {
        if (data is Map && data['roomId'] != null && data['roomId'] != widget.roomId) return;
        setState(() {
          _isRolling = true;
          _countdown = null;
        });
      }
    });

    _listenSocket('roll_tick', (data) {
      if (mounted && data != null && data['number'] != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        setState(() {
          _rollTickNumber = (data['number'] as num).toInt();
        });
      }
    });

    _listenSocket('game_finished', (data) {
      if (mounted && data != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        setState(() {
          _isRolling = false;
          _gameFinishedData = Map<String, dynamic>.from(data);
          if (data['room'] != null) {
            _room = RoomModel.fromJson(data['room']);
          }
        });
      }
    });

    // Fallback polling every 3 seconds for network reliability
    _fallbackPollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (!['COMPLETED', 'CANCELLED'].contains(_room?.status)) {
        _loadRoom(silent: true);
      }
    });
  }

  Future<void> _loadRoom({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final room = await ApiClient.getRoomDetails(widget.roomId);
      if (mounted) {
        setState(() {
          _room = room;
          if (['COMPLETED', 'CANCELLED'].contains(room.status)) { _isRolling = false; _countdown = null; }
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && !silent) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (mounted && !silent) {
        setState(() => _loading = false);
      }
    }
  }

  void _copyRoomCode() {
    if (_room == null) return;
    Clipboard.setData(ClipboardData(text: _room!.roomCode));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Room code ${_room!.roomCode} copied to clipboard'),
        duration: const Duration(seconds: 2),
        backgroundColor: AppColors.slate900,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_loading && _error == null && _room?.gameType == 'TEEN_PATTI') {
      return TeenPattiTableScreen(
        roomId: widget.roomId,
        user: widget.user,
        onBalanceRefresh: () => _loadRoom(silent: true),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        title: Text(
          _room != null ? 'Table #${_room!.roomCode}' : 'Game Table',
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.slate900,
          ),
        ),
        backgroundColor: AppColors.white,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: AppColors.slate900),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          if (_room?.status == 'WAITING' && _room!.players.any((p) => p.userId == widget.user.id))
            IconButton(
              icon: const Icon(Icons.cancel_outlined),
              tooltip: 'Cancel table and refund all entries',
              onPressed: () async {
                try { await ApiClient.cancelRoom(widget.roomId); await _loadRoom(); }
                catch (error) { if (mounted) setState(() => _error = error.toString()); }
              },
            ),
          if (_room != null)
            IconButton(
              icon: const Icon(Icons.copy, size: 18, color: AppColors.slate700),
              tooltip: 'Copy Room Code',
              onPressed: _copyRoomCode,
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: AppColors.slate200, height: 1),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.emerald600))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 36, color: AppColors.red600),
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: AppColors.slate600)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () => _loadRoom(),
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald600),
                        child: const Text('Retry', style: TextStyle(color: AppColors.white)),
                      )
                    ],
                  ),
                )
              : _buildRoomContent(),
    );
  }

  Widget _buildRoomContent() {
    final room = _room!;
    final totalPool = room.entryFee * room.maxPlayers;
    final winnerPrize = room.winnerPrize ?? totalPool;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Metrics Bar
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.slate200),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'ENTRY STAKE',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate500),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '₹${room.entryFee.toStringAsFixed(0)}',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: AppColors.slate900,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(height: 36, width: 1, color: AppColors.slate200),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(left: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            room.winnerPrize != null ? 'WINNER PAYOUT' : 'PRIZE POOL',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.emerald700),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '₹${winnerPrize.toStringAsFixed(0)}',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: AppColors.emerald600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.slate100,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: Text(
                      '${room.players.length}/${room.maxPlayers} Seats',
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.slate800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Live Game State Banner
            _buildGameStateBanner(),
            const SizedBox(height: 20),

            // Players Seats Section
            const Text(
              'TABLE PARTICIPANTS',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
                color: AppColors.slate500,
              ),
            ),
            const SizedBox(height: 10),
            _buildSeatsList(room),
            const SizedBox(height: 24),

            // Room Code Share Pill
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.slate200),
              ),
              child: Row(
                children: [
                  const Icon(Icons.share_outlined, size: 16, color: AppColors.slate600),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Share Code: ${room.roomCode}',
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.slate800,
                      ),
                    ),
                  ),
                  InkWell(
                    onTap: _copyRoomCode,
                    child: const Text(
                      'COPY',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.emerald600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGameStateBanner() {
    if (_room?.status == 'CANCELLED') return const Text('Table cancelled. Entry fees refunded.');
    // 1. Finished Game State
    if (_gameFinishedData != null || _room?.status == 'COMPLETED') {
      final winnerUsername = _gameFinishedData?['winnerUsername'] ?? _room?.winnerUsername ?? 'Winner';
      final winningNumber = _gameFinishedData?['winningNumber'] ?? _room?.winningNumber ?? 0;
      final winnerPrize = (_gameFinishedData?['winnerPrize'] as num?)?.toDouble() ??
          _room?.winnerPrize;
      final isMeWinner = _gameFinishedData?['winnerId'] == widget.user.id || _room?.winnerId == widget.user.id;

      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: isMeWinner ? AppColors.emerald50 : AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isMeWinner ? AppColors.emerald600 : AppColors.slate200),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: isMeWinner ? AppColors.emerald600 : AppColors.slate900,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                isMeWinner ? 'YOU ARE THE WINNER!' : 'GAME CONCLUDED',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.white),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'WINNING NUMBER',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate500),
            ),
            const SizedBox(height: 6),
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: AppColors.slate900,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: Text(
                  '$winningNumber',
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: AppColors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Winner: $winnerUsername',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
            ),
            const SizedBox(height: 4),
            Text(
              winnerPrize != null ? 'Payout: ₹${winnerPrize.toStringAsFixed(2)} credited' : 'Prize credited. See your wallet for the payout.',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.emerald600,
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              height: 42,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.slate900,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: const Text('Back to Lobby', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
      );
    }

    // 2. Rolling State
    if (_isRolling || _room?.status == 'ROLLING') {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.emerald600),
        ),
        child: Column(
          children: [
            const Text(
              'ROLLING RANDOM WINNER...',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.emerald700),
            ),
            const SizedBox(height: 16),
            Container(
              width: 70,
              height: 70,
              decoration: BoxDecoration(
                color: AppColors.emerald600,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Center(
                child: Text(
                  '${_rollTickNumber ?? 7}',
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 34,
                    fontWeight: FontWeight.w800,
                    color: AppColors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Determining winner with cryptographic random roll',
              style: TextStyle(fontSize: 12, color: AppColors.slate500),
            ),
          ],
        ),
      );
    }

    // 3. Countdown State
    if (_countdown != null || _room?.status == 'COUNTDOWN') {
      final count = _countdown ?? 5;
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.amber600),
        ),
        child: Column(
          children: [
            const Text(
              'TABLE FULL - STARTING IN',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.amber800),
            ),
            const SizedBox(height: 12),
            Text(
              '$count',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 48,
                fontWeight: FontWeight.w800,
                color: AppColors.amber600,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Prepare for the number reveal!',
              style: TextStyle(fontSize: 12, color: AppColors.slate500),
            ),
          ],
        ),
      );
    }

    // 4. Waiting State
    final remaining = _room!.maxPlayers - _room!.players.length;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.slate200),
      ),
      child: Column(
        children: [
          const Icon(Icons.people_alt_outlined, size: 28, color: AppColors.slate600),
          const SizedBox(height: 10),
          Text(
            remaining > 0 ? 'Waiting for $remaining player${remaining > 1 ? 's' : ''}' : 'Table ready',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
          ),
          const SizedBox(height: 4),
          const Text(
            'The roll will begin automatically once all seats are filled.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.slate500),
          ),
        ],
      ),
    );
  }

  Widget _buildSeatsList(RoomModel room) {
    return Column(
      children: List.generate(room.maxPlayers, (index) {
        if (index < room.players.length) {
          final p = room.players[index];
          final isMe = p.userId == widget.user.id;
          final isWinner = room.winnerId != null && room.winnerId == p.userId;

          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: isMe ? AppColors.emerald50.withValues(alpha: 0.5) : AppColors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isWinner
                    ? AppColors.emerald600
                    : isMe
                        ? AppColors.emerald600.withValues(alpha: 0.5)
                        : AppColors.slate200,
                width: isWinner ? 1.5 : 1,
              ),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: isMe ? AppColors.emerald600 : AppColors.slate800,
                  child: Text(
                    p.username.isNotEmpty ? p.username[0].toUpperCase() : 'P',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.white),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            p.username,
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate900),
                          ),
                          if (isMe) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.emerald100,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                'YOU',
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.emerald800),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        index == 0 ? 'Table Host' : 'Challenger',
                        style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                      ),
                    ],
                  ),
                ),
                // Guess number badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.slate100,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: AppColors.slate200),
                  ),
                  child: Text(
                    isMe || room.status == 'COMPLETED' ? 'No. ${p.guessNumber}' : 'No. ? [🔒]',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.slate800,
                    ),
                  ),
                ),
              ],
            ),
          );
        } else {
          // Empty seat placeholder
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.slate200, style: BorderStyle.solid),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: AppColors.slate100,
                  child: const Icon(Icons.person_outline, size: 18, color: AppColors.slate400),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Empty Seat',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.slate400),
                ),
                const Spacer(),
                const Text(
                  'Waiting...',
                  style: TextStyle(fontSize: 12, color: AppColors.slate400),
                ),
              ],
            ),
          );
        }
      }),
    );
  }
}
