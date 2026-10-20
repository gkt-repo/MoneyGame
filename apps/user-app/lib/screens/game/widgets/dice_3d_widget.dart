import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/constants/colors.dart';

class Dice3DWidget extends StatefulWidget {
  final bool isRolling;
  final int? targetNumber; // 1 to 10
  final int rollIndex;
  final bool isMatch;

  const Dice3DWidget({
    super.key,
    required this.isRolling,
    required this.targetNumber,
    required this.rollIndex,
    this.isMatch = false,
  });

  @override
  State<Dice3DWidget> createState() => _Dice3DWidgetState();
}

class _Dice3DWidgetState extends State<Dice3DWidget> with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _animation;

  double _startRotY = 0.0;
  double _endRotY = 0.0;
  double _startRotX = 0.22;
  double _endRotX = 0.22;
  double _translateY = 0.0;

  static const int totalFaces = 10;
  static const double faceWidth = 52.0;
  static const double faceHeight = 80.0;
  // Radius R = (faceWidth / 2) / tan(18 deg) ~ (26) / 0.3249 ~ 80.0
  static const double radius = 80.0;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );

    _animation = CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOutCubic,
    );

    _animation.addListener(_onAnimate);
    _animation.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        if (widget.isMatch) {
          HapticFeedback.heavyImpact();
        } else {
          HapticFeedback.mediumImpact();
        }
      }
    });

    _alignToTarget(widget.targetNumber ?? 7, immediate: true);
  }

  @override
  void didUpdateWidget(covariant Dice3DWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isRolling && !oldWidget.isRolling) {
      _startRolling();
    } else if (!widget.isRolling && (oldWidget.isRolling || widget.targetNumber != oldWidget.targetNumber)) {
      _alignToTarget(widget.targetNumber ?? 7, immediate: false);
    }
  }

  void _startRolling() {
    HapticFeedback.selectionClick();
    _startRotY = _endRotY;
    _startRotX = 0.22;

    final targetFace = widget.targetNumber ?? 7;
    // Calculate target angle: Face k is at (k - 1) * 36 deg.
    // So rotation by -((k - 1) * (2 * pi / 10)) brings it to front.
    const stepAngle = (2 * math.pi) / totalFaces;
    const spins = 4;
    _endRotY = _startRotY + (spins * 2 * math.pi) - ((targetFace - 1) * stepAngle);
    _endRotX = _startRotX + (spins * 2 * math.pi);

    _animController.forward(from: 0.0);
  }

  void _alignToTarget(int targetFace, {required bool immediate}) {
    const stepAngle = (2 * math.pi) / totalFaces;
    final alignedY = -((targetFace - 1) * stepAngle);

    if (immediate) {
      _startRotY = alignedY;
      _endRotY = alignedY;
      _startRotX = 0.22;
      _endRotX = 0.22;
      _translateY = 0.0;
      if (mounted) setState(() {});
    } else {
      _startRotY = _endRotY;
      _endRotY = alignedY;
      _startRotX = 0.22;
      _endRotX = 0.22;
      _animController.duration = const Duration(milliseconds: 500);
      _animController.forward(from: 0.0).then((_) {
        _animController.duration = const Duration(milliseconds: 1600);
      });
    }
  }

  void _onAnimate() {
    final t = _animation.value;
    // Leap up into the air and bounce on landing
    // Parabolic arc with bounce
    if (widget.isRolling) {
      final bounce = math.sin(t * math.pi);
      _translateY = -65.0 * bounce;
    } else {
      _translateY = 0.0;
    }
    setState(() {});
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = _animation.value;
    final currentRotY = _startRotY + (_endRotY - _startRotY) * t;
    final currentRotX = _startRotX + (_endRotX - _startRotX) * t;

    // Depth-sort the 10 faces so front-facing ones are rendered last (on top)
    const stepAngle = (2 * math.pi) / totalFaces;
    final faceIndices = List.generate(totalFaces, (i) => i + 1);

    // Calculate depth for each face
    final List<MapEntry<int, double>> faceDepths = faceIndices.map((faceNum) {
      final faceAngle = (faceNum - 1) * stepAngle + currentRotY;
      final depth = math.cos(faceAngle);
      return MapEntry(faceNum, depth);
    }).toList();

    // Sort ascending: deepest in back, highest depth (front) last
    faceDepths.sort((a, b) => a.value.compareTo(b.value));

    final isAirborne = widget.isRolling && _translateY < -15.0;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 180,
            width: 220,
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Table Felt Ambient Glow
                Container(
                  width: 150,
                  height: 150,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: widget.isMatch
                            ? const Color(0xFFF59E0B).withValues(alpha: 0.35)
                            : AppColors.emerald500.withValues(alpha: 0.2),
                        blurRadius: 40,
                        spreadRadius: 10,
                      ),
                    ],
                  ),
                ),

                // Ground Shadow Under Dice
                Positioned(
                  bottom: 18,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: isAirborne ? 65 : 100,
                    height: isAirborne ? 16 : 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.slate950.withValues(alpha: isAirborne ? 0.3 : 0.7),
                          blurRadius: isAirborne ? 12 : 6,
                          spreadRadius: isAirborne ? 1 : 4,
                        ),
                      ],
                    ),
                  ),
                ),

                // 3D 10-Faced Polyhedral Dice
                Transform(
                  alignment: Alignment.center,
                  transform: Matrix4.identity()
                    ..setEntry(3, 2, 0.0016) // 3D Perspective
                    ..setTranslationRaw(0.0, _translateY, 0.0)
                    ..rotateX(currentRotX)
                    ..rotateZ(-0.05),
                  child: SizedBox(
                    width: faceWidth,
                    height: faceHeight,
                    child: Stack(
                      alignment: Alignment.center,
                      clipBehavior: Clip.none,
                      children: [
                        // Top Decagonal Beveled Cap
                        Transform(
                          alignment: Alignment.center,
                          transform: Matrix4.identity()
                            ..rotateX(math.pi / 2)
                            ..setTranslationRaw(0.0, 0.0, faceHeight / 2),
                          child: Container(
                            width: faceWidth * 0.95,
                            height: faceWidth * 0.95,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: const RadialGradient(
                                colors: [Color(0xFFF59E0B), Color(0xFFB45309), Color(0xFF78350F)],
                              ),
                              border: Border.all(color: const Color(0xFFFEF08A), width: 2),
                            ),
                            child: const Center(
                              child: Text(
                                '★',
                                style: TextStyle(
                                  color: Color(0xFFFEF08A),
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ),

                        // Sorted 10 Faces
                        ...faceDepths.map((entry) {
                          final faceNum = entry.key;
                          final depth = entry.value;

                          // Backface culling: hide faces completely facing away
                          if (depth < -0.15) {
                            return const SizedBox.shrink();
                          }

                          final faceAngle = (faceNum - 1) * stepAngle + currentRotY;
                          final isTarget = widget.targetNumber == faceNum;

                          return Transform(
                            alignment: Alignment.center,
                            transform: Matrix4.identity()
                              ..rotateY(faceAngle)
                              ..setTranslationRaw(0.0, 0.0, radius),
                            child: _buildDiceFace(faceNum, isTarget, depth),
                          );
                        }),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Roll Index Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.slate900,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.slate700),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: const BoxDecoration(
                    color: AppColors.emerald500,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  'ROLL #${widget.rollIndex} | 10-DIGIT 3D DICE',
                  style: const TextStyle(
                    color: AppColors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDiceFace(int faceNum, bool isTarget, double depth) {
    final isMatch = isTarget && widget.isMatch;
    // Dim faces slightly as they curve away from the camera for realistic 3D lighting
    final opacity = (depth * 0.5 + 0.5).clamp(0.4, 1.0);

    return Opacity(
      opacity: opacity,
      child: Container(
        width: faceWidth,
        height: faceHeight,
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: isMatch
                ? const [Color(0xFFF59E0B), Color(0xFFD97706), Color(0xFF92400E)]
                : isTarget
                    ? const [Color(0xFF10B981), Color(0xFF059669), Color(0xFF064E3B)]
                    : const [Color(0xFF047857), Color(0xFF065F46), Color(0xFF022C22)],
          ),
          border: Border.all(
            color: isMatch
                ? const Color(0xFFFEF08A)
                : isTarget
                    ? const Color(0xFF6EE7B7)
                    : const Color(0xFFFBBF24).withValues(alpha: 0.75),
            width: isTarget ? 2.0 : 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: isMatch
                  ? const Color(0xFFF59E0B).withValues(alpha: 0.6)
                  : Colors.black.withValues(alpha: 0.4),
              blurRadius: isMatch ? 8 : 4,
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Top Star Indicator
            Text(
              '✦ $faceNum ✦',
              style: TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w900,
                color: isMatch ? const Color(0xFFFEF08A) : AppColors.emerald100,
              ),
            ),

            // Number (1 to 10)
            Text(
              '$faceNum',
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: faceNum == 10 ? 22 : 26,
                fontWeight: FontWeight.w900,
                color: isMatch ? Colors.white : const Color(0xFFFDE68A),
                shadows: const [
                  Shadow(
                    color: Colors.black87,
                    offset: Offset(0, 2),
                    blurRadius: 4,
                  ),
                ],
              ),
            ),

            // Bottom Pip Accent
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 5,
                  height: 5,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isMatch ? const Color(0xFFFEF08A) : const Color(0xFFFBBF24),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
