import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';
import '../../core/storage/admin_secure_storage.dart';
import '../feedback/feedback_screen.dart';
import '../rooms/rooms_screen.dart';
import '../settings/admin_settings_screen.dart';

class AdminMoreScreen extends StatefulWidget {
  final AdminProfileModel admin;
  final VoidCallback onLogout;
  final VoidCallback? onRefreshCounts;

  const AdminMoreScreen({
    super.key,
    required this.admin,
    required this.onLogout,
    this.onRefreshCounts,
  });

  @override
  State<AdminMoreScreen> createState() => _AdminMoreScreenState();
}

class _AdminMoreScreenState extends State<AdminMoreScreen> {
  AdminStatsModel? _stats;

  @override
  void initState() {
    super.initState();
    _fetchStats();
  }

  Future<void> _fetchStats() async {
    try {
      final s = await AdminApiClient.getStats();
      if (mounted) setState(() => _stats = s);
    } catch (_) {}
  }

  Future<void> _handleSimulateWebhook() async {
    final amtController = TextEditingController(text: '100');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text('Simulate Bank Webhook', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Simulate incoming bank notification (Android listener webhook). Finds matching pending deposit and marks APPROVED.',
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
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final amt = double.tryParse(amtController.text) ?? 100;
              Navigator.of(ctx).pop();
              try {
                await AdminApiClient.simulatePayment(amount: amt);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Simulated payment of ₹$amt verified successfully!'), backgroundColor: AppColors.emerald700),
                  );
                  _fetchStats();
                  widget.onRefreshCounts?.call();
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
    final openFeedbacks = _stats?.openFeedbacksCount ?? 0;
    final activeRooms = _stats?.activeRooms ?? 0;

    return Scaffold(
      backgroundColor: AppColors.slate50,
      body: RefreshIndicator(
        onRefresh: () async {
          await _fetchStats();
          widget.onRefreshCounts?.call();
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Admin Header Card
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
                      radius: 22,
                      backgroundColor: AppColors.slate900,
                      child: Text(
                        widget.admin.username.isNotEmpty ? widget.admin.username.substring(0, 1).toUpperCase() : 'A',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.white),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.admin.username, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.slate900)),
                          Text(widget.admin.email, style: const TextStyle(fontSize: 11, color: AppColors.slate500)),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.emerald50,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.3)),
                      ),
                      child: Text(widget.admin.role, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.emerald800)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // SECTION 1: OPERATIONS & MANAGEMENT
              const Text(
                'OPERATIONS & MONITORING',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: AppColors.slate500),
              ),
              const SizedBox(height: 10),

              _buildMenuTile(
                icon: Icons.support_agent_outlined,
                iconColor: AppColors.amber800,
                iconBg: AppColors.amber50,
                title: 'Player Support & Feedback Desk',
                subtitle: 'Review tickets, send responses, and resolve player queries',
                badgeText: openFeedbacks > 0 ? '$openFeedbacks open' : null,
                badgeColor: AppColors.amber800,
                badgeBg: AppColors.amber50,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const FeedbackScreen()),
                ).then((_) => _fetchStats()),
              ),
              const SizedBox(height: 8),

              _buildMenuTile(
                icon: Icons.casino_outlined,
                iconColor: AppColors.emerald700,
                iconBg: AppColors.emerald50,
                title: 'Active Game Tables & Rooms',
                subtitle: 'Live monitor of multiplayer rooms, joined players, and stakes',
                badgeText: activeRooms > 0 ? '$activeRooms live' : null,
                badgeColor: AppColors.emerald800,
                badgeBg: AppColors.emerald50,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const RoomsScreen()),
                ),
              ),
              const SizedBox(height: 8),

              _buildMenuTile(
                icon: Icons.flash_on_outlined,
                iconColor: AppColors.slate800,
                iconBg: AppColors.slate100,
                title: 'Simulate Incoming Bank Webhook',
                subtitle: 'Test automatic push notification payment approval',
                onTap: _handleSimulateWebhook,
              ),
              const SizedBox(height: 20),

              // SECTION 2: SYSTEM CONFIGURATION
              const Text(
                'SYSTEM CONFIGURATION',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: AppColors.slate500),
              ),
              const SizedBox(height: 10),

              _buildMenuTile(
                icon: Icons.settings_outlined,
                iconColor: AppColors.slate800,
                iconBg: AppColors.slate100,
                title: 'Gateway & Support Channels',
                subtitle: 'Receiving UPI VPA, official email, WhatsApp & Telegram helpline',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => AdminSettingsScreen(admin: widget.admin, onLogout: widget.onLogout),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // SECTION 3: SESSION & LOGOUT
              const Text(
                'SESSION & SECURITY',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: AppColors.slate500),
              ),
              const SizedBox(height: 10),

              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.slate200),
                ),
                child: Column(
                  children: [
                    _buildRow('Admin ID', widget.admin.id),
                    const Divider(height: 16),
                    _buildRow('Permission Role', widget.admin.role),
                    const Divider(height: 16),
                    _buildRow('Audience Claim', 'moneygame-admin'),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 42,
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          await AdminSecureStorage.clearSession();
                          widget.onLogout();
                        },
                        icon: const Icon(Icons.logout, size: 16, color: AppColors.red600),
                        label: const Text('End Admin Session', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.red600)),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: AppColors.red600.withValues(alpha: 0.3)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMenuTile({
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    required String subtitle,
    String? badgeText,
    Color? badgeColor,
    Color? badgeBg,
    required VoidCallback onTap,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.slate200),
      ),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        leading: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: iconBg,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 20, color: iconColor),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
            ),
            if (badgeText != null) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: badgeBg ?? AppColors.slate100,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  badgeText,
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: badgeColor ?? AppColors.slate700),
                ),
              ),
            ],
          ],
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(fontSize: 11, color: AppColors.slate500),
        ),
        trailing: const Icon(Icons.arrow_forward_ios, size: 13, color: AppColors.slate400),
      ),
    );
  }

  Widget _buildRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.slate500)),
        Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate900)),
      ],
    );
  }
}
