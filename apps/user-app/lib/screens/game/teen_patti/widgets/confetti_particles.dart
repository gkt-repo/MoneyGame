import 'dart:math';
import 'package:flutter/material.dart';

class ConfettiParticle {
  double x;
  double y;
  double vx;
  double vy;
  double size;
  Color color;
  double rotation;
  double rotationSpeed;
  double opacity;

  ConfettiParticle({
    required this.x,
    required this.y,
    required this.vx,
    required this.vy,
    required this.size,
    required this.color,
    required this.rotation,
    required this.rotationSpeed,
    required this.opacity,
  });
}

class ConfettiCelebrationOverlay extends StatefulWidget {
  final VoidCallback? onFinished;

  const ConfettiCelebrationOverlay({super.key, this.onFinished});

  @override
  State<ConfettiCelebrationOverlay> createState() => _ConfettiCelebrationOverlayState();
}

class _ConfettiCelebrationOverlayState extends State<ConfettiCelebrationOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  final List<ConfettiParticle> _particles = [];
  final Random _rnd = Random();

  final List<Color> _colors = const [
    Color(0xFFFFD700), // Gold
    Color(0xFFFFA500), // Orange
    Color(0xFFFF3B30), // Red
    Color(0xFF34C759), // Green
    Color(0xFF007AFF), // Blue
    Color(0xFFAF52DE), // Purple
    Color(0xFFFFFFFF), // White
  ];

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3500),
    )..addListener(_updateParticles);

    _initParticles();
    _controller.forward().then((_) {
      if (mounted) widget.onFinished?.call();
    });
  }

  void _initParticles() {
    _particles.clear();
    for (int i = 0; i < 90; i++) {
      final angle = _rnd.nextDouble() * 2 * pi;
      final speed = _rnd.nextDouble() * 6 + 3;
      _particles.add(
        ConfettiParticle(
          x: 0.5,
          y: 0.45,
          vx: cos(angle) * speed * 0.003,
          vy: sin(angle) * speed * 0.003 - 0.003,
          size: _rnd.nextDouble() * 8 + 6,
          color: _colors[_rnd.nextInt(_colors.length)],
          rotation: _rnd.nextDouble() * 2 * pi,
          rotationSpeed: (_rnd.nextDouble() - 0.5) * 0.2,
          opacity: 1.0,
        ),
      );
    }
  }

  void _updateParticles() {
    final progress = _controller.value;
    for (final p in _particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.00015; // Gravity
      p.rotation += p.rotationSpeed;
      if (progress > 0.6) {
        p.opacity = ((1.0 - progress) / 0.4).clamp(0.0, 1.0);
      }
    }
    setState(() {});
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: CustomPaint(
        size: Size.infinite,
        painter: _ConfettiPainter(_particles),
      ),
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  final List<ConfettiParticle> particles;

  _ConfettiPainter(this.particles);

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in particles) {
      if (p.opacity <= 0) continue;

      final paint = Paint()
        ..color = p.color.withValues(alpha: p.opacity)
        ..style = PaintingStyle.fill;

      canvas.save();
      canvas.translate(p.x * size.width, p.y * size.height);
      canvas.rotate(p.rotation);

      // Draw rectangular confetti or round gold coin
      if (p.size > 10) {
        // Gold coin star
        canvas.drawCircle(Offset.zero, p.size * 0.4, paint);
      } else {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(center: Offset.zero, width: p.size, height: p.size * 0.6),
            const Radius.circular(2),
          ),
          paint,
        );
      }
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter oldDelegate) => true;
}
