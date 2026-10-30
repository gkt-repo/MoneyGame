import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/socket_service.dart';

const _gold = Color(0xFFE6C781);
const _mint = Color(0xFF70D9B0);
const _suits = {'SPADES': '♠', 'HEARTS': '♥', 'DIAMONDS': '♦', 'CLUBS': '♣'};
typedef _Data = Map<String, dynamic>;
List<_Data> _list(dynamic value) =>
    (value as List? ?? []).map((e) => _Data.from(e as Map)).toList();
int _number(dynamic value) => (value as num?)?.toInt() ?? 0;

class SeepTableScreen extends StatefulWidget {
  final String roomId;
  final UserProfileModel user;
  final VoidCallback onBalanceRefresh;
  final Future<RoomModel> Function(String)? loadRoom;
  final Future<void> Function(String, String, Map<String, dynamic>)?
  submitAction;
  const SeepTableScreen({
    super.key,
    required this.roomId,
    required this.user,
    required this.onBalanceRefresh,
    this.loadRoom,
    this.submitAction,
  });

  @override
  State<SeepTableScreen> createState() => _SeepTableScreenState();
}

class _SeepTableScreenState extends State<SeepTableScreen> {
  RoomModel? _room;
  _Data? _game;
  String? _selected, _move, _error;
  bool _busy = false, _loading = true, _finished = false, _fetching = false;
  Timer? _poll, _clock;
  final List<MapEntry<String, dynamic Function(dynamic)>> _listeners = [];

  @override
  void initState() {
    super.initState();
    _listen('seep_state', (data) {
      if (data is Map) _accept(_Data.from(data));
    });
    _listen('connect', (_) {
      SocketService.joinRoom(widget.roomId);
      unawaited(_load());
    });
    _listen('room_updated', (data) {
      if (data is Map && data['id'] == widget.roomId) unawaited(_load());
    });
    SocketService.joinRoom(widget.roomId);
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!_finished) unawaited(_load());
    });
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && !_finished) setState(() {});
    });
  }

  void _listen(String event, dynamic Function(dynamic) handler) {
    _listeners.add(MapEntry(event, handler));
    SocketService.on(event, handler);
  }

  void _accept(_Data game) {
    if (!mounted ||
        game['roomId'] != widget.roomId ||
        _number(game['sequence']) < _number(_game?['sequence'])) {
      return;
    }
    setState(() {
      if (_game?['sequence'] != game['sequence']) {
        _selected = null;
        _move = null;
      }
      _game = game;
      _loading = false;
    });
    if (game['phase'] == 'COMPLETED' && !_finished) {
      _finished = true;
      widget.onBalanceRefresh();
    }
  }

  Future<void> _load() async {
    if (_fetching) return;
    _fetching = true;
    try {
      final room = await (widget.loadRoom ?? ApiClient.getRoomDetails)(
        widget.roomId,
      );
      if (!mounted) return;
      setState(() {
        _room = room;
        _loading = false;
      });
      if (room.gameState != null) _accept(room.gameState!);
    } catch (e) {
      if (mounted && _game == null) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    } finally {
      _fetching = false;
    }
  }

  Future<void> _act(String action, _Data payload) async {
    if (_busy || _game == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = {
        ...payload,
        'expectedSequence': _game!['sequence'],
        'actionId':
            '${widget.user.id}-${DateTime.now().microsecondsSinceEpoch}',
      };
      if (widget.submitAction != null) {
        await widget.submitAction!(widget.roomId, action, data);
      } else {
        await ApiClient.sendGameAction(
          roomId: widget.roomId,
          action: action,
          payload: data,
        );
      }
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
      await _load();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _clock?.cancel();
    for (final listener in _listeners) {
      SocketService.off(listener.key, listener.value);
    }
    SocketService.leaveRoom(widget.roomId);
    super.dispose();
  }

  List<_Data> get _players => (_game?['players'] as Map? ?? {}).values
      .map((e) => _Data.from(e as Map))
      .toList();
  _Data? get _me {
    for (final p in _players) {
      if (p['userId'] == widget.user.id) return p;
    }
    return null;
  }

  bool get _myTurn => _game?['currentTurnUserId'] == widget.user.id;
  int get _seconds => math.max(
    0,
    ((_number(_game?['turnExpiresAt']) -
                DateTime.now().millisecondsSinceEpoch) /
            1000)
        .ceil(),
  );

  @override
  Widget build(BuildContext context) {
    final game = _game;
    return Scaffold(
      backgroundColor: const Color(0xFF091916),
      appBar: AppBar(
        backgroundColor: const Color(0xFF10261F),
        foregroundColor: const Color(0xFFF2E8CD),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'SEEP ♠',
              style: TextStyle(
                fontFamily: 'serif',
                fontWeight: FontWeight.w700,
                fontSize: 23,
                letterSpacing: 4,
              ),
            ),
            Text(
              _room?.roomCode ?? 'THE CARD CLUB',
              style: const TextStyle(
                fontSize: 9,
                letterSpacing: 1.5,
                color: _gold,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh table',
            onPressed: _load,
            icon: const Icon(Icons.refresh, size: 21),
          ),
          IconButton(
            tooltip: 'Seep rules',
            onPressed: _rules,
            icon: const Icon(Icons.help_outline, size: 21),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _gold))
          : game == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _error ?? 'Connecting to the table…',
                      style: const TextStyle(color: Colors.white),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(onPressed: _load, child: const Text('Retry')),
                  ],
                ),
              ),
            )
          : SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) => SingleChildScrollView(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 760),
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                            child: _scoreboard(),
                          ),
                          Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Text(
                              _number(game['maxPlayers']) == 4
                                  ? 'PARTNERSHIP · OPPOSITE SEATS'
                                  : 'HEAD TO HEAD',
                              style: const TextStyle(
                                color: _gold,
                                fontSize: 9,
                                letterSpacing: 2,
                              ),
                            ),
                          ),
                          SizedBox(
                            height: constraints.maxWidth < 400 ? 410 : 460,
                            child: _table(),
                          ),
                          _controls(),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _scoreboard() {
    final teams = _list(_game!['teams']);
    final mine = _number(_me?['teamIndex']);
    return Row(
      children: [mine, 1 - mine]
          .map(
            (team) => Expanded(
              child: Container(
                padding: const EdgeInsets.all(13),
                margin: const EdgeInsets.symmetric(horizontal: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF183328),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _gold.withValues(alpha: .12)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: team == mine ? _mint : const Color(0xFFC9A2C2),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _me == null
                                ? 'Team ${team == 0 ? 'A' : 'B'}'
                                : team == mine
                                ? 'Your side'
                                : 'Opponents',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${teams[team]['cardPoints']} + ${teams[team]['sweepPoints']} sweep',
                            style: const TextStyle(
                              color: Color(0xFF9EB6A3),
                              fontSize: 9,
                            ),
                          ),
                        ],
                      ),
                    ),
                    TweenAnimationBuilder<double>(
                      duration: const Duration(milliseconds: 400),
                      tween: Tween(
                        end: _number(teams[team]['points']).toDouble(),
                      ),
                      builder: (_, score, _) => Text(
                        '${score.round()}',
                        style: const TextStyle(
                          color: _gold,
                          fontSize: 28,
                          fontFamily: 'serif',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          )
          .toList(),
    );
  }

  Widget _table() {
    final game = _game!;
    final floor = _list(game['floor']);
    final selectedMove = _list(
      game['legalMoves'],
    ).where((m) => m['id'] == _move).firstOrNull;
    final targets = (selectedMove?['floorIds'] as List? ?? []).toSet();
    final maxPlayers = _number(game['maxPlayers']);
    final mySeat = _number(_me?['seatIndex']);
    final last = game['lastMove'] is Map
        ? _Data.from(game['lastMove'] as Map)
        : null;
    return LayoutBuilder(
      builder: (context, bounds) {
        final narrow = bounds.maxWidth < 400;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              left: 15,
              right: 15,
              top: 65,
              bottom: 60,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(130),
                  gradient: const LinearGradient(
                    colors: [
                      Color(0xFF816443),
                      Color(0xFF382B20),
                      Color(0xFF8B6C46),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: Colors.black54,
                      blurRadius: 24,
                      offset: Offset(0, 12),
                    ),
                  ],
                ),
                padding: const EdgeInsets.all(10),
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(120),
                    border: Border.all(
                      color: const Color(0xFF173B29),
                      width: 3,
                    ),
                    gradient: const RadialGradient(
                      colors: [Color(0xFF28654A), Color(0xFF103928)],
                      radius: .9,
                    ),
                  ),
                  child: Container(
                    margin: const EdgeInsets.all(9),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(110),
                      border: Border.all(color: _gold.withValues(alpha: .18)),
                    ),
                    child: Center(
                      child: Text(
                        'SEEP',
                        style: TextStyle(
                          fontSize: 39,
                          letterSpacing: 8,
                          fontFamily: 'serif',
                          color: _gold.withValues(alpha: .07),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned.fill(
              left: narrow ? 78 : 100,
              right: narrow ? 78 : 100,
              top: 122,
              bottom: 118,
              child: game['phase'] == 'BIDDING'
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Transform.rotate(
                            angle: -.12,
                            child: Container(
                              width: 40,
                              height: 58,
                              decoration: BoxDecoration(
                                color: const Color(0xFF284C3B),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: _gold, width: 2),
                              ),
                              child: const Center(
                                child: Text(
                                  '♠',
                                  style: TextStyle(color: _gold, fontSize: 28),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'The opening bid',
                            style: TextStyle(
                              color: _gold,
                              fontFamily: 'serif',
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _myTurn
                                ? 'Choose 9–13 from your four cards. Then the floor is revealed.'
                                : 'Waiting for the bidder…',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Color(0xFFB5C9B4),
                              fontSize: 10,
                              height: 1.5,
                            ),
                          ),
                        ],
                      ),
                    )
                  : floor.isEmpty
                  ? Center(
                      child: Text(
                        game['phase'] == 'COMPLETED'
                            ? 'All cards counted'
                            : 'A clean table',
                        style: const TextStyle(
                          color: Color(0xFFACC3A4),
                          fontFamily: 'serif',
                          fontSize: 13,
                        ),
                      ),
                    )
                  : Center(
                      child: SingleChildScrollView(
                        child: Wrap(
                          alignment: WrapAlignment.center,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 7,
                          runSpacing: 9,
                          children: floor
                              .map(
                                (item) => AnimatedContainer(
                                  key: ValueKey(item['id']),
                                  duration: const Duration(milliseconds: 220),
                                  padding: const EdgeInsets.all(3),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: targets.contains(item['id'])
                                          ? _gold
                                          : Colors.transparent,
                                      width: 2,
                                    ),
                                    boxShadow: targets.contains(item['id'])
                                        ? [
                                            BoxShadow(
                                              color: _gold.withValues(
                                                alpha: .4,
                                              ),
                                              blurRadius: 12,
                                            ),
                                          ]
                                        : [],
                                  ),
                                  child: item['isHouse'] == true
                                      ? _house(item)
                                      : _SeepCard(
                                          card: _list(item['cards']).first,
                                          small: true,
                                        ),
                                ),
                              )
                              .toList(),
                        ),
                      ),
                    ),
            ),
            ..._players.map((p) {
              final relative =
                  (_number(p['seatIndex']) - mySeat + maxPlayers) % maxPlayers;
              final alignment = maxPlayers == 2
                  ? relative == 0
                        ? Alignment.bottomCenter
                        : Alignment.topCenter
                  : [
                      Alignment.bottomCenter,
                      Alignment.centerRight,
                      Alignment.topCenter,
                      Alignment.centerLeft,
                    ][relative];
              return Align(
                alignment: alignment,
                child: Padding(
                  padding: EdgeInsets.only(
                    bottom: relative == 0 ? 18 : 0,
                    top: alignment == Alignment.topCenter ? 0 : 0,
                  ),
                  child: _seat(p, narrow),
                ),
              );
            }),
            if (last != null)
              Positioned.fill(
                child: IgnorePointer(
                  child: _captureAnimation(last, maxPlayers, mySeat),
                ),
              ),
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Text(
                'DEAL ${game['dealNumber']} / ${maxPlayers == 2 ? 2 : 1}  ·  ${game['stockCount']} IN STOCK${game['bid'] == null ? '' : '  ·  BID ${game['bid']}'}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFF93A88E),
                  fontSize: 8,
                  letterSpacing: 1.5,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _seat(_Data p, bool narrow) {
    final active = p['userId'] == _game!['currentTurnUserId'];
    final self = p['userId'] == widget.user.id;
    final partner = !self && _me != null && p['teamIndex'] == _me!['teamIndex'];
    return SizedBox(
      width: narrow ? 73 : 96,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            width: 41,
            height: 41,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF2A4937),
              border: Border.all(
                color: active ? _gold : const Color(0xFF6C846C),
                width: 2,
              ),
              boxShadow: active
                  ? [
                      BoxShadow(
                        color: _gold.withValues(alpha: .3),
                        blurRadius: 15,
                        spreadRadius: 4,
                      ),
                    ]
                  : [],
            ),
            child: Center(
              child: Text(
                (p['username'] as String? ?? 'P').characters.first
                    .toUpperCase(),
                style: const TextStyle(
                  color: _gold,
                  fontFamily: 'serif',
                  fontSize: 19,
                ),
              ),
            ),
          ),
          const SizedBox(height: 5),
          Text(
            self ? 'You' : p['username'] as String? ?? 'Player',
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${partner ? 'PARTNER · ' : ''}${p['cardCount']} cards',
            style: const TextStyle(color: Color(0xFFA8BCA0), fontSize: 8),
          ),
          if (active)
            Container(
              margin: const EdgeInsets.only(top: 3),
              padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 6),
              decoration: BoxDecoration(
                color: _seconds <= 5 ? const Color(0xFFFFA38A) : _gold,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${_seconds}s',
                style: const TextStyle(
                  fontSize: 9,
                  color: Color(0xFF20392B),
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          if (!self && _number(p['cardCount']) > 0)
            const Text(
              '▧▧▧▧',
              style: TextStyle(color: _gold, fontSize: 12, letterSpacing: -2),
            ),
        ],
      ),
    );
  }

  Widget _house(_Data item) => Semantics(
    label:
        '${item['value']} ${item['cemented'] == true ? 'pukka' : 'open'} house',
    button: true,
    child: InkWell(
      onTap: () => _inspect(item),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 56,
        height: 73,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: item['cemented'] == true
                ? [const Color(0xFF72603D), const Color(0xFF3E3826)]
                : [const Color(0xFF4D6545), const Color(0xFF273E2F)],
          ),
          border: Border.all(color: _gold),
          borderRadius: BorderRadius.circular(8),
          boxShadow: const [
            BoxShadow(color: Color(0xFF102E21), offset: Offset(3, 4)),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              item['cemented'] == true ? '◆ PUKKA' : '⌂ HOUSE',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: _gold,
                fontSize: 7,
                letterSpacing: .8,
              ),
            ),
            Text(
              '${item['value']}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xFFF9E7B9),
                fontSize: 26,
                fontFamily: 'serif',
              ),
            ),
            Text(
              '${(item['cards'] as List).length} cards',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFFD0D8BC), fontSize: 8),
            ),
            const SizedBox(height: 2),
            const Text(
              'Tap to inspect',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Color(0xFFB3C3A4), fontSize: 6),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _captureAnimation(_Data last, int count, int mySeat) {
    if (MediaQuery.disableAnimationsOf(context)) return const SizedBox.shrink();
    final player = _players
        .where((p) => p['userId'] == last['userId'])
        .firstOrNull;
    final relative = (_number(player?['seatIndex']) - mySeat + count) % count;
    final destination = count == 2
        ? relative == 0
              ? const Offset(0, 110)
              : const Offset(0, -110)
        : [
            const Offset(0, 110),
            const Offset(100, 0),
            const Offset(0, -110),
            const Offset(-100, 0),
          ][relative];
    final capture = last['type'] == 'CAPTURE';
    return TweenAnimationBuilder<double>(
      key: ValueKey('capture-${last['sequence']}'),
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 1800),
      builder: (_, t, _) {
        final progress = (t * 2).clamp(0.0, 1.0);
        return Center(
          child: Opacity(
            opacity: (1 - ((t - .7) / .3).clamp(0.0, 1.0)),
            child: Transform.translate(
              offset: capture
                  ? destination * Curves.easeInCubic.transform(progress)
                  : destination * (1 - Curves.easeOutCubic.transform(progress)),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_number(last['sweep']) > 0) ...[
                    const Text(
                      'SEEP!',
                      style: TextStyle(
                        color: _gold,
                        fontFamily: 'serif',
                        fontSize: 35,
                        letterSpacing: 5,
                        shadows: [Shadow(color: Colors.black, blurRadius: 10)],
                      ),
                    ),
                    Text(
                      '+${last['sweep']} sweep points',
                      style: const TextStyle(color: _gold, fontSize: 12),
                    ),
                    const SizedBox(height: 8),
                  ],
                  _SeepCard(card: _Data.from(last['card'] as Map), small: true),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _controls() {
    final game = _game!;
    final completed = game['phase'] == 'COMPLETED';
    final hand = _list(_me?['cards'])
      ..sort(
        (a, b) => (_number(a['rank']) == 14 ? 1 : _number(a['rank'])).compareTo(
          _number(b['rank']) == 14 ? 1 : _number(b['rank']),
        ),
      );
    final moves = _list(
      game['legalMoves'],
    ).where((m) => m['cardId'] == _selected).toList();
    final selectedMove = moves.where((m) => m['id'] == _move).firstOrNull;
    final active = _players
        .where((p) => p['userId'] == game['currentTurnUserId'])
        .firstOrNull;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.fromLTRB(16, 17, 16, 20),
      decoration: const BoxDecoration(
        color: Color(0xFF10251D),
        border: Border(top: BorderSide(color: Color(0xFF284232))),
      ),
      child: Column(
        children: [
          if (completed)
            _result()
          else ...[
            Semantics(
              liveRegion: true,
              child: Text(
                game['phase'] == 'SETTLING'
                    ? 'Confirming the result…'
                    : _myTurn
                    ? game['phase'] == 'BIDDING'
                          ? 'Your bid · choose an opening value'
                          : 'Your turn · choose a card, then a move'
                    : '${active?['username'] ?? 'Player'}’s turn',
                style: const TextStyle(color: _gold, fontSize: 11),
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(3, 19, 3, 8),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: hand
                      .asMap()
                      .entries
                      .map(
                        (entry) => Padding(
                          padding: const EdgeInsets.only(right: 7),
                          child: _SeepCard(
                            key: ValueKey(
                              '${game['dealNumber']}-${entry.value['id']}',
                            ),
                            card: entry.value,
                            selected: _selected == entry.value['id'],
                            dealIndex: entry.key,
                            onTap:
                                _myTurn && !_busy && game['phase'] == 'PLAYING'
                                ? () => setState(() {
                                    _selected = entry.value['id'] as String;
                                    _move = null;
                                  })
                                : null,
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
            ),
            if (game['phase'] == 'BIDDING' && _myTurn)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: (game['bidOptions'] as List? ?? [])
                    .map(
                      (bid) => FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: _gold,
                          foregroundColor: const Color(0xFF18392B),
                        ),
                        onPressed: _busy
                            ? null
                            : () => _act('BID', {'bid': bid}),
                        child: Text('Bid $bid'),
                      ),
                    )
                    .toList(),
              ),
            if (_myTurn && game['phase'] == 'PLAYING') ...[
              if (_selected == null || moves.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: Text(
                    _selected == null
                        ? 'Select a card to see its legal moves'
                        : 'Keep this card for your house. Choose another card.',
                    style: const TextStyle(
                      color: Color(0xFFAFC4A8),
                      fontSize: 11,
                    ),
                  ),
                ),
              if (moves.isNotEmpty) ...[
                SizedBox(
                  height: 62,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: moves.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 7),
                    itemBuilder: (_, i) {
                      final m = moves[i];
                      final chosen = m['id'] == _move;
                      final detail = (m['floorIds'] as List)
                          .map((id) {
                            final item = _list(
                              game['floor'],
                            ).where((i) => i['id'] == id).firstOrNull;
                            if (item == null) return '';
                            final card = _list(item['cards']).first;
                            return item['isHouse'] == true
                                ? 'House ${item['value']}'
                                : '${card['label']}${_suits[card['suit']]}';
                          })
                          .join(' + ');
                      return OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: chosen
                              ? _gold
                              : const Color(0xFFCFDDC7),
                          backgroundColor: chosen
                              ? const Color(0xFF3F3D28)
                              : const Color(0xFF1B3526),
                          side: BorderSide(
                            color: chosen ? _gold : const Color(0xFF536B4D),
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(9),
                          ),
                        ),
                        onPressed: _busy
                            ? null
                            : () => setState(() => _move = m['id'] as String),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              m['label'] as String,
                              style: const TextStyle(fontSize: 11),
                            ),
                            if (detail.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              SizedBox(
                                width: math.min(200.0, detail.length * 5.5),
                                child: Text(
                                  detail,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(fontSize: 8),
                                ),
                              ),
                            ],
                          ],
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: _gold,
                    foregroundColor: const Color(0xFF18392B),
                    disabledBackgroundColor: const Color(0xFF48523A),
                    disabledForegroundColor: const Color(0xFFA1AA8E),
                    minimumSize: const Size(200, 44),
                  ),
                  onPressed: _busy || selectedMove == null
                      ? null
                      : () => _act('PLAY_MOVE', {'moveId': _move}),
                  child: Text(
                    _busy
                        ? 'Playing…'
                        : selectedMove == null
                        ? 'Choose your move'
                        : 'Play · ${selectedMove['label']}',
                  ),
                ),
              ],
            ],
          ],
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(10),
              child: Text(
                _error!,
                style: const TextStyle(color: Color(0xFFFFB5A3), fontSize: 12),
              ),
            ),
          const SizedBox(height: 16),
          const Divider(color: Color(0xFF2A3D2C)),
          const SizedBox(height: 5),
          const Text(
            '♠ Spades score their value · Aces 1 · 10♦ 6',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF9FB397), fontSize: 9),
          ),
          const SizedBox(height: 5),
          Text(
            '₹${_room?.entryFee.toStringAsFixed(0) ?? '—'} entry · ₹${((_room?.entryFee ?? 0) * (_room?.maxPlayers ?? 0)).toStringAsFixed(0)} pool before commission',
            style: const TextStyle(color: Color(0xFF809779), fontSize: 8),
          ),
        ],
      ),
    );
  }

  Widget _result() {
    final game = _game!;
    final win = (game['winningUserIds'] as List? ?? []).contains(
      widget.user.id,
    );
    final payout = _list(
      game['payouts'],
    ).where((p) => p['userId'] == widget.user.id).firstOrNull;
    return Column(
      children: [
        const Icon(Icons.emoji_events_outlined, color: _gold, size: 44),
        const SizedBox(height: 10),
        Text(
          game['winningTeamIndex'] == null
              ? 'Honours even'
              : win
              ? 'Beautifully played. You win!'
              : 'The other side takes it',
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: _gold,
            fontFamily: 'serif',
            fontSize: 24,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          game['explanation'] as String? ?? '',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Color(0xFFC1D0B9), fontSize: 12),
        ),
        if (payout != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              '₹${(payout['amount'] as num).toStringAsFixed(2)} credited to your wallet',
              style: const TextStyle(
                color: _mint,
                fontWeight: FontWeight.bold,
                fontSize: 13,
              ),
            ),
          ),
      ],
    );
  }

  void _inspect(_Data house) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF163023),
        title: Text(
          '${house['value']} ${house['cemented'] == true ? 'pukka' : 'open'} house',
          style: const TextStyle(color: _gold),
        ),
        content: SingleChildScrollView(
          child: Wrap(
            spacing: 8,
            runSpacing: 10,
            children: _list(
              house['cards'],
            ).map((c) => _SeepCard(card: c, small: true)).toList(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close', style: TextStyle(color: _gold)),
          ),
        ],
      ),
    );
  }

  void _rules() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF163023),
        title: const Text('How to play Seep', style: TextStyle(color: _gold)),
        content: const SingleChildScrollView(
          child: Text(
            'Play one card each turn, counterclockwise. Ace = 1, J = 11, Q = 12, K = 13.\n\n'
            'OPENING BID\nChoose 9–13 matching your first four cards. The floor is then revealed. Your first move must build a house at your bid value, or play a card of that value.\n\n'
            'CAPTURE\nMatch loose cards, sums of loose cards, or a house of the same value. Collect every available disjoint matching set. Houses cannot be part of sums.\n\n'
            'BUILD & CEMENT\nBuild a house from 9–13 while keeping a matching card in hand. Raise someone else’s open house with a hand card. Add a matching set to cement it into an unbreakable pukka house. You may add to a partner’s house without keeping your own matching card. House owners must keep a matching card until the house is captured or raised.\n\n'
            'SCORING\nSpades score their value, other aces score 1, and 10♦ scores 6. There are 100 card points. Sweeps score 50, except the first play (25) and the last play (0). Leftovers go to the last capturing side.\n\n'
            'TABLE RULES\nTwo players receive two hands of 12. Four players receive one hand of 12, with partners opposite. Highest score wins this single deal. A draw returns all entries without commission. Winners share the pool after platform commission. After 30 seconds, a legal move is played automatically.',
            style: TextStyle(
              color: Color(0xFFD0DCC6),
              fontSize: 13,
              height: 1.6,
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Got it', style: TextStyle(color: _gold)),
          ),
        ],
      ),
    );
  }
}

class _SeepCard extends StatelessWidget {
  final _Data card;
  final bool small, selected;
  final int dealIndex;
  final VoidCallback? onTap;
  const _SeepCard({
    super.key,
    required this.card,
    this.small = false,
    this.selected = false,
    this.dealIndex = 0,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final symbol = _suits[card['suit']] ?? '♠';
    final red = card['suit'] == 'HEARTS' || card['suit'] == 'DIAMONDS';
    final color = red ? const Color(0xFFAF3F42) : const Color(0xFF203D2D);
    final reduced = MediaQuery.disableAnimationsOf(context);
    final duration = reduced
        ? Duration.zero
        : const Duration(milliseconds: 200);
    return Semantics(
      label: '${card['label']} of ${card['suit']}',
      button: onTap != null,
      selected: selected,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: reduced
            ? Duration.zero
            : Duration(milliseconds: 350 + dealIndex * 35),
        builder: (_, t, child) => Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset((1 - t) * -12, (1 - t) * -28),
            child: child,
          ),
        ),
        child: AnimatedSlide(
          offset: selected ? const Offset(0, -.14) : Offset.zero,
          duration: duration,
          curve: Curves.easeOut,
          child: GestureDetector(
            onTap: onTap,
            child: AnimatedContainer(
              duration: duration,
              width: small ? 39 : 58,
              height: small ? 57 : 83,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFFFFFF7), Color(0xFFECEBDD)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(small ? 5 : 8),
                border: Border.all(
                  color: selected ? _gold : const Color(0xFFDDDCCA),
                  width: selected ? 3 : 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: selected
                        ? _gold.withValues(alpha: .35)
                        : Colors.black38,
                    blurRadius: selected ? 12 : 4,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: Stack(
                children: [
                  Positioned(
                    left: 4,
                    top: 4,
                    child: Column(
                      children: [
                        Text(
                          '${card['label']}',
                          style: TextStyle(
                            fontFamily: 'serif',
                            color: color,
                            fontWeight: FontWeight.bold,
                            fontSize: small ? 11 : 15,
                            height: 1,
                          ),
                        ),
                        Text(
                          symbol,
                          style: TextStyle(
                            color: color,
                            fontSize: small ? 8 : 10,
                            height: 1,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        symbol,
                        style: TextStyle(
                          color: color,
                          fontSize: small ? 22 : 31,
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    right: 4,
                    bottom: 3,
                    child: RotatedBox(
                      quarterTurns: 2,
                      child: Text(
                        '${card['label']} $symbol',
                        style: TextStyle(
                          color: color,
                          fontFamily: 'serif',
                          fontSize: small ? 6 : 8,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
