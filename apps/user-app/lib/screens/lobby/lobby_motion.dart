import 'package:flutter/material.dart';

/// A brief, tactile response shared by game tiles and table cards.
class LobbyPressMotion extends StatefulWidget {
  final Widget child;
  final bool enabled;

  const LobbyPressMotion({super.key, required this.child, this.enabled = true});

  @override
  State<LobbyPressMotion> createState() => _LobbyPressMotionState();
}

class _LobbyPressMotionState extends State<LobbyPressMotion> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed != value) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) => Listener(
    onPointerDown: widget.enabled ? (_) => _setPressed(true) : null,
    onPointerUp: (_) => _setPressed(false),
    onPointerCancel: (_) => _setPressed(false),
    child: AnimatedScale(
      scale: _pressed && widget.enabled ? .985 : 1,
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 120),
      curve: Curves.easeOutCubic,
      child: widget.child,
    ),
  );
}
