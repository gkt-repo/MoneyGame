import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';

class AdminDashboardScreen extends StatefulWidget {
  final AdminProfileModel admin;
  final Function(int targetTab) onNavigateTab;

  const AdminDashboardScreen({
    super.key,
    required this.admin,
    required this.onNavigateTab,
  });

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  AdminStatsModel? _stats;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchStats();
  }

  Future<void> _fetchStats() async {
    setState(() => _loading = true);
    try {
      final stats = await AdminApiClient.getStats();
      if (mounted) {
        setState(() {
          _stats = stats;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _handleSimulateWebhook() async {
    final amtController = TextEditingController(text: '100');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text(
          'Simulate Bank Webhook',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Simulate incoming bank notification (Android listener webhook). Automatically finds pending deposit matching this amount and marks APPROVED.',
              style: TextStyle(fontSize: 12, color: AppColors.slate600, height: 1.4),
            ),
            const SizedBox(height: 14),
            const Text('Deposit Amount (₹)', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            TextField(
              controller: amtController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700),
              decoration: const InputDecoration(
                prefixText: '₹ ',
                border: OutlineInputBorder(),
                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.slate500)),
          ),
          ElevatedButton(
            onPressed: () async {
              final amt = double.tryParse(amtController.text) ?? 100;
              Navigator.of(ctx).pop();
              try {
                await AdminApiClient.simulatePayment(amount: amt);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Simulated payment of ₹$amt verified successfully!'),
                      backgroundColor: AppColors.emerald700,
                    ),
                  );
                  _fetchStats();
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(e.toString()), backgroundColor: AppColors.red600),
                  );
                }
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.slate900),
            child: const Text('Dispatch Simulation', style: TextStyle(color: AppColors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      body: RefreshIndicator(
        onRefresh: _fetchStats,
        color: AppColors.slate900,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Admin Greeting Header
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.slate200),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: AppColors.slate900,
                      child: const Icon(Icons.admin_panel_settings, size: 20, color: AppColors.white),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.admin.username,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Super Admin (${widget.admin.email})',
                            style: const TextStyle(fontSize: 12, color: AppColors.slate500),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.emerald50,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.2)),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.circle, size: 6, color: AppColors.emerald600),
                          SizedBox(width: 4),
                          Text(
                            'ONLINE',
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.emerald800),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // KPI Section Title
              const Text(
                'PLATFORM OVERVIEW',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                  color: AppColors.slate500,
                ),
              ),
              const SizedBox(height: 10),

              if (_loading && _stats == null) ...[
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900)),
                ),
              ] else if (_error != null && _stats == null) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.red50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                  ),
                  child: Column(
                    children: [
                      Text(_error!, style: const TextStyle(color: AppColors.red600, fontSize: 13)),
                      const SizedBox(height: 10),
                      ElevatedButton(
                        onPressed: _fetchStats,
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.red600),
                        child: const Text('Retry', style: TextStyle(color: AppColors.white)),
                      ),
                    ],
                  ),
                ),
              ] else if (_stats != null) ...[
                // Grid of 6 KPI Cards
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  childAspectRatio: 1.45,
                  children: [
                    _buildKpiCard(
                      title: 'TOTAL USERS',
                      value: '${_stats!.totalUsers}',
                      icon: Icons.people_outline,
                      iconColor: AppColors.slate700,
                    ),
                    _buildKpiCard(
                      title: 'TOTAL DEPOSITED',
                      value: '₹${_stats!.totalDeposited.toStringAsFixed(0)}',
                      icon: Icons.south_west,
                      iconColor: AppColors.emerald600,
                      isMonospace: true,
                    ),
                    _buildKpiCard(
                      title: 'TOTAL WITHDRAWN',
                      value: '₹${_stats!.totalWithdrawn.toStringAsFixed(0)}',
                      icon: Icons.north_east,
                      iconColor: AppColors.amber600,
                      isMonospace: true,
                    ),
                    _buildKpiCard(
                      title: 'PLATFORM PROFIT',
                      value: '₹${_stats!.platformProfit.toStringAsFixed(0)}',
                      icon: Icons.account_balance,
                      iconColor: AppColors.emerald700,
                      isMonospace: true,
                    ),
                    _buildKpiCard(
                      title: 'PENDING PAYOUTS',
                      value: '${_stats!.pendingWithdrawalsCount}',
                      icon: Icons.pending_actions,
                      iconColor: _stats!.pendingWithdrawalsCount > 0 ? AppColors.red600 : AppColors.slate500,
                      highlightAlert: _stats!.pendingWithdrawalsCount > 0,
                    ),
                    _buildKpiCard(
                      title: 'ACTIVE TABLES',
                      value: '${_stats!.activeRooms}',
                      icon: Icons.casino_outlined,
                      iconColor: AppColors.slate700,
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Quick Action Clearance Banner
                if (_stats!.pendingWithdrawalsCount > 0) ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.amber50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.amber600.withValues(alpha: 0.3)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.warning_amber_rounded, size: 24, color: AppColors.amber800),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${_stats!.pendingWithdrawalsCount} Payout Request${_stats!.pendingWithdrawalsCount > 1 ? 's' : ''} Awaiting',
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.amber800),
                              ),
                              const SizedBox(height: 2),
                              const Text(
                                'Clear player withdrawals with bank UTR verification.',
                                style: TextStyle(fontSize: 11, color: AppColors.amber800),
                              ),
                            ],
                          ),
                        ),
                        ElevatedButton(
                          onPressed: () => widget.onNavigateTab(1),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.amber800,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                          ),
                          child: const Text('Clear Now', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.white)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                ],

                // Quick Navigation Cards
                const Text(
                  'QUICK ACTIONS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: AppColors.slate500,
                  ),
                ),
                const SizedBox(height: 10),

                _buildActionTile(
                  icon: Icons.account_balance_wallet_outlined,
                  title: 'Withdrawal Clearance Queue',
                  subtitle: 'Inspect UPI VPAs and input bank IMPS/UPI UTRs',
                  onTap: () => widget.onNavigateTab(1),
                ),
                const SizedBox(height: 8),
                _buildActionTile(
                  icon: Icons.receipt_long_outlined,
                  title: 'Live Deposits Ledger',
                  subtitle: 'View automated paise-offset reconciliation log',
                  onTap: () => widget.onNavigateTab(2),
                ),
                const SizedBox(height: 8),
                _buildActionTile(
                  icon: Icons.settings_outlined,
                  title: 'Gateway & UPI Settings',
                  subtitle: 'Receiver UPI: ${_stats!.adminUpiId}',
                  onTap: () => widget.onNavigateTab(3),
                ),
                const SizedBox(height: 8),
                _buildActionTile(
                  icon: Icons.flash_on_outlined,
                  title: 'Simulate Bank Push Notification',
                  subtitle: 'Test automated webhook without real bank transfer',
                  onTap: _handleSimulateWebhook,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildKpiCard({
    required String title,
    required String value,
    required IconData icon,
    required Color iconColor,
    bool isMonospace = false,
    bool highlightAlert = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: highlightAlert ? AppColors.red50 : AppColors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: highlightAlert ? AppColors.red600.withValues(alpha: 0.4) : AppColors.slate200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                  color: highlightAlert ? AppColors.red700 : AppColors.slate400,
                ),
              ),
              Icon(icon, size: 16, color: iconColor),
            ],
          ),
          Text(
            value,
            style: TextStyle(
              fontFamily: isMonospace ? 'monospace' : null,
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: highlightAlert ? AppColors.red700 : AppColors.slate900,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.slate200),
      ),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: AppColors.slate100,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 18, color: AppColors.slate800),
        ),
        title: Text(
          title,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(fontSize: 11, color: AppColors.slate500),
        ),
        trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.slate400),
      ),
    );
  }
}
