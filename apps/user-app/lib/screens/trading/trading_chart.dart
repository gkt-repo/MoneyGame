import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/constants/app_theme.dart';
import '../../core/constants/colors.dart';
import 'package:intl/intl.dart' show DateFormat;
import '../../core/models/trading_models.dart';

class TradingChart extends StatefulWidget {
  final List<TradingCandle> candles;
  final double average;
  final List<TradingExecution> trades;
  const TradingChart({
    super.key,
    required this.candles,
    this.average = 0,
    this.trades = const [],
  });
  @override
  State<TradingChart> createState() => _TradingChartState();
}

class _TradingChartState extends State<TradingChart> {
  int? _selected;
  double _xZoom = 1, _yZoom = 1, _pan = 0, _startZoom = 1, _startPan = 0;
  Offset _startFocal = Offset.zero;
  @override
  Widget build(BuildContext context) {
    final selected = _selected != null && _selected! < widget.candles.length
        ? widget.candles[_selected!]
        : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 24,
          child: Text(
            selected == null
                ? 'Price · credits per share'
                : 'O ${selected.open}  H ${selected.high}  L ${selected.low}  C ${selected.close}',
            style: TextStyle(color: context.palette.muted, fontSize: 10),
          ),
        ),
        LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth,
                plotWidth = math.max(1.0, width - 56);
            final view = _ChartViewport(widget.candles, _xZoom, _yZoom, _pan);
            return SizedBox(
              height: 340,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: Semantics(
                      label:
                          'Price chart, ${widget.candles.length} candles. Latest price ${widget.candles.isEmpty ? 'unavailable' : widget.candles.last.close} credits.',
                      child: CustomPaint(
                        painter: _ChartPainter(
                          widget.candles,
                          view,
                          widget.average,
                          _selected,
                          widget.trades,
                          context.palette,
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 56,
                    top: 0,
                    bottom: 30,
                    child: GestureDetector(
                      key: const ValueKey('trading-plot'),
                      behavior: HitTestBehavior.opaque,
                      onTapDown: (d) {
                        if (widget.candles.isEmpty) return;
                        final time =
                            view.start +
                            d.localPosition.dx / plotWidth * view.span;
                        var nearest = 0;
                        for (var i = 1; i < widget.candles.length; i++) {
                          if ((widget.candles[i].time - time).abs() <
                              (widget.candles[nearest].time - time).abs()) {
                            nearest = i;
                          }
                        }
                        setState(() => _selected = nearest);
                      },
                      onDoubleTap: () => setState(() {
                        _xZoom = 1;
                        _yZoom = 1;
                        _pan = 0;
                      }),
                      onScaleStart: (d) {
                        _startZoom = _xZoom;
                        _startPan = _pan;
                        _startFocal = d.localFocalPoint;
                      },
                      onScaleUpdate: (d) => setState(() {
                        _xZoom = (_startZoom * d.scale).clamp(.5, 20);
                        _pan =
                            (_startPan +
                                    (d.localFocalPoint.dx - _startFocal.dx) /
                                        plotWidth *
                                        view.fullSpan /
                                        _startZoom)
                                .clamp(-view.fullSpan, view.fullSpan);
                      }),
                    ),
                  ),
                  Positioned(
                    right: 0,
                    top: 0,
                    bottom: 30,
                    width: 56,
                    child: Semantics(
                      label:
                          'Price axis. Drag vertically to scale. Zoom ${_yZoom.toStringAsFixed(2)}',
                      child: GestureDetector(
                        key: const ValueKey('trading-price-axis'),
                        behavior: HitTestBehavior.opaque,
                        onVerticalDragUpdate: (d) => setState(
                          () => _yZoom = (_yZoom * math.exp(-d.delta.dy / 120))
                              .clamp(.25, 20),
                        ),
                        onDoubleTap: () => setState(() => _yZoom = 1),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 56,
                    bottom: 0,
                    height: 30,
                    child: Semantics(
                      label:
                          'Time axis. Drag horizontally to scale. Zoom ${_xZoom.toStringAsFixed(2)}',
                      child: GestureDetector(
                        key: const ValueKey('trading-time-axis'),
                        behavior: HitTestBehavior.opaque,
                        onHorizontalDragUpdate: (d) => setState(
                          () => _xZoom = (_xZoom * math.exp(d.delta.dx / 160))
                              .clamp(.5, 20),
                        ),
                        onDoubleTap: () => setState(() {
                          _xZoom = 1;
                          _pan = 0;
                        }),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
        if (widget.candles.isEmpty)
          Text(
            'Waiting for price snapshots.',
            style: TextStyle(color: context.palette.muted, fontSize: 11),
          ),
        const SizedBox(height: 8),
        Text(
          'Drag price ↕ to scale · drag time ↔ to zoom',
          style: TextStyle(color: context.palette.muted, fontSize: 10),
        ),
      ],
    );
  }
}

class _ChartViewport {
  late final double start, span, fullSpan, low, high;
  _ChartViewport(
    List<TradingCandle> data,
    double xZoom,
    double yZoom,
    double pan,
  ) {
    final first = data.isEmpty ? 0.0 : data.first.time.toDouble(),
        last = data.isEmpty ? 60.0 : data.last.time.toDouble();
    final step = data.length > 1
        ? math.max(1.0, (last - first) / (data.length - 1))
        : 60.0;
    fullSpan = math.max(60.0, last - first + step * 2);
    span = fullSpan / xZoom;
    start = last + step - span - pan;
    final visible = data
        .where((c) => c.time >= start && c.time <= start + span)
        .toList();
    final prices = visible.isEmpty ? data : visible;
    final minimum = prices.isEmpty
        ? 0.0
        : prices.map((c) => c.low).reduce(math.min);
    final maximum = prices.isEmpty
        ? 100.0
        : prices.map((c) => c.high).reduce(math.max);
    final center = (minimum + maximum) / 2,
        range = math.max(4.0, (maximum - minimum) * 1.3) / yZoom;
    low = center - range / 2;
    high = center + range / 2;
  }
}

class _ChartPainter extends CustomPainter {
  final List<TradingCandle> data;
  final _ChartViewport view;
  final double average;
  final int? selected;
  final List<TradingExecution> trades;
  final AppPalette palette;
  _ChartPainter(
    this.data,
    this.view,
    this.average,
    this.selected,
    this.trades,
    this.palette,
  );
  void text(Canvas canvas, String value, Offset offset, {Color? color}) {
    final painter = TextPainter(
      text: TextSpan(
        text: value,
        style: TextStyle(fontSize: 10, color: color ?? palette.muted),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    painter.paint(canvas, offset);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final width = math.max(1.0, size.width - 56), height = size.height - 30;
    double x(num time) => (time - view.start) / view.span * width;
    double y(double price) =>
        8 + (view.high - price) / (view.high - view.low) * (height - 16);
    final grid = Paint()
      ..color = palette.outline
      ..strokeWidth = .7;
    for (var i = 0; i <= 4; i++) {
      final value = view.low + (view.high - view.low) * i / 4, cy = y(value);
      canvas.drawLine(Offset(0, cy), Offset(width, cy), grid);
      text(canvas, value.toStringAsFixed(1), Offset(width + 9, cy - 5));
    }
    canvas.drawLine(Offset(width, 0), Offset(width, height), grid);
    canvas.drawLine(Offset(0, height), Offset(width, height), grid);
    for (var i = 0; i < 3; i++) {
      final cx = width * (.1 + .4 * i),
          time = view.start + cx / width * view.span;
      canvas.drawLine(Offset(cx, 0), Offset(cx, height), grid);
      text(
        canvas,
        DateFormat.Hm().format(
          DateTime.fromMillisecondsSinceEpoch((time * 1000).round()),
        ),
        Offset((cx - 16).clamp(0, width - 32), height + 9),
      );
    }
    canvas.save();
    canvas.clipRect(Rect.fromLTWH(0, 0, width, height));
    final step = data.length > 1
        ? (data.last.time - data.first.time) / (data.length - 1)
        : 60.0;
    final candleWidth = (step / view.span * width * .65).clamp(2.0, 35.0);
    for (final c in data) {
      final cx = x(c.time);
      if (cx < -candleWidth || cx > width + candleWidth) continue;
      final paint = Paint()
        ..color = c.close >= c.open
            ? palette.accent
            : palette.adapt(AppColors.red600)
        ..strokeWidth = 1.3;
      canvas.drawLine(Offset(cx, y(c.high)), Offset(cx, y(c.low)), paint);
      canvas.drawRect(
        Rect.fromLTWH(
          cx - candleWidth / 2,
          math.min(y(c.open), y(c.close)),
          candleWidth,
          math.max(1.2, (y(c.open) - y(c.close)).abs()),
        ),
        paint,
      );
    }
    if (average > 0 && average >= view.low && average <= view.high) {
      final paint = Paint()
        ..color = palette.adapt(AppColors.amber700)
        ..strokeWidth = .8;
      for (double dx = 0; dx < width; dx += 8) {
        canvas.drawLine(
          Offset(dx, y(average)),
          Offset(math.min(dx + 4, width), y(average)),
          paint,
        );
      }
      text(
        canvas,
        'Avg. ${average.toStringAsFixed(1)}',
        Offset(5, y(average) - 14),
        color: palette.adapt(AppColors.amber700),
      );
    }
    for (final t in trades) {
      final time = DateTime.parse(t.createdAt).millisecondsSinceEpoch / 1000;
      canvas.drawCircle(
        Offset(x(time), y(t.price / 10)),
        3,
        Paint()
          ..color = t.side == 'BUY'
              ? palette.accent
              : palette.adapt(AppColors.red600),
      );
    }
    if (selected != null && selected! < data.length) {
      final c = data[selected!];
      canvas.drawLine(
        Offset(x(c.time), 0),
        Offset(x(c.time), height),
        Paint()..color = palette.muted.withValues(alpha: .55),
      );
      canvas.drawLine(
        Offset(0, y(c.close)),
        Offset(width, y(c.close)),
        Paint()..color = palette.muted.withValues(alpha: .55),
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ChartPainter oldDelegate) => true;
}
