import 'dart:math';
import 'package:flutter/material.dart';

class FlyingChipEvent {
  final Offset start;
  final Offset end;
  final int count;
  final VoidCallback? onComplete;

  FlyingChipEvent({
    required this.start,
    required this.end,
    this.count = 4,
    this.onComplete,
  });
}

class FlyingChipsOverlay extends StatefulWidget {
  final FlyingChipEvent? event;

  const FlyingChipsOverlay({super.key, this.event});

  @override
  State<FlyingChipsOverlay> createState() => FlyingChipsOverlayState();
}

class FlyingChipsOverlayState extends State<FlyingChipsOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  FlyingChipEvent? _currentEvent;
  final List<double> _randomOffsets = [];

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 650),
    )..addListener(() => setState(() {}));

    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _currentEvent?.onComplete?.call();
        setState(() {
          _currentEvent = null;
        });
      }
    });

    if (widget.event != null) {
      animateChips(widget.event!);
    }
  }

  void animateChips(FlyingChipEvent event) {
    _currentEvent = event;
    _randomOffsets.clear();
    final rnd = Random();
    for (int i = 0; i < event.count; i++) {
      _randomOffsets.add((rnd.nextDouble() - 0.5) * 20);
    }
    _controller.forward(from: 0.0);
  }

  @override
  void didUpdateWidget(covariant FlyingChipsOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.event != null && widget.event != oldWidget.event) {
      animateChips(widget.event!);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_currentEvent == null || !_controller.isAnimating) {
      return const SizedBox.shrink();
    }

    final t = CurvedAnimation(parent: _controller, curve: Curves.easeOutQuad).value;
    final start = _currentEvent!.start;
    final end = _currentEvent!.end;

    return IgnorePointer(
      child: Stack(
        children: List.generate(_currentEvent!.count, (idx) {
          // Staggered departure
          final delay = idx * 0.08;
          final localT = ((t - delay) / (1.0 - delay)).clamp(0.0, 1.0);

          if (localT <= 0.0) return const SizedBox.shrink();

          // Curved Arc interpolation
          final curX = start.dx + (end.dx - start.dx) * localT;
          final arcHeight = -40 * sin(localT * pi);
          final curY = start.dy + (end.dy - start.dy) * localT + arcHeight;

          final offsetJitter = _randomOffsets.length > idx ? _randomOffsets[idx] : 0.0;

          return Positioned(
            left: curX + offsetJitter * (1.0 - localT) - 9,
            top: curY - 9,
            child: Opacity(
              opacity: (1.0 - localT * 0.2).clamp(0.0, 1.0),
              child: Image.asset(
                'assets/game/teen_patti/gold_coin.png',
                width: 18,
                height: 18,
                errorBuilder: (context, error, stackTrace) => const Icon(
                  Icons.monetization_on,
                  size: 16,
                  color: Color(0xFFFFD700),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}
