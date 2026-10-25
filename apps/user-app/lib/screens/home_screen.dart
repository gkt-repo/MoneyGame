import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/constants/colors.dart';
import '../core/network/api_client.dart';
import '../core/network/socket_service.dart';
import '../core/storage/secure_storage_service.dart';
import '../core/services/notification_sound_service.dart';
import 'lobby/lobby_screen.dart';
import 'trading/trading_screen.dart';
import 'wallet/add_cash_screen.dart';
import 'wallet/withdraw_screen.dart';

class HomeScreen extends StatefulWidget {
  final UserProfileModel user;
  final VoidCallback onLogout;

  const HomeScreen({
    super.key,
    required this.user,
    required this.onLogout,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late UserProfileModel _user;
  int _currentIndex = 0;
  List<TransactionModel> _transactions = [];
  bool _loadingTransactions = false;

  List<NotificationItemModel> _notifications = [];
  int _unreadNotificationCount = 0;
  bool _loadingNotifications = false;
  String? _notificationError;

  @override
  void initState() {
    super.initState();
    _user = widget.user;
    _initSocket();
    _refreshProfile();
    _loadNotifications();
  }

  void _initSocket() {
    SocketService.connect(
      _user.id,
      onBalanceUpdated: (newBalance) {
        if (mounted) {
          setState(() {
            _user = _user.copyWith(balance: newBalance);
          });
          _loadTransactions();
        }
      },
      onDepositApproved: (newBalance) {
        if (mounted) {
          setState(() {
            _user = _user.copyWith(balance: newBalance);
          });
          _loadTransactions();
          _loadNotifications();
          NotificationSoundService().playNotificationRing();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Payment approved! Wallet balance: ₹${newBalance.toStringAsFixed(2)}'),
              backgroundColor: AppColors.emerald700,
            ),
          );
        }
      },
      onNewNotification: (notif) {
        if (mounted) {
          setState(() {
            _notifications.insert(0, notif);
            _unreadNotificationCount++;
          });
          NotificationSoundService().playNotificationRing();
          _loadTransactions();
          _refreshProfile();

          // Show floating on-screen banner popup
          ScaffoldMessenger.of(context).hideCurrentSnackBar();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              behavior: SnackBarBehavior.floating,
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              backgroundColor: AppColors.slate900,
              elevation: 8,
              content: Row(
                children: [
                  _getNotificationIconWidget(notif.type),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          notif.title,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          notif.message,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11, color: AppColors.slate300),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              action: SnackBarAction(
                label: 'OPEN',
                textColor: AppColors.emerald500,
                onPressed: _showNotificationSheet,
              ),
              duration: const Duration(seconds: 5),
            ),
          );
        }
      },
      onNotificationUnreadCount: (count) {
        if (mounted) {
          setState(() {
            _unreadNotificationCount = count;
          });
        }
      },
    );
  }

  Future<void> _refreshProfile() async {
    try {
      final updated = await ApiClient.getMe();
      if (mounted) {
        setState(() => _user = updated);
      }
    } catch (_) {}
    _loadTransactions();
    _loadNotifications();
  }

  Future<void> _loadNotifications() async {
    if (mounted) {
      setState(() {
        _loadingNotifications = true;
        _notificationError = null;
      });
    }
    try {
      final items = await ApiClient.getMyNotifications();
      final unread = await ApiClient.getUnreadNotificationCount();
      if (mounted) {
        setState(() {
          _notifications = items;
          _unreadNotificationCount = unread;
          _loadingNotifications = false;
          _notificationError = null;
        });
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          _loadingNotifications = false;
          _notificationError = err.toString();
        });
      }
    }
  }

  Future<void> _markAsRead(String id) async {
    setState(() {
      _notifications = _notifications.map((n) => n.id == id ? n.copyWith(isRead: true) : n).toList();
      _unreadNotificationCount = (_unreadNotificationCount - 1).clamp(0, 999);
    });
    await ApiClient.markNotificationAsRead(id);
  }

  Future<void> _markAllAsRead() async {
    setState(() {
      _notifications = _notifications.map((n) => n.copyWith(isRead: true)).toList();
      _unreadNotificationCount = 0;
    });
    await ApiClient.markAllNotificationsAsRead();
  }

  Future<void> _deleteNotification(String id) async {
    final target = _notifications.firstWhere((n) => n.id == id, orElse: () => _notifications.first);
    setState(() {
      _notifications.removeWhere((n) => n.id == id);
      if (!target.isRead) {
        _unreadNotificationCount = (_unreadNotificationCount - 1).clamp(0, 999);
      }
    });
    await ApiClient.deleteNotification(id);
  }

  Future<void> _clearAllNotifications() async {
    setState(() {
      _notifications.clear();
      _unreadNotificationCount = 0;
    });
    await ApiClient.clearAllNotifications();
  }

  Future<void> _loadTransactions() async {
    if (_loadingTransactions) return;
    if (mounted) setState(() => _loadingTransactions = true);
    try {
      final list = await ApiClient.getMyTransactions(limit: 25);
      if (mounted) {
        setState(() {
          _transactions = list;
          _loadingTransactions = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loadingTransactions = false);
      }
    }
  }

  void _openAddCash() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AddCashScreen(
          user: _user,
          onPaymentSuccess: _refreshProfile,
        ),
      ),
    ).then((_) => _refreshProfile());
  }

  void _openWithdraw() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => WithdrawScreen(
          user: _user,
          onWithdrawalSuccess: _refreshProfile,
        ),
      ),
    ).then((_) => _refreshProfile());
  }

  void _confirmLogout() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text('Confirm Logout', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        content: const Text(
          'Are you sure you want to end this session?',
          style: TextStyle(fontSize: 13, color: AppColors.slate600),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.slate500)),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              SocketService.disconnect();
              await SecureStorageService.clearSession();
              widget.onLogout();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.red600,
              elevation: 0,
            ),
            child: const Text('Logout', style: TextStyle(color: AppColors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: _currentIndex == 2 ? null : AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        centerTitle: false,
        title: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Image.asset(
                'assets/icon/app_icon.png',
                width: 28,
                height: 28,
                fit: BoxFit.contain,
              ),
            ),
            const SizedBox(width: 8),
            const Text(
              'MONEYGAME',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
                color: AppColors.slate900,
              ),
            ),
          ],
        ),
        actions: [
          // Live Wallet Pill with quick add button
          GestureDetector(
            onTap: _openAddCash,
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 10),
              padding: const EdgeInsets.fromLTRB(10, 0, 4, 0),
              decoration: BoxDecoration(
                color: AppColors.emerald50,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      color: AppColors.emerald600,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '₹${_user.balance.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.emerald900,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Container(
                    width: 24,
                    height: 24,
                    decoration: const BoxDecoration(
                      color: AppColors.emerald600,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.add, size: 14, color: AppColors.white),
                  ),
                ],
              ),
            ),
          ),
          // Notification Bell with unread counter
          Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_outlined, size: 22, color: AppColors.slate700),
                tooltip: 'Notifications',
                onPressed: _showNotificationSheet,
              ),
              if (_unreadNotificationCount > 0)
                Positioned(
                  top: 8,
                  right: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                    decoration: BoxDecoration(
                      color: AppColors.red600,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                    child: Text(
                      _unreadNotificationCount > 9 ? '9+' : '$_unreadNotificationCount',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.logout, size: 20, color: AppColors.slate600),
            tooltip: 'Logout',
            onPressed: _confirmLogout,
          ),
          const SizedBox(width: 4),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: AppColors.slate200, height: 1),
        ),
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: [
          LobbyScreen(
            user: _user,
            onBalanceRefresh: _refreshProfile,
          ),
          _buildWalletTab(),
          _currentIndex == 2
              ? TradingScreen(
                  userId: _user.id,
                  onWithdraw: () async {
                    await _refreshProfile();
                    if (mounted) _openWithdraw();
                  },
                )
              : const SizedBox.shrink(),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: _currentIndex == 2 ? const Color(0xff0d1117) : AppColors.white,
          border: Border(top: BorderSide(color: AppColors.slate200, width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) {
            setState(() => _currentIndex = index);
            if (index == 1) _refreshProfile();
          },
          backgroundColor: _currentIndex == 2 ? const Color(0xff0d1117) : AppColors.white,
          selectedItemColor: _currentIndex == 2 ? const Color(0xff34d399) : AppColors.emerald700,
          unselectedItemColor: AppColors.slate400,
          selectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
          unselectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
          elevation: 0,
          items: const [
            // Keep the existing lobby/wallet indices stable.
            BottomNavigationBarItem(
              icon: Icon(Icons.casino_outlined),
              activeIcon: Icon(Icons.casino),
              label: 'Game Lobby',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.account_balance_wallet_outlined),
              activeIcon: Icon(Icons.account_balance_wallet),
              label: 'My Wallet',
            ),
            BottomNavigationBarItem(icon: Icon(Icons.candlestick_chart_outlined), activeIcon: Icon(Icons.candlestick_chart), label: 'CricTrade'),
          ],
        ),
      ),
    );
  }

  Widget _buildWalletTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Balance Overview Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.slate200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'TOTAL WALLET BALANCE',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                        color: AppColors.slate500,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.refresh, size: 18, color: AppColors.slate500),
                      onPressed: _refreshProfile,
                    ),
                  ],
                ),
                Text(
                  '₹${_user.balance.toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: AppColors.slate900,
                  ),
                ),
                const SizedBox(height: 16),

                // Deposit & Withdraw Action Buttons
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _openAddCash,
                        icon: const Icon(Icons.add_circle, size: 16, color: AppColors.white),
                        label: const Text(
                          'Add Cash',
                          style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.white),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.emerald600,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _openWithdraw,
                        icon: const Icon(Icons.arrow_circle_up, size: 16, color: AppColors.slate800),
                        label: const Text(
                          'Withdraw',
                          style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.slate800),
                        ),
                        style: OutlinedButton.styleFrom(
                          backgroundColor: AppColors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          side: const BorderSide(color: AppColors.slate200),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Transaction Passbook / Activity
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.slate200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'TRANSACTION PASSBOOK',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                        color: AppColors.slate500,
                      ),
                    ),
                    IconButton(
                      icon: _loadingTransactions
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.refresh, size: 18, color: AppColors.slate500),
                      onPressed: _loadTransactions,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (_transactions.isEmpty && !_loadingTransactions)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    alignment: Alignment.center,
                    child: const Column(
                      children: [
                        Icon(Icons.receipt_long_outlined, size: 36, color: AppColors.slate300),
                        SizedBox(height: 8),
                        Text(
                          'No transactions recorded yet',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate500),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Add cash or enter a room to view ledger activity',
                          style: TextStyle(fontSize: 11, color: AppColors.slate400),
                        ),
                      ],
                    ),
                  )
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _transactions.length,
                    separatorBuilder: (context, index) => const Divider(height: 16, color: AppColors.slate100),
                    itemBuilder: (context, index) {
                      final tx = _transactions[index];
                      final isWithdrawalComplete = tx.type == 'WITHDRAWAL_COMPLETE';
                      final isCredit = tx.amount > 0 ||
                          (tx.amount == 0 &&
                              (tx.type == 'DEPOSIT' ||
                                  tx.type == 'ROOM_WIN' ||
                                  tx.type == 'REFUND' ||
                                  tx.type == 'MANUAL_CREDIT' ||
                                  isWithdrawalComplete));
                      final isZero = tx.amount == 0;
                      final color = isWithdrawalComplete
                          ? AppColors.emerald700
                          : isZero
                          ? AppColors.slate600
                          : (isCredit ? AppColors.emerald700 : AppColors.red600);
                      final sign = isZero ? '' : (isCredit ? '+' : '-');
                      final icon = _getTransactionIcon(tx.type, tx.amount);

                      return Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: isWithdrawalComplete
                                  ? AppColors.emerald50
                                  : isZero
                                  ? AppColors.slate100
                                  : (isCredit ? AppColors.emerald50 : AppColors.red50),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Icon(icon, size: 18, color: color),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  tx.description ?? tx.type,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.slate800,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  _formatDate(tx.createdAt),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.slate400,
                                    fontFamily: 'monospace',
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (isWithdrawalComplete && isZero)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: AppColors.emerald100,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                'PAID',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.emerald800,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            )
                          else
                            Text(
                              '$sign₹${tx.amount.abs().toStringAsFixed(2)}',
                              style: TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: color,
                              ),
                            ),
                        ],
                      );
                    },
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // User Profile Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.slate200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'ACCOUNT DETAILS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: AppColors.slate500,
                  ),
                ),
                const SizedBox(height: 14),
                _buildInfoRow('Username', _user.username),
                const Divider(height: 18, color: AppColors.slate100),
                _buildInfoRow('Mobile Number', _user.phone ?? 'N/A'),
                const Divider(height: 18, color: AppColors.slate100),
                _buildInfoRow('Recovery Email', _user.email ?? 'N/A'),
                const Divider(height: 18, color: AppColors.slate100),
                _buildInfoRow('Account Status', _user.status, isStatus: true),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Financial Security Guarantee
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.slate100,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.slate200),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.lock_outline, size: 16, color: AppColors.slate600),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Direct UPI Settlement: Deposits use unique paise offsets for instant automated verification. Withdrawals are cleared manually via Super Admin IMPS UTR.',
                    style: TextStyle(fontSize: 12, color: AppColors.slate600, height: 1.4),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value, {bool isStatus = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, color: AppColors.slate500)),
        if (isStatus)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.emerald50,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              value,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.emerald700),
            ),
          )
        else
          Text(
            value,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
          ),
      ],
    );
  }

  IconData _getTransactionIcon(String type, [double? amount]) {
    switch (type) {
      case 'DEPOSIT':
        return Icons.arrow_downward;
      case 'ROOM_WIN':
        return Icons.emoji_events;
      case 'ROOM_ENTRY':
      case 'ROOM_BET':
        return Icons.sports_esports;
      case 'WITHDRAWAL_LOCK':
        return Icons.arrow_upward;
      case 'WITHDRAWAL_COMPLETE':
        return Icons.check_circle_outline;
      case 'REFUND':
        return Icons.replay;
      case 'MANUAL_CREDIT':
        return Icons.add_circle;
      case 'MANUAL_DEBIT':
        return Icons.remove_circle;
      case 'MANUAL_ADJUST':
        return (amount != null && amount >= 0) ? Icons.add_circle : Icons.remove_circle;
      default:
        return (amount != null && amount >= 0) ? Icons.add_circle : Icons.payments;
    }
  }

  String _formatDate(DateTime dt) {
    final local = dt.toLocal();
    final y = local.year.toString();
    final m = local.month.toString().padLeft(2, '0');
    final d = local.day.toString().padLeft(2, '0');
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '$d/$m/$y $hh:$mm';
  }

  String _formatRelativeTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 45) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return _formatDate(dt);
  }

  void _showNotificationSheet() {
    _loadNotifications();
    String currentFilter = 'all';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final filtered = currentFilter == 'unread'
                ? _notifications.where((n) => !n.isRead).toList()
                : _notifications;

            Widget bodyContent;
            if (_loadingNotifications && _notifications.isEmpty) {
              bodyContent = const Center(
                child: Padding(
                  padding: EdgeInsets.all(32.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.emerald600),
                      SizedBox(height: 12),
                      Text('Loading updates...', style: TextStyle(fontSize: 12, color: AppColors.slate500)),
                    ],
                  ),
                ),
              );
            } else if (_notificationError != null && _notifications.isEmpty) {
              bodyContent = Center(
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.cloud_off, size: 36, color: AppColors.slate400),
                      const SizedBox(height: 10),
                      const Text(
                        'Failed to load notifications',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.slate800),
                      ),
                      const SizedBox(height: 6),
                      TextButton.icon(
                        icon: const Icon(Icons.refresh, size: 16),
                        label: const Text('Try Again'),
                        onPressed: () async {
                          await _loadNotifications();
                          setModalState(() {});
                        },
                      ),
                    ],
                  ),
                ),
              );
            } else if (filtered.isEmpty) {
              bodyContent = RefreshIndicator(
                onRefresh: () async {
                  await _loadNotifications();
                  setModalState(() {});
                },
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    SizedBox(height: MediaQuery.of(context).size.height * 0.16),
                    Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 60,
                            height: 60,
                            decoration: BoxDecoration(
                              color: AppColors.slate100,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: const Icon(Icons.notifications_none, size: 30, color: AppColors.slate400),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'No notifications',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.slate800),
                          ),
                          const SizedBox(height: 4),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 24.0),
                            child: Text(
                              currentFilter == 'unread'
                                  ? 'You have read all your notifications.'
                                  : 'Payout confirmations, deposit updates, and table results will appear here.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 12, color: AppColors.slate400),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            } else {
              bodyContent = RefreshIndicator(
                onRefresh: () async {
                  await _loadNotifications();
                  setModalState(() {});
                },
                child: ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  itemCount: filtered.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final notif = filtered[index];
                    final utr = notif.metadata?['payoutUtr'] ?? notif.metadata?['utr'];

                    return InkWell(
                      onTap: () async {
                        if (!notif.isRead) {
                          await _markAsRead(notif.id);
                          setModalState(() {});
                        }
                      },
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: notif.isRead ? Colors.white : AppColors.emerald50.withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: notif.isRead ? AppColors.slate200 : AppColors.emerald200,
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _getNotificationIconWidget(notif.type),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          notif.title,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.slate900,
                                          ),
                                        ),
                                      ),
                                      Text(
                                        _formatRelativeTime(notif.createdAt),
                                        style: const TextStyle(
                                          fontSize: 10,
                                          color: AppColors.slate400,
                                          fontFamily: 'monospace',
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    notif.message,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: AppColors.slate600,
                                      height: 1.35,
                                    ),
                                  ),
                                  if (utr != null && utr.toString().isNotEmpty) ...[
                                    const SizedBox(height: 6),
                                    GestureDetector(
                                      onTap: () {
                                        Clipboard.setData(ClipboardData(text: utr.toString()));
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          SnackBar(
                                            content: Text('UTR copied: $utr'),
                                            duration: const Duration(seconds: 2),
                                            backgroundColor: AppColors.slate900,
                                          ),
                                        );
                                      },
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: AppColors.slate100,
                                          borderRadius: BorderRadius.circular(6),
                                          border: Border.all(color: AppColors.slate200),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Text(
                                              'UTR: ',
                                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.slate500),
                                            ),
                                            Text(
                                              utr.toString(),
                                              style: const TextStyle(
                                                fontSize: 10,
                                                fontWeight: FontWeight.w700,
                                                fontFamily: 'monospace',
                                                color: AppColors.slate800,
                                              ),
                                            ),
                                            const SizedBox(width: 4),
                                            const Icon(Icons.copy, size: 11, color: AppColors.slate500),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(width: 4),
                            Column(
                              children: [
                                if (!notif.isRead)
                                  Container(
                                    width: 7,
                                    height: 7,
                                    margin: const EdgeInsets.only(top: 2, bottom: 4),
                                    decoration: const BoxDecoration(
                                      color: AppColors.emerald600,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                InkWell(
                                  onTap: () async {
                                    await _deleteNotification(notif.id);
                                    setModalState(() {});
                                  },
                                  child: const Padding(
                                    padding: EdgeInsets.all(4.0),
                                    child: Icon(Icons.delete_outline, size: 15, color: AppColors.slate400),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              );
            }

            return Container(
              height: MediaQuery.of(context).size.height * 0.78,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              ),
              child: Column(
                children: [
                  // Top Drag Handle
                  Container(
                    width: 38,
                    height: 4,
                    margin: const EdgeInsets.only(top: 10, bottom: 6),
                    decoration: BoxDecoration(
                      color: AppColors.slate300,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),

                  // Header
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.slate100,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(Icons.notifications, size: 20, color: AppColors.slate700),
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Notifications',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                            ),
                            Text(
                              _unreadNotificationCount > 0
                                  ? '$_unreadNotificationCount unread update${_unreadNotificationCount > 1 ? 's' : ''}'
                                  : 'All caught up',
                              style: const TextStyle(fontSize: 11, color: AppColors.slate400),
                            ),
                          ],
                        ),
                        const Spacer(),
                        if (_unreadNotificationCount > 0)
                          TextButton.icon(
                            style: TextButton.styleFrom(
                              backgroundColor: AppColors.emerald50,
                              foregroundColor: AppColors.emerald700,
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            icon: const Icon(Icons.done_all, size: 16),
                            label: const Text('Read all', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                            onPressed: () async {
                              await _markAllAsRead();
                              setModalState(() {});
                            },
                          ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 20, color: AppColors.slate500),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                  ),

                  // Filter Pills
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    color: AppColors.slate50,
                    child: Row(
                      children: [
                        _buildFilterChip(
                          label: 'All (${_notifications.length})',
                          isSelected: currentFilter == 'all',
                          onTap: () => setModalState(() => currentFilter = 'all'),
                        ),
                        const SizedBox(width: 8),
                        _buildFilterChip(
                          label: 'Unread ($_unreadNotificationCount)',
                          isSelected: currentFilter == 'unread',
                          badgeCount: _unreadNotificationCount,
                          onTap: () => setModalState(() => currentFilter = 'unread'),
                        ),
                        const Spacer(),
                        if (_notifications.isNotEmpty)
                          TextButton.icon(
                            icon: const Icon(Icons.delete_sweep, size: 15, color: AppColors.red600),
                            label: const Text('Clear', style: TextStyle(fontSize: 11, color: AppColors.red600)),
                            onPressed: () async {
                              await _clearAllNotifications();
                              setModalState(() {});
                            },
                          ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.slate200),

                  // Notification List
                  Expanded(
                    child: bodyContent,
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildFilterChip({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
    int badgeCount = 0,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: isSelected ? Border.all(color: AppColors.slate200) : null,
          boxShadow: isSelected ? [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 2)] : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? AppColors.slate900 : AppColors.slate500,
          ),
        ),
      ),
    );
  }

  Widget _getNotificationIconWidget(String type) {
    IconData icon;
    Color iconColor;
    Color bgColor;

    switch (type) {
      case 'WITHDRAWAL_COMPLETED':
        icon = Icons.arrow_outward;
        iconColor = AppColors.emerald700;
        bgColor = AppColors.emerald50;
        break;
      case 'WITHDRAWAL_REQUESTED':
        icon = Icons.hourglass_top_rounded;
        iconColor = Colors.indigo.shade700;
        bgColor = Colors.indigo.shade50;
        break;
      case 'WITHDRAWAL_REJECTED':
        icon = Icons.error_outline;
        iconColor = AppColors.red600;
        bgColor = AppColors.red50;
        break;
      case 'DEPOSIT_APPROVED':
        icon = Icons.arrow_downward;
        iconColor = Colors.blue.shade700;
        bgColor = Colors.blue.shade50;
        break;
      case 'ROOM_WIN':
        icon = Icons.emoji_events;
        iconColor = Colors.amber.shade800;
        bgColor = Colors.amber.shade50;
        break;
      case 'FEEDBACK_REPLY':
        icon = Icons.chat_bubble_outline;
        iconColor = Colors.purple.shade700;
        bgColor = Colors.purple.shade50;
        break;
      default:
        icon = Icons.notifications_none;
        iconColor = AppColors.slate600;
        bgColor = AppColors.slate100;
    }

    return Container(
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Icon(icon, size: 16, color: iconColor),
    );
  }
}
