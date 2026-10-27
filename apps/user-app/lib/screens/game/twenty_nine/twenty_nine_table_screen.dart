import 'dart:async';
import '../../../core/services/room_invitations.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/constants/colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/socket_service.dart';
import '../../../models/twenty_nine_models.dart';

const Map<String, String> kCuratedAvatarIcons = {
  'avatar_1': '🦁',
  'avatar_2': '🐯',
  'avatar_3': '🦅',
  'avatar_4': '🐺',
  'avatar_5': '🦊',
  'avatar_6': '🐉',
  'avatar_7': '🎯',
  'avatar_8': '⚡',
  'avatar_9': '👑',
  'avatar_10': '🛡️',
  'avatar_11': '💎',
  'avatar_12': '🎲',
};

class TwentyNineTableScreen extends StatefulWidget {
  final String roomId;
  final UserProfileModel user;
  final VoidCallback onBalanceRefresh;
  final Future<RoomModel> Function(String)? loadRoom;
  final Future<void> Function(String, String, Map<String, dynamic>)? submitAction;

  const TwentyNineTableScreen({
    super.key,
    required this.roomId,
    required this.user,
    required this.onBalanceRefresh,
    this.loadRoom, this.submitAction,
  });

  @override
  State<TwentyNineTableScreen> createState() => _TwentyNineTableScreenState();
}

class _TwentyNineTableScreenState extends State<TwentyNineTableScreen> {
  RoomModel? _room;
  TwentyNineGameStateModel? _gameState;
  bool _loading = true;
  String? _error;
  bool _isActing = false;

  int _selectedBid = 16;
  int _secondsRemaining = 0;
  Timer? _turnTimer;
  Timer? _fallbackPollTimer;
  final List<MapEntry<String, dynamic Function(dynamic)>> _socketListeners = [];

  void _listenSocket(String event, dynamic Function(dynamic) handler) {
    _socketListeners.add(MapEntry(event, handler));
    SocketService.on(event, handler);
  }

  @override
  void initState() {
    super.initState();
    _initTable();
  }

  @override
  void dispose() {
    _turnTimer?.cancel();
    _fallbackPollTimer?.cancel();
    SocketService.leaveRoom(widget.roomId);
    for (final entry in _socketListeners) {
      SocketService.off(entry.key, entry.value);
    }
    _socketListeners.clear();
    super.dispose();
  }

  Future<void> _initTable() async {
    await _loadRoom();
    if (!mounted) return;

    SocketService.joinRoom(widget.roomId);
    _listenSocket('connect', (_) {
      SocketService.joinRoom(widget.roomId);
      _loadRoom();
    });

    _listenSocket('twenty_nine_state', (data) {
      if (!mounted || data == null || data['roomId'] != widget.roomId) return;
      final incoming = TwentyNineGameStateModel.fromJson(Map<String, dynamic>.from(data));
      if (_gameState != null && incoming.sequence < _gameState!.sequence) return;
      setState(() { _gameState = incoming; _updateTurnTimer(); });
      if (incoming.phase == TwentyNinePhase.COMPLETED) widget.onBalanceRefresh();
    });
    _listenSocket('room_updated', (data) {
      if (mounted && data != null && data['id'] == widget.roomId) _loadRoom(silent: true);
    });

    _fallbackPollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (mounted && _gameState?.phase != TwentyNinePhase.COMPLETED) {
        _loadRoom(silent: true);
      }
    });
  }

  Future<void> _loadRoom({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final room = await (widget.loadRoom ?? ApiClient.getRoomDetails)(widget.roomId);
      if (mounted) {
        setState(() {
          _room = room;
          if (room.gameState != null) {
            final incoming = TwentyNineGameStateModel.fromJson(room.gameState!);
            if (_gameState == null || incoming.sequence >= _gameState!.sequence) _gameState = incoming;
            _updateTurnTimer();
          }
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

  void _updateTurnTimer() {
    _turnTimer?.cancel();
    if (_gameState?.turnExpiresAt == null) {
      _secondsRemaining = 0;
      return;
    }
    _secondsRemaining = ((_gameState!.turnExpiresAt! - DateTime.now().millisecondsSinceEpoch) / 1000).ceil();
    if (_secondsRemaining < 0) _secondsRemaining = 0;

    _turnTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        final remaining = ((_gameState!.turnExpiresAt! - DateTime.now().millisecondsSinceEpoch) / 1000).ceil();
        if (remaining <= 0) {
          _secondsRemaining = 0;
          timer.cancel();
        } else {
          _secondsRemaining = remaining;
        }
      });
    });

    // Update default bid selector when highest bid changes
    if (_gameState?.highestBid != null) {
      _selectedBid = (_gameState!.highestBid! + 1).clamp(16, 28);
    } else {
      _selectedBid = 16;
    }
  }

  // Determine user's seat and partners
  int get _mySeatIndex {
    final myState = _gameState?.players[widget.user.id];
    if (myState != null) return myState.seatIndex;
    final p = _room?.players.firstWhere(
      (p) => p.userId == widget.user.id,
      orElse: () => RoomPlayerModel(id: '', userId: '', username: '', displayName: '', seatIndex: 0),
    );
    return p?.seatIndex ?? 0;
  }

  TwentyNinePlayerStateModel? _getPlayerAtSeat(int seatIndex) {
    if (_gameState == null) return null;
    return _gameState!.players.values.cast<TwentyNinePlayerStateModel?>().firstWhere(
          (p) => p?.seatIndex == seatIndex,
          orElse: () => null,
        );
  }

  RoomPlayerModel? _getRoomPlayerAtSeat(int seatIndex) {
    if (_room == null) return null;
    return _room!.players.cast<RoomPlayerModel?>().firstWhere(
          (p) => p?.seatIndex == seatIndex,
          orElse: () => null,
        );
  }

  bool get _isMyTurn => _gameState?.currentTurnUserId == widget.user.id;

  Future<void> _sendAction({required String roomId, required String action, Map<String, dynamic>? payload}) async {
    try {
      final data = <String, dynamic>{
        ...?payload, 'expectedSequence': _gameState?.sequence,
        'actionId': '${widget.user.id}-${DateTime.now().microsecondsSinceEpoch}',
      };
      if (widget.submitAction != null) { await widget.submitAction!(roomId, action, data); }
      else { await ApiClient.sendGameAction(roomId: roomId, action: action, payload: data); }
    } catch (_) { await _loadRoom(silent: true); rethrow; }
  }

  // Actions
  Future<void> _submitBid(int amount) async {
    if (_isActing) return;
    setState(() => _isActing = true);
    try {
      await _sendAction(
        roomId: widget.roomId,
        action: 'BID',
        payload: {'amount': amount},
      );
    } catch (e) {
      _showToast(e.toString());
    } finally {
      if (mounted) setState(() => _isActing = false);
    }
  }

  Future<void> _submitPass() async {
    if (_isActing) return;
    setState(() => _isActing = true);
    try {
      await _sendAction(
        roomId: widget.roomId,
        action: 'PASS',
      );
    } catch (e) {
      _showToast(e.toString());
    } finally {
      if (mounted) setState(() => _isActing = false);
    }
  }

  Future<void> _selectTrump(CardSuit suit) async {
    if (_isActing) return;
    setState(() => _isActing = true);
    try {
      await _sendAction(
        roomId: widget.roomId,
        action: 'SELECT_TRUMP',
        payload: {'suit': suit.name},
      );
    } catch (e) {
      _showToast(e.toString());
    } finally {
      if (mounted) setState(() => _isActing = false);
    }
  }

  Future<void> _revealTrump() async {
    if (_isActing) return;
    setState(() => _isActing = true);
    try {
      await _sendAction(
        roomId: widget.roomId,
        action: 'REVEAL_TRUMP',
      );
    } catch (e) {
      _showToast(e.toString());
    } finally {
      if (mounted) setState(() => _isActing = false);
    }
  }

  Future<void> _playCard(PlayingCardModel card) async {
    if (!_isMyTurn || _isActing) return;
    setState(() => _isActing = true);
    try {
      await _sendAction(
        roomId: widget.roomId,
        action: 'PLAY_CARD',
        payload: {'card': card.toJson()},
      );
    } catch (e) {
      _showToast(e.toString());
    } finally {
      if (mounted) setState(() => _isActing = false);
    }
  }

  void _showToast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.slate900,
        duration: const Duration(seconds: 2),
      ),
    );
  }


  void _copyRoomCode() {
    Clipboard.setData(ClipboardData(text: _room?.roomCode ?? ''));
    _showToast('Room code #${_room?.roomCode} copied!');
  }

  void _showPlayerProfile(String userId) async {
    try {
      final profile = await ApiClient.getPublicProfile(userId);
      if (!mounted) return;
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              Text(
                kCuratedAvatarIcons[profile.avatar] ?? '🦁',
                style: const TextStyle(fontSize: 28),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile.displayName,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      '@${profile.username}',
                      style: const TextStyle(fontSize: 12, color: AppColors.slate500),
                    ),
                  ],
                ),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.slate100,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    Column(
                      children: [
                        const Text('Played', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                        const SizedBox(height: 2),
                        Text(
                          '${profile.stats.totalGames}',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    Column(
                      children: [
                        const Text('Won', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                        const SizedBox(height: 2),
                        Text(
                          '${profile.stats.totalWins}',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.emerald600),
                        ),
                      ],
                    ),
                    Column(
                      children: [
                        const Text('Win Rate', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                        const SizedBox(height: 2),
                        Text(
                          '${profile.stats.winRatePercent.toStringAsFixed(1)}%',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.indigo),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (_) {}
  }

  // Determine if a card is legally playable
  bool _isCardLegal(PlayingCardModel card, List<PlayingCardModel> hand) {
    return _isMyTurn && _gameState?.phase == TwentyNinePhase.PLAYING &&
        (_gameState?.players[widget.user.id]?.legalCards.contains(card) ?? false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _room == null) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: CircularProgressIndicator(color: AppColors.emerald500)),
      );
    }

    if (_error != null && _room == null) {
      return Scaffold(
        backgroundColor: const Color(0xFF0F172A),
        appBar: AppBar(backgroundColor: Colors.transparent, elevation: 0),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppColors.red600, size: 40),
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _loadRoom, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    final partnerSeat = (_mySeatIndex + 2) % 4;
    final leftSeat = (_mySeatIndex + 3) % 4;
    final rightSeat = (_mySeatIndex + 1) % 4;

    final myPlayer = _gameState?.players[widget.user.id];
    final myCards = myPlayer?.cards ?? [];

    return Scaffold(
      backgroundColor: const Color(0xFF0B132B),
      appBar: _buildAppBar(),
      body: SafeArea(
        child: Column(
          children: [
            // Header Scoreboard & Contract Indicator
            _buildScoreboardHeader(),

            // Main Arena: Table + Seats
            Expanded(
              child: Stack(
                children: [
                  // Green Felt Table Surface
                  Center(
                    child: Container(
                      width: 290,
                      height: 290,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const RadialGradient(
                          colors: [
                            Color(0xFF065F46),
                            Color(0xFF064E3B),
                            Color(0xFF022C22),
                          ],
                        ),
                        border: Border.all(color: const Color(0xFFD97706), width: 3),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.5),
                            blurRadius: 20,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: _buildCenterTrickArea(),
                    ),
                  ),

                  // Top Partner Seat
                  Align(
                    alignment: Alignment.topCenter,
                    child: _buildSeatWidget(partnerSeat, 'Partner (Team ${_seatTeam(partnerSeat)})'),
                  ),

                  // Left Opponent Seat
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: _buildSeatWidget(leftSeat, 'Opponent (Team ${_seatTeam(leftSeat)})'),
                    ),
                  ),

                  // Right Opponent Seat
                  Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _buildSeatWidget(rightSeat, 'Opponent (Team ${_seatTeam(rightSeat)})'),
                    ),
                  ),

                  // Active Phase Overlay (e.g. Bidding sheet or Trump Selection sheet)
                  if (_gameState?.phase == TwentyNinePhase.BIDDING)
                    Align(
                      alignment: Alignment.bottomCenter,
                      child: _buildBiddingControls(),
                    )
                  else if (_gameState?.phase == TwentyNinePhase.TRUMP_SELECTION)
                    Align(
                      alignment: Alignment.bottomCenter,
                      child: _buildTrumpSelectionControls(),
                    ),
                ],
              ),
            ),

            // Bottom Area: Player's Own Hand Cards & Actions
            _buildBottomPlayerArea(myCards),
          ],
        ),
      ),
    );
  }

  int _seatTeam(int seatIndex) => (seatIndex % 2 == 0) ? 1 : 2;

  PreferredSizeWidget _buildAppBar() {
    return AppBar(
      backgroundColor: const Color(0xFF1E293B),
      elevation: 0,
      titleSpacing: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back, color: Colors.white),
        onPressed: () => Navigator.of(context).pop(),
      ),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: Colors.indigo.shade900,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: Colors.indigo.shade400),
            ),
            child: const Text(
              '🃏 29 CARDS',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.white),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '#${_room?.roomCode ?? ''}',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white70),
          ),
          if (_room?.isPrivate == true) ...[
            const SizedBox(width: 6),
            const Icon(Icons.lock, size: 12, color: Colors.purpleAccent),
          ],
        ],
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.share, size: 18, color: Colors.white70),
          tooltip: 'Share Table Link',
          onPressed: () { if (_room != null) RoomInvitations.show(context, _room!, widget.user.id, () => _loadRoom(silent: true)); },
        ),
        IconButton(
          icon: const Icon(Icons.copy, size: 18, color: Colors.white70),
          tooltip: 'Copy Room Code',
          onPressed: _copyRoomCode,
        ),
        IconButton(
          icon: const Icon(Icons.refresh, size: 18, color: Colors.white70),
          tooltip: 'Refresh Table',
          onPressed: () {
            _loadRoom();
            widget.onBalanceRefresh();
          },
        ),
      ],
    );
  }

  Widget _buildScoreboardHeader() {
    final t1Pts = _gameState?.team0Points ?? 0;
    final t2Pts = _gameState?.team1Points ?? 0;
    final bid = _gameState?.finalContract ?? _gameState?.highestBid;
    final contractorId = _gameState?.bidWinnerUserId ?? _gameState?.highestBidderUserId;
    final contractorName = contractorId != null
        ? (_room?.players.firstWhere((p) => p.userId == contractorId, orElse: () => RoomPlayerModel(id: '', userId: '', username: '', displayName: 'Bidder')).displayName)
        : null;

    final trumpRevealed = _gameState?.trumpRevealed == true;
    final trumpSuit = _gameState?.trumpSuit;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      color: const Color(0xFF1E293B),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Team 1 Points
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Team 1 (Seats 0 & 2)', style: TextStyle(fontSize: 10, color: Colors.white60)),
              Text(
                '$t1Pts pts',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.cyanAccent),
              ),
            ],
          )),

          // Center Contract & Trump Status
          Expanded(flex: 2, child: Column(
            children: [
              if (bid != null)
                Text(
                  'Goal: $bid pts ${contractorName != null ? 'by $contractorName' : ''}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.amberAccent),
                )
              else
                const Text(
                  'Bidding Phase (Min 16)',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white70),
                ),
              const SizedBox(height: 2),
              Wrap(
                alignment: WrapAlignment.center,
                children: [
                  const Text('Trump: ', style: TextStyle(fontSize: 10, color: Colors.white60)),
                  if (trumpRevealed && trumpSuit != null)
                    Text(
                      '${_suitSymbol(trumpSuit)} ${trumpSuit.name}',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: _isSuitRed(trumpSuit) ? Colors.redAccent : Colors.white,
                      ),
                    )
                  else if (_gameState?.phase.index != null && _gameState!.phase.index >= TwentyNinePhase.DEAL_2.index)
                    const Text(
                      'Secret (Hidden)',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.amber),
                    )
                  else
                    const Text(
                      'Not set yet',
                      style: TextStyle(fontSize: 10, color: Colors.white38),
                    ),
                ],
              ),
            ],
          )),

          // Team 2 Points
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text('Team 2 (Seats 1 & 3)', style: TextStyle(fontSize: 10, color: Colors.white60)),
              Text(
                '$t2Pts pts',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.orangeAccent),
              ),
            ],
          )),
        ],
      ),
    );
  }

  Widget _buildSeatWidget(int seatIndex, String label) {
    final player = _getPlayerAtSeat(seatIndex);
    final roomP = _getRoomPlayerAtSeat(seatIndex);
    final isTurn = _gameState?.currentTurnUserId == player?.userId && player != null;

    final avatarEmoji = kCuratedAvatarIcons[roomP?.avatar ?? 'avatar_1'] ?? '🦁';
    final name = roomP?.displayName ?? 'Open Seat';

    return GestureDetector(
      onTap: () {
        if (player != null) _showPlayerProfile(player.userId);
      },
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: isTurn ? Colors.amber.withOpacity(0.2) : Colors.black.withOpacity(0.4),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isTurn ? Colors.amberAccent : Colors.white24,
            width: isTurn ? 2 : 1,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 12,
                  backgroundColor: Colors.white12,
                  child: Text(avatarEmoji, style: const TextStyle(fontSize: 13)),
                ),
                const SizedBox(width: 5),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 70),
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(fontSize: 9, color: Colors.white54),
            ),
            if (isTurn && _secondsRemaining > 0)
              Text(
                '${_secondsRemaining}s',
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.amberAccent),
              ),
            if (player?.passed == true)
              Container(
                margin: const EdgeInsets.only(top: 2),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(color: Colors.red.shade900, borderRadius: BorderRadius.circular(4)),
                child: const Text('PASS', style: TextStyle(fontSize: 8, color: Colors.white, fontWeight: FontWeight.bold)),
              )
            else if (player?.bid != null)
              Container(
                margin: const EdgeInsets.only(top: 2),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(color: Colors.green.shade900, borderRadius: BorderRadius.circular(4)),
                child: Text('BID ${player!.bid}', style: const TextStyle(fontSize: 8, color: Colors.white, fontWeight: FontWeight.bold)),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCenterTrickArea() {
    final trick = _gameState?.currentTrick;
    final phase = _gameState?.phase ?? TwentyNinePhase.DEAL_1;

    if (phase == TwentyNinePhase.SETTLING) return const Center(child: Text('Deal finished. Confirming payouts…', style: TextStyle(color: Colors.white)));
    if (phase == TwentyNinePhase.COMPLETED) {
      final isWinner = _gameState?.winningUserIds?.contains(widget.user.id) == true;
      final payout = _gameState?.payoutFor(widget.user.id) ?? 0.0;
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            isWinner ? Icons.emoji_events : Icons.military_tech,
            size: 40,
            color: isWinner ? Colors.amber : Colors.white60,
          ),
          const SizedBox(height: 6),
          Text(
            isWinner ? 'Victory! You Won!' : 'Match Finished',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          if (_gameState?.explanation != null) Text(_gameState!.explanation!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontSize: 11)),
          if (isWinner && payout > 0)
            Text(
              '+₹${payout.toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.greenAccent),
            ),
          const SizedBox(height: 8),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald600),
            child: const Text('Back to Lobby', style: TextStyle(color: Colors.white, fontSize: 12)),
          ),
        ],
      );
    }

    if (phase == TwentyNinePhase.DEAL_1 || phase == TwentyNinePhase.DEAL_2) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.style, size: 32, color: Colors.white70),
            const SizedBox(height: 6),
            Text(
              phase == TwentyNinePhase.DEAL_1 ? 'Dealing First 4 Cards...' : 'Dealing Remaining 4 Cards...',
              style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      );
    }

    if (trick == null || trick.cards.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Trick ${trick?.trickNumber ?? 1} of 8',
              style: const TextStyle(color: Colors.white54, fontSize: 12, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              _isMyTurn ? 'Your Turn to Lead!' : 'Waiting for lead card...',
              style: TextStyle(
                color: _isMyTurn ? Colors.amberAccent : Colors.white38,
                fontSize: 11,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      );
    }

    // Display cards played in the current trick
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'Trick ${trick.trickNumber} of 8 · ${trick.points} pts in pool',
            style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: trick.cards.map((c) {
              final playerName = _room?.players.firstWhere(
                    (p) => p.userId == c.userId,
                    orElse: () => RoomPlayerModel(id: '', userId: '', username: '', displayName: 'P'),
                  ).displayName ?? 'P';
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildMiniCard(c.card),
                  const SizedBox(height: 2),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 50),
                    child: Text(
                      playerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 9, color: Colors.white60),
                    ),
                  ),
                ],
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniCard(PlayingCardModel card) {
    return Container(
      width: 36,
      height: 52,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.slate300),
        boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(0, 2))],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            card.rankLabel,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: card.isRed ? Colors.red : Colors.black,
            ),
          ),
          Text(
            card.suitSymbol,
            style: TextStyle(
              fontSize: 14,
              color: card.isRed ? Colors.red : Colors.black,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBiddingControls() {
    if (!_isMyTurn) {
      final currentBidder = _room?.players.firstWhere(
        (p) => p.userId == _gameState?.currentTurnUserId,
        orElse: () => RoomPlayerModel(id: '', userId: '', username: '', displayName: 'Player'),
      ).displayName;
      return Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B).withOpacity(0.95),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white24),
        ),
        child: Text(
          'Waiting for $currentBidder to bid...',
          style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold),
        ),
      );
    }

    final minBid = ((_gameState?.highestBid ?? 0) + 1).clamp(16, 29);

    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.amberAccent, width: 2),
        boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 10)],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'YOUR TURN TO BID',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.amberAccent),
              ),
              if (_secondsRemaining > 0)
                Text(
                  '${_secondsRemaining}s left',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white70),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                onPressed: _selectedBid > minBid
                    ? () => setState(() => _selectedBid--)
                    : null,
                icon: const Icon(Icons.remove_circle_outline, color: Colors.white),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black38,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '$_selectedBid',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.amberAccent),
                ),
              ),
              IconButton(
                onPressed: _selectedBid < 28
                    ? () => setState(() => _selectedBid++)
                    : null,
                icon: const Icon(Icons.add_circle_outline, color: Colors.white),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _isActing ? null : _submitPass,
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.redAccent),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  child: const Text('Pass', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  onPressed: _isActing || _selectedBid < minBid ? null : () => _submitBid(_selectedBid),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.amber.shade700,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  child: Text('Bid $_selectedBid', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTrumpSelectionControls() {
    final isContractor = _gameState?.bidWinnerUserId == widget.user.id;
    if (!isContractor) {
      return Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B).withOpacity(0.95),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white24),
        ),
        child: const Text(
          'Contractor is selecting the secret trump card...',
          style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.amberAccent, width: 2),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'SELECT SECRET TRUMP SUIT',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.amberAccent),
          ),
          const SizedBox(height: 4),
          const Text(
            'This suit will remain hidden until revealed in play.',
            style: TextStyle(fontSize: 10, color: Colors.white60),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: CardSuit.values.map((suit) {
              final isRed = _isSuitRed(suit);
              return InkWell(
                onTap: _isActing ? null : () => _selectTrump(suit),
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  width: 58,
                  height: 60,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _suitSymbol(suit),
                        style: TextStyle(fontSize: 24, color: isRed ? Colors.red : Colors.black),
                      ),
                      Text(
                        suit.name,
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: isRed ? Colors.red : Colors.black),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomPlayerArea(List<PlayingCardModel> hand) {
    final canRevealTrump = _gameState?.phase == TwentyNinePhase.PLAYING &&
        _gameState?.trumpRevealed == false &&
        _isMyTurn &&
        _gameState?.currentTrick?.leadSuit != null &&
        !hand.any((c) => c.suit == _gameState!.currentTrick!.leadSuit);

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        border: Border(top: BorderSide(color: Colors.white12)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Allow instructions to wrap on small phones and large text sizes.
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 16,
            runSpacing: 4,
            children: [
              Text(
                'YOUR HAND (${hand.length} cards)',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white70),
              ),
              if (canRevealTrump)
                ElevatedButton.icon(
                  onPressed: _isActing ? null : _revealTrump,
                  icon: const Icon(Icons.visibility, size: 14, color: Colors.white),
                  label: const Text('Reveal Trump', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.purple.shade700,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  ),
                )
              else if (_isMyTurn && _gameState?.phase == TwentyNinePhase.PLAYING)
                const Text(
                  'Tap a highlighted card to play',
                  style: TextStyle(fontSize: 11, color: Colors.amberAccent, fontWeight: FontWeight.bold),
                ),
            ],
          ),
          const SizedBox(height: 8),

          // Cards Fan / Grid
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: hand.map((card) {
                final isLegal = _isCardLegal(card, hand);
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: InkWell(
                    key: ValueKey('29-card-${card.suit.name}-${card.numericRank}'),
                    onTap: isLegal ? () => _playCard(card) : null,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      width: 54,
                      height: 80,
                      decoration: BoxDecoration(
                        color: isLegal ? Colors.white : Colors.white.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isLegal ? AppColors.emerald600 : Colors.grey.shade400,
                          width: isLegal ? 2.5 : 1,
                        ),
                        boxShadow: [
                          if (isLegal)
                            BoxShadow(
                              color: AppColors.emerald600.withValues(alpha: 0.5),
                              blurRadius: 8,
                              offset: const Offset(0, -2),
                            ),
                        ],
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(left: 4, top: 2),
                            child: Align(
                              alignment: Alignment.topLeft,
                              child: Text(
                                card.rankLabel,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: card.isRed ? Colors.red : Colors.black,
                                ),
                              ),
                            ),
                          ),
                          Text(
                            card.suitSymbol,
                            style: TextStyle(
                              fontSize: 22,
                              color: card.isRed ? Colors.red : Colors.black,
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.only(right: 4, bottom: 2),
                            child: Align(
                              alignment: Alignment.bottomRight,
                              child: Text(
                                card.points > 0 ? '${card.points}p' : '',
                                style: const TextStyle(fontSize: 9, color: Colors.black45, fontWeight: FontWeight.bold),
                              ),
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
        ],
      ),
    );
  }

  String _suitSymbol(CardSuit suit) {
    switch (suit) {
      case CardSuit.SPADES:
        return '♠';
      case CardSuit.HEARTS:
        return '♥';
      case CardSuit.DIAMONDS:
        return '♦';
      case CardSuit.CLUBS:
        return '♣';
    }
  }

  bool _isSuitRed(CardSuit suit) => suit == CardSuit.HEARTS || suit == CardSuit.DIAMONDS;
}
