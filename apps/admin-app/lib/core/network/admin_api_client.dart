import 'dart:convert';
import 'package:dio/dio.dart';
import 'authenticated_client.dart';
import '../constants/api_constants.dart';
import '../storage/admin_secure_storage.dart';

class AdminProfileModel {
  final String id;
  final String username;
  final String email;
  final String role;
  final String status;

  AdminProfileModel({
    required this.id,
    required this.username,
    required this.email,
    required this.role,
    required this.status,
  });

  factory AdminProfileModel.fromJson(Map<String, dynamic> json) {
    return AdminProfileModel(
      id: json['id'] ?? '',
      username: json['username'] ?? '',
      email: json['email'] ?? '',
      role: json['role'] ?? 'ADMIN',
      status: json['status'] ?? 'ACTIVE',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'email': email,
        'role': role,
        'status': status,
      };
}

class AdminStatsModel {
  final int totalUsers;
  final double totalDeposited;
  final double totalWithdrawn;
  final double totalFleetBalance;
  final double totalFleetReserved;
  final int unverifiedFloatAccounts;
  final double platformProfit;
  final int activeRooms;
  final int pendingWithdrawalsCount;
  final int completedDepositsCount;
  final int pendingDepositsCount;
  final int openFeedbacksCount;
  final int completedRoomsCount;
  final String adminUpiId;
  final String adminUpiName;
  final String commissionPercent;
  final String supportEmail;
  final String supportWhatsapp;
  final String supportTelegram;
  final String supportHours;
  final String listenerStatus;
  final String? lastHeartbeatAt;
  final Map<String, dynamic>? listenerMetadata;

  AdminStatsModel({
    required this.totalUsers,
    required this.totalDeposited,
    required this.totalWithdrawn,
    this.totalFleetBalance = 0,
    this.totalFleetReserved = 0,
    this.unverifiedFloatAccounts = 0,
    required this.platformProfit,
    required this.activeRooms,
    required this.pendingWithdrawalsCount,
    required this.completedDepositsCount,
    required this.pendingDepositsCount,
    required this.openFeedbacksCount,
    required this.completedRoomsCount,
    required this.adminUpiId,
    required this.adminUpiName,
    required this.commissionPercent,
    required this.supportEmail,
    required this.supportWhatsapp,
    required this.supportTelegram,
    required this.supportHours,
    this.listenerStatus = 'OFFLINE',
    this.lastHeartbeatAt,
    this.listenerMetadata,
  });

  factory AdminStatsModel.fromJson(Map<String, dynamic> json) {
    return AdminStatsModel(
      totalUsers: json['totalUsers'] ?? json['totalUsersCount'] ?? 0,
      totalDeposited: (json['totalDeposited'] ?? json['totalDepositVolume'] as num?)?.toDouble() ?? 0.0,
      totalWithdrawn: (json['totalWithdrawn'] ?? json['totalPayoutVolume'] as num?)?.toDouble() ?? 0.0,
      totalFleetBalance: (json['totalFleetBalance'] as num?)?.toDouble() ?? 0,
      totalFleetReserved: (json['totalFleetReserved'] as num?)?.toDouble() ?? 0,
      unverifiedFloatAccounts: json['unverifiedFloatAccounts'] ?? 0,
      platformProfit: (json['platformProfit'] as num?)?.toDouble() ?? 0.0,
      activeRooms: json['activeRooms'] ?? 0,
      pendingWithdrawalsCount: json['pendingWithdrawalsCount'] ?? 0,
      completedDepositsCount: json['completedDepositsCount'] ?? 0,
      pendingDepositsCount: json['pendingDepositsCount'] ?? 0,
      openFeedbacksCount: json['openFeedbacksCount'] ?? 0,
      completedRoomsCount: json['completedRoomsCount'] ?? 0,
      adminUpiId: json['adminUpiId'] ?? '',
      adminUpiName: json['adminUpiName'] ?? '',
      commissionPercent: json['commissionPercent']?.toString() ?? '0',
      supportEmail: json['supportEmail'] ?? 'support@moneygame.com',
      supportWhatsapp: json['supportWhatsapp'] ?? '+91 98765 43210',
      supportTelegram: json['supportTelegram'] ?? '@MoneyGameSupport',
      supportHours: json['supportHours'] ?? '24/7 Live Support',
      listenerStatus: json['listenerStatus'] ?? 'OFFLINE',
      lastHeartbeatAt: json['lastHeartbeatAt'],
      listenerMetadata: json['listenerMetadata'] as Map<String, dynamic>?,
    );
  }
}

class ListenerConfigModel {
  final bool success;
  final String webhookSecret;
  final String serverUrl;
  final String listenerStatus;
  final String? lastHeartbeatAt;
  final Map<String, dynamic>? listenerMetadata;

  ListenerConfigModel({
    required this.success,
    required this.webhookSecret,
    required this.serverUrl,
    required this.listenerStatus,
    this.lastHeartbeatAt,
    this.listenerMetadata,
  });

  factory ListenerConfigModel.fromJson(Map<String, dynamic> json) {
    return ListenerConfigModel(
      success: json['success'] == true,
      webhookSecret: json['webhookSecret'] ?? '',
      serverUrl: json['serverUrl'] ?? '',
      listenerStatus: json['listenerStatus'] ?? 'OFFLINE',
      lastHeartbeatAt: json['lastHeartbeatAt'],
      listenerMetadata: json['listenerMetadata'] as Map<String, dynamic>?,
    );
  }
}

class AdminWithdrawalModel {
  final String id;
  final String userId;
  final double amount;
  final String upiId;
  final String status;
  final String? assignedModeratorId;
  final String? assignedModeratorName;
  final String? payoutAccountUpi;
  final String? processingById;
  final String? processingByName;
  final String? fundingSource;
  final String? payoutUtr;
  final String? rejectionReason;
  final String createdAt;
  final String username;
  final String? phone;

  AdminWithdrawalModel({
    required this.id,
    required this.userId,
    required this.amount,
    required this.upiId,
    required this.status,
    this.assignedModeratorId,
    this.assignedModeratorName,
    this.payoutAccountUpi,
    this.processingById,
    this.processingByName,
    this.fundingSource,
    this.payoutUtr,
    this.rejectionReason,
    required this.createdAt,
    required this.username,
    this.phone,
  });

  factory AdminWithdrawalModel.fromJson(Map<String, dynamic> json) {
    return AdminWithdrawalModel(
      id: json['id'] ?? '',
      userId: json['userId'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      upiId: json['upiId'] ?? '',
      status: json['status'] ?? 'PENDING',
      assignedModeratorId: json['assignedModeratorId'],
      assignedModeratorName: json['assignedModeratorName'],
      payoutAccountUpi: json['payoutAccountUpi'],
      processingById: json['processingById'],
      processingByName: json['processingByName'],
      fundingSource: json['fundingSource'],
      payoutUtr: json['payoutUtr'],
      rejectionReason: json['reason'] ?? json['rejectionReason'],
      createdAt: json['createdAt'] ?? '',
      username: json['user']?['username'] ?? 'User',
      phone: json['user']?['phone'],
    );
  }
}

class AdminDepositModel {
  final String id;
  final String userId;
  final double baseAmount;
  final double totalAmount;
  final int offsetPaise;
  final String status;
  final String? utr;
  final String? receivingUpi;
  final String createdAt;
  final String username;
  final String? phone;
  final String? userClaimedUtr;

  AdminDepositModel({
    required this.id,
    required this.userId,
    required this.baseAmount,
    required this.totalAmount,
    required this.offsetPaise,
    required this.status,
    this.utr,
    this.receivingUpi,
    this.userClaimedUtr,
    required this.createdAt,
    required this.username,
    this.phone,
  });

  factory AdminDepositModel.fromJson(Map<String, dynamic> json) {
    return AdminDepositModel(
      id: json['id'] ?? '',
      userId: json['userId'] ?? '',
      baseAmount: (json['baseAmount'] as num?)?.toDouble() ?? 0.0,
      totalAmount: (json['totalAmount'] as num?)?.toDouble() ?? 0.0,
      offsetPaise: json['offsetPaise'] ?? 0,
      status: json['status'] ?? 'PENDING',
      utr: json['utr'],
      receivingUpi: json['receivingUpi'],
      userClaimedUtr: json['userClaimedUtr'],
      createdAt: json['createdAt'] ?? '',
      username: json['user']?['username'] ?? 'Player',
      phone: json['user']?['phone'],
    );
  }
}

class UnmatchedPaymentModel {
  final String id;
  final double amount;
  final String? utr;
  final String? senderUpi;
  final String? senderName;
  final String status;
  final String? assignedUserId;
  final String? assignedDepositId;
  final String? resolvedAt;
  final String createdAt;

  UnmatchedPaymentModel({
    required this.id,
    required this.amount,
    this.utr,
    this.senderUpi,
    this.senderName,
    required this.status,
    this.assignedUserId,
    this.assignedDepositId,
    this.resolvedAt,
    required this.createdAt,
  });

  factory UnmatchedPaymentModel.fromJson(Map<String, dynamic> json) {
    return UnmatchedPaymentModel(
      id: json['id'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      utr: json['utr'],
      senderUpi: json['senderUpi'],
      senderName: json['senderName'],
      status: json['status'] ?? 'UNCLAIMED',
      assignedUserId: json['assignedUserId'],
      assignedDepositId: json['assignedDepositId'],
      resolvedAt: json['resolvedAt'],
      createdAt: json['createdAt'] ?? '',
    );
  }
}

class AdminUserModel {
  final String id;
  final String username;
  final String? phone;
  final String? email;
  final String role;
  final String status;
  final String createdAt;
  final double balance;
  final double lockedBalance;
  final int totalDepositsCount;
  final double totalDepositedAmount;
  final int totalWithdrawalsCount;
  final double totalWithdrawnAmount;
  final int roomsPlayedCount;
  final int roomsWonCount;
  final int feedbacksCount;

  AdminUserModel({
    required this.id,
    required this.username,
    this.phone,
    this.email,
    required this.role,
    required this.status,
    required this.createdAt,
    required this.balance,
    required this.lockedBalance,
    required this.totalDepositsCount,
    required this.totalDepositedAmount,
    required this.totalWithdrawalsCount,
    required this.totalWithdrawnAmount,
    required this.roomsPlayedCount,
    required this.roomsWonCount,
    required this.feedbacksCount,
  });

  factory AdminUserModel.fromJson(Map<String, dynamic> json) {
    return AdminUserModel(
      id: json['id'] ?? '',
      username: json['username'] ?? '',
      phone: json['phone'],
      email: json['email'],
      role: json['role'] ?? 'USER',
      status: json['status'] ?? 'ACTIVE',
      createdAt: json['createdAt'] ?? '',
      balance: (json['balance'] as num?)?.toDouble() ?? 0.0,
      lockedBalance: (json['lockedBalance'] as num?)?.toDouble() ?? 0.0,
      totalDepositsCount: json['totalDepositsCount'] ?? 0,
      totalDepositedAmount: (json['totalDepositedAmount'] as num?)?.toDouble() ?? 0.0,
      totalWithdrawalsCount: json['totalWithdrawalsCount'] ?? 0,
      totalWithdrawnAmount: (json['totalWithdrawnAmount'] as num?)?.toDouble() ?? 0.0,
      roomsPlayedCount: json['roomsPlayedCount'] ?? 0,
      roomsWonCount: json['roomsWonCount'] ?? 0,
      feedbacksCount: json['feedbacksCount'] ?? 0,
    );
  }
}

class UserWalletDetail {
  final double balance;
  final double lockedBalance;
  final String updatedAt;

  UserWalletDetail({
    required this.balance,
    required this.lockedBalance,
    required this.updatedAt,
  });

  factory UserWalletDetail.fromJson(Map<String, dynamic> json) {
    return UserWalletDetail(
      balance: (json['balance'] as num?)?.toDouble() ?? 0.0,
      lockedBalance: (json['lockedBalance'] as num?)?.toDouble() ?? 0.0,
      updatedAt: json['updatedAt'] ?? '',
    );
  }
}

class UserMetricsDetail {
  final int totalDepositsCount;
  final double approvedDepositsSum;
  final int totalWithdrawalsCount;
  final double completedWithdrawalsSum;
  final int roomsPlayed;
  final int roomsWon;
  final double winRate;
  final double netProfitLoss;

  UserMetricsDetail({
    required this.totalDepositsCount,
    required this.approvedDepositsSum,
    required this.totalWithdrawalsCount,
    required this.completedWithdrawalsSum,
    required this.roomsPlayed,
    required this.roomsWon,
    required this.winRate,
    required this.netProfitLoss,
  });

  factory UserMetricsDetail.fromJson(Map<String, dynamic> json) {
    return UserMetricsDetail(
      totalDepositsCount: json['totalDepositsCount'] ?? 0,
      approvedDepositsSum: (json['approvedDepositsSum'] as num?)?.toDouble() ?? 0.0,
      totalWithdrawalsCount: json['totalWithdrawalsCount'] ?? 0,
      completedWithdrawalsSum: (json['completedWithdrawalsSum'] as num?)?.toDouble() ?? 0.0,
      roomsPlayed: json['roomsPlayed'] ?? 0,
      roomsWon: json['roomsWon'] ?? 0,
      winRate: (json['winRate'] as num?)?.toDouble() ?? 0.0,
      netProfitLoss: (json['netProfitLoss'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class UserTransactionItem {
  final String id;
  final double amount;
  final String type;
  final String? referenceId;
  final String? description;
  final String createdAt;

  UserTransactionItem({
    required this.id,
    required this.amount,
    required this.type,
    this.referenceId,
    this.description,
    required this.createdAt,
  });

  factory UserTransactionItem.fromJson(Map<String, dynamic> json) {
    return UserTransactionItem(
      id: json['id'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      type: json['type'] ?? '',
      referenceId: json['referenceId'],
      description: json['description'],
      createdAt: json['createdAt'] ?? '',
    );
  }
}

class UserGameItem {
  final String id;
  final String roomId;
  final String roomCode;
  final double entryFee;
  final int guessNumber;
  final int? winningNumber;
  final bool isWinner;
  final String status;
  final String createdAt;

  UserGameItem({
    required this.id,
    required this.roomId,
    required this.roomCode,
    required this.entryFee,
    required this.guessNumber,
    this.winningNumber,
    required this.isWinner,
    required this.status,
    required this.createdAt,
  });

  factory UserGameItem.fromJson(Map<String, dynamic> json) {
    return UserGameItem(
      id: json['id'] ?? '',
      roomId: json['roomId'] ?? '',
      roomCode: json['roomCode'] ?? '',
      entryFee: (json['entryFee'] as num?)?.toDouble() ?? 0.0,
      guessNumber: json['guessNumber'] ?? 0,
      winningNumber: json['winningNumber'],
      isWinner: json['isWinner'] ?? false,
      status: json['status'] ?? '',
      createdAt: json['createdAt'] ?? '',
    );
  }
}

class UserAuditLogItem {
  final String id;
  final String action;
  final String actorUsername;
  final String? details;
  final String? ipAddress;
  final String createdAt;

  UserAuditLogItem({
    required this.id,
    required this.action,
    required this.actorUsername,
    this.details,
    this.ipAddress,
    required this.createdAt,
  });

  factory UserAuditLogItem.fromJson(Map<String, dynamic> json) {
    return UserAuditLogItem(
      id: json['id'] ?? '',
      action: json['action'] ?? '',
      actorUsername: json['actor']?['username'] ?? 'System',
      details: json['details'],
      ipAddress: json['ipAddress'],
      createdAt: json['createdAt'] ?? '',
    );
  }
}

class UserProfileDetailModel {
  final String id;
  final String username;
  final String? phone;
  final String? email;
  final String role;
  final String status;
  final String createdAt;
  final String updatedAt;
  final UserWalletDetail? wallet;
  final UserMetricsDetail metrics;
  final List<UserTransactionItem> recentTransactions;
  final List<AdminDepositModel> recentDeposits;
  final List<AdminWithdrawalModel> recentWithdrawals;
  final List<UserGameItem> recentGames;
  final List<AdminFeedbackModel> feedbacks;
  final List<UserAuditLogItem> auditLogs;

  UserProfileDetailModel({
    required this.id,
    required this.username,
    this.phone,
    this.email,
    required this.role,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.wallet,
    required this.metrics,
    required this.recentTransactions,
    required this.recentDeposits,
    required this.recentWithdrawals,
    required this.recentGames,
    required this.feedbacks,
    required this.auditLogs,
  });

  factory UserProfileDetailModel.fromJson(Map<String, dynamic> json) {
    return UserProfileDetailModel(
      id: json['id'] ?? '',
      username: json['username'] ?? '',
      phone: json['phone'],
      email: json['email'],
      role: json['role'] ?? 'USER',
      status: json['status'] ?? 'ACTIVE',
      createdAt: json['createdAt'] ?? '',
      updatedAt: json['updatedAt'] ?? '',
      wallet: json['wallet'] != null ? UserWalletDetail.fromJson(json['wallet']) : null,
      metrics: UserMetricsDetail.fromJson(json['metrics'] ?? {}),
      recentTransactions: (json['recentTransactions'] as List? ?? [])
          .map((t) => UserTransactionItem.fromJson(t))
          .toList(),
      recentDeposits: (json['recentDeposits'] as List? ?? [])
          .map((d) => AdminDepositModel.fromJson(d))
          .toList(),
      recentWithdrawals: (json['recentWithdrawals'] as List? ?? [])
          .map((w) => AdminWithdrawalModel.fromJson(w))
          .toList(),
      recentGames: (json['recentGames'] as List? ?? [])
          .map((g) => UserGameItem.fromJson(g))
          .toList(),
      feedbacks: (json['feedbacks'] as List? ?? [])
          .map((f) => AdminFeedbackModel.fromJson(f))
          .toList(),
      auditLogs: (json['auditLogs'] as List? ?? [])
          .map((l) => UserAuditLogItem.fromJson(l))
          .toList(),
    );
  }
}

class AdminFeedbackModel {
  final String id;
  final String userId;
  final String category;
  final String subject;
  final String message;
  final String? contactInfo;
  final String status;
  final String? adminReply;
  final String? repliedAt;
  final String createdAt;
  final String updatedAt;
  final String username;
  final String? email;
  final String? phone;
  final String? userStatus;
  final double? userBalance;

  AdminFeedbackModel({
    required this.id,
    required this.userId,
    required this.category,
    required this.subject,
    required this.message,
    this.contactInfo,
    required this.status,
    this.adminReply,
    this.repliedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.username,
    this.email,
    this.phone,
    this.userStatus,
    this.userBalance,
  });

  factory AdminFeedbackModel.fromJson(Map<String, dynamic> json) {
    return AdminFeedbackModel(
      id: json['id'] ?? '',
      userId: json['userId'] ?? '',
      category: json['category'] ?? 'GENERAL',
      subject: json['subject'] ?? '',
      message: json['message'] ?? '',
      contactInfo: json['contactInfo'],
      status: json['status'] ?? 'OPEN',
      adminReply: json['adminReply'],
      repliedAt: json['repliedAt'],
      createdAt: json['createdAt'] ?? '',
      updatedAt: json['updatedAt'] ?? '',
      username: json['user']?['username'] ?? 'User',
      email: json['user']?['email'],
      phone: json['user']?['phone'],
      userStatus: json['user']?['status'],
      userBalance: (json['user']?['wallet']?['balance'] as num?)?.toDouble(),
    );
  }
}

class AdminRoomPlayerModel {
  final String id;
  final String userId;
  final String username;
  final int? guessNumber;
  final int seatIndex;
  final double inGameStake;
  final double totalPaid;

  AdminRoomPlayerModel({
    required this.id,
    required this.userId,
    required this.username,
    this.guessNumber,
    this.seatIndex = 0,
    this.inGameStake = 0.0,
    this.totalPaid = 0.0,
  });

  factory AdminRoomPlayerModel.fromJson(Map<String, dynamic> json) {
    return AdminRoomPlayerModel(
      id: json['id'] ?? '',
      userId: json['userId'] ?? '',
      username: json['user']?['username'] ?? json['username'] ?? 'Player',
      guessNumber: json['guessNumber'],
      seatIndex: json['seatIndex'] ?? 0,
      inGameStake: (json['inGameStake'] as num?)?.toDouble() ?? 0.0,
      totalPaid: (json['totalPaid'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class AdminRoomModel {
  final String id;
  final String roomCode;
  final String gameType;
  final double entryFee;
  final int maxPlayers;
  final String status;
  final int? winningNumber;
  final String? winnerId;
  final String? winnerUsername;
  final double? winnerPrize;
  final double totalPot;
  final String createdAt;
  final List<AdminRoomPlayerModel> players;
  final Map<String, dynamic>? customConfig;

  AdminRoomModel({
    required this.id,
    required this.roomCode,
    this.gameType = 'GUESS_NUMBER',
    required this.entryFee,
    required this.maxPlayers,
    required this.status,
    this.winningNumber,
    this.winnerId,
    this.winnerUsername,
    this.winnerPrize,
    this.totalPot = 0.0,
    required this.createdAt,
    required this.players,
    this.customConfig,
  });

  factory AdminRoomModel.fromJson(Map<String, dynamic> json) {
    final entry = (json['entryFee'] as num?)?.toDouble() ?? 0.0;
    final playersList = (json['players'] as List? ?? [])
        .map((p) => AdminRoomPlayerModel.fromJson(p))
        .toList();
    final pot = (json['totalPot'] as num?)?.toDouble() ?? (entry * playersList.length);

    return AdminRoomModel(
      id: json['id'] ?? '',
      roomCode: json['roomCode'] ?? '',
      gameType: json['gameType'] ?? 'GUESS_NUMBER',
      entryFee: entry,
      maxPlayers: json['maxPlayers'] ?? 4,
      status: json['status'] ?? 'WAITING',
      winningNumber: json['winningNumber'],
      winnerId: json['winnerId'],
      winnerUsername: json['winnerUsername'] ?? json['winner']?['username'],
      winnerPrize: (json['winnerPrize'] as num?)?.toDouble(),
      totalPot: pot,
      createdAt: json['createdAt'] ?? '',
      players: playersList,
      customConfig: json['customConfig'] is Map<String, dynamic> ? json['customConfig'] : null,
    );
  }
}

class SupportSettingsModel {
  final String email;
  final String whatsapp;
  final String telegram;
  final String hours;
  final String? upiHelpText;

  SupportSettingsModel({
    required this.email,
    required this.whatsapp,
    required this.telegram,
    required this.hours,
    this.upiHelpText,
  });

  factory SupportSettingsModel.fromJson(Map<String, dynamic> json) {
    return SupportSettingsModel(
      email: json['email'] ?? 'support@moneygame.com',
      whatsapp: json['whatsapp'] ?? '+91 98765 43210',
      telegram: json['telegram'] ?? '@MoneyGameSupport',
      hours: json['hours'] ?? '24/7 Live Support',
      upiHelpText: json['upiHelpText'],
    );
  }
}

class AdminApiClient {
  static final _session = AuthenticatedClient(
    baseUrl: () => ApiConstants.baseUrl,
    refreshPath: '/admin/auth/refresh-token',
    readAccessToken: AdminSecureStorage.getAccessToken,
    readRefreshToken: AdminSecureStorage.getRefreshToken,
    saveTokens: AdminSecureStorage.saveTokens,
    clearSession: AdminSecureStorage.clearSession,
  );
  static final Dio _dio = _session.dio;
  static void init() {}
  static Future<void> claimWithdrawal(String id, {bool external = false}) async {
    await _dio.post('/admin/withdrawals/claim', data: {'withdrawalId': id, if (external) 'fundingSource': 'EXTERNAL'});
  }
  static Future<void> reconcileWithdrawal(String id, String outcome, String note, String utr) async {
    await _dio.post('/admin/withdrawals/reconcile', data: {'withdrawalId': id, 'outcome': outcome, 'note': note, 'payoutUtr': utr});
  }
  static Future<void> reassignWithdrawal(String id, String moderatorId) async {
    await _dio.post('/admin/withdrawals/reassign', data: {'withdrawalId': id, 'moderatorId': moderatorId});
  }
  static Future<void> confirmOpeningBalance(String id, double balance, String reason) async {
    await _dio.post('/admin/upi-pool/$id/opening-balance', data: {'balance': balance, 'reason': reason});
  }
  static Future<String?> getValidAccessToken({bool forceRefresh = false}) =>
      _session.validAccessToken(forceRefresh: forceRefresh);

  // ─── ADMIN AUTH ────────────────────────────────────────────────────────────

  static Future<AdminProfileModel> login({
    required String identifier,
    required String password,
  }) async {
    try {
      final res = await _dio.post('/admin/auth/login', data: {
        'identifier': identifier,
        'password': password,
      });

      final tokens = res.data['tokens'];
      await AdminSecureStorage.saveTokens(
        accessToken: tokens['accessToken'],
        refreshToken: tokens['refreshToken'],
      );

      final admin = AdminProfileModel.fromJson(res.data['admin'] ?? res.data['user']);
      if (admin.role == 'MODERATOR') { await AdminSecureStorage.clearSession(); throw 'Use the MoneyGame Moderator app'; }
      await AdminSecureStorage.saveAdminProfile(jsonEncode(admin.toJson()));
      return admin;
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Admin authorization failed';
    }
  }

  static Future<AdminProfileModel> getMe() async {
    try {
      final res = await _dio.get('/admin/auth/me');
      final profile = AdminProfileModel.fromJson(res.data['admin'] ?? res.data['user']);
      if (profile.role == 'MODERATOR') { await AdminSecureStorage.clearSession(); throw 'Use the MoneyGame Moderator app'; }
      return profile;
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to authenticate admin';
    }
  }

  // ─── ADMIN DASHBOARD STATS ─────────────────────────────────────────────────

  static Future<AdminStatsModel> getStats() async {
    try {
      final res = await _dio.get('/admin/stats');
      return AdminStatsModel.fromJson(res.data['stats']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load system statistics';
    }
  }

  // ─── PAYOUT CLEARANCE QUEUE ────────────────────────────────────────────────

  static Future<List<AdminWithdrawalModel>> getWithdrawals() async {
    try {
      final res = await _dio.get('/admin/withdrawals');
      final list = res.data['withdrawals'] as List? ?? [];
      return list.map((w) => AdminWithdrawalModel.fromJson(w)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load payouts';
    }
  }

  static Future<void> completeWithdrawal({
    required String withdrawalId,
    required String payoutUtr,
  }) async {
    try {
      await _dio.post('/admin/withdrawals/complete', data: {
        'withdrawalId': withdrawalId,
        'payoutUtr': payoutUtr,
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to mark withdrawal complete';
    }
  }

  static Future<void> rejectWithdrawal({
    required String withdrawalId,
    String? reason,
  }) async {
    try {
      await _dio.post('/admin/withdrawals/reject', data: {
        'withdrawalId': withdrawalId,
        'reason': reason ?? 'Payout rejected by Super Admin',
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to reject withdrawal';
    }
  }

  // ─── DEPOSITS LEDGER ───────────────────────────────────────────────────────

  static Future<List<AdminDepositModel>> getDeposits() async {
    try {
      final res = await _dio.get('/admin/deposits');
      final list = res.data['deposits'] as List? ?? [];
      return list.map((d) => AdminDepositModel.fromJson(d)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load deposits ledger';
    }
  }

  static Future<void> approveDeposit({
    required String depositId,
    required String utr,
  }) async {
    try {
      await _dio.post('/admin/deposits/$depositId/approve', data: {
        'utr': utr,
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to approve deposit';
    }
  }

  static Future<void> rejectDeposit({
    required String depositId,
    String? reason,
  }) async {
    try {
      await _dio.post('/admin/deposits/$depositId/reject', data: {
        'reason': reason ?? 'Declined by administrator',
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to reject deposit';
    }
  }

  // ─── UNMATCHED / ORPHAN BANK PAYMENTS ──────────────────────────────────────

  static Future<List<UnmatchedPaymentModel>> getUnmatchedPayments({String? status}) async {
    try {
      final qs = status != null ? '?status=$status' : '';
      final res = await _dio.get('/admin/unmatched-payments$qs');
      final list = res.data['unmatchedPayments'] as List? ?? [];
      return list.map((u) => UnmatchedPaymentModel.fromJson(u)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load unmatched payments';
    }
  }

  static Future<void> assignUnmatchedPayment({
    required String id,
    required String userId,
  }) async {
    try {
      await _dio.post('/admin/unmatched-payments/$id/assign', data: {
        'userId': userId,
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to assign payment to player';
    }
  }

  // ─── USER DIRECTORY & MANAGEMENT ───────────────────────────────────────────

  static Future<List<AdminUserModel>> getUsers({String? search, String? status}) async {
    try {
      final params = <String, dynamic>{};
      if (search != null && search.isNotEmpty) params['search'] = search;
      if (status != null && status != 'ALL') params['status'] = status;

      final res = await _dio.get('/admin/users', queryParameters: params);
      final list = res.data['users'] as List? ?? [];
      return list.map((u) => AdminUserModel.fromJson(u)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load users directory';
    }
  }

  static Future<UserProfileDetailModel> getUserDetail(String userId) async {
    try {
      final res = await _dio.get('/admin/users/$userId');
      return UserProfileDetailModel.fromJson(res.data['user']);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load user profile';
    }
  }

  static Future<void> updateUserStatus({
    required String userId,
    required String status,
    String? reason,
  }) async {
    try {
      final data = <String, dynamic>{'status': status};
      if (reason != null) data['reason'] = reason;
      await _dio.patch('/admin/users/$userId/status', data: data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to update user status';
    }
  }

  static Future<void> adjustUserBalance({
    required String userId,
    required double amount,
    required String reason,
  }) async {
    try {
      await _dio.post('/admin/users/$userId/adjust-balance', data: {
        'amount': amount,
        'reason': reason,
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to adjust user balance';
    }
  }

  static Future<void> deleteUser(String userId) async {
    try {
      await _dio.delete('/admin/users/$userId');
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to delete user';
    }
  }

  // ─── SUPPORT TICKETS & FEEDBACK ────────────────────────────────────────────

  static Future<List<AdminFeedbackModel>> getFeedbacks({String? status}) async {
    try {
      final params = <String, dynamic>{};
      if (status != null && status != 'ALL') params['status'] = status;

      final res = await _dio.get('/admin/feedback', queryParameters: params);
      final list = res.data['feedbacks'] as List? ?? [];
      return list.map((f) => AdminFeedbackModel.fromJson(f)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load support feedback';
    }
  }

  static Future<void> replyFeedback({
    required String feedbackId,
    required String adminReply,
    String? status,
  }) async {
    try {
      final data = <String, dynamic>{'adminReply': adminReply};
      if (status != null) data['status'] = status;
      await _dio.patch('/admin/feedback/$feedbackId/reply', data: data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to reply to feedback';
    }
  }

  // ─── GAME TABLES & ROOMS ───────────────────────────────────────────────────

  static Future<List<AdminRoomModel>> getRooms({String? status, String? search}) async {
    try {
      final queryParams = <String, dynamic>{};
      if (status != null && status != 'ALL') queryParams['status'] = status;
      if (search != null && search.trim().isNotEmpty) queryParams['search'] = search.trim();
      final res = await _dio.get('/admin/rooms', queryParameters: queryParams);
      final list = res.data['rooms'] as List? ?? [];
      return list.map((r) => AdminRoomModel.fromJson(r)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load game rooms';
    }
  }

  static Future<Map<String, dynamic>> cancelRoom(String roomId, {String? reason}) async {
    try {
      final data = <String, dynamic>{};
      if (reason != null && reason.trim().isNotEmpty) {
        data['reason'] = reason.trim();
      }
      final res = await _dio.post('/admin/rooms/$roomId/cancel', data: data);
      return Map<String, dynamic>.from(res.data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to cancel table';
    }
  }

  // ─── SYSTEM SETTINGS & SUPPORT CONFIG ──────────────────────────────────────

  static Future<void> updateUpiSettings({
    required String upiId,
    required String upiName,
  }) async {
    try {
      await _dio.post('/admin/upi-settings', data: {
        'upiId': upiId,
        'upiName': upiName,
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to update receiver UPI ID';
    }
  }

  static Future<SupportSettingsModel> getSupportSettings() async {
    try {
      final res = await _dio.get('/admin/support-settings');
      return SupportSettingsModel.fromJson(res.data['contact'] ?? {});
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load support settings';
    }
  }

  static Future<void> updateSupportSettings({
    String? email,
    String? whatsapp,
    String? telegram,
    String? hours,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (email != null) data['email'] = email;
      if (whatsapp != null) data['whatsapp'] = whatsapp;
      if (telegram != null) data['telegram'] = telegram;
      if (hours != null) data['hours'] = hours;
      await _dio.post('/admin/support-settings', data: data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to update support contact settings';
    }
  }

  // ─── UPI PAYMENT LISTENER WATCHDOG ─────────────────────────────────────────

  static Future<ListenerConfigModel> getListenerConfig() async {
    try {
      final res = await _dio.get('/admin/listener-config');
      return ListenerConfigModel.fromJson(res.data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load listener configuration';
    }
  }

  static Future<void> sendHeartbeat({
    double? batteryLevel,
    String? phoneModel,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (batteryLevel != null) data['batteryLevel'] = batteryLevel;
      if (phoneModel != null) data['phoneModel'] = phoneModel;
      await _dio.post('/admin/listener-heartbeat', data: data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to transmit listener heartbeat';
    }
  }

  // ─── Moderator Management (SUPER_ADMIN only) ───────────────────────────────

  static Future<List<Map<String, dynamic>>> listModerators() async {
    try {
      final res = await _dio.get('/admin/moderators');
      return List<Map<String, dynamic>>.from(res.data as List);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load moderators';
    }
  }

  static Future<Map<String, dynamic>> createModerator({
    required String username,
    required String password,
    String? email,
    String? phone,
    String? upiId,
    String? receiverName,
    int dailyLimit = 15,
    int batchSize = 2,
  }) async {
    try {
      final res = await _dio.post('/admin/moderators', data: {
        'username': username,
        'password': password,
        if (email != null && email.isNotEmpty) 'email': email,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (upiId != null && upiId.isNotEmpty) 'upiId': upiId,
        if (receiverName != null && receiverName.isNotEmpty) 'receiverName': receiverName,
        'dailyLimit': dailyLimit,
        'batchSize': batchSize,
      });
      return Map<String, dynamic>.from(res.data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to create moderator';
    }
  }

  static Future<Map<String, dynamic>> updateModerator(String id, Map<String, dynamic> data) async {
    try {
      final res = await _dio.patch('/admin/moderators/$id', data: data);
      return Map<String, dynamic>.from(res.data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to update moderator';
    }
  }

  static Future<void> deleteModerator(String id) async {
    try {
      await _dio.delete('/admin/moderators/$id');
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to delete moderator';
    }
  }

  // ─── UPI Pool Management (SUPER_ADMIN only) ──────────────────────────────────

  static Future<List<Map<String, dynamic>>> listUpiPool() async {
    try {
      final res = await _dio.get('/admin/upi-pool');
      return List<Map<String, dynamic>>.from(res.data as List);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load UPI pool';
    }
  }

  static Future<Map<String, dynamic>> addUpiAccount({
    required String upiId,
    required String receiverName,
    int dailyLimit = 15,
    int batchSize = 2,
  }) async {
    try {
      final res = await _dio.post('/admin/upi-pool', data: {
        'upiId': upiId,
        'receiverName': receiverName,
        'dailyLimit': dailyLimit,
        'batchSize': batchSize,
      });
      return Map<String, dynamic>.from(res.data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to add UPI account';
    }
  }

  static Future<Map<String, dynamic>> updateUpiAccount(String id, Map<String, dynamic> data) async {
    try {
      final res = await _dio.patch('/admin/upi-pool/$id', data: data);
      return Map<String, dynamic>.from(res.data);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to update UPI account';
    }
  }

  static Future<void> deleteUpiAccount(String id) async {
    try {
      await _dio.delete('/admin/upi-pool/$id');
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to delete UPI account';
    }
  }
  static Future<Map<String, dynamic>> rotationSettings() async => Map<String, dynamic>.from((await _dio.get('/admin/rotation-settings')).data);
  static Future<void> saveRotation(int batchSize) async { await _dio.patch('/admin/rotation-settings', data: {'batchSize': batchSize}); }

  static Future<void> createPoolAccount(Map<String, dynamic> data) async { await _dio.post('/admin/upi-pool', data: data); }

}
