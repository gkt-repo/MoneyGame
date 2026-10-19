import 'package:flutter/material.dart';
import '../core/constants/colors.dart';
import '../core/network/admin_api_client.dart';
import '../core/services/listener_service.dart';
import 'dashboard/admin_dashboard_screen.dart';
import 'users/users_screen.dart';
import 'withdrawals/withdrawals_queue_screen.dart';
import 'deposits/deposits_ledger_screen.dart';
import 'more/admin_more_screen.dart';
import 'feedback/feedback_screen.dart';

class AdminHomeScreen extends StatefulWidget {
  final AdminProfileModel admin;
  final VoidCallback onLogout;

  const AdminHomeScreen({
    super.key,
    required this.admin,
    required this.onLogout,
  });

  @override
  State<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends State<AdminHomeScreen> {
  int _currentIndex = 0;
  int _pendingWithdrawalsCount = 0;
  int _openFeedbacksCount = 0;

  @override
  void initState() {
    super.initState();
    _fetchCounts();
    ListenerService.startAutoHeartbeat();
  }

  @override
  void dispose() {
    ListenerService.stopAutoHeartbeat();
    super.dispose();
  }

  void _handleLogout() {
    ListenerService.stopAutoHeartbeat();
    widget.onLogout();
  }

  Future<void> _fetchCounts() async {
    try {
      final stats = await AdminApiClient.getStats();
      if (mounted) {
        setState(() {
          _pendingWithdrawalsCount = stats.pendingWithdrawalsCount;
          _openFeedbacksCount = stats.openFeedbacksCount;
        });
      }
    } catch (_) {}
  }

  void _onTabTapped(int index) {
    setState(() => _currentIndex = index);
    _fetchCounts();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        centerTitle: false,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.slate900,
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text(
                'MG ADMIN',
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: AppColors.white,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              widget.admin.username,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: AppColors.slate900,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Badge(
              isLabelVisible: _openFeedbacksCount > 0,
              label: Text('$_openFeedbacksCount'),
              backgroundColor: AppColors.amber800,
              child: const Icon(Icons.support_agent_outlined, size: 22, color: AppColors.slate700),
            ),
            tooltip: 'Support Desk Tickets',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const FeedbackScreen()),
              ).then((_) => _fetchCounts());
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh, size: 20, color: AppColors.slate600),
            tooltip: 'Refresh Telemetry',
            onPressed: () {
              _fetchCounts();
              setState(() {});
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout, size: 20, color: AppColors.slate600),
            tooltip: 'Logout',
            onPressed: _handleLogout,
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
          AdminDashboardScreen(
            admin: widget.admin,
            onNavigateTab: _onTabTapped,
            onLogout: _handleLogout,
          ),
          const UsersScreen(),
          WithdrawalsQueueScreen(
            onQueueUpdated: _fetchCounts,
          ),
          const DepositsLedgerScreen(),
          AdminMoreScreen(
            admin: widget.admin,
            onLogout: _handleLogout,
            onRefreshCounts: _fetchCounts,
          ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.white,
          border: Border(top: BorderSide(color: AppColors.slate200, width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: _onTabTapped,
          type: BottomNavigationBarType.fixed,
          backgroundColor: AppColors.white,
          selectedItemColor: AppColors.slate900,
          unselectedItemColor: AppColors.slate400,
          selectedLabelStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800),
          unselectedLabelStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.w500),
          elevation: 0,
          items: [
            const BottomNavigationBarItem(
              icon: Icon(Icons.dashboard_outlined),
              activeIcon: Icon(Icons.dashboard),
              label: 'Overview',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.people_outline),
              activeIcon: Icon(Icons.people),
              label: 'Users',
            ),
            BottomNavigationBarItem(
              icon: Badge(
                isLabelVisible: _pendingWithdrawalsCount > 0,
                label: Text('$_pendingWithdrawalsCount'),
                backgroundColor: AppColors.red600,
                child: const Icon(Icons.account_balance_wallet_outlined),
              ),
              activeIcon: Badge(
                isLabelVisible: _pendingWithdrawalsCount > 0,
                label: Text('$_pendingWithdrawalsCount'),
                backgroundColor: AppColors.red600,
                child: const Icon(Icons.account_balance_wallet),
              ),
              label: 'Payouts',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.receipt_long_outlined),
              activeIcon: Icon(Icons.receipt_long),
              label: 'Deposits',
            ),
            BottomNavigationBarItem(
              icon: Badge(
                isLabelVisible: _openFeedbacksCount > 0,
                label: Text('$_openFeedbacksCount'),
                backgroundColor: AppColors.amber800,
                child: const Icon(Icons.menu_outlined),
              ),
              activeIcon: Badge(
                isLabelVisible: _openFeedbacksCount > 0,
                label: Text('$_openFeedbacksCount'),
                backgroundColor: AppColors.amber800,
                child: const Icon(Icons.menu),
              ),
              label: 'More',
            ),
          ],
        ),
      ),
    );
  }
}
