import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;
import '../../core/models/trading_models.dart';

class TradingChart extends StatefulWidget {
  final List<TradingCandle> candles;
  final bool line;
  final double average;
  final List<TradingExecution> trades;
  const TradingChart({
    super.key,
    required this.candles,
    required this.line,
    this.average = 0,
    this.trades = const [],
  });
  @override
  State<TradingChart> createState() => _TradingChartState();
}

class _TradingChartState extends State<TradingChart> {
  int? _selected;
  double _zoom = 1;
  final _scroll = ScrollController();
  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _selected != null && _selected! < widget.candles.length
        ? widget.candles[_selected!]
        : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          c == null
              ? 'Model price · credits per share'
              : '${DateFormat.Hms().format(DateTime.fromMillisecondsSinceEpoch(c.time * 1000))}  O ${c.open} H ${c.high} L ${c.low} C ${c.close}',
          style: const TextStyle(color: Color(0xff9eb1c7), fontSize: 11),
        ),
        const SizedBox(height: 8),
        LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth * _zoom;
            return Semantics(
              label:
                  'Sampled price chart, ${widget.candles.length} candles. Latest price ${widget.candles.isEmpty ? 'unavailable' : widget.candles.last.close} credits.',
              child: SingleChildScrollView(
                controller: _scroll,
                scrollDirection: Axis.horizontal,
                child: GestureDetector(
                  onTapDown: (details) {
                    if (widget.candles.isEmpty) return;
                    final first = widget.candles.first.time,
                        span = math.max(1, widget.candles.last.time - first);
                    final target =
                        first +
                        ((details.localPosition.dx - 8) / (width - 60)).clamp(
                              0,
                              1,
                            ) *
                            span;
                    var nearest = 0;
                    for (var i = 1; i < widget.candles.length; i++) {
                      if ((widget.candles[i].time - target).abs() <
                          (widget.candles[nearest].time - target).abs()) {
                        nearest = i;
                      }
                    }
                    setState(() => _selected = nearest);
                  },
                  child: CustomPaint(
                    size: Size(width, 270),
                    painter: _ChartPainter(
                      widget.candles,
                      widget.line,
                      widget.average,
                      _selected,
                      widget.trades,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
        if (widget.candles.isEmpty)
          const Text(
            'Waiting for price snapshots.',
            style: TextStyle(color: Color(0xff9eb1c7)),
          ),
        Row(
          children: [
            const Text(
              'Zoom',
              style: TextStyle(color: Color(0xff9eb1c7), fontSize: 11),
            ),
            Expanded(
              child: Slider(
                value: _zoom,
                min: 1,
                max: 5,
                onChanged: (v) => setState(() => _zoom = v),
              ),
            ),
            TextButton(
              onPressed: () {
                setState(() => _zoom = 1);
                if (_scroll.hasClients) _scroll.jumpTo(0);
              },
              child: const Text('Reset'),
            ),
          ],
        ),
        const Text(
          'Tap for OHLC · scroll to inspect history · gaps are not reconstructed.',
          style: TextStyle(color: Color(0xff9eb1c7), fontSize: 10),
        ),
      ],
    );
  }
}

class _ChartPainter extends CustomPainter {
  final List<TradingCandle> data;
  final bool line;
  final double average;
  final int? selected;
  final List<TradingExecution> trades;
  _ChartPainter(this.data, this.line, this.average, this.selected, this.trades);
  void text(Canvas canvas, String value, Offset offset) {
    final painter = TextPainter(
      text: TextSpan(
        text: value,
        style: const TextStyle(fontSize: 10, color: Color(0xff9eb1c7)),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    painter.paint(canvas, offset);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final width = size.width - 60, height = size.height - 32;
    double y(double value) =>
        8 + (100 - value.clamp(0, 100)) / 100 * (height - 16);
    final grid = Paint()
      ..color = const Color(0xff27384d)
      ..strokeWidth = 1;
    for (var value = 0; value <= 100; value += 25) {
      canvas.drawLine(
        Offset(8, y(value.toDouble())),
        Offset(width + 8, y(value.toDouble())),
        grid,
      );
      text(canvas, '$value cr', Offset(width + 14, y(value.toDouble()) - 5));
    }
    if (data.isEmpty) return;
    final start = data.first.time, span = math.max(1, data.last.time - start);
    double x(num time) =>
        data.length == 1 ? width / 2 : 8 + (time - start) / span * width;
    final candleWidth = (width / (data.length * 2)).clamp(2.0, 14.0);
    final path = Path();
    for (var i = 0; i < data.length; i++) {
      final c = data[i], cx = x(data[i].time);
      final paint = Paint()
        ..color = c.close >= c.open
            ? const Color(0xff42dfb6)
            : const Color(0xfffb8293)
        ..strokeWidth = 1.5;
      if (line) {
        if (i == 0) {
          path.moveTo(cx, y(c.close));
        } else {
          path.lineTo(cx, y(c.close));
        }
      } else {
        canvas.drawLine(Offset(cx, y(c.high)), Offset(cx, y(c.low)), paint);
        canvas.drawRect(
          Rect.fromLTWH(
            cx - candleWidth / 2,
            math.min(y(c.open), y(c.close)),
            candleWidth,
            math.max(1.5, (y(c.open) - y(c.close)).abs()),
          ),
          paint,
        );
      }
    }
    if (line) {
      canvas.drawPath(
        path,
        Paint()
          ..color = const Color(0xff42dfb6)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      if (data.length == 1) {
        canvas.drawCircle(
          Offset(x(start), y(data.first.close)),
          3,
          Paint()..color = const Color(0xff42dfb6),
        );
      }
    }
    if (average > 0) {
      canvas.drawLine(
        Offset(8, y(average)),
        Offset(width + 8, y(average)),
        Paint()
          ..color = const Color(0xfff3c969)
          ..strokeWidth = 1,
      );
      text(
        canvas,
        'Entry ${average.toStringAsFixed(1)}',
        Offset(10, y(average) - 14),
      );
    }
    for (final trade in trades) {
      final time =
          DateTime.parse(trade.createdAt).millisecondsSinceEpoch / 1000;
      if (time < start || time > data.last.time) continue;
      canvas.drawCircle(
        Offset(x(time), y(trade.price / 10)),
        3,
        Paint()
          ..color = trade.side == 'BUY'
              ? const Color(0xff42dfb6)
              : const Color(0xfffb8293),
      );
    }
    for (final i in {0, data.length ~/ 2, data.length - 1}) {
      text(
        canvas,
        DateFormat.Hm().format(
          DateTime.fromMillisecondsSinceEpoch(data[i].time * 1000),
        ),
        Offset(x(data[i].time).clamp(0, width - 30), height + 8),
      );
    }
    if (selected != null && selected! < data.length) {
      canvas.drawLine(
        Offset(x(data[selected!].time), 8),
        Offset(x(data[selected!].time), height),
        Paint()
          ..color = Colors.white54
          ..strokeWidth = 1,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ChartPainter oldDelegate) => true;
}
