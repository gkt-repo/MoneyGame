import 'package:flutter/material.dart';

class TeenPattiFeltTable extends StatelessWidget {
  final double bootAmount;
  final double currentChaalAmount;
  final double pot;
  final Widget? centerPotWidget;

  const TeenPattiFeltTable({
    super.key,
    required this.bootAmount,
    required this.currentChaalAmount,
    required this.pot,
    this.centerPotWidget,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final h = constraints.maxHeight;

        // Table dimensions (centered with margins for seats)
        final tableW = w * 0.72;
        final tableH = h * 0.62;
        final tableLeft = (w - tableW) / 2;
        final tableTop = h * 0.17;

        return Stack(
          children: [
            // 1. Dealer Character at top center
            Positioned(
              top: h * 0.01,
              left: (w - 150) / 2,
              width: 150,
              height: 120,
              child: Image.asset(
                'assets/game/teen_patti/dealer.png',
                fit: BoxFit.contain,
                errorBuilder: (context, error, stackTrace) => const SizedBox(),
              ),
            ),

            // 2. Custom Painted Kidney Oval Table Felt
            Positioned(
              left: tableLeft,
              top: tableTop,
              width: tableW,
              height: tableH,
              child: CustomPaint(
                painter: _KidneyTablePainter(),
                child: SizedBox(
                  width: tableW,
                  height: tableH,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      // Table felt stakes info text
                      Positioned(
                        top: tableH * 0.18,
                        child: Text(
                          'Boot: ${bootAmount.toStringAsFixed(0)}    '
                          'Chaal Limit: ${(bootAmount * 128).toStringAsFixed(0)}    '
                          'Pot Limit: ${(bootAmount * 1024).toStringAsFixed(0)}',
                          style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: (tableH * 0.038).clamp(9.0, 13.0),
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.5,
                            color: const Color(0xFFFFD180).withValues(alpha: 0.8),
                            shadows: const [
                              Shadow(color: Colors.black, blurRadius: 4, offset: Offset(0, 1)),
                            ],
                          ),
                        ),
                      ),

                      // Center Pot Display
                      Positioned(
                        top: tableH * 0.38,
                        child: centerPotWidget ?? _defaultPotWidget(),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _defaultPotWidget() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF28070F).withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFFC107).withValues(alpha: 0.6), width: 1),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFFFB300).withValues(alpha: 0.25),
            blurRadius: 10,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset(
            'assets/game/teen_patti/gold_coin.png',
            width: 18,
            height: 18,
            errorBuilder: (context, error, stackTrace) => const Icon(
              Icons.monetization_on,
              size: 16,
              color: Color(0xFFFFD700),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            pot.toStringAsFixed(0),
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 15,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              shadows: [
                Shadow(color: Colors.black, blurRadius: 3, offset: Offset(0, 1)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _KidneyTablePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;

    // Kidney-shaped / Oval Table Path
    final path = _createTablePath(size);

    // 1. Drop shadow beneath table
    canvas.drawShadow(path, Colors.black.withValues(alpha: 0.8), 16, true);

    // 2. Leather Cushion Outer Armrest (Dark Charcoal / Brown Leather)
    final leatherPaint = Paint()
      ..shader = const RadialGradient(
        center: Alignment(0, 0.2),
        radius: 0.9,
        colors: [
          Color(0xFF2A2A2E),
          Color(0xFF1E1E22),
          Color(0xFF101014),
        ],
      ).createShader(rect);

    canvas.drawPath(path, leatherPaint);

    // 3. Golden Beveled Inner Rim
    final rimPath = _createTablePath(size, inset: size.height * 0.05);

    // Golden metallic glow
    final glowPaint = Paint()
      ..shader = const SweepGradient(
        colors: [
          Color(0xFFFFD54F),
          Color(0xFFFF8F00),
          Color(0xFFFFE082),
          Color(0xFFFF8F00),
          Color(0xFFFFD54F),
        ],
      ).createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.height * 0.02;

    canvas.drawPath(rimPath, glowPaint);

    // 4. Velvet Felt Interior (Ruby / Crimson Casino Red)
    final feltPath = _createTablePath(size, inset: size.height * 0.06);

    final feltPaint = Paint()
      ..shader = const RadialGradient(
        center: Alignment(0, 0.1),
        radius: 0.75,
        colors: [
          Color(0xFF9E182B), // Bright ruby center
          Color(0xFF7A0F1F),
          Color(0xFF4E0813), // Deep crimson edge
        ],
      ).createShader(rect)
      ..style = PaintingStyle.fill;

    canvas.drawPath(feltPath, feltPaint);

    // 5. Delicate Red Betting Line on Felt
    final dividerPath = _createTablePath(size, inset: size.height * 0.13);
    final dividerPaint = Paint()
      ..color = const Color(0xFFC2185B).withValues(alpha: 0.45)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    canvas.drawPath(dividerPath, dividerPaint);

    // 6. Center dealer separator line
    final linePaint = Paint()
      ..color = const Color(0xFFC2185B).withValues(alpha: 0.35)
      ..strokeWidth = 1.2;

    final cx = size.width / 2;
    canvas.drawLine(
      Offset(cx, size.height * 0.06),
      Offset(cx, size.height * 0.24),
      linePaint,
    );
  }

  Path _createTablePath(Size size, {double inset = 0}) {
    final w = size.width - inset * 2;
    final h = size.height - inset * 2;
    final left = inset;
    final top = inset;
    final right = left + w;
    final bottom = top + h;
    final radius = h * 0.45;

    final path = Path();

    // Start at top-left
    path.moveTo(left + radius, top);

    // Top edge with slight dealer alcove indentation in the center
    final midX = left + w / 2;
    final alcoveWidth = w * 0.28;
    final alcoveDepth = h * 0.09;

    path.lineTo(midX - alcoveWidth / 2, top);

    // Subtle smooth curve inward for dealer
    path.cubicTo(
      midX - alcoveWidth * 0.3,
      top + alcoveDepth,
      midX + alcoveWidth * 0.3,
      top + alcoveDepth,
      midX + alcoveWidth / 2,
      top,
    );

    // Top right
    path.lineTo(right - radius, top);

    // Right rounded semicircle
    path.arcToPoint(
      Offset(right, top + radius),
      radius: Radius.circular(radius),
    );
    path.arcToPoint(
      Offset(right - radius, bottom),
      radius: Radius.circular(radius),
    );

    // Bottom edge
    path.lineTo(left + radius, bottom);

    // Left rounded semicircle
    path.arcToPoint(
      Offset(left, bottom - radius),
      radius: Radius.circular(radius),
    );
    path.arcToPoint(
      Offset(left + radius, top),
      radius: Radius.circular(radius),
    );

    path.close();
    return path;
  }

  @override
  bool shouldRepaint(covariant _KidneyTablePainter oldDelegate) => false;
}
