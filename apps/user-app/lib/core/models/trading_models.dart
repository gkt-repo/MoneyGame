class TradingMarket {
  final String id, title, team0, team1, source, status, reason, mode;
  final Map<String, dynamic>? quote;
  final String? feedReceivedAt;
  final int pollingMs;
  final bool _serverEntryClosed;
  TradingMarket.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      title = j['title'] as String,
      team0 = j['team0'] as String,
      team1 = j['team1'] as String,
      source = j['source'] as String,
      status = j['status'] as String,
      reason = j['reason'] as String,
      mode = j['mode'] as String,
      _serverEntryClosed = j['entryClosed'] == true,
      quote = j['quote'] == null
          ? null
          : Map<String, dynamic>.from(j['quote'] as Map),
      feedReceivedAt = j['feedReceivedAt'] as String?,
      pollingMs = (j['pollingMs'] as num).toInt();
  Map<String, dynamic> get state =>
      quote == null ? {} : Map<String, dynamic>.from(quote!['state'] as Map);
  int price(int outcome) => outcome == 0
      ? (quote?['price0'] as num? ?? 0).toInt()
      : outcome == 2
      ? (quote?['priceDraw'] as num? ?? 0).toInt()
      : 1000 -
            (quote?['price0'] as num? ?? 1000).toInt() -
            (quote?['priceDraw'] as num? ?? 0).toInt();
  String get format =>
      state['format'] as String? ??
      (state['totalBalls'] == 300
          ? 'ODI'
          : state.containsKey('totalBalls') && state['totalBalls'] == null
          ? 'TEST'
          : 'T20');
  List<int> get outcomes => format == 'TEST' ? [0, 1, 2] : [0, 1];
  String team(int outcome) => outcome == 2
      ? 'Draw'
      : outcome == 0
      ? team0
      : team1;
  bool get open =>
      status == 'OPEN' &&
      quote != null &&
      DateTime.parse(quote!['expiresAt'] as String).isAfter(DateTime.now());
  bool get entryClosed =>
      _serverEntryClosed ||
      (quote != null && outcomes.any((o) => price(o) > 900));
  bool get canEnter => open && !entryClosed;
}

class TradingCandle {
  final int time, quotes;
  final double open, high, low, close;
  TradingCandle.fromJson(Map<String, dynamic> j)
    : time = (j['time'] as num).toInt(),
      quotes = (j['quotes'] as num).toInt(),
      open = (j['open'] as num).toDouble(),
      high = (j['high'] as num).toDouble(),
      low = (j['low'] as num).toDouble(),
      close = (j['close'] as num).toDouble();
}

class TradingPosition {
  final int outcome, quantity, cost, value, unrealized;
  final double averagePrice;
  TradingPosition.fromJson(Map<String, dynamic> j)
    : outcome = (j['outcome'] as num).toInt(),
      quantity = (j['quantity'] as num).toInt(),
      cost = (j['cost'] as num).toInt(),
      value = (j['value'] as num).toInt(),
      unrealized = (j['unrealized'] as num).toInt(),
      averagePrice = (j['averagePrice'] as num).toDouble();
}

class TradingExecution {
  final String id, side, createdAt;
  final int outcome, quantity, price, total;
  TradingExecution.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      side = j['side'] as String,
      createdAt = j['createdAt'] as String,
      outcome = (j['outcome'] as num).toInt(),
      quantity = (j['quantity'] as num).toInt(),
      price = (j['price'] as num).toInt(),
      total = (j['total'] as num).toInt();
}

class TradingSnapshot {
  final TradingMarket market;
  final int deposit, balance, equity, net, realized;
  final List<TradingPosition> positions;
  final List<TradingExecution> executions;
  final Map<String, dynamic> pool;
  final Map<String, dynamic>? receipt;
  TradingSnapshot.fromJson(Map<String, dynamic> j)
    : market = TradingMarket.fromJson(
        Map<String, dynamic>.from(j['market'] as Map),
      ),
      deposit = (j['account']['deposit'] as num).toInt(),
      balance = (j['account']['balance'] as num).toInt(),
      equity = (j['account']['equity'] as num).toInt(),
      net = (j['account']['net'] as num).toInt(),
      realized = (j['account']['realized'] as num).toInt(),
      positions = (j['account']['positions'] as List)
          .map(
            (p) =>
                TradingPosition.fromJson(Map<String, dynamic>.from(p as Map)),
          )
          .toList(),
      executions = (j['executions'] as List)
          .map(
            (p) =>
                TradingExecution.fromJson(Map<String, dynamic>.from(p as Map)),
          )
          .toList(),
      pool = Map<String, dynamic>.from(j['pool'] as Map),
      receipt = j['account']['receipt'] == null
          ? null
          : Map<String, dynamic>.from(j['account']['receipt'] as Map);
}
