import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/socket_service.dart';
import '../../../../models/teen_patti_models.dart';
import 'widgets/confetti_particles.dart';
import 'widgets/teen_patti_action_bar.dart';
import 'widgets/teen_patti_card_deal.dart';
import 'widgets/teen_patti_chip_toss.dart';
import 'widgets/teen_patti_felt_table.dart';
import 'widgets/teen_patti_player_seat.dart';
import 'widgets/teen_patti_rules_dialog.dart';
import 'widgets/teen_patti_victory_dialog.dart';
import 'services/teen_patti_audio_service.dart';

class TeenPattiTableScreen extends StatefulWidget {
  final String roomId;
  final UserProfileModel user;
  final VoidCallback onBalanceRefresh;

  const TeenPattiTableScreen({
    super.key,
    required this.roomId,
    required this.user,
    required this.onBalanceRefresh,
  });

  @override
  State<TeenPattiTableScreen> createState() => _TeenPattiTableScreenState();
}

class _TeenPattiTableScreenState extends State<TeenPattiTableScreen>
    with TickerProviderStateMixin {
  RoomModel? _room;
  TeenPattiGameStateModel? _gameState;
  bool _loading = true;
  double _myBalance = 0.0;
  bool _submittingAction = false;
  int _betMultiplier = 1; // 1x or 2x Chaal / Blind raise

  // Turn Timer
  Timer? _timerTicker;
  double _turnProgress = 1.0;
  int? _lastTickSecond;

  // Animations
  late AnimationController _cardFlipController;
  late AnimationController _dealController;
  FlyingChipEvent? _chipTossEvent;
  bool _showConfetti = false;
  GameFinishedModel? _finishData;
  bool _showVictoryModal = false;
  Timer? _fallbackPollTimer;
  bool _soundEnabled = true;
  final TeenPattiAudioService _audioService = TeenPattiAudioService();
  final List<MapEntry<String, dynamic Function(dynamic)>> _socketListeners = [];

  void _listenSocket(String event, dynamic Function(dynamic) handler) {
    _socketListeners.add(MapEntry(event, handler));
    SocketService.on(event, handler);
  }

  @override
  void initState() {
    super.initState();
    _myBalance = widget.user.balance;
    _audioService.init();

    // Force landscape mode and immersive sticky full screen
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

    // Initialize Animation Controllers
    _cardFlipController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );

    _dealController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..addListener(() => setState(() {}));

    _initTable();
  }

  @override
  void dispose() {
    _timerTicker?.cancel();
    _fallbackPollTimer?.cancel();
    _cardFlipController.dispose();
    _dealController.dispose();
    _audioService.dispose();

    // Restore portrait mode and standard UI
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

    SocketService.leaveRoom(widget.roomId);
    for (final entry in _socketListeners) {
      SocketService.off(entry.key, entry.value);
    }
    _socketListeners.clear();
    super.dispose();
  }

  Future<void> _initTable() async {
    await _fetchRoomDetails();
    if (!mounted) return;

    // Connect WebSocket
    SocketService.joinRoom(widget.roomId);

    // Initial Dealing animation if playing
    if (_room?.status == 'PLAYING') {
      _triggerDealAnimation();
    }

    _listenSocket('room_updated', (data) {
      if (mounted && data != null) {
        if (data['id'] != null && data['id'] != widget.roomId) return;
        final oldStatus = _room?.status;
        setState(() {
          _room = RoomModel.fromJson(data);
          if (_room?.gameState != null) {
            _gameState = TeenPattiGameStateModel.fromJson(_room!.gameState!);
          }
        });
        if (oldStatus != 'PLAYING' && _room?.status == 'PLAYING') {
          _triggerDealAnimation();
        }
      }
    });

    _listenSocket('teen_patti_state', (data) {
      if (mounted && data != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        final parsed = TeenPattiGameStateModel.fromJson(Map<String, dynamic>.from(data));
        final roundChanged = _gameState != null && parsed.roundNumber > _gameState!.roundNumber;
        setState(() {
          _gameState = parsed;
        });
        _syncMyCardsFromState(parsed);
        if (roundChanged) {
          _triggerDealAnimation();
        }
      }
    });

    _listenSocket('turn_timer_started', (data) {
      if (mounted && data != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        final currentTurnUserId = data['currentTurnUserId']?.toString();
        final expiresAt = (data['turnExpiresAt'] as num?)?.toInt();
        if (_gameState != null) {
          setState(() {
            _gameState = _gameState!.copyWith(
              currentTurnUserId: currentTurnUserId,
              turnExpiresAt: expiresAt,
            );
          });
        }
        _startTimerTicker();
        if (currentTurnUserId == widget.user.id) {
          HapticFeedback.mediumImpact();
        }
      }
    });

    _listenSocket('player_acted', (data) {
      if (mounted && data != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        final actUserId = data['userId']?.toString() ?? '';
        final pot = (data['pot'] as num?)?.toDouble();
        if (pot != null && _gameState != null) {
          setState(() {
            _gameState = _gameState!.copyWith(pot: pot);
          });
        }
        _triggerChipToss(actUserId);
        _audioService.playChipToss();
        HapticFeedback.lightImpact();
      }
    });

    _listenSocket('cards_revealed', (data) {
      if (mounted && data != null && data['cards'] != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        final rawCards = data['cards'] as List;
        final cards = rawCards.map((c) => PlayingCardModel.fromJson(Map<String, dynamic>.from(c))).toList();

        if (_gameState != null) {
          final myP = _gameState!.players[widget.user.id];
          if (myP != null) {
            final updatedP = myP.copyWith(isSeen: true, cards: cards);
            setState(() {
              _gameState = _gameState!.copyWith(
                players: {
                  ..._gameState!.players,
                  widget.user.id: updatedP,
                },
              );
            });
          }
        }
        _cardFlipController.forward(from: 0.0);
        _audioService.playCardFlip();
        HapticFeedback.mediumImpact();
      }
    });

    _listenSocket('player_packed', (data) {
      if (mounted && data != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        final packedUserId = data['userId']?.toString();
        if (_gameState != null && packedUserId != null) {
          final p = _gameState!.players[packedUserId];
          if (p != null) {
            setState(() {
              _gameState = _gameState!.copyWith(
                players: {
                  ..._gameState!.players,
                  packedUserId: p.copyWith(isPacked: true),
                },
              );
            });
            _audioService.playFold();
          }
        }
      }
    });

    _listenSocket('side_show_result', (data) {
      if (mounted && data != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        final msg = data['message']?.toString() ?? 'Side Show completed';
        final winnerId = data['winnerId']?.toString();
        final loserId = data['loserId']?.toString();

        _audioService.playChipToss();

        if (loserId == widget.user.id) {
          HapticFeedback.heavyImpact();
        } else if (winnerId == widget.user.id) {
          HapticFeedback.mediumImpact();
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.compare_arrows, color: Color(0xFFFFD54F), size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    msg,
                    style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
                  ),
                ),
              ],
            ),
            backgroundColor: const Color(0xFF1E293B),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: const BorderSide(color: Color(0xFFFFD54F), width: 1),
            ),
            duration: const Duration(seconds: 3),
          ),
        );
      }
    });

    _listenSocket('game_finished', (data) {
      if (mounted && data != null) {
        if (data['roomId'] != null && data['roomId'] != widget.roomId) return;
        final finish = GameFinishedModel.fromJson(Map<String, dynamic>.from(data));
        setState(() {
          _finishData = finish;
          _showVictoryModal = false;
          _showConfetti = finish.winnerId == widget.user.id;
        });

        // Trigger chip flight from pot to winner
        _triggerPotToWinnerFlight(finish.winnerId);
        _audioService.playWin();

        if (finish.winnerId == widget.user.id) {
          HapticFeedback.heavyImpact();
        }

        // Reveal the victory dialog after chip collection finishes
        Future.delayed(const Duration(milliseconds: 1500), () {
          if (mounted && _finishData != null) {
            setState(() {
              _showVictoryModal = true;
            });
          }
        });

        widget.onBalanceRefresh();
      }
    });

    _listenSocket('balance_updated', (data) {
      if (mounted && data != null && data['balance'] != null) {
        setState(() {
          _myBalance = (data['balance'] as num).toDouble();
        });
      }
    });

    _listenSocket('wallet_updated', (data) {
      if (mounted && data != null && data['balance'] != null) {
        setState(() {
          _myBalance = (data['balance'] as num).toDouble();
        });
      }
    });

    _startTimerTicker();

    // Fallback polling for network reliability
    _fallbackPollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!['COMPLETED', 'CANCELLED'].contains(_room?.status)) {
        _fetchRoomDetails(silent: true);
      }
    });
  }

  void _syncMyCardsFromState(TeenPattiGameStateModel state) {
    final myP = state.players[widget.user.id];
    if (myP != null && myP.isSeen && myP.cards != null && myP.cards!.isNotEmpty) {
      if (_cardFlipController.value < 1.0 && !_cardFlipController.isAnimating) {
        _cardFlipController.value = 1.0;
      }
    }
  }

  void _triggerDealAnimation() {
    _triggerBootChipToss();
    _dealController.forward(from: 0.0);
    _audioService.playCardDeal();
  }

  void _startTimerTicker() {
    _timerTicker?.cancel();
    _lastTickSecond = null;
    _timerTicker = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) return;
      final expiresAt = _gameState?.turnExpiresAt;
      if (expiresAt == null) return;

      final diff = expiresAt - DateTime.now().millisecondsSinceEpoch;
      if (diff <= 0) {
        setState(() {
          _turnProgress = 0.0;
        });
      } else {
        final secRemaining = (diff / 1000).ceil();
        if (secRemaining <= 5 && secRemaining > 0 && secRemaining != _lastTickSecond) {
          _lastTickSecond = secRemaining;
          final isMyTurn = _gameState?.currentTurnUserId == widget.user.id;
          if (isMyTurn) {
            _audioService.playTimerTick();
            HapticFeedback.selectionClick();
          }
        }

        setState(() {
          _turnProgress = (diff / 25000.0).clamp(0.0, 1.0);
        });
      }
    });
  }

  Future<void> _fetchRoomDetails({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final room = await ApiClient.getRoomDetails(widget.roomId);
      if (mounted) {
        setState(() {
          _room = room;
          if (room.gameState != null) {
            _gameState = TeenPattiGameStateModel.fromJson(room.gameState!);
          }
        });
        if (_gameState != null) {
          _syncMyCardsFromState(_gameState!);
        }
      }
    } catch (_) {
      // Ignored for silent polling
    } finally {
      if (mounted && !silent) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _handleAction(String action, [Map<String, dynamic>? payload]) async {
    if (_submittingAction) return;
    setState(() => _submittingAction = true);

    try {
      final res = await ApiClient.sendGameAction(
        roomId: widget.roomId,
        action: action,
        payload: payload,
      );

      if (res['wallet'] != null && res['wallet']['balance'] != null) {
        setState(() {
          _myBalance = (res['wallet']['balance'] as num).toDouble();
        });
      }
      if (res['gameState'] != null) {
        setState(() {
          _gameState = TeenPattiGameStateModel.fromJson(Map<String, dynamic>.from(res['gameState']));
        });
      }

      // If action is SEE_CARDS, immediately reveal cards and trigger flip
      if (action == 'SEE_CARDS') {
        List<PlayingCardModel>? revealedCards;
        if (res['cards'] != null && res['cards'] is List) {
          final rawCards = res['cards'] as List;
          revealedCards = rawCards
              .map((c) => PlayingCardModel.fromJson(Map<String, dynamic>.from(c)))
              .toList();
        }
        if (_gameState != null) {
          final myP = _gameState!.players[widget.user.id];
          if (myP != null) {
            final updatedP = myP.copyWith(
              isSeen: true,
              cards: revealedCards ?? myP.cards,
            );
            setState(() {
              _gameState = _gameState!.copyWith(
                players: {
                  ..._gameState!.players,
                  widget.user.id: updatedP,
                },
              );
            });
          }
        }
        _cardFlipController.forward(from: 0.0);
        HapticFeedback.mediumImpact();
      }

      widget.onBalanceRefresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: const Color(0xFFE53935),
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _submittingAction = false;
          _betMultiplier = 1;
        });
      }
    }
  }

  bool _computeCanSideShow() {
    if (_gameState == null || _room?.status != 'PLAYING') return false;
    final myPlayer = _gameState!.players[widget.user.id];
    if (myPlayer == null || myPlayer.isPacked || !myPlayer.isSeen) return false;
    if (_gameState!.currentTurnUserId != widget.user.id) return false;

    final activePlayers = _gameState!.players.values.where((p) => !p.isPacked).toList();
    if (activePlayers.length < 3) return false;

    // Active players in turn order (sorted by seatIndex)
    final sortedActive = List<TeenPattiPlayerModel>.from(activePlayers)
      ..sort((a, b) => a.seatIndex.compareTo(b.seatIndex));

    final myIdx = sortedActive.indexWhere((p) => p.userId == widget.user.id);
    if (myIdx == -1) return false;

    final prevIdx = (myIdx - 1 + sortedActive.length) % sortedActive.length;
    final prevPlayer = sortedActive[prevIdx];

    final currentChaalAmount = _gameState!.currentChaalAmount;
    final sideShowCost = currentChaalAmount * 2;
    return prevPlayer.isSeen && _myBalance >= sideShowCost;
  }

  void _triggerChipToss(String fromUserId) {
    final screenSize = MediaQuery.of(context).size;
    final w = screenSize.width;
    final h = screenSize.height;

    final startPos = _getPlayerSeatPosition(fromUserId, w, h);
    final centerPot = Offset(w * 0.5, h * 0.40);

    setState(() {
      _chipTossEvent = FlyingChipEvent(
        start: startPos,
        end: centerPot,
        count: 4,
      );
    });
  }

  void _triggerPotToWinnerFlight(String winnerUserId) {
    final screenSize = MediaQuery.of(context).size;
    final w = screenSize.width;
    final h = screenSize.height;

    final centerPot = Offset(w * 0.5, h * 0.40);
    final winnerPos = _getPlayerSeatPosition(winnerUserId, w, h);

    setState(() {
      _chipTossEvent = FlyingChipEvent(
        start: centerPot,
        end: winnerPos,
        count: 8,
      );
    });
  }

  void _triggerBootChipToss() {
    final screenSize = MediaQuery.of(context).size;
    final w = screenSize.width;
    final h = screenSize.height;

    final starts = <Offset>[
      _getPlayerSeatPosition(widget.user.id, w, h),
    ];
    for (final opp in _getOpponentPlayers()) {
      starts.add(_getPlayerSeatPosition(opp.userId, w, h));
    }

    final centerPot = Offset(w * 0.5, h * 0.40);

    setState(() {
      _chipTossEvent = FlyingChipEvent(
        starts: starts,
        end: centerPot,
        count: 2,
      );
    });
    _audioService.playChipToss();
  }

  List<PlayingCardModel>? _getShowdownCardsForUser(String userId) {
    if (_finishData == null) return null;
    final matches = _finishData!.showdown.where((s) => s.userId == userId);
    if (matches.isNotEmpty) {
      return matches.first.cards;
    }
    return null;
  }

  Offset _getPlayerSeatPosition(String userId, double w, double h) {
    if (userId == widget.user.id) {
      return Offset(w * 0.5, h * 0.80);
    }

    final opponents = _getOpponentPlayers();
    final idx = opponents.indexWhere((p) => p.userId == userId);

    switch (idx) {
      case 0:
        return Offset(w * 0.18, h * 0.58); // Bottom Left
      case 1:
        return Offset(w * 0.20, h * 0.18); // Top Left
      case 2:
        return Offset(w * 0.80, h * 0.18); // Top Right
      case 3:
        return Offset(w * 0.82, h * 0.58); // Bottom Right
      default:
        return Offset(w * 0.5, h * 0.3);
    }
  }

  List<TeenPattiPlayerModel> _getOpponentPlayers() {
    if (_gameState == null) return [];
    return _gameState!.players.values.where((p) => p.userId != widget.user.id).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF190623), // Luxury Damask Royal Purple
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(
                color: Color(0xFFFFD54F),
                strokeWidth: 2.5,
              ),
            )
          : Stack(
              children: [
                // 1. DAMASK WALLPAPER BACKGROUND
                Positioned.fill(
                  child: Image.asset(
                    'assets/game/teen_patti/table_bg.png',
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => Container(
                      decoration: const BoxDecoration(
                        gradient: RadialGradient(
                          center: Alignment.center,
                          radius: 1.0,
                          colors: [Color(0xFF2E083C), Color(0xFF13021B)],
                        ),
                      ),
                    ),
                  ),
                ),

                // 2. FELT CASINO TABLE WITH DEALER
                Positioned.fill(
                  child: TeenPattiFeltTable(
                    bootAmount: _gameState?.bootAmount ?? _room?.entryFee ?? 10.0,
                    currentChaalAmount: _gameState?.currentChaalAmount ?? _room?.entryFee ?? 10.0,
                    pot: _gameState?.pot ?? (_room != null ? _room!.entryFee * _room!.players.length : 0.0),
                  ),
                ),

                // 3. TABLE SEATS (HERO + OPPONENTS IN OVAL FORMATION)
                _buildPlayerSeatsLayer(),

                // 4. CARD DISTRIBUTION DEAL OVERLAY (Dealer deals to all active seats)
                Positioned.fill(
                  child: TeenPattiCardDealOverlay(
                    controller: _dealController,
                    activeSeatsCount: 1 + _getOpponentPlayers().length,
                  ),
                ),

                // 5. FLYING CHIPS OVERLAY
                Positioned.fill(
                  child: FlyingChipsOverlay(event: _chipTossEvent),
                ),

                // 5. TOP BAR (BACK, RULES, SOUND)
                _buildTopBar(),

                // 6. BOTTOM CONTROL DECK
                _buildBottomControlDeck(),

                // 7. CONFETTI CELEBRATION OVERLAY
                if (_showConfetti)
                  Positioned.fill(
                    child: ConfettiCelebrationOverlay(
                      onFinished: () => setState(() => _showConfetti = false),
                    ),
                  ),

                // 8. VICTORY CELEBRATION MODAL
                if (_finishData != null && _showVictoryModal)
                  Positioned.fill(
                    child: Container(
                      color: Colors.black.withValues(alpha: 0.65),
                      child: TeenPattiVictoryDialog(
                        finishData: _finishData!,
                        heroUserId: widget.user.id,
                        onBackToLobby: () => Navigator.of(context).pop(),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _buildTopBar() {
    return Positioned(
      top: 10,
      left: 12,
      right: 12,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Left buttons: Back, Rules, and Replay Deal
          Row(
            children: [
              _buildCircularTopButton(
                icon: Icons.arrow_back_ios_new,
                size: 16,
                onTap: () => Navigator.of(context).pop(),
              ),
              const SizedBox(width: 8),
              _buildCircularTopButton(
                icon: Icons.style,
                size: 18,
                onTap: () {
                  showDialog(
                    context: context,
                    builder: (_) => const TeenPattiRulesDialog(),
                  );
                },
              ),
              const SizedBox(width: 8),
              _buildCircularTopButton(
                icon: Icons.refresh,
                size: 18,
                onTap: _triggerDealAnimation,
              ),
            ],
          ),

          // Right button: Sound toggle
          _buildCircularTopButton(
            icon: _soundEnabled ? Icons.volume_up : Icons.volume_off,
            size: 18,
            onTap: () {
              _audioService.toggleSound();
              setState(() => _soundEnabled = _audioService.enabled);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildCircularTopButton({
    required IconData icon,
    required double size,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const LinearGradient(
            colors: [Color(0xFF5B21B6), Color(0xFF3B0764)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          border: Border.all(color: const Color(0xFFA78BFA).withValues(alpha: 0.6), width: 1.5),
          boxShadow: const [
            BoxShadow(color: Colors.black45, blurRadius: 6, offset: Offset(0, 2)),
          ],
        ),
        child: Icon(icon, color: Colors.white, size: size),
      ),
    );
  }

  Widget _buildPlayerSeatsLayer() {
    final screenSize = MediaQuery.of(context).size;
    final w = screenSize.width;
    final h = screenSize.height;

    final myPlayer = _gameState?.players[widget.user.id];
    final isMyTurn = _gameState?.currentTurnUserId == widget.user.id &&
        _room?.status == 'PLAYING' &&
        myPlayer?.isPacked != true;

    final opponents = _getOpponentPlayers();

    // 5-Seat Specific Coordinates
    final opponentPositions = [
      Offset(w * 0.16, h * 0.58), // Seat 1: Bottom Left
      Offset(w * 0.18, h * 0.18), // Seat 2: Top Left
      Offset(w * 0.82, h * 0.18), // Seat 3: Top Right
      Offset(w * 0.84, h * 0.58), // Seat 4: Bottom Right
    ];

    return Stack(
      children: [
        // 1. HERO SEAT (BOTTOM CENTER)
        Positioned(
          left: w * 0.5 - 75,
          bottom: 54,
          child: TeenPattiPlayerSeat(
            player: myPlayer ??
                TeenPattiPlayerModel(
                  userId: widget.user.id,
                  username: widget.user.username,
                  seatIndex: 0,
                ),
            isHero: true,
            isDealing: _dealController.isAnimating,
            isWinner: _finishData?.winnerId == widget.user.id,
            showdownCards: _getShowdownCardsForUser(widget.user.id),
            isCurrentTurn: isMyTurn,
            turnProgress: isMyTurn ? _turnProgress : 1.0,
            isDealer: true,
            heroFlipAnimation: _cardFlipController,
            heroCards: myPlayer?.cards,
            userBalance: _myBalance,
            currentBet: myPlayer?.totalBet ?? 0.0,
            onSeeCards: () => _handleAction('SEE_CARDS'),
          ),
        ),

        // 2. OPPONENTS SEATS (AROUND RIM)
        for (int i = 0; i < opponentPositions.length; i++)
          Positioned(
            left: opponentPositions[i].dx - 40,
            top: opponentPositions[i].dy - 35,
            child: TeenPattiPlayerSeat(
              player: opponents.length > i ? opponents[i] : null,
              isDealing: _dealController.isAnimating,
              isWinner: opponents.length > i && _finishData?.winnerId == opponents[i].userId,
              showdownCards: opponents.length > i ? _getShowdownCardsForUser(opponents[i].userId) : null,
              isCurrentTurn: opponents.length > i &&
                  _gameState?.currentTurnUserId == opponents[i].userId,
              turnProgress: (opponents.length > i &&
                      _gameState?.currentTurnUserId == opponents[i].userId)
                  ? _turnProgress
                  : 1.0,
              currentBet: opponents.length > i ? opponents[i].totalBet : 0.0,
              cardsOnRight: i < 2, // Left opponents fan cards to the right, right opponents to the left
            ),
          ),
      ],
    );
  }

  Widget _buildBottomControlDeck() {
    final myPlayer = _gameState?.players[widget.user.id];
    final isPlaying = _room?.status == 'PLAYING' && _finishData == null;
    final isMyTurn = _gameState?.currentTurnUserId == widget.user.id &&
        isPlaying &&
        myPlayer?.isPacked != true;

    // Reset multiplier if turn changed
    if (!isMyTurn && _betMultiplier != 1) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _betMultiplier != 1) setState(() => _betMultiplier = 1);
      });
    }

    final activePlayers = _gameState?.players.values.where((p) => !p.isPacked).toList() ?? [];
    final canShow = activePlayers.length == 2 && isMyTurn;
    final canSideShow = _computeCanSideShow();

    final currentChaalAmount = _gameState?.currentChaalAmount ?? _room?.entryFee ?? 10.0;
    final isSeen = myPlayer?.isSeen == true;

    final baseBlindCost = currentChaalAmount;
    final baseChaalCost = currentChaalAmount * 2;
    final activeBlindCost = baseBlindCost * _betMultiplier;
    final activeChaalCost = baseChaalCost * _betMultiplier;

    final nextMultiplierCost = isSeen ? baseChaalCost * 2 : baseBlindCost * 2;
    final canIncrease = isMyTurn &&
        _betMultiplier == 1 &&
        !_submittingAction &&
        _myBalance >= nextMultiplierCost;
    final canDecrease = isMyTurn && _betMultiplier > 1 && !_submittingAction;

    return Positioned(
      bottom: 6,
      left: 0,
      right: 0,
      child: TeenPattiActionBar(
        isMyTurn: isMyTurn,
        isSeen: isSeen,
        canShow: canShow,
        canSideShow: canSideShow,
        currentChaalCost: activeChaalCost,
        blindCost: activeBlindCost,
        userBalance: _myBalance,
        isSubmitting: _submittingAction,
        onPack: () => _handleAction('PACK'),
        onBlind: () => _handleAction('BLIND', {'multiplier': _betMultiplier}),
        onChaal: () => _handleAction('CHAAL', {'multiplier': _betMultiplier}),
        onShow: () => _handleAction('SHOW'),
        onSideShow: canSideShow ? () => _handleAction('SIDE_SHOW') : null,
        onIncreaseBet: canIncrease ? () => setState(() => _betMultiplier = 2) : null,
        onDecreaseBet: canDecrease ? () => setState(() => _betMultiplier = 1) : null,
      ),
    );
  }
}
