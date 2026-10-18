import 'dart:convert';
import 'package:dio/dio.dart';
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
  final double platformProfit;
  final int activeRooms;
  final int pendingWithdrawalsCount;
  final int completedDepositsCount;
  final int pendingDepositsCount;
  final String adminUpiId;
  final String adminUpiName;

  AdminStatsModel({
    required this.totalUsers,
    required this.totalDeposited,
    required this.totalWithdrawn,
    required this.platformProfit,
    required this.activeRooms,
    required this.pendingWithdrawalsCount,
    required this.completedDepositsCount,
    required this.pendingDepositsCount,
    required this.adminUpiId,
    required this.adminUpiName,
  });

  factory AdminStatsModel.fromJson(Map<String, dynamic> json) {
    return AdminStatsModel(
      totalUsers: json['totalUsers'] ?? json['totalUsersCount'] ?? 0,
      totalDeposited: (json['totalDeposited'] ?? json['totalDepositVolume'] as num?)?.toDouble() ?? 0.0,
      totalWithdrawn: (json['totalWithdrawn'] ?? json['totalPayoutVolume'] as num?)?.toDouble() ?? 0.0,
      platformProfit: (json['platformProfit'] as num?)?.toDouble() ?? 0.0,
      activeRooms: json['activeRooms'] ?? 0,
      pendingWithdrawalsCount: json['pendingWithdrawalsCount'] ?? 0,
      completedDepositsCount: json['completedDepositsCount'] ?? 0,
      pendingDepositsCount: json['pendingDepositsCount'] ?? 0,
      adminUpiId: json['adminUpiId'] ?? '',
      adminUpiName: json['adminUpiName'] ?? '',
    );
  }
}

class AdminWithdrawalModel {
  final String id;
  final String userId;
  final double amount;
  final String upiId;
  final String status;
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
      payoutUtr: json['payoutUtr'],
      rejectionReason: json['rejectionReason'],
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
  final String createdAt;
  final String username;

  AdminDepositModel({
    required this.id,
    required this.userId,
    required this.baseAmount,
    required this.totalAmount,
    required this.offsetPaise,
    required this.status,
    this.utr,
    required this.createdAt,
    required this.username,
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
      createdAt: json['createdAt'] ?? '',
      username: json['user']?['username'] ?? 'Player',
    );
  }
}

class AdminApiClient {
  static final Dio _dio = Dio(BaseOptions(
    baseUrl: '${ApiConstants.baseUrl}/api',
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
    headers: {'Content-Type': 'application/json'},
  ));

  static void init() {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          options.baseUrl = ApiConstants.baseUrl;
          final token = await AdminSecureStorage.getAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          if (error.response?.statusCode == 401) {
            await AdminSecureStorage.clearSession();
          }
          return handler.next(error);
        },
      ),
    );
  }

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
      await AdminSecureStorage.saveAdminProfile(jsonEncode(admin.toJson()));
      return admin;
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Admin authorization failed';
    }
  }

  static Future<AdminProfileModel> getMe() async {
    try {
      final res = await _dio.get('/admin/auth/me');
      return AdminProfileModel.fromJson(res.data['admin'] ?? res.data['user']);
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

  // ─── SYSTEM SETTINGS ───────────────────────────────────────────────────────

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

  // ─── SIMULATE WEBHOOK / NOTIFICATION ───────────────────────────────────────

  static Future<void> simulatePayment({
    required double amount,
    String? utr,
  }) async {
    try {
      await _dio.post('/admin/simulate-payment', data: {
        'amount': amount,
        'utr': utr,
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to simulate payment';
    }
  }
}
