import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:dio/dio.dart';

class TradingHistory extends StatefulWidget {
  final Future<dynamic> Function(String, {Map<String, dynamic>? body}) request;
  const TradingHistory({super.key, required this.request});
  @override
  State<TradingHistory> createState() => _TradingHistoryState();
}

class _TradingHistoryState extends State<TradingHistory> {
  List<Map<String, dynamic>> _items = [];
  String? _cursor;
  String _error = '';
  bool _loading = true;
  int _epoch = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool more = false}) async {
    final epoch = ++_epoch;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final data =
          await widget.request(
                '/history${more && _cursor != null ? '?cursor=${Uri.encodeComponent(_cursor!)}' : ''}',
              )
              as Map;
      if (!mounted || epoch != _epoch) return;
      final items = (data['items'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        _items = more ? [..._items, ...items] : items;
        _cursor = data['nextCursor'] as String?;
      });
    } catch (e) {
      if (mounted && epoch == _epoch) {
        setState(() {
          _error = e is DioException && e.response?.data is Map
              ? '${e.response!.data['error']}'
              : 'Unable to load history. Pull down to retry.';
        });
      }
    } finally {
      if (mounted && epoch == _epoch) setState(() => _loading = false);
    }
  }

  String credits(num n) => NumberFormat('#,##0.#').format(n / 10);
  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'History',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
        ),
        if (_error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(_error),
          ),
        if (!_loading && _error.isEmpty && _items.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Text('No trades yet.'),
          ),
        ..._items.map(
          (e) => Container(
            padding: const EdgeInsets.symmetric(vertical: 18),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Color(0xff26303d))),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${e['side'] == 'BUY' ? 'Buy' : 'Exit'} · ${e['outcomeName']}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '${e['marketTitle']}${e['mode'] == 'TEST' ? ' · Test credits' : ''}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xffa4b5cb),
                        ),
                      ),
                      Text(
                        '${DateFormat('dd MMM yyyy, HH:mm:ss').format(DateTime.parse(e['createdAt'] as String).toLocal())} · Executed',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xffa4b5cb),
                        ),
                      ),
                      Text(
                        '${e['quantity']} shares × ${credits(e['price'] as num)} cr',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Flexible(
                  child: Text(
                    '${credits(e['total'] as num)} cr',
                    textAlign: TextAlign.end,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_loading)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
          ),
        if (_cursor != null)
          TextButton(
            onPressed: _loading ? null : () => _load(more: true),
            child: const Text('Load more'),
          ),
      ],
    ),
  );
}
