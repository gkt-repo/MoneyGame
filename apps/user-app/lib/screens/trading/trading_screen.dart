import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import '../../core/models/trading_models.dart';
import '../../core/network/api_client.dart';
import '../../core/network/socket_service.dart';
import 'trading_chart.dart';

const _green = Color(0xff42dfb6),
    _muted = Color(0xffa4b5cb),
    _panel = Color(0xff101c2b);
String _credits(num n) => NumberFormat('#,##0.#').format(n / 10);
String _rupees(num n) => '₹${NumberFormat('#,##0.00').format(n / 100)}';
String _id() =>
    '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}';
String _time(String? value) => value == null
    ? '—'
    : DateFormat.Hms().format(DateTime.parse(value).toLocal());

class TradingScreen extends StatefulWidget {
  final String userId;
  final Future<dynamic> Function(String, {Map<String, dynamic>? body}) request;
  const TradingScreen({
    super.key,
    required this.userId,
    this.request = ApiClient.trading,
  });
  @override
  State<TradingScreen> createState() => _TradingScreenState();
}

class _TradingScreenState extends State<TradingScreen> {
  List<TradingMarket> _markets = [];
  List<TradingCandle> _candles = [];
  TradingSnapshot? _snapshot;
  String? _marketId;
  String _interval = '1m', _tab = 'Positions', _error = '', _notice = '';
  int _outcome = 0, _epoch = 0;
  bool _line = false, _loading = true, _fetching = false, _busy = false;
  Timer? _timer, _marketTimer;
  Map<String, dynamic>? _pending;
  final _storage = const FlutterSecureStorage();
  late final dynamic Function(dynamic) _socketHandler;
  String get _pendingKey => 'crictrade_pending_${widget.userId}';

  @override
  void initState() {
    super.initState();
    _loadMarkets();
    _restore();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _load());
    _marketTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _loadMarkets(),
    );
    _socketHandler = (event) {
      if (event is Map && event['marketId'] == _marketId) _load();
    };
    SocketService.on('trading_market_updated', _socketHandler);
    SocketService.on('trading_account_updated', _socketHandler);
  }

  Future<void> _restore() async {
    final value = await _storage.read(key: _pendingKey);
    if (value != null && mounted) {
      try {
        setState(
          () => _pending = Map<String, dynamic>.from(jsonDecode(value) as Map),
        );
      } catch (_) {
        await _storage.delete(key: _pendingKey);
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _marketTimer?.cancel();
    SocketService.off('trading_market_updated', _socketHandler);
    SocketService.off('trading_account_updated', _socketHandler);
    super.dispose();
  }

  String _message(Object e) => e is DioException && e.response?.data is Map
      ? '${e.response!.data['error']}'
      : 'Unable to reach CricTrade. Please retry.';
  Future<void> _loadMarkets() async {
    try {
      final list = (await widget.request('/markets') as List)
          .map(
            (m) => TradingMarket.fromJson(Map<String, dynamic>.from(m as Map)),
          )
          .toList();
      if (!mounted) return;
      setState(() {
        _markets = list;
        if (!list.any((m) => m.id == _marketId)) {
          _marketId =
              list.where((m) => m.status == 'OPEN').firstOrNull?.id ??
              list.firstOrNull?.id;
          _snapshot = null;
          _epoch++;
        }
        _loading = false;
      });
      if (_snapshot == null) _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = _message(e);
          _loading = false;
        });
      }
    }
  }

  Future<void> _load() async {
    if (_marketId == null || _fetching) return;
    _fetching = true;
    final epoch = _epoch, id = _marketId;
    try {
      final results = await Future.wait([
        widget.request('/markets/$id'),
        widget.request(
          '/markets/$id/candles?outcome=$_outcome&interval=$_interval',
        ),
      ]);
      if (!mounted || epoch != _epoch) return;
      setState(() {
        _snapshot = TradingSnapshot.fromJson(
          Map<String, dynamic>.from(results[0] as Map),
        );
        _candles = (results[1] as List)
            .map(
              (c) =>
                  TradingCandle.fromJson(Map<String, dynamic>.from(c as Map)),
            )
            .toList();
      });
    } catch (e) {
      if (mounted && epoch == _epoch) setState(() => _error = _message(e));
    } finally {
      _fetching = false;
    }
  }

  void _select(String id) {
    setState(() {
      _marketId = id;
      _snapshot = null;
      _candles = [];
      _outcome = 0;
      _epoch++;
      _error = '';
      _notice = '';
    });
    _load();
  }

  void _chartChange({int? outcome, String? interval}) {
    setState(() {
      _outcome = outcome ?? _outcome;
      _interval = interval ?? _interval;
      _candles = [];
      _epoch++;
    });
    _load();
  }

  Future<void> _execute(Map<String, dynamic> pending) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _pending = pending;
      _error = '';
    });
    try {
      await _storage.write(key: _pendingKey, value: jsonEncode(pending));
      await widget.request(
        pending['path'] as String,
        body: Map<String, dynamic>.from(pending['body'] as Map),
      );
      await _storage.delete(key: _pendingKey);
      if (mounted) {
        setState(() {
          _pending = null;
          _notice = '${pending['label']} completed.';
        });
      }
    } catch (e) {
      if (e is DioException &&
          e.response != null &&
          e.response!.statusCode! < 500) {
        await _storage.delete(key: _pendingKey);
        if (mounted) setState(() => _pending = null);
      }
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        await _load();
      }
    }
  }

  Future<void> _ticket(String side) async {
    final s = _snapshot;
    if (s == null || !s.market.open || _pending != null) return;
    final m = s.market,
        outcome = _outcome,
        p = s.positions.where((p) => p.outcome == outcome).firstOrNull;
    final price = m.price(outcome),
        maximum = side == 'BUY' ? s.balance ~/ max(1, price) : p?.quantity ?? 0;
    final controller = TextEditingController(text: min(10, maximum).toString());
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _panel,
      builder: (sheetContext) => StatefulBuilder(
        builder: (ctx, update) {
          final quantity = int.tryParse(controller.text) ?? 0,
              valid = quantity > 0 && quantity <= maximum;
          return SingleChildScrollView(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                24,
                20,
                MediaQuery.viewInsetsOf(ctx).bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '$side ${m.team(outcome)}',
                    style: const TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  Text(
                    '${_credits(price)} credits per share · maximum $maximum shares',
                    style: const TextStyle(color: _muted),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: controller,
                    style: const TextStyle(color: Colors.white),
                    keyboardType: TextInputType.number,
                    onChanged: (_) => update(() {}),
                    decoration: const InputDecoration(
                      labelText: 'Share quantity',
                      labelStyle: TextStyle(color: _muted),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  Wrap(
                    spacing: 8,
                    children: [.25, .5, .75, 1.0]
                        .map(
                          (v) => TextButton(
                            onPressed: () => update(
                              () => controller.text = (maximum * v)
                                  .floor()
                                  .toString(),
                            ),
                            child: Text(
                              v == 1 ? 'Max' : '${(v * 100).round()}%',
                            ),
                          ),
                        )
                        .toList(),
                  ),
                  Text(
                    '${side == 'BUY' ? 'Cost' : 'Proceeds'}: ${_credits(quantity * price)} credits',
                    style: const TextStyle(fontSize: 18, color: Colors.white),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Test credits only. Selling closes your credit result; the final loss pool determines the reward. A changed or expired quote will be rejected.',
                    style: TextStyle(color: _muted, fontSize: 12),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: valid
                        ? () {
                            Navigator.pop(sheetContext);
                            _execute({
                              'path': '/markets/${m.id}/orders',
                              'body': {
                                'requestId': _id(),
                                'quoteId': m.quote!['id'],
                                'side': side,
                                'outcome': outcome,
                                'quantity': quantity,
                              },
                              'label': '$side $quantity shares',
                            });
                          }
                        : null,
                    child: Text('Confirm ${side.toLowerCase()}'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    controller.dispose();
  }

  Future<void> _fund() async {
    final m = _snapshot?.market;
    if (m == null || !m.open) return;
    final controller = TextEditingController(text: '1000');
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, update) {
          final amount = double.tryParse(controller.text),
              valid =
                  amount != null &&
                  amount.isFinite &&
                  amount >= 1 &&
                  amount <= 100000;
          return AlertDialog(
            title: const Text('Add test match credits'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: controller,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  onChanged: (_) => update(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Nominal rupee amount',
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  valid
                      ? '${_credits((amount * 100).round())} test credits. Your cash wallet is unchanged.'
                      : 'Enter an amount from 1 to 100,000.',
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: valid
                    ? () {
                        Navigator.pop(ctx);
                        _execute({
                          'path': '/markets/${m.id}/fund',
                          'body': {
                            'requestId': _id(),
                            'amount': (amount * 100).round(),
                          },
                          'label': 'Test funding',
                        });
                      }
                    : null,
                child: const Text('Add credits'),
              ),
            ],
          );
        },
      ),
    );
    controller.dispose();
  }

  Widget _card(Widget child) => Container(
    margin: const EdgeInsets.only(bottom: 14),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: _panel,
      border: Border.all(color: const Color(0xff27384d)),
      borderRadius: BorderRadius.circular(14),
    ),
    child: child,
  );
  Widget _row(String title, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      children: [
        Expanded(
          child: Text(title, style: const TextStyle(color: _muted)),
        ),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final s = _snapshot, m = s?.market;
    final position = s?.positions
        .where((p) => p.outcome == _outcome)
        .firstOrNull;
    return Theme(
      data: ThemeData.dark(useMaterial3: true).copyWith(
        colorScheme: ColorScheme.fromSeed(
          seedColor: _green,
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xff0b1420),
      ),
      child: Scaffold(
        body: RefreshIndicator(
          onRefresh: () async {
            await _loadMarkets();
            await _load();
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'MONEYGAME / CRICKET MARKETS',
                style: TextStyle(
                  fontSize: 10,
                  letterSpacing: 1.6,
                  color: _muted,
                ),
              ),
              const Text(
                'CricTrade',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
              const Text(
                'Read the match. Trade the probability.',
                style: TextStyle(color: _muted),
              ),
              const SizedBox(height: 16),
              _card(
                const Text(
                  'TEST CREDITS · No cash wallet deductions. Live snapshots and simulations use an experimental probability model.',
                  style: TextStyle(color: Color(0xfff3d080), fontSize: 12),
                ),
              ),
              if (_error.isNotEmpty)
                _card(
                  Text(
                    _error,
                    style: const TextStyle(color: Color(0xfffb8293)),
                  ),
                ),
              if (_notice.isNotEmpty)
                Text(_notice, style: const TextStyle(color: _green)),
              if (_pending != null)
                _card(
                  Column(
                    children: [
                      const Text(
                        'Request result unknown. Retry the same request to avoid duplicates.',
                      ),
                      TextButton(
                        onPressed: _busy ? null : () => _execute(_pending!),
                        child: const Text('Retry pending request'),
                      ),
                    ],
                  ),
                ),
              if (_loading) const Center(child: CircularProgressIndicator()),
              if (!_loading && _markets.isEmpty)
                _card(
                  const Text(
                    'No supported matches yet. Pull to refresh. A simulation is created when the server starts.',
                  ),
                ),
              if (_markets.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: DropdownButtonFormField<String>(
                    initialValue: _marketId,
                    key: ValueKey(_marketId),
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Match',
                      border: OutlineInputBorder(),
                    ),
                    items: _markets
                        .map(
                          (m) => DropdownMenuItem(
                            value: m.id,
                            child: Text(
                              '${m.title} · ${m.status}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (id) {
                      if (id != null) _select(id);
                    },
                  ),
                ),
              if (s != null && m != null) ...[
                Text(
                  m.title,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  '${m.open
                      ? '● OPEN'
                      : m.status == 'OPEN'
                      ? 'QUOTE EXPIRED'
                      : m.status} · ${m.reason}',
                  style: TextStyle(
                    color: m.open ? _green : _muted,
                    fontSize: 11,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Text(
                    '${m.state['description'] ?? ''}',
                    style: const TextStyle(color: _muted),
                  ),
                ),
                _card(
                  Column(
                    children: [
                      Row(
                        children: [0, 1]
                            .map(
                              (o) => Expanded(
                                child: Padding(
                                  padding: EdgeInsets.only(
                                    right: o == 0 ? 8 : 0,
                                  ),
                                  child: OutlinedButton(
                                    style: OutlinedButton.styleFrom(
                                      side: BorderSide(
                                        color: _outcome == o
                                            ? _green
                                            : const Color(0xff27384d),
                                      ),
                                      padding: const EdgeInsets.all(12),
                                    ),
                                    onPressed: () => _chartChange(outcome: o),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(m.team(o)),
                                        Text(
                                          '${_credits(m.price(o))} cr',
                                          style: const TextStyle(
                                            fontSize: 24,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                        Text(
                                          '${(m.price(o) / 10).toStringAsFixed(1)}% estimated',
                                          style: const TextStyle(
                                            fontSize: 10,
                                            color: _muted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            )
                            .toList(),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 5,
                        children: [
                          TextButton(
                            onPressed: () => setState(() => _line = !_line),
                            child: Text(_line ? 'Line ↔' : 'Candles ↔'),
                          ),
                          ...['1m', '5m', '15m', 'over'].map(
                            (v) => ChoiceChip(
                              label: Text(v == 'over' ? 'By over' : v),
                              selected: _interval == v,
                              onSelected: (_) => _chartChange(interval: v),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TradingChart(
                        key: ValueKey('$_marketId:$_outcome:$_interval'),
                        candles: _candles,
                        line: _line,
                        average: (position?.averagePrice ?? 0) / 10,
                        trades: s.executions
                            .where((e) => e.outcome == _outcome)
                            .toList(),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Quote ${_time(m.quote?['publishedAt'] as String?)} · Feed checked ${_time(m.feedReceivedAt)}\n${m.source == 'SIMULATION' ? 'Simulation clock' : 'Checks every ${m.pollingMs ~/ 1000}s · source delay unknown'}',
                        style: const TextStyle(fontSize: 10, color: _muted),
                      ),
                    ],
                  ),
                ),
                _card(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _row(
                        'Available match credits',
                        '${_credits(s.balance)} cr',
                      ),
                      _row('Test funding', _rupees(s.deposit)),
                      _row('Net trading result', '${_credits(s.net)} cr'),
                      _row(
                        'Principal estimate',
                        _rupees(s.pool['estimatedPrincipal'] as num),
                      ),
                      _row(
                        'Provisional reward',
                        _rupees(s.pool['estimatedReward'] as num),
                      ),
                      OutlinedButton(
                        onPressed: m.open && !_busy && _pending == null
                            ? _fund
                            : null,
                        child: const Text('Add test credits'),
                      ),
                    ],
                  ),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['Positions', 'History', 'Pool', 'Rules']
                        .map(
                          (t) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(t),
                              selected: _tab == t,
                              onSelected: (_) => setState(() => _tab = t),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
                const SizedBox(height: 12),
                if (_tab == 'Positions')
                  _card(
                    Column(
                      children: [
                        if (!s.positions.any((p) => p.quantity > 0))
                          const Text(
                            'No open positions. Choose a team and buy shares.',
                          ),
                        ...s.positions
                            .where((p) => p.quantity > 0)
                            .map(
                              (p) => Column(
                                children: [
                                  _row(
                                    m.team(p.outcome),
                                    '${p.quantity} shares',
                                  ),
                                  _row(
                                    'Average entry',
                                    '${_credits(p.averagePrice)} cr',
                                  ),
                                  _row(
                                    'Unrealized result',
                                    '${_credits(p.unrealized)} cr',
                                  ),
                                  TextButton(
                                    onPressed:
                                        m.open && !_busy && _pending == null
                                        ? () {
                                            _chartChange(outcome: p.outcome);
                                            _ticket('SELL');
                                          }
                                        : null,
                                    child: const Text('Sell shares'),
                                  ),
                                ],
                              ),
                            ),
                      ],
                    ),
                  ),
                if (_tab == 'History')
                  _card(
                    Column(
                      children: [
                        if (s.executions.isEmpty) const Text('No trades yet.'),
                        ...s.executions.map(
                          (e) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              '${e.side} ${e.quantity} ${m.team(e.outcome)}',
                            ),
                            subtitle: Text(
                              '${_time(e.createdAt)} · ${_credits(e.price)} cr/share',
                            ),
                            trailing: Text('${_credits(e.total)} cr'),
                          ),
                        ),
                        const Text(
                          'Most recent 100 trades.',
                          style: TextStyle(color: _muted, fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                if (_tab == 'Pool')
                  _card(
                    Column(
                      children: [
                        _row('Participants', '${s.pool['participants']}'),
                        _row(
                          'Total test funding',
                          _rupees(s.pool['deposits'] as num),
                        ),
                        _row(
                          'Loss pool (estimated)',
                          _rupees(s.pool['losses'] as num),
                        ),
                        _row(
                          'Positive credits',
                          _credits(s.pool['gains'] as num),
                        ),
                        const Text(
                          'Your reward = your positive net credits / all positive net credits × loss pool. The estimate can change until settlement.',
                          style: TextStyle(color: _muted),
                        ),
                      ],
                    ),
                  ),
                if (_tab == 'Rules')
                  _card(
                    const Text(
                      '₹1 equivalent buys 10 match credits. Losses use their full equivalent, capped at your match funding. Remaining principal is refunded at settlement.\n\nPositive net credits share the entire loss pool. If everyone profits, cash profit is zero. If nobody profits, deposits are refunded. Voided matches refund deposits. No fees in this version.\n\nOpen winning shares close at 100 credits and losing shares at zero. This calculates a trading score, not a guaranteed cash payout.\n\nTime pressure follows remaining balls; event sensitivity depends on wickets, runs and target. Prices use an experimental model. Missing feed deliveries are not reconstructed.\n\nThese are test credits: no deposits, losses or rewards affect your cash wallet.',
                      style: TextStyle(height: 1.6, color: _muted),
                    ),
                  ),
                if (s.receipt != null)
                  _card(
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Settlement receipt',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text('${s.receipt!['reason']}'),
                        _row('Deposit', _rupees(s.receipt!['deposit'] as num)),
                        _row(
                          'Loss contribution',
                          _rupees(s.receipt!['loss'] as num),
                        ),
                        _row(
                          'Principal returned',
                          _rupees(s.receipt!['principal'] as num),
                        ),
                        _row(
                          'Pool reward',
                          _rupees(s.receipt!['reward'] as num),
                        ),
                        _row(
                          'Total equivalent',
                          _rupees(s.receipt!['payout'] as num),
                        ),
                        Text(
                          s.receipt!['mode'] == 'TEST'
                              ? 'Test result only. Your cash wallet is unchanged.'
                              : 'Credited to wallet.',
                          style: const TextStyle(color: _muted),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 20),
              ],
            ],
          ),
        ),
        bottomNavigationBar: m == null
            ? null
            : SafeArea(
                top: false,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  color: _panel,
                  child: Row(
                    children: [
                      Expanded(
                        child: FilledButton(
                          onPressed: m.open && !_busy && _pending == null
                              ? () => _ticket('BUY')
                              : null,
                          child: Text('Buy ${m.team(_outcome)}'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton(
                          onPressed:
                              m.open &&
                                  !_busy &&
                                  _pending == null &&
                                  (position?.quantity ?? 0) > 0
                              ? () => _ticket('SELL')
                              : null,
                          child: Text('Sell ${m.team(_outcome)}'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}
