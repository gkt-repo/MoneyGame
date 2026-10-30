import '../core/constants/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/constants/colors.dart';
import '../core/network/api_client.dart';
import '../core/network/socket_service.dart';
import '../core/storage/secure_storage_service.dart';
import '../core/services/notification_sound_service.dart';
import 'lobby/lobby_screen.dart';
import 'trading/trading_screen.dart';
import 'wallet/withdraw_screen.dart';
import 'wallet/add_cash_screen.dart';
import 'profile/personal_profile_screen.dart';

class HomeScreen extends StatefulWidget {
  final UserProfileModel user;
  final VoidCallback onLogout;
  final String? pendingInvitation;
  final VoidCallback? onInvitationOpened;

  const HomeScreen({
    super.key,
    required this.user,
    required this.onLogout,
    this.pendingInvitation,
    this.onInvitationOpened,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late UserProfileModel _user;
  int _currentIndex = 0;

  List<NotificationItemModel> _notifications = [];
  int _unreadNotificationCount = 0;
  bool _loadingNotifications = false;
  String? _notificationError;

  @override
  void initState() {
    super.initState();
    _user = widget.user;
    if (widget.pendingInvitation != null) _currentIndex = 1;
    _initSocket();
    _refreshProfile();
    _loadNotifications();
  }

  @override
  void didUpdateWidget(covariant HomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.pendingInvitation != null &&
        widget.pendingInvitation != oldWidget.pendingInvitation) {
      _currentIndex = 1;
    }
  }

  @override
  void dispose() {
    SocketService.disconnect();
    super.dispose();
  }

  void _initSocket() {
    SocketService.connect(
      _user.id,
      onBalanceUpdated: (newBalance) {
        if (mounted) {
          setState(() {
            _user = _user.copyWith(balance: newBalance);
          });
        }
      },
      onDepositApproved: (newBalance) {
        if (mounted) {
          setState(() {
            _user = _user.copyWith(balance: newBalance);
          });
          _loadNotifications();
          NotificationSoundService().playNotificationRing();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Payment approved! Wallet balance: ₹${newBalance.toStringAsFixed(2)}',
              ),
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
          _refreshProfile();

          // Show floating on-screen banner popup
          ScaffoldMessenger.of(context).hideCurrentSnackBar();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              behavior: SnackBarBehavior.floating,
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
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
                          style: TextStyle(
                            fontSize: 11,
                            color: context.palette.adapt(AppColors.slate300),
                          ),
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
      _notifications = _notifications
          .map((n) => n.id == id ? n.copyWith(isRead: true) : n)
          .toList();
      _unreadNotificationCount = (_unreadNotificationCount - 1).clamp(0, 999);
    });
    await ApiClient.markNotificationAsRead(id);
  }

  Future<void> _markAllAsRead() async {
    setState(() {
      _notifications = _notifications
          .map((n) => n.copyWith(isRead: true))
          .toList();
      _unreadNotificationCount = 0;
    });
    await ApiClient.markAllNotificationsAsRead();
  }

  Future<void> _deleteNotification(String id) async {
    final target = _notifications.firstWhere(
      (n) => n.id == id,
      orElse: () => _notifications.first,
    );
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

  void _openDeposit() {
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => AddCashScreen(
              user: _user,
              onPaymentSuccess: _refreshProfile,
            ),
          ),
        )
        .then((_) {
          if (mounted) _refreshProfile();
        });
  }

  void _openWithdraw() {
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => WithdrawScreen(
              user: _user,
              onWithdrawalSuccess: _refreshProfile,
            ),
          ),
        )
        .then((_) => _refreshProfile());
  }

  void _openProfile() {
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => PersonalProfileScreen(
              user: _user,
              onChanged: _refreshProfile,
              onNotifications: _showNotificationSheet,
              onLogout: () {
                Navigator.of(context).popUntil((route) => route.isFirst);
                _confirmLogout();
              },
            ),
          ),
        )
        .then((_) {
          if (mounted) _refreshProfile();
        });
  }

  void _openTrading() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => TradingScreen(
          userId: _user.id,
          onWithdraw: () async {
            await _refreshProfile();
            if (mounted) _openWithdraw();
          },
        ),
      ),
    );
  }

  void _confirmLogout() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.palette.adapt(AppColors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text(
          'Confirm Logout',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Text(
          'Are you sure you want to end this session?',
          style: TextStyle(fontSize: 13, color: context.palette.adapt(AppColors.slate600)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(
              'Cancel',
              style: TextStyle(color: context.palette.adapt(AppColors.slate500)),
            ),
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
            child: const Text(
              'Logout',
              style: TextStyle(color: AppColors.white),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.palette.adapt(AppColors.canvas),
    appBar: AppBar(
      backgroundColor: context.palette.adapt(AppColors.canvas),
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: 16,
      toolbarHeight: 48,
      title: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: Image.asset(
              'assets/icon/app_icon.png',
              width: 24,
              height: 24,
              fit: BoxFit.cover,
            ),
          ),
          const SizedBox(width: 9),
          Text(
            'MONEYGAME',
            style: TextStyle(
              fontSize: 13,
              letterSpacing: 2,
              fontWeight: FontWeight.w700,
              color: context.palette.adapt(AppColors.ink),
            ),
          ),
        ],
      ),
      actions: [
        Padding(
          padding: const EdgeInsets.only(right: 16),
          child: IconButton(
            tooltip: 'My profile',
            onPressed: _openProfile,
            style: IconButton.styleFrom(
              backgroundColor: context.palette.adapt(Colors.white),
              side: BorderSide(color: context.palette.adapt(AppColors.outline)),
              minimumSize: const Size(40, 40),
            ),
            icon: Icon(
              Icons.person_outline,
              size: 20,
              color: context.palette.adapt(AppColors.ink),
            ),
          ),
        ),
      ],
      bottom: PreferredSize(
        preferredSize: Size.fromHeight(
          MediaQuery.textScalerOf(context).scale(44) + 12,
        ),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Balance',
                        style: TextStyle(
                          color: context.palette.muted,
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '₹${_user.balance.toStringAsFixed(2)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: context.palette.ink,
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                IconButton.filled(
                  tooltip: 'Deposit',
                  onPressed: _openDeposit,
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.emerald700,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(40, 40),
                  ),
                  icon: const Icon(Icons.add_rounded, size: 20),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
    body: LobbyScreen(
      user: _user,
      onBalanceRefresh: _refreshProfile,
      pendingInvitation: widget.pendingInvitation,
      onInvitationOpened: widget.onInvitationOpened,
      section: LobbySection.values[_currentIndex],
      onOpenTrading: _openTrading,
    ),
    bottomNavigationBar: DecoratedBox(
      decoration: BoxDecoration(
        color: context.palette.adapt(Colors.white),
        border: Border(top: BorderSide(color: context.palette.adapt(AppColors.outline))),
      ),
      child: NavigationBarTheme(
        data: NavigationBarThemeData(
          iconTheme: WidgetStateProperty.resolveWith(
            (states) => IconThemeData(
              color: states.contains(WidgetState.selected)
                  ? context.palette.accent
                  : context.palette.adapt(AppColors.muted),
            ),
          ),
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => TextStyle(
              color: states.contains(WidgetState.selected)
                  ? context.palette.adapt(AppColors.ink)
                  : context.palette.adapt(AppColors.muted),
              fontSize: 11,
              fontWeight: states.contains(WidgetState.selected)
                  ? FontWeight.w700
                  : FontWeight.w500,
            ),
          ),
        ),
        child: NavigationBar(
          height: 60,
          labelPadding: const EdgeInsets.only(top: 2),
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          indicatorColor: context.palette.adapt(AppColors.emerald50),
          selectedIndex: _currentIndex,
          onDestinationSelected: (index) =>
              setState(() => _currentIndex = index),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.sports_esports_outlined),
              selectedIcon: Icon(Icons.sports_esports),
              label: 'Games',
            ),
            NavigationDestination(
              icon: Icon(Icons.table_restaurant_outlined),
              selectedIcon: Icon(Icons.table_restaurant),
              label: 'Join Tables',
            ),
            NavigationDestination(
              icon: Icon(Icons.bookmark_border_rounded),
              selectedIcon: Icon(Icons.bookmark_rounded),
              label: 'My Table',
            ),
          ],
        ),
      ),
    ),
  );

  String _formatRelativeTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 45) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${dt.day}/${dt.month}/${dt.year}';
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
              bodyContent = Center(
                child: Padding(
                  padding: EdgeInsets.all(32.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.emerald600),
                      SizedBox(height: 12),
                      Text('Loading updates...', style: TextStyle(fontSize: 12, color: context.palette.adapt(AppColors.slate500))),
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
                      Icon(Icons.cloud_off, size: 36, color: context.palette.adapt(AppColors.slate400)),
                      const SizedBox(height: 10),
                      Text(
                        'Failed to load notifications',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: context.palette.adapt(AppColors.slate800)),
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
                              color: context.palette.adapt(AppColors.slate100),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Icon(Icons.notifications_none, size: 30, color: context.palette.adapt(AppColors.slate400)),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No notifications',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: context.palette.adapt(AppColors.slate800)),
                          ),
                          const SizedBox(height: 4),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 24.0),
                            child: Text(
                              currentFilter == 'unread'
                                  ? 'You have read all your notifications.'
                                  : 'Payout confirmations, deposit updates, and table results will appear here.',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 12, color: context.palette.adapt(AppColors.slate400)),
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
                          color: notif.isRead ? context.palette.adapt(Colors.white) : context.palette.adapt(AppColors.emerald50).withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: notif.isRead ? context.palette.adapt(AppColors.slate200) : AppColors.emerald200,
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
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                            color: context.palette.adapt(AppColors.slate900),
                                          ),
                                        ),
                                      ),
                                      Text(
                                        _formatRelativeTime(notif.createdAt),
                                        style: TextStyle(
                                          fontSize: 10,
                                          color: context.palette.adapt(AppColors.slate400),
                                          fontFamily: 'monospace',
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    notif.message,
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: context.palette.adapt(AppColors.slate600),
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
                                          color: context.palette.adapt(AppColors.slate100),
                                          borderRadius: BorderRadius.circular(6),
                                          border: Border.all(color: context.palette.adapt(AppColors.slate200)),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(
                                              'UTR: ',
                                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: context.palette.adapt(AppColors.slate500)),
                                            ),
                                            Text(
                                              utr.toString(),
                                              style: TextStyle(
                                                fontSize: 10,
                                                fontWeight: FontWeight.w700,
                                                fontFamily: 'monospace',
                                                color: context.palette.adapt(AppColors.slate800),
                                              ),
                                            ),
                                            const SizedBox(width: 4),
                                            Icon(Icons.copy, size: 11, color: context.palette.adapt(AppColors.slate500)),
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
                                  child: Padding(
                                    padding: EdgeInsets.all(4.0),
                                    child: Icon(Icons.delete_outline, size: 15, color: context.palette.adapt(AppColors.slate400)),
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
              decoration: BoxDecoration(
                color: context.palette.adapt(Colors.white),
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
                      color: context.palette.adapt(AppColors.slate300),
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
                            color: context.palette.adapt(AppColors.slate100),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(Icons.notifications, size: 20, color: context.palette.adapt(AppColors.slate700)),
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Notifications',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: context.palette.adapt(AppColors.slate900)),
                            ),
                            Text(
                              _unreadNotificationCount > 0
                                  ? '$_unreadNotificationCount unread update${_unreadNotificationCount > 1 ? 's' : ''}'
                                  : 'All caught up',
                              style: TextStyle(fontSize: 11, color: context.palette.adapt(AppColors.slate400)),
                            ),
                          ],
                        ),
                        const Spacer(),
                        if (_unreadNotificationCount > 0)
                          TextButton.icon(
                            style: TextButton.styleFrom(
                              backgroundColor: context.palette.adapt(AppColors.emerald50),
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
                          icon: Icon(Icons.close, size: 20, color: context.palette.adapt(AppColors.slate500)),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                  ),

                  // Filter Pills
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    color: context.palette.adapt(AppColors.slate50),
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
                  Divider(height: 1, color: context.palette.adapt(AppColors.slate200)),

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
          color: isSelected ? context.palette.adapt(Colors.white) : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: isSelected ? Border.all(color: context.palette.adapt(AppColors.slate200)) : null,
          boxShadow: isSelected ? [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 2)] : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? context.palette.adapt(AppColors.slate900) : context.palette.adapt(AppColors.slate500),
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
        bgColor = context.palette.adapt(AppColors.emerald50);
        break;
      case 'WITHDRAWAL_REQUESTED':
        icon = Icons.hourglass_top_rounded;
        iconColor = Colors.indigo.shade700;
        bgColor = Colors.indigo.shade50;
        break;
      case 'WITHDRAWAL_REJECTED':
        icon = Icons.error_outline;
        iconColor = AppColors.red600;
        bgColor = context.palette.adapt(AppColors.red50);
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
        iconColor = context.palette.adapt(AppColors.slate600);
        bgColor = context.palette.adapt(AppColors.slate100);
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
