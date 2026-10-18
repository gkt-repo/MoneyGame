import 'package:socket_io_client/socket_io_client.dart' as io;
import '../constants/api_constants.dart';

class SocketService {
  static io.Socket? _socket;

  static void connect(String userId, {
    Function(double balance)? onBalanceUpdated,
    Function(double balance)? onDepositApproved,
  }) {
    disconnect();

    _socket = io.io(
      ApiConstants.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .build(),
    );

    _socket?.connect();

    _socket?.onConnect((_) {
      _socket?.emit('join_user_channel', userId);
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
    _socket?.emit('join_room_channel', roomId);
  }

  static void leaveRoom(String roomId) {
    _socket?.emit('leave_room_channel', roomId);
  }

  static void on(String event, dynamic Function(dynamic) handler) {
    _socket?.on(event, handler);
  }

  static void off(String event) {
    _socket?.off(event);
  }

  static void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }
}
