import 'package:flutter/material.dart';
import '../core/constants/colors.dart';
import '../core/network/api_client.dart';
import '../core/network/socket_service.dart';
import '../core/storage/secure_storage_service.dart';
import 'lobby/lobby_screen.dart';
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

  @override
  void initState() {
    super.initState();
    _user = widget.user;
    _initSocket();
    _refreshProfile();
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
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Payment approved! Wallet balance: ₹${newBalance.toStringAsFixed(2)}'),
              backgroundColor: AppColors.emerald700,
            ),
          );
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
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        centerTitle: false,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.slate900,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                'MG',
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: AppColors.white,
                ),
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
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.white,
          border: Border(top: BorderSide(color: AppColors.slate200, width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) {
            setState(() => _currentIndex = index);
            if (index == 1) _refreshProfile();
          },
          backgroundColor: AppColors.white,
          selectedItemColor: AppColors.emerald700,
          unselectedItemColor: AppColors.slate400,
          selectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
          unselectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
          elevation: 0,
          items: const [
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
}
