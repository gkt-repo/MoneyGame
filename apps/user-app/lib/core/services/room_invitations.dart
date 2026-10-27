import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../network/api_client.dart';

class RoomInvitations {
  static const website = 'https://mgame-1.web.app';
  static const _channel = MethodChannel('moneygame/share');
  static String link(String code) => '$website/join/${Uri.encodeComponent(code)}';
  static String message(String code) => 'Join my room: ${link(code)}\nLog in if asked. Room code: $code (filled in automatically).';

  /// Accept only our invitation routes, including the path-only route Flutter
  /// can deliver on startup. A link opens a preview; it never pays for a seat.
  static String? targetFromLink(String raw) {
    try {
      final uri = Uri.parse(raw);
      List<String> parts;
      if (uri.scheme == 'moneygame' && uri.host == 'join') {
        parts = ['join', ...uri.pathSegments];
      } else if ((uri.scheme == 'https' && uri.host == 'mgame-1.web.app' &&
                  uri.userInfo.isEmpty && (!uri.hasPort || uri.port == 443)) ||
                 (uri.scheme.isEmpty && !uri.hasAuthority && raw.startsWith('/'))) {
        parts = uri.pathSegments;
      } else { return null; }
      if (parts.length != 2 || parts[0] != 'join' ||
          !RegExp(r'^[A-Za-z0-9_-]{4,128}$').hasMatch(parts[1])) return null;
      return parts[1].toUpperCase().startsWith('R-') ? parts[1].toUpperCase() : parts[1];
    } on FormatException { return null; }
  }

  static Future<void> share(String code) async {
    try { await _channel.invokeMethod<void>('share', {'text': message(code)}); }
    on MissingPluginException { await Clipboard.setData(ClipboardData(text: message(code))); }
  }

  static Future<void> show(BuildContext context, RoomModel initial, String userId, VoidCallback refresh) async {
    var room = initial;
    var busy = false;
    var status = '';
    final host = room.players.any((p) => p.seatIndex == 0 && p.userId == userId);
    await showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (sheetContext) => StatefulBuilder(builder: (context, setState) {
      Future<void> perform(Future<void> Function() action, String success) async {
        setState(() { busy = true; status = ''; });
        try { await action(); if (context.mounted) setState(() => status = success); }
        catch (error) { if (context.mounted) setState(() => status = error.toString()); }
        finally { if (context.mounted) setState(() => busy = false); }
      }
      return SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('Invite friends · ${room.roomCode}', style: Theme.of(context).textTheme.titleMedium),
        const Text('Open the link to preview this room in the app or website. Log in if asked. Invitations expire after 24 hours.'),
        ListTile(title: const Text('Share website & code'), leading: const Icon(Icons.share), onTap: busy ? null : () => perform(() => share(room.roomCode), 'Invitation ready')),
        ListTile(title: const Text('Copy invitation'), leading: const Icon(Icons.link), onTap: busy ? null : () => perform(() => Clipboard.setData(ClipboardData(text: message(room.roomCode))), 'Copied')),
        ListTile(title: const Text('Copy room code'), leading: const Icon(Icons.copy), onTap: busy ? null : () => perform(() => Clipboard.setData(ClipboardData(text: room.roomCode)), 'Copied')),
        if (host && room.status == 'WAITING') ...[
          ListTile(title: const Text('New invitation'), subtitle: const Text('Invalidates previous links and codes'), onTap: busy ? null : () => perform(() async { room = await ApiClient.updateInvitation(room.id, 'RENEW'); refresh(); }, 'New invitation created')),
          ListTile(title: const Text('Revoke invitation'), onTap: busy ? null : () => perform(() async { room = await ApiClient.updateInvitation(room.id, 'REVOKE'); refresh(); }, 'Invitation revoked')),
        ],
        if (status.isNotEmpty) Text(status),
      ])));
    }));
  }
}
