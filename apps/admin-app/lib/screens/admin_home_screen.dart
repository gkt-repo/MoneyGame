import 'package:flutter/material.dart';
import '../core/constants/colors.dart';
import '../core/network/admin_api_client.dart';
import 'dashboard/admin_dashboard_screen.dart';
import 'withdrawals/withdrawals_queue_screen.dart';
import 'deposits/deposits_ledger_screen.dart';
import 'settings/admin_settings_screen.dart';

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
  int _pendingCount = 0;

  @override
  void initState() {
    super.initState();
    _fetchPendingCount();
  }

  Future<void> _fetchPendingCount() async {
    try {
      final stats = await AdminApiClient.getStats();
      if (mounted) {
        setState(() => _pendingCount = stats.pendingWithdrawalsCount);
      }
    } catch (_) {}
  }

  void _onTabTapped(int index) {
    setState(() => _currentIndex = index);
    _fetchPendingCount();
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
            const Text(
              'Super Admin',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: AppColors.slate900,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, size: 20, color: AppColors.slate600),
            tooltip: 'Refresh',
            onPressed: () {
              _fetchPendingCount();
              setState(() {});
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout, size: 20, color: AppColors.slate600),
            tooltip: 'Logout',
            onPressed: widget.onLogout,
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
          ),
          WithdrawalsQueueScreen(
            onQueueUpdated: _fetchPendingCount,
          ),
          const DepositsLedgerScreen(),
          AdminSettingsScreen(
            admin: widget.admin,
            onLogout: widget.onLogout,
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
            BottomNavigationBarItem(
              icon: Badge(
                isLabelVisible: _pendingCount > 0,
                label: Text('$_pendingCount'),
                backgroundColor: AppColors.red600,
                child: const Icon(Icons.account_balance_wallet_outlined),
              ),
              activeIcon: Badge(
                isLabelVisible: _pendingCount > 0,
                label: Text('$_pendingCount'),
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
            const BottomNavigationBarItem(
              icon: Icon(Icons.settings_outlined),
              activeIcon: Icon(Icons.settings),
              label: 'Gateway',
            ),
          ],
        ),
      ),
    );
  }
}
