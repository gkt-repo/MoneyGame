import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../constants/api_constants.dart';
import '../network/admin_api_client.dart';

class CashDeskUpdates {
  final Future<void> Function() refresh;
  io.Socket? _socket;
  Timer? _timer;
  bool _disposed = false;
  bool _refreshing = false;
  CashDeskUpdates(this.refresh) {
    _connect();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _refresh());
  }
  Future<void> _refresh() async {
    if (_disposed || _refreshing) return;
    _refreshing = true;
    try { await refresh(); } finally { _refreshing = false; }
  }
  Future<void> _connect() async {
    try {
      final token = await AdminApiClient.getValidAccessToken();
      if (_disposed || token == null) return;
      _socket?.dispose();
      _socket = io.io(ApiConstants.socketUrl.replaceAll(RegExp(r'/api/?$'), ''),
        io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).disableAutoConnect().enableForceNew().build());
      _socket!.on('cash_desk_updated', (_) => _refresh());
      _socket!.onDisconnect((reason) { if (!_disposed && reason == 'io server disconnect') _connect(); });
      _socket!.connect();
    } catch (_) { /* Authenticated polling recovers on the next interval. */ }
  }
  void dispose() { _disposed = true; _timer?.cancel(); _socket?.dispose(); }
}
