import 'dart:convert';
import 'package:dio/dio.dart';
import 'authenticated_client.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';

class UserProfileModel {
  final String id;
  final String username;
  final String? displayName;
  final String? avatar;
  final String? phone;
  final String? email;
  final String role;
  final String status;
  final double balance;
  final DateTime? createdAt;

  UserProfileModel({
    required this.id,
    required this.username,
    this.displayName,
    this.avatar,
    this.phone,
    this.email,
    required this.role,
    required this.status,
    this.balance = 0.0,
    this.createdAt,
  });

  UserProfileModel copyWith({
    String? id,
    String? username,
    String? displayName,
    String? avatar,
    String? phone,
    String? email,
    String? role,
    String? status,
    double? balance,
    DateTime? createdAt,
  }) {
    return UserProfileModel(
      id: id ?? this.id,
      username: username ?? this.username,
      displayName: displayName ?? this.displayName,
      avatar: avatar ?? this.avatar,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      role: role ?? this.role,
      status: status ?? this.status,
      balance: balance ?? this.balance,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  factory UserProfileModel.fromJson(Map<String, dynamic> json) {
    double bal = 0.0;
    if (json['wallet'] != null) {
      bal = (json['wallet']['balance'] as num?)?.toDouble() ?? 0.0;
    }
    DateTime? created;
    if (json['createdAt'] != null) {
      try {
        created = DateTime.parse(json['createdAt']);
      } catch (_) {}
    }
    return UserProfileModel(
      id: json['id'] ?? '',
      username: json['username'] ?? '',
      displayName: json['displayName'] ?? json['username'],
      avatar: json['avatar'] ?? 'avatar_1',
      phone: json['phone'],
      email: json['email'],
      role: json['role'] ?? 'USER',
      status: json['status'] ?? 'ACTIVE',
      balance: bal,
      createdAt: created,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'displayName': displayName,
        'avatar': avatar,
        'phone': phone,
        'email': email,
        'role': role,
        'status': status,
        'balance': balance,
        if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
      };
}

class UserStatsModel {
  final int totalGames;
  final int totalWins;
  final double winRatePercent;
  final Map<String, GameStatsModel> byGame;

  UserStatsModel({
    required this.totalGames,
    required this.totalWins,
    required this.winRatePercent,
    required this.byGame,
  });

  factory UserStatsModel.fromJson(Map<String, dynamic> json) {
    Map<String, GameStatsModel> games = {};
    if (json['byGame'] != null && json['byGame'] is Map) {
      (json['byGame'] as Map).forEach((k, v) {
        games[k.toString()] = GameStatsModel.fromJson(Map<String, dynamic>.from(v));
      });
    }
    return UserStatsModel(
      totalGames: json['totalGames'] ?? 0,
      totalWins: json['totalWins'] ?? 0,
      winRatePercent: (json['winRatePercent'] as num?)?.toDouble() ?? 0.0,
      byGame: games,
    );
  }
}

class GameStatsModel {
  final int played;
  final int won;
  final double winRatePercent;

  GameStatsModel({
    required this.played,
    required this.won,
    required this.winRatePercent,
  });

  factory GameStatsModel.fromJson(Map<String, dynamic> json) {
    return GameStatsModel(
      played: json['played'] ?? 0,
      won: json['won'] ?? 0,
      winRatePercent: (json['winRatePercent'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class RecentGameModel {
  final String roomId;
  final String roomCode;
  final String gameType;
  final double entryFee;
  final bool isWin;
  final double prize;
  final String settledAt;

  RecentGameModel({
    required this.roomId,
    required this.roomCode,
    required this.gameType,
    required this.entryFee,
    required this.isWin,
    required this.prize,
    required this.settledAt,
  });

  factory RecentGameModel.fromJson(Map<String, dynamic> json) {
    return RecentGameModel(
      roomId: json['roomId'] ?? '',
      roomCode: json['roomCode'] ?? '',
      gameType: json['gameType'] ?? '',
      entryFee: (json['entryFee'] as num?)?.toDouble() ?? 0.0,
      isWin: json['isWin'] ?? false,
      prize: (json['prize'] as num?)?.toDouble() ?? 0.0,
      settledAt: json['settledAt'] ?? '',
    );
  }
}

class UserProfileDetailModel {
  final String id;
  final String username;
  final String displayName;
  final String avatar;
  final String? phone;
  final String? email;
  final String role;
  final String status;
  final String createdAt;
  final UserStatsModel stats;
  final List<RecentGameModel> recentGames;

  UserProfileDetailModel({
    required this.id,
    required this.username,
    required this.displayName,
    required this.avatar,
    this.phone,
    this.email,
    required this.role,
    required this.status,
    required this.createdAt,
    required this.stats,
    required this.recentGames,
  });

  factory UserProfileDetailModel.fromJson(Map<String, dynamic> json) {
    var rawRecent = json['recentGames'] as List? ?? [];
    return UserProfileDetailModel(
      id: json['id'] ?? '',
      username: json['username'] ?? '',
      displayName: json['displayName'] ?? json['username'] ?? '',
      avatar: json['avatar'] ?? 'avatar_1',
      phone: json['phone'],
      email: json['email'],
      role: json['role'] ?? 'USER',
      status: json['status'] ?? 'ACTIVE',
      createdAt: json['createdAt'] ?? '',
      stats: json['stats'] != null
          ? UserStatsModel.fromJson(Map<String, dynamic>.from(json['stats']))
          : UserStatsModel(totalGames: 0, totalWins: 0, winRatePercent: 0, byGame: {}),
      recentGames: rawRecent.map((g) => RecentGameModel.fromJson(Map<String, dynamic>.from(g))).toList(),
    );
  }
}

class PublicProfileModel {
  final String id;
  final String username;
  final String displayName;
  final String avatar;
  final String createdAt;
  final UserStatsModel stats;

  PublicProfileModel({
    required this.id,
    required this.username,
    required this.displayName,
    required this.avatar,
    required this.createdAt,
    required this.stats,
  });

  factory PublicProfileModel.fromJson(Map<String, dynamic> json) {
    return PublicProfileModel(
      id: json['id'] ?? '',
      username: json['username'] ?? '',
      displayName: json['displayName'] ?? json['username'] ?? '',
      avatar: json['avatar'] ?? 'avatar_1',
      createdAt: json['createdAt'] ?? '',
      stats: json['stats'] != null
          ? UserStatsModel.fromJson(Map<String, dynamic>.from(json['stats']))
          : UserStatsModel(totalGames: 0, totalWins: 0, winRatePercent: 0, byGame: {}),
    );
  }
}

class RoomPreviewPlayerModel {
  final String userId;
  final String username;
  final String displayName;
  final String avatar;
  final int seatIndex;

  RoomPreviewPlayerModel({
    required this.userId,
    required this.username,
    required this.displayName,
    required this.avatar,
    required this.seatIndex,
  });

  factory RoomPreviewPlayerModel.fromJson(Map<String, dynamic> json) {
    return RoomPreviewPlayerModel(
      userId: json['userId'] ?? '',
      username: json['username'] ?? '',
      displayName: json['displayName'] ?? json['username'] ?? '',
      avatar: json['avatar'] ?? 'avatar_1',
      seatIndex: json['seatIndex'] ?? 0,
    );
  }
}

class RoomPreviewModel {
  final bool available;
  final String? unavailabilityReason;
  final String? rulesSummary;
  final List<int> takenNumbers;
  final List<String> teams;
  final String id;
  final String roomCode;
  final String gameType;
  final double entryFee;
  final int maxPlayers;
  final int occupiedSeats;
  final bool isPrivate;
  final String status;
  final bool isFull;
  final String hostUsername;
  final String hostDisplayName;
  final String hostAvatar;
  final List<RoomPreviewPlayerModel> players;

  int get availableSeats => maxPlayers - occupiedSeats;

  RoomPreviewModel({
    this.available = false, this.unavailabilityReason, this.rulesSummary,
    this.takenNumbers = const [], this.teams = const [],
    required this.id,
    required this.roomCode,
    required this.gameType,
    required this.entryFee,
    required this.maxPlayers,
    required this.occupiedSeats,
    required this.isPrivate,
    required this.status,
    required this.isFull,
    required this.hostUsername,
    required this.hostDisplayName,
    required this.hostAvatar,
    required this.players,
  });

  factory RoomPreviewModel.fromJson(Map<String, dynamic> json) {
    var rawPlayers = json['players'] as List? ?? [];
    return RoomPreviewModel(
      available: json['available'] == true, unavailabilityReason: json['unavailabilityReason'], rulesSummary: json['rulesSummary'],
      takenNumbers: List<int>.from(json['takenNumbers'] ?? []), teams: List<String>.from(json['teams'] ?? []),
      id: json['id'] ?? '',
      roomCode: json['roomCode'] ?? '',
      gameType: json['gameType'] ?? '',
      entryFee: (json['entryFee'] as num?)?.toDouble() ?? 0.0,
      maxPlayers: json['maxPlayers'] ?? 0,
      occupiedSeats: json['occupiedSeats'] ?? 0,
      isPrivate: json['isPrivate'] ?? false,
      status: json['status'] ?? '',
      isFull: json['isFull'] ?? false,
      hostUsername: json['host']?['username'] ?? '',
      hostDisplayName: json['host']?['displayName'] ?? json['host']?['username'] ?? '',
      hostAvatar: json['host']?['avatar'] ?? 'avatar_1',
      players: rawPlayers.map((p) => RoomPreviewPlayerModel.fromJson(Map<String, dynamic>.from(p))).toList(),
    );
  }
}

class DepositResponseModel {
  final bool success;
  final String depositId;
  final double totalAmount;
  final double baseAmount;
  final int offsetPaise;
  final String receivingUpi;
  final String upiDeepLink;
  final String qrCodeUrl;

  DepositResponseModel({
    required this.success,
    required this.depositId,
    required this.totalAmount,
    required this.baseAmount,
    required this.offsetPaise,
    required this.receivingUpi,
    required this.upiDeepLink,
    required this.qrCodeUrl,
  });

  factory DepositResponseModel.fromJson(Map<String, dynamic> json) {
    return DepositResponseModel(
      success: json['success'] ?? true,
      depositId: json['depositId'] ?? '',
      totalAmount: (json['totalAmount'] as num).toDouble(),
      baseAmount: (json['baseAmount'] as num).toDouble(),
      offsetPaise: json['offsetPaise'] ?? 0,
      receivingUpi: json['receivingUpi'] ?? '',
      upiDeepLink: json['upiDeepLink'] ?? '',
      qrCodeUrl: json['qrCodeUrl'] ?? '',
    );
  }
}

class RoomModel {
  final String id;
  final String roomCode;
  final String gameType;
  final double entryFee;
  final int maxPlayers;
  final String status;
  final int? winningNumber;
  final double? winnerPrize;
  final String? winnerId;
  final String? winnerUsername;
  final bool isPrivate;
  final String? invitationToken;
  final List<RoomPlayerModel> players;
  final Map<String, dynamic>? gameState;
  final dynamic customConfig;

  RoomModel({
    required this.id,
    required this.roomCode,
    this.gameType = 'GUESS_NUMBER',
    required this.entryFee,
    required this.maxPlayers,
    required this.status,
    this.winningNumber,
    this.winnerPrize,
    this.winnerId,
    this.winnerUsername,
    this.isPrivate = false,
    this.invitationToken,
    required this.players,
    this.gameState,
    this.customConfig,
  });

  factory RoomModel.fromJson(Map<String, dynamic> json) {
    var rawPlayers = json['players'] as List? ?? [];
    List<RoomPlayerModel> parsedPlayers =
        rawPlayers.map((p) => RoomPlayerModel.fromJson(p)).toList();

    dynamic rawConfig = json['customConfig'];
    Map<String, dynamic>? parsedConfig;
    if (rawConfig is Map) {
      parsedConfig = Map<String, dynamic>.from(rawConfig);
    } else if (rawConfig is String) {
      try {
        parsedConfig = Map<String, dynamic>.from(jsonDecode(rawConfig));
      } catch (_) {}
    }

    return RoomModel(
      id: json['id'] ?? '',
      roomCode: json['roomCode'] ?? '',
      gameType: json['gameType'] ?? 'GUESS_NUMBER',
      entryFee: (json['entryFee'] as num).toDouble(),
      maxPlayers: json['maxPlayers'] ?? 2,
      status: json['status'] ?? 'WAITING',
      winningNumber: json['winningNumber'],
      winnerPrize: (json['winnerPrize'] as num?)?.toDouble(),
      winnerId: json['winnerId'],
      winnerUsername: json['winner']?['username'],
      isPrivate: json['isPrivate'] ?? false,
      invitationToken: json['invitationToken'],
      players: parsedPlayers,
      gameState: json['gameState'] != null ? Map<String, dynamic>.from(json['gameState']) : null,
      customConfig: parsedConfig ?? rawConfig,
    );
  }
}

class RoomPlayerModel {
  final String id;
  final String userId;
  final String username;
  final String displayName;
  final String avatar;
  final int seatIndex;
  final int? guessNumber;

  RoomPlayerModel({
    required this.id,
    required this.userId,
    required this.username,
    required this.displayName,
    this.avatar = 'avatar_1',
    this.seatIndex = 0,
    this.guessNumber,
  });

  factory RoomPlayerModel.fromJson(Map<String, dynamic> json) {
    final rawUser = json['user'];
    final uname = rawUser?['username'] ?? 'Player';
    final dname = rawUser?['displayName'] ?? uname;
    final av = rawUser?['avatar'] ?? 'avatar_1';

    return RoomPlayerModel(
      id: json['id'] ?? '',
      userId: json['userId'] ?? '',
      username: uname,
      displayName: dname,
      avatar: av,
      seatIndex: json['seatIndex'] ?? 0,
      guessNumber: json['guessNumber'],
    );
  }
}

class TransactionModel {
  final String id;
  final String userId;
  final double amount;
  final String type;
  final String? referenceId;
  final String? description;
  final DateTime createdAt;

  TransactionModel({
    required this.id,
    required this.userId,
    required this.amount,
    required this.type,
    this.referenceId,
    this.description,
    required this.createdAt,
  });

  factory TransactionModel.fromJson(Map<String, dynamic> json) {
    return TransactionModel(
      id: json['id'] ?? '',
      userId: json['userId'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      type: json['type'] ?? 'UNKNOWN',
      referenceId: json['referenceId'],
      description: json['description'],
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt']).toLocal()
          : DateTime.now(),
    );
  }
}

class NotificationItemModel {
  final String id;
  final String userId;
  final String title;
  final String message;
  final String type;
  final bool isRead;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;

  NotificationItemModel({
    required this.id,
    required this.userId,
    required this.title,
    required this.message,
    required this.type,
    required this.isRead,
    this.metadata,
    required this.createdAt,
  });

  factory NotificationItemModel.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? meta;
    if (json['metadata'] != null) {
      if (json['metadata'] is Map) {
        meta = Map<String, dynamic>.from(json['metadata']);
      } else if (json['metadata'] is String) {
        try {
          meta = Map<String, dynamic>.from(jsonDecode(json['metadata']));
        } catch (_) {}
      }
    }
    return NotificationItemModel(
      id: json['id'] ?? '',
      userId: json['userId'] ?? '',
      title: json['title'] ?? '',
      message: json['message'] ?? '',
      type: json['type'] ?? 'SYSTEM',
      isRead: json['isRead'] ?? false,
      metadata: meta,
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt']).toLocal()
          : DateTime.now(),
    );
  }

  NotificationItemModel copyWith({bool? isRead}) {
    return NotificationItemModel(
      id: id,
      userId: userId,
      title: title,
      message: message,
      type: type,
      isRead: isRead ?? this.isRead,
      metadata: metadata,
      createdAt: createdAt,
    );
  }
}

class ApiClient {
  static Future<dynamic> trading(String path, {Map<String, dynamic>? body}) async {
    final response = body == null
        ? await _dio.get<dynamic>('/trading$path')
        : await _dio.post<dynamic>('/trading$path', data: body);
    return response.data;
  }
  static final _session = AuthenticatedClient(
    baseUrl: () => ApiConstants.baseUrl,
    refreshPath: '/v1/auth/refresh-token',
    readAccessToken: SecureStorageService.getAccessToken,
    readRefreshToken: SecureStorageService.getRefreshToken,
    saveTokens: SecureStorageService.saveTokens,
    clearSession: SecureStorageService.clearSession,
  );
  static final Dio _dio = _session.dio;
  static void init() {}
  static Future<String?> getValidAccessToken({bool forceRefresh = false}) =>
      _session.validAccessToken(forceRefresh: forceRefresh);

  static String _extractDioError(DioException e, {required String defaultMessage}) {
    if (e.response?.data != null) {
      if (e.response!.data is Map && e.response!.data['error'] != null) {
        return e.response!.data['error'].toString();
      }
      if (e.response!.data is String) {
        try {
          final decoded = jsonDecode(e.response!.data as String);
          if (decoded is Map && decoded['error'] != null) {
            return decoded['error'].toString();
          }
        } catch (_) {}
      }
    }
    if (e.type == DioExceptionType.receiveTimeout) {
      return 'Server response timed out. If your account was already created, please try signing in.';
    }
    if (e.type == DioExceptionType.connectionTimeout) {
      return 'Connection timed out. Please check your internet connection.';
    }
    if (e.type == DioExceptionType.sendTimeout) {
      return 'Send request timed out. Please check your internet connection.';
    }
    if (e.type == DioExceptionType.connectionError) {
      return 'Unable to connect to game servers. Please check your internet connection.';
    }
    return e.message?.isNotEmpty == true ? e.message! : defaultMessage;
  }

  // ─── AUTHENTICATION ────────────────────────────────────────────────────────

  static Future<UserProfileModel> register({
    required String username,
    required String phone,
    required String email,
    required String password,
  }) async {
    try {
      final res = await _dio.post('/v1/auth/register', data: {
        'username': username,
        'phone': phone,
        'email': email,
        'password': password,
      });

      final tokens = res.data['tokens'] ?? res.data;
      final accessToken = tokens?['accessToken'] ?? res.data['accessToken'];
      final refreshToken = tokens?['refreshToken'] ?? res.data['refreshToken'];

      if (accessToken != null && refreshToken != null) {
        await SecureStorageService.saveTokens(
          accessToken: accessToken,
          refreshToken: refreshToken,
        );
      }

      final user = UserProfileModel.fromJson(res.data['user']);
      await SecureStorageService.saveUserProfile(jsonEncode(user.toJson()));
      return user;
    } on DioException catch (e) {
      throw _extractDioError(e, defaultMessage: 'Registration failed. Please try again.');
    }
  }

  static Future<UserProfileModel> login({
    required String phone,
    String? identifier,
    required String password,
  }) async {
    final loginId = identifier ?? phone;
    try {
      final res = await _dio.post('/v1/auth/login', data: {
        'phone': loginId,
        'identifier': loginId,
        'username': loginId,
        'password': password,
      });

      final tokens = res.data['tokens'] ?? res.data;
      final accessToken = tokens?['accessToken'] ?? res.data['accessToken'];
      final refreshToken = tokens?['refreshToken'] ?? res.data['refreshToken'];

      if (accessToken != null && refreshToken != null) {
        await SecureStorageService.saveTokens(
          accessToken: accessToken,
          refreshToken: refreshToken,
        );
      }

      final user = UserProfileModel.fromJson(res.data['user']);
      await SecureStorageService.saveUserProfile(jsonEncode(user.toJson()));
      return user;
    } on DioException catch (e) {
      throw _extractDioError(e, defaultMessage: 'Login failed. Please check your credentials.');
    }
  }

  static Future<String> forgotPassword(String identifier) async {
    try {
      final res = await _dio.post('/v1/auth/forgot-password', data: {
        'identifier': identifier,
      });
      return res.data['message'] ?? 'OTP dispatched to recovery email';
    } on DioException catch (e) {
      throw _extractDioError(e, defaultMessage: 'Failed to send recovery code');
    }
  }

  static Future<String> resetPassword({
    required String email,
    required String otp,
    required String newPassword,
  }) async {
    try {
      final res = await _dio.post('/v1/auth/reset-password', data: {
        'email': email,
        'otp': otp,
        'newPassword': newPassword,
      });
      return res.data['message'] ?? 'Password reset successful';
    } on DioException catch (e) {
      throw _extractDioError(e, defaultMessage: 'Invalid code or password');
    }
  }

  static Future<UserProfileModel> getMe() async {
    try {
      final res = await _dio.get('/v1/auth/me');
      return UserProfileModel.fromJson(res.data['user']);
    } on DioException catch (e) {
      throw _extractDioError(e, defaultMessage: 'Failed to fetch profile');
    }
  }

  // ─── WALLET & PAYMENTS ─────────────────────────────────────────────────────

  static Future<double> getWalletBalance(String userId) async {
    try {
      final res = await _dio.get('/wallet/$userId');
      return (res.data['wallet']['balance'] as num).toDouble();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load balance';
    }
  }

  static Future<DepositResponseModel> createDeposit(String userId, double amount) async {
    try {
      final res = await _dio.post('/deposits/create', data: {
        'userId': userId,
        'amount': amount,
      });
      return DepositResponseModel.fromJson(res.data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to initiate deposit';
    }
  }

  static Future<bool> checkDepositStatus(String depositId) async {
    try {
      final res = await _dio.get('/deposits/status/$depositId');
      return res.data['deposit']?['status'] == 'APPROVED';
    } catch (_) {
      return false;
    }
  }

  static Future<Map<String, dynamic>> claimDepositUtr(String depositId, String utr) async {
    try {
      final res = await _dio.post('/deposits/claim-utr', data: {
        'depositId': depositId,
        'utr': utr,
      });
      return Map<String, dynamic>.from(res.data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to submit UTR';
    }
  }

  static Future<void> requestWithdrawal(String userId, double amount, String upiId) async {
    try {
      await _dio.post('/withdrawals/request', data: {
        'userId': userId,
        'amount': amount,
        'upiId': upiId,
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to submit withdrawal request';
    }
  }

  static Future<List<TransactionModel>> getMyTransactions({int limit = 50}) async {
    try {
      final res = await _dio.get('/user/transactions', queryParameters: {'limit': limit});
      final list = res.data['transactions'] as List? ?? [];
      return list.map((t) => TransactionModel.fromJson(t)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load transaction history';
    }
  }

  static Future<List<Map<String, dynamic>>> getMyDeposits() async {
    try {
      final res = await _dio.get('/deposits/my');
      final list = res.data['deposits'] as List? ?? [];
      return list.map((d) => Map<String, dynamic>.from(d)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load deposits';
    }
  }

  // ─── GAME ROOMS ────────────────────────────────────────────────────────────

  static Future<List<RoomModel>> getActiveRooms() async {
    try {
      final res = await _dio.get('/rooms');
      final list = res.data['rooms'] as List? ?? [];
      return list.map((r) => RoomModel.fromJson(r)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load tables';
    }
  }

  static Future<RoomModel> createRoom({
    required String userId,
    required double entryFee,
    required int maxPlayers,
    int? guessNumber,
    String gameType = 'TEEN_PATTI',
    Map<String, dynamic>? customConfig,
    bool isPrivate = false,
  }) async {
    try {
      final res = await _dio.post('/rooms/create', data: {
        'userId': userId,
        'entryFee': entryFee,
        'maxPlayers': maxPlayers,
        if (guessNumber != null) ...{'guessNumber': guessNumber},
        'gameType': gameType,
        if (customConfig != null) ...{'customConfig': customConfig},
        'isPrivate': isPrivate,
      });
      return RoomModel.fromJson(res.data['room']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to create room';
    }
  }

  static Future<RoomModel> joinByInvitation({
    required String invitationToken,
    int? seatIndex,
    int? guessNumber,
  }) async {
    try {
      final res = await _dio.post('/rooms/join-invitation', data: {
        'invitationToken': invitationToken,
        if (seatIndex != null) 'seatIndex': seatIndex,
        if (guessNumber != null) 'guessNumber': guessNumber,
      });
      return RoomModel.fromJson(res.data['room']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to join via invitation';
    }
  }

  static Future<RoomPreviewModel> getInvitationPreview(String token) async {
    try {
      final res = await _dio.get('/invitations/$token');
      return RoomPreviewModel.fromJson(res.data['preview']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Invalid or expired invitation link';
    }
  }

  static Future<UserProfileDetailModel> getUserProfile() async {
    try {
      final res = await _dio.get('/user/profile');
      return UserProfileDetailModel.fromJson(res.data['profile']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to fetch player profile';
    }
  }

  static Future<UserProfileDetailModel> updateUserProfile({
    String? displayName,
    String? avatar,
  }) async {
    try {
      final res = await _dio.patch('/user/profile', data: {
        if (displayName != null) 'displayName': displayName,
        if (avatar != null) 'avatar': avatar,
      });
      return UserProfileDetailModel.fromJson(res.data['profile']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to update player profile';
    }
  }

  static Future<PublicProfileModel> getPublicProfile(String userId) async {
    try {
      final res = await _dio.get('/user/$userId/public-profile');
      return PublicProfileModel.fromJson(res.data['profile']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to fetch player profile';
    }
  }

  static Future<List<dynamic>> getSportsMatches({String? sport}) async {
    try {
      final res = await _dio.get('/sports/matches', queryParameters: {
        if (sport != null && sport != 'ALL') 'sport': sport,
      });
      return (res.data['matches'] as List? ?? []);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to fetch sports matches';
    }
  }

  static Future<RoomModel> getRoomByCode(String roomCode) async {
    try {
      final res = await _dio.get('/rooms/by-code/${Uri.encodeComponent(roomCode.trim().toUpperCase())}');
      return RoomModel.fromJson(res.data['room']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Room not found with that code';
    }
  }

  static Future<RoomModel> joinRoom({
    required String userId,
    required String roomCode,
    int? guessNumber,
  }) async {
    try {
      final res = await _dio.post('/rooms/join', data: {
        'userId': userId,
        'roomCode': roomCode,
        if (guessNumber != null) ...{'guessNumber': guessNumber},
      });
      return RoomModel.fromJson(res.data['room']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to join room';
    }
  }

  static Future<Map<String, dynamic>> sendGameAction({
    required String roomId,
    required String action,
    Map<String, dynamic>? payload,
  }) async {
    try {
      final res = await _dio.post('/rooms/$roomId/action', data: {
        'action': action,
        'payload': payload ?? {},
      });
      if (res.data['success'] != true) throw res.data['message'] ?? 'Action rejected';
      return Map<String, dynamic>.from(res.data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Action failed';
    }
  }

  static Future<RoomModel> updateInvitation(String roomId, String operation) async {
    final res = await _dio.post('/rooms/$roomId/invitation', data: {'operation': operation});
    return RoomModel.fromJson(Map<String, dynamic>.from(res.data['room']));
  }

  static Future<void> cancelRoom(String roomId) async {
    await _dio.post('/rooms/$roomId/cancel');
  }

  static Future<RoomModel> getRoomDetails(String roomId) async {
    try {
      final res = await _dio.get('/rooms/$roomId');
      return RoomModel.fromJson(res.data['room']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Room not found';
    }
  }

  // ─── Notification Methods ───────────────────────────────────────────────────

  static Future<List<NotificationItemModel>> getMyNotifications() async {
    try {
      final res = await _dio.get('/notifications/my');
      final list = res.data['notifications'] as List? ?? [];
      return list.map((e) => NotificationItemModel.fromJson(Map<String, dynamic>.from(e))).toList();
    } on DioException catch (e) {
      throw _extractDioError(e, defaultMessage: 'Failed to fetch notifications');
    }
  }

  static Future<int> getUnreadNotificationCount() async {
    try {
      final res = await _dio.get('/notifications/unread-count');
      return (res.data['unreadCount'] as num?)?.toInt() ?? 0;
    } catch (_) {
      return 0;
    }
  }

  static Future<void> markNotificationAsRead(String id) async {
    try {
      await _dio.patch('/notifications/$id/read');
    } catch (_) {}
  }

  static Future<void> markAllNotificationsAsRead() async {
    try {
      await _dio.post('/notifications/mark-all-read');
    } catch (_) {}
  }

  static Future<void> deleteNotification(String id) async {
    try {
      await _dio.delete('/notifications/$id');
    } catch (_) {}
  }

  static Future<void> clearAllNotifications() async {
    try {
      await _dio.delete('/notifications/clear-all');
    } catch (_) {}
  }
}
