import 'package:socket_io_client/socket_io_client.dart' as io;
import '../constants/api_constants.dart';
import 'api_client.dart';

class SocketService {
  static io.Socket? _socket;
  static final Set<String> _rooms = {};

  static void connect(String userId, {
    Function(double balance)? onBalanceUpdated,
    Function(double balance)? onDepositApproved,
  }) {
    disconnect();

    _socket = io.io(
      ApiConstants.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuthFn((callback) async {
            try { callback({'token': await ApiClient.getValidAccessToken()}); }
            catch (_) { callback({}); }
          })
          .disableAutoConnect()
          .build(),
    );

    _socket?.connect();

    _socket?.onConnect((_) {
      _socket?.emit('join_user_channel', userId);
      for (final roomId in _rooms) { _socket?.emit('join_room_channel', roomId); }
    });

    final currentSocket = _socket;
    _socket?.onDisconnect((reason) {
      if (reason == 'io server disconnect' && identical(_socket, currentSocket)) currentSocket?.connect();
    });
    bool refreshing = false;
    _socket?.onConnectError((error) async {
      if (refreshing || !identical(_socket, currentSocket)) return;
      if (error is! Map || error['data']?['code'] != 'AUTH_REQUIRED') return;
      refreshing = true;
      try {
        if (await ApiClient.getValidAccessToken(forceRefresh: true) != null && identical(_socket, currentSocket)) currentSocket?.connect();
      } catch (_) { /* HTTP requests display session errors. */ }
      finally { refreshing = false; }
    });

    _socket?.on('balance_updated', (data) {
      if (data != null && data['balance'] != null) {
        final bal = (data['balance'] as num).toDouble();
        onBalanceUpdated?.call(bal);
      }
    });

    _socket?.on('wallet_updated', (data) {
      if (data != null && data['balance'] != null) {
        final bal = (data['balance'] as num).toDouble();
        onBalanceUpdated?.call(bal);
      }
    });

    _socket?.on('deposit_approved', (data) {
      if (data != null && data['balance'] != null) {
        final bal = (data['balance'] as num).toDouble();
        onDepositApproved?.call(bal);
      }
    });
  }

  static io.Socket? get socket => _socket;

  static void joinRoom(String roomId) {
    _rooms.add(roomId);
    _socket?.emit('join_room_channel', roomId);
  }

  static void leaveRoom(String roomId) {
    _rooms.remove(roomId);
    _socket?.emit('leave_room_channel', roomId);
  }

  static void on(String event, dynamic Function(dynamic) handler) {
    _socket?.on(event, handler);
  }

  static void off(String event) {
    _socket?.off(event);
  }

  static void disconnect() {
    _rooms.clear();
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }
}
