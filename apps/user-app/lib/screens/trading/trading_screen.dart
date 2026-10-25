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
String _teamCode(String name) =>
    {
      'India': 'IND',
      'New Zealand': 'NZ',
      'Australia': 'AUS',
      'England': 'ENG',
      'Pakistan': 'PAK',
      'South Africa': 'SA',
      'Sri Lanka': 'SL',
      'Bangladesh': 'BAN',
      'Afghanistan': 'AFG',
      'West Indies': 'WI',
    }[name] ??
    (name.length <= 4
        ? name.toUpperCase()
        : name
              .split(RegExp(r'\s+'))
              .where((s) => s.isNotEmpty)
              .map((s) => s[0])
              .take(4)
              .join()
              .toUpperCase());
String _credits(num n) => NumberFormat('#,##0.#').format(n / 10);
String _rupees(num n) => '₹${NumberFormat('#,##0.00').format(n / 100)}';
String _id() =>
    '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}';
String _time(String? value) => value == null
    ? '—'
    : DateFormat.Hms().format(DateTime.parse(value).toLocal());

class TradingScreen extends StatefulWidget {
  final String userId;
  final VoidCallback? onWithdraw;
  final Future<dynamic> Function(String, {Map<String, dynamic>? body}) request;
  const TradingScreen({
    super.key,
    required this.userId,
    this.onWithdraw,
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
  String _tab = 'Home', _error = '', _notice = '';
  int _outcome = 0, _epoch = 0;
  bool _loading = true, _fetching = false, _busy = false;
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
          _marketId = null;
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
        widget.request('/markets/$id/candles?outcome=$_outcome&interval=auto'),
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

  void _chartChange(int outcome) {
    setState(() {
      _outcome = outcome;
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
      _notice = '';
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
          _notice = '${pending['label']}.';
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

  Future<void> _ticket(String side, {int? selectedOutcome}) async {
    final s = _snapshot;
    if (s == null || !s.market.open || _pending != null) return;
    final m = s.market,
        outcome = selectedOutcome ?? _outcome,
        p = s.positions
            .where((p) => p.outcome == (selectedOutcome ?? _outcome))
            .firstOrNull;
    final price = m.price(outcome),
        maximum = side == 'BUY' ? s.balance ~/ max(1, price) : p?.quantity ?? 0;
    final controller = TextEditingController(
      text: (side == 'BUY' ? min(10, maximum) : maximum).toString(),
    );
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
                    '${side == 'BUY' ? 'Buy' : 'Exit'} ${m.team(outcome)}',
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
                    'Credit P&L. Final rewards depend on the match loss pool.',
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
                              'label': side == 'BUY'
                                  ? 'Position opened'
                                  : 'Position exited',
                            });
                          }
                        : null,
                    child: Text(side == 'BUY' ? 'Confirm buy' : 'Confirm exit'),
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
            title: const Text('Add credits'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${m.title} · Credits for this match only'),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  onChanged: (_) => update(() {}),
                  decoration: const InputDecoration(labelText: 'Amount (₹)'),
                ),
                const SizedBox(height: 12),
                Text(
                  valid
                      ? '${_credits((amount * 100).round())} credits · ₹1 = 10 credits\n${m.mode == 'TEST' ? 'Test market. No wallet deduction.' : 'Funds stay in this match until settlement.'}'
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
                          'label': 'Credits added',
                        });
                      }
                    : null,
                child: Text(
                  m.mode == 'TEST' ? 'Add test credits' : 'Convert to credits',
                ),
              ),
            ],
          );
        },
      ),
    );
    controller.dispose();
  }

  Color _pnlColor(num n) => n > 0
      ? _green
      : n < 0
      ? const Color(0xfff87171)
      : Colors.white;
  String _signed(num n) => '${n > 0 ? '+' : ''}${_credits(n)} cr';
  void _withdraw() {
    final s = _snapshot;
    if (s == null) return;
    final receipt = s.receipt;
    final cashSettled = receipt != null && s.market.mode == 'CASH';
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw'),
        content: SingleChildScrollView(
          child: Text(
            '${s.market.title}\n\n${receipt == null
                ? (s.market.status == 'SETTLED' || s.market.status == 'VOIDED' ? 'You have no settlement payout for this match.' : 'Credits stay locked until this match settles. After the result is confirmed, remaining principal and your share of this match’s loss pool return automatically to your wallet.')
                : !cashSettled
                ? 'This match used test credits. Its settlement cannot be withdrawn as money.'
                : '${_rupees(receipt['payout'] as num)} returned to your wallet when this match settled. Your wallet shows the amount still available to withdraw.'}',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
          if (cashSettled && widget.onWithdraw != null)
            FilledButton(
              onPressed: () {
                Navigator.pop(ctx);
                widget.onWithdraw!();
              },
              child: const Text('Continue to withdrawal'),
            ),
        ],
      ),
    );
  }

  Widget _row(String name, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(name, style: const TextStyle(color: _muted, fontSize: 12)),
        Text(value),
      ],
    ),
  );
  void _details() => showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Market details'),
      content: SingleChildScrollView(
        child: Text(
          '${_snapshot?.market.reason ?? ''}\n\n₹1 = 10 match credits. Remaining principal returns at settlement. Positive net credits share the actual loss pool; profits are not guaranteed. Voided matches and pools without positive participants refund deposits. No fees.\n\nCandles use observed prices: per over, then one minute in the last three overs. Drag the price axis vertically to change candle height; drag the time axis horizontally to change spacing. Double-tap to reset.',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Done'),
        ),
      ],
    ),
  );
  @override
  Widget build(BuildContext context) {
    final s = _snapshot,
        m = s?.market,
        positions =
            s?.positions.where((p) => p.quantity > 0).toList() ??
            <TradingPosition>[];
    final position = positions.where((p) => p.outcome == _outcome).firstOrNull;
    final state = m?.state ?? <String, dynamic>{};
    final oneMinute =
        state['balls'] != null &&
        (state['totalBalls'] as num) - (state['balls'] as num) <= 18;
    return Theme(
      data: ThemeData.dark(useMaterial3: true).copyWith(
        colorScheme: ColorScheme.fromSeed(
          seedColor: _green,
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xff0d1117),
      ),
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          backgroundColor: const Color(0xff0d1117),
          surfaceTintColor: Colors.transparent,
          title: const Text(
            'CricTrade',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          actions: [
            IconButton(
              tooltip: 'Withdraw',
              onPressed: m == null || _busy || _pending != null
                  ? null
                  : _withdraw,
              icon: const Icon(Icons.north_east, size: 20),
            ),
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: OutlinedButton(
                onPressed: m == null || !m.open || _busy || _pending != null
                    ? null
                    : _fund,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Match credits',
                          style: TextStyle(fontSize: 9, color: _muted),
                        ),
                        Text(
                          '${_credits(s?.receipt != null ? 0 : s?.balance ?? 0)} cr',
                          style: const TextStyle(
                            fontSize: 14,
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 12),
                    const Icon(Icons.add, size: 22, color: _green),
                  ],
                ),
              ),
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(48),
            child: Row(
              children: ['Home', 'My positions']
                  .map(
                    (tab) => InkWell(
                      onTap: () => setState(() => _tab = tab),
                      child: Container(
                        margin: const EdgeInsets.only(left: 20),
                        padding: const EdgeInsets.symmetric(
                          vertical: 14,
                          horizontal: 2,
                        ),
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(
                              color: _tab == tab ? _green : Colors.transparent,
                              width: 2,
                            ),
                          ),
                        ),
                        child: Text(
                          tab,
                          style: TextStyle(
                            color: _tab == tab ? _green : _muted,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
        body: RefreshIndicator(
          onRefresh: () async {
            await _loadMarkets();
            await _load();
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    _error,
                    style: const TextStyle(color: Color(0xfff87171)),
                  ),
                ),
              if (_notice.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    _notice,
                    style: const TextStyle(color: _green, fontSize: 12),
                  ),
                ),
              if (_pending != null)
                TextButton(
                  onPressed: _busy ? null : () => _execute(_pending!),
                  child: const Text('Retry unconfirmed request'),
                ),
              if (_loading) const Center(child: CircularProgressIndicator()),
              if (!_loading && _markets.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Text('No matches available yet.'),
                ),
              if (_markets.isNotEmpty)
                Row(
                  children: [
                    Expanded(
                      child: DropdownButton<String>(
                        value: _marketId,
                        hint: const Text(
                          'Choose a match',
                          style: TextStyle(color: _muted),
                        ),
                        isExpanded: true,
                        underline: const SizedBox.shrink(),
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                        items: _markets
                            .map(
                              (market) => DropdownMenuItem(
                                value: market.id,
                                child: Text(
                                  market.title,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: _busy || _pending != null
                            ? null
                            : (id) {
                                if (id != null) _select(id);
                              },
                      ),
                    ),
                    if (m?.mode == 'TEST')
                      const Padding(
                        padding: EdgeInsets.only(left: 12),
                        child: Text(
                          'Test market',
                          style: TextStyle(fontSize: 10, color: _muted),
                        ),
                      ),
                    IconButton(
                      onPressed: _details,
                      tooltip: 'Market details',
                      icon: const Icon(
                        Icons.info_outline,
                        size: 18,
                        color: _muted,
                      ),
                    ),
                  ],
                ),
              if (!_loading && _markets.isNotEmpty && _marketId == null)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Text(
                    'Choose a match to add credits and trade. Credits belong only to that match.',
                    style: TextStyle(color: _muted),
                  ),
                ),
              if (_marketId != null && s == null)
                const Center(child: CircularProgressIndicator()),
              if (s != null && m != null) ...[
                if (_tab == 'Home') ...[
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          m.open
                              ? (state['description'] as String? ?? '')
                              : m.reason,
                          style: const TextStyle(fontSize: 11, color: _muted),
                        ),
                      ),
                      const SizedBox(width: 12),
                      if (state['balls'] != null)
                        Text(
                          '${state['runs']}/${state['wickets']}  (${(state['balls'] as int) ~/ 6}.${(state['balls'] as int) % 6} ov)',
                          style: const TextStyle(fontSize: 12),
                        ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Container(
                    decoration: BoxDecoration(
                      border: Border.all(color: const Color(0xff26303d)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Row(
                      children: [0, 1]
                          .map(
                            (o) => Expanded(
                              child: Semantics(
                                label:
                                    '${m.team(o)}, ${_credits(m.price(o))} credits',
                                selected: o == _outcome,
                                button: true,
                                child: InkWell(
                                  onTap: () => _chartChange(o),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 11,
                                    ),
                                    decoration: BoxDecoration(
                                      color: o == _outcome
                                          ? const Color(0xff122b22)
                                          : _panel,
                                      border: Border(
                                        left: BorderSide(
                                          color: o == 1
                                              ? const Color(0xff26303d)
                                              : Colors.transparent,
                                        ),
                                        bottom: BorderSide(
                                          color: o == _outcome
                                              ? _green
                                              : Colors.transparent,
                                          width: 2,
                                        ),
                                      ),
                                    ),
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          _teamCode(m.team(o)),
                                          style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: o == _outcome
                                                ? _green
                                                : Colors.white,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Text(
                                          (m.price(o) / 10).toStringAsFixed(2),
                                          style: TextStyle(
                                            fontSize: 17,
                                            fontWeight: FontWeight.w600,
                                            color: o == _outcome
                                                ? _green
                                                : Colors.white,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                  const SizedBox(height: 22),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        m.team(_outcome),
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        '${oneMinute ? '1 min' : 'Over'} candles · Auto',
                        style: const TextStyle(fontSize: 10, color: _muted),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TradingChart(
                    key: ValueKey('$_marketId:$_outcome:$oneMinute'),
                    candles: _candles,
                    average: (position?.averagePrice ?? 0) / 10,
                    trades: s.executions
                        .where((e) => e.outcome == _outcome)
                        .toList(),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Updated ${_time(m.quote?['publishedAt'] as String?)}',
                    style: const TextStyle(color: _muted, fontSize: 10),
                  ),
                ] else ...[
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Expanded(
                        child: Text(
                          'My positions',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          const Text(
                            'Total P&L',
                            style: TextStyle(fontSize: 10, color: _muted),
                          ),
                          Text(
                            _signed(s.net),
                            style: TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.w600,
                              color: _pnlColor(s.net),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _metric(
                        'Invested',
                        '${_credits(positions.fold<int>(0, (n, p) => n + p.cost))} cr',
                      ),
                      _metric(
                        'Current value',
                        '${_credits(positions.fold<int>(0, (n, p) => n + p.value))} cr',
                      ),
                      _metric(
                        'Realized',
                        _signed(s.realized),
                        color: _pnlColor(s.realized),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (positions.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 60),
                      child: Column(
                        children: [
                          const Text(
                            'No open positions',
                            style: TextStyle(fontSize: 18),
                          ),
                          const SizedBox(height: 12),
                          TextButton(
                            onPressed: () => setState(() => _tab = 'Home'),
                            child: const Text('Explore match'),
                          ),
                        ],
                      ),
                    ),
                  ...positions.map(
                    (p) => Container(
                      padding: const EdgeInsets.symmetric(vertical: 22),
                      decoration: const BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: Color(0xff26303d)),
                        ),
                      ),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    m.team(p.outcome),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 16,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    '${p.quantity} shares · Avg. ${_credits(p.averagePrice)} cr',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: _muted,
                                    ),
                                  ),
                                ],
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    _signed(p.unrealized),
                                    style: TextStyle(
                                      fontSize: 18,
                                      color: _pnlColor(p.unrealized),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    '${p.cost == 0 ? '0.00' : (p.unrealized / p.cost * 100).toStringAsFixed(2)}%',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: _pnlColor(p.unrealized),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'LTP ${_credits(m.price(p.outcome))} cr',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: _muted,
                                ),
                              ),
                              OutlinedButton(
                                onPressed: m.open && !_busy && _pending == null
                                    ? () => _ticket(
                                        'SELL',
                                        selectedOutcome: p.outcome,
                                      )
                                    : null,
                                child: const Text('Exit position'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (s.executions.isNotEmpty)
                    ExpansionTile(
                      title: const Text(
                        'Order history',
                        style: TextStyle(fontSize: 13),
                      ),
                      tilePadding: EdgeInsets.zero,
                      children: s.executions
                          .map(
                            (e) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                '${e.side == 'BUY' ? 'Buy' : 'Exit'} · ${m.team(e.outcome)}',
                                style: const TextStyle(fontSize: 13),
                              ),
                              subtitle: Text(
                                '${e.quantity} shares · ${_time(e.createdAt)}',
                                style: const TextStyle(fontSize: 11),
                              ),
                              trailing: Text('${_credits(e.total)} cr'),
                            ),
                          )
                          .toList(),
                    ),
                  if (s.receipt != null)
                    ExpansionTile(
                      title: const Text(
                        'Settlement receipt',
                        style: TextStyle(fontSize: 13),
                      ),
                      tilePadding: EdgeInsets.zero,
                      children: [
                        Text('${s.receipt!['reason']}'),
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
                      ],
                    ),
                ],
              ],
            ],
          ),
        ),
        bottomNavigationBar: m == null || _tab != 'Home'
            ? null
            : SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                  child: FilledButton(
                    onPressed: m.open && !_busy && _pending == null
                        ? () => _ticket('BUY')
                        : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: _green,
                      foregroundColor: const Color(0xff062e23),
                      padding: const EdgeInsets.symmetric(vertical: 15),
                    ),
                    child: Text(
                      m.open ? 'Buy ${m.team(_outcome)}' : 'Trading paused',
                    ),
                  ),
                ),
              ),
      ),
    );
  }

  Widget _metric(String name, String value, {Color color = Colors.white}) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(name, style: const TextStyle(fontSize: 10, color: _muted)),
          const SizedBox(height: 7),
          Text(value, style: TextStyle(fontSize: 12, color: color)),
        ],
      );
}
