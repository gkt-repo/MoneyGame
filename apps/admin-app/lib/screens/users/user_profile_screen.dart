import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';

class UserProfileScreen extends StatefulWidget {
  final String userId;
  final VoidCallback? onUserUpdated;

  const UserProfileScreen({
    super.key,
    required this.userId,
    this.onUserUpdated,
  });

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  UserProfileDetailModel? _profile;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
    _fetchProfile();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _fetchProfile() async {
    setState(() => _loading = true);
    try {
      final data = await AdminApiClient.getUserDetail(widget.userId);
      if (mounted) {
        setState(() {
          _profile = data;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _copyToClipboard(String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label copied to clipboard'),
        duration: const Duration(seconds: 2),
        backgroundColor: AppColors.slate900,
      ),
    );
  }

  Future<void> _showAdjustBalanceDialog() async {
    if (_profile == null) return;
    String type = 'CREDIT'; // CREDIT or DEBIT
    final amountController = TextEditingController();
    final reasonController = TextEditingController();
    bool submitting = false;
    String? dialogError;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: AppColors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text(
            'Adjust User Wallet Balance',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'User: ${_profile!.username}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700),
                ),
                Text(
                  'Current Balance: ₹${_profile!.wallet?.balance.toStringAsFixed(2) ?? "0.00"}',
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.emerald700),
                ),
                const SizedBox(height: 14),
                const Text('Adjustment Type:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () => setDialogState(() => type = 'CREDIT'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: type == 'CREDIT' ? AppColors.emerald50 : AppColors.slate100,
                            border: Border.all(
                              color: type == 'CREDIT' ? AppColors.emerald600 : AppColors.slate300,
                              width: type == 'CREDIT' ? 1.5 : 1,
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            '+ Credit (Add)',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: type == 'CREDIT' ? AppColors.emerald800 : AppColors.slate600,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: InkWell(
                        onTap: () => setDialogState(() => type = 'DEBIT'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: type == 'DEBIT' ? AppColors.red50 : AppColors.slate100,
                            border: Border.all(
                              color: type == 'DEBIT' ? AppColors.red600 : AppColors.slate300,
                              width: type == 'DEBIT' ? 1.5 : 1,
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            '- Debit (Deduct)',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: type == 'DEBIT' ? AppColors.red700 : AppColors.slate600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Text('Amount (₹):', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                TextField(
                  controller: amountController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700),
                  decoration: const InputDecoration(
                    prefixText: '₹ ',
                    hintText: '100.00',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
                const SizedBox(height: 14),
                const Text('Reason (Audit Trail):', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                TextField(
                  controller: reasonController,
                  maxLines: 2,
                  style: const TextStyle(fontSize: 13),
                  decoration: const InputDecoration(
                    hintText: 'e.g. Deposit reconciliation / Goodwill bonus',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
                if (dialogError != null) ...[
                  const SizedBox(height: 10),
                  Text(dialogError!, style: const TextStyle(color: AppColors.red600, fontSize: 12)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel', style: TextStyle(color: AppColors.slate500)),
            ),
            ElevatedButton(
              onPressed: submitting
                  ? null
                  : () async {
                      final amt = double.tryParse(amountController.text.trim());
                      final reason = reasonController.text.trim();
                      if (amt == null || amt <= 0) {
                        setDialogState(() => dialogError = 'Enter a valid positive amount');
                        return;
                      }
                      if (reason.isEmpty) {
                        setDialogState(() => dialogError = 'Reason is required for audit trail');
                        return;
                      }
                      final finalAmount = type == 'CREDIT' ? amt : -amt;
                      setDialogState(() {
                        submitting = true;
                        dialogError = null;
                      });
                      try {
                        await AdminApiClient.adjustUserBalance(
                          userId: _profile!.id,
                          amount: finalAmount,
                          reason: reason,
                        );
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        _fetchProfile();
                        widget.onUserUpdated?.call();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Balance adjusted by ${finalAmount >= 0 ? "+₹" : "-₹"}${amt.abs().toStringAsFixed(2)}'),
                              backgroundColor: AppColors.emerald700,
                            ),
                          );
                        }
                      } catch (e) {
                        setDialogState(() {
                          submitting = false;
                          dialogError = e.toString();
                        });
                      }
                    },
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.slate900),
              child: submitting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                  : const Text('Apply Adjustment', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showUpdateStatusDialog() async {
    if (_profile == null) return;
    String selectedStatus = _profile!.status;
    final reasonController = TextEditingController();
    bool submitting = false;
    String? dialogError;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: AppColors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text(
            'Change Account Status',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('User: ${_profile!.username}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 14),
              const Text('Select New Status:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: ['ACTIVE', 'SUSPENDED', 'BANNED'].map((st) {
                  final isSelected = selectedStatus == st;
                  Color color = AppColors.emerald600;
                  if (st == 'SUSPENDED') color = AppColors.amber600;
                  if (st == 'BANNED') color = AppColors.red600;

                  return ChoiceChip(
                    label: Text(st, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: isSelected ? AppColors.white : AppColors.slate700)),
                    selected: isSelected,
                    selectedColor: color,
                    backgroundColor: AppColors.slate100,
                    onSelected: (val) {
                      if (val) setDialogState(() => selectedStatus = st);
                    },
                  );
                }).toList(),
              ),
              const SizedBox(height: 14),
              const Text('Reason:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              TextField(
                controller: reasonController,
                decoration: const InputDecoration(
                  hintText: 'e.g. Terms violation or suspicious activity',
                  border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              ),
              if (dialogError != null) ...[
                const SizedBox(height: 8),
                Text(dialogError!, style: const TextStyle(color: AppColors.red600, fontSize: 12)),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel', style: TextStyle(color: AppColors.slate500)),
            ),
            ElevatedButton(
              onPressed: submitting
                  ? null
                  : () async {
                      setDialogState(() {
                        submitting = true;
                        dialogError = null;
                      });
                      try {
                        await AdminApiClient.updateUserStatus(
                          userId: _profile!.id,
                          status: selectedStatus,
                          reason: reasonController.text.trim().isNotEmpty ? reasonController.text.trim() : 'Updated by Admin',
                        );
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        _fetchProfile();
                        widget.onUserUpdated?.call();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('User status updated to $selectedStatus'),
                              backgroundColor: AppColors.emerald700,
                            ),
                          );
                        }
                      } catch (e) {
                        setDialogState(() {
                          submitting = false;
                          dialogError = e.toString();
                        });
                      }
                    },
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.slate900),
              child: const Text('Update Status', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleDeleteUser() async {
    if (_profile == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Delete User Account?', style: TextStyle(color: AppColors.red600, fontWeight: FontWeight.bold)),
        content: Text('Are you sure you want to permanently delete user "${_profile!.username}"? This action cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.red600),
            child: const Text('Confirm Delete', style: TextStyle(color: AppColors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await AdminApiClient.deleteUser(_profile!.id);
        widget.onUserUpdated?.call();
        if (mounted) {
          Navigator.of(context).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('User deleted successfully'), backgroundColor: AppColors.emerald700),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString()), backgroundColor: AppColors.red600),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        title: Text(
          _profile != null ? _profile!.username : 'User Profile',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.slate900),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, size: 20, color: AppColors.slate600),
            onPressed: _fetchProfile,
          ),
          if (_profile != null && _profile!.role != 'SUPER_ADMIN')
            IconButton(
              icon: const Icon(Icons.delete_outline, size: 20, color: AppColors.red600),
              tooltip: 'Delete User',
              onPressed: _handleDeleteUser,
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: AppColors.slate200, height: 1),
        ),
      ),
      body: _loading && _profile == null
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900))
          : _error != null && _profile == null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_error!, style: const TextStyle(color: AppColors.red600)),
                      const SizedBox(height: 12),
                      ElevatedButton(onPressed: _fetchProfile, child: const Text('Retry')),
                    ],
                  ),
                )
              : _buildProfileContent(),
    );
  }

  Widget _buildProfileContent() {
    final p = _profile!;
    final statusColor = p.status == 'ACTIVE'
        ? AppColors.emerald600
        : p.status == 'SUSPENDED'
            ? AppColors.amber600
            : AppColors.red600;

    return NestedScrollView(
      headerSliverBuilder: (context, innerBoxIsScrolled) => [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Top Identity Card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.slate200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 24,
                            backgroundColor: AppColors.slate900,
                            child: Text(
                              p.username.isNotEmpty ? p.username.substring(0, 1).toUpperCase() : 'U',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.white),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        p.username,
                                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.slate900),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: statusColor.withValues(alpha: 0.1),
                                        borderRadius: BorderRadius.circular(6),
                                        border: Border.all(color: statusColor.withValues(alpha: 0.3)),
                                      ),
                                      child: Text(
                                        p.status,
                                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: statusColor),
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: AppColors.slate100,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        p.role,
                                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.slate600),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        'ID: ${p.id}',
                                        style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.slate500),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    InkWell(
                                      onTap: () => _copyToClipboard(p.id, 'User ID'),
                                      child: const Icon(Icons.copy, size: 14, color: AppColors.slate400),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      const Divider(height: 1),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Icon(Icons.phone_outlined, size: 14, color: AppColors.slate500),
                          const SizedBox(width: 6),
                          Text(p.phone ?? 'No phone linked', style: const TextStyle(fontSize: 12, color: AppColors.slate700)),
                          const Spacer(),
                          const Icon(Icons.mail_outline, size: 14, color: AppColors.slate500),
                          const SizedBox(width: 6),
                          Text(p.email ?? 'No email linked', style: const TextStyle(fontSize: 12, color: AppColors.slate700)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Balances Card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.slate200),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('AVAILABLE WALLET', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.slate400)),
                            const SizedBox(height: 2),
                            Text(
                              '₹${p.wallet?.balance.toStringAsFixed(2) ?? "0.00"}',
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.emerald700),
                            ),
                          ],
                        ),
                      ),
                      Container(width: 1, height: 40, color: AppColors.slate200),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('LOCKED / IN-PLAY', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.slate400)),
                            const SizedBox(height: 2),
                            Text(
                              '₹${p.wallet?.lockedBalance.toStringAsFixed(2) ?? "0.00"}',
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate700),
                            ),
                          ],
                        ),
                      ),
                      Container(width: 1, height: 40, color: AppColors.slate200),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('NET PROFIT/LOSS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.slate400)),
                            const SizedBox(height: 2),
                            Text(
                              '${p.metrics.netProfitLoss >= 0 ? "+" : ""}₹${p.metrics.netProfitLoss.toStringAsFixed(2)}',
                              style: TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: p.metrics.netProfitLoss >= 0 ? AppColors.emerald600 : AppColors.red600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Metrics Grid (4 items)
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                  childAspectRatio: 2.2,
                  children: [
                    _buildMetricTile(
                      'APPROVED DEPOSITS',
                      '₹${p.metrics.approvedDepositsSum.toStringAsFixed(0)}',
                      '${p.metrics.totalDepositsCount} deposits',
                      Icons.south_west,
                      AppColors.emerald600,
                    ),
                    _buildMetricTile(
                      'TOTAL PAYOUTS',
                      '₹${p.metrics.completedWithdrawalsSum.toStringAsFixed(0)}',
                      '${p.metrics.totalWithdrawalsCount} withdrawals',
                      Icons.north_east,
                      AppColors.amber600,
                    ),
                    _buildMetricTile(
                      'ROOMS PLAYED / WON',
                      '${p.metrics.roomsPlayed} / ${p.metrics.roomsWon}',
                      'win count: ${p.metrics.roomsWon}',
                      Icons.casino_outlined,
                      AppColors.slate700,
                    ),
                    _buildMetricTile(
                      'WIN RATIO',
                      '${p.metrics.winRate.toStringAsFixed(1)}%',
                      'Win percentage',
                      Icons.percent,
                      AppColors.emerald700,
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Action Buttons (Adjust Balance, Change Status)
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _showAdjustBalanceDialog,
                        icon: const Icon(Icons.account_balance_wallet, size: 16, color: AppColors.white),
                        label: const Text('Adjust Balance', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.white)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.slate900,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _showUpdateStatusDialog,
                        icon: const Icon(Icons.shield_outlined, size: 16, color: AppColors.slate800),
                        label: const Text('Status Control', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.slate800)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: AppColors.slate300),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        SliverPersistentHeader(
          pinned: true,
          delegate: _SliverAppBarDelegate(
            TabBar(
              controller: _tabController,
              isScrollable: true,
              labelColor: AppColors.slate900,
              unselectedLabelColor: AppColors.slate400,
              indicatorColor: AppColors.slate900,
              indicatorWeight: 2,
              labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              unselectedLabelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
              tabs: [
                Tab(text: 'Ledger (${p.recentTransactions.length})'),
                Tab(text: 'Deposits (${p.recentDeposits.length})'),
                Tab(text: 'Payouts (${p.recentWithdrawals.length})'),
                Tab(text: 'Games (${p.recentGames.length})'),
                Tab(text: 'Feedback (${p.feedbacks.length})'),
                Tab(text: 'Audit Logs (${p.auditLogs.length})'),
              ],
            ),
          ),
        ),
      ],
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildTransactionsTab(p.recentTransactions),
          _buildDepositsTab(p.recentDeposits),
          _buildWithdrawalsTab(p.recentWithdrawals),
          _buildGamesTab(p.recentGames),
          _buildFeedbacksTab(p.feedbacks),
          _buildAuditLogsTab(p.auditLogs),
        ],
      ),
    );
  }

  Widget _buildMetricTile(String label, String value, String subtitle, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.slate200),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.slate400)),
                Text(value, style: const TextStyle(fontFamily: 'monospace', fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.slate900)),
                Text(subtitle, style: const TextStyle(fontSize: 9, color: AppColors.slate500)),
              ],
            ),
          ),
          Icon(icon, size: 18, color: color),
        ],
      ),
    );
  }

  Widget _buildTransactionsTab(List<UserTransactionItem> list) {
    if (list.isEmpty) return _buildEmptyPlaceholder('No wallet transactions found');

    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: list.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final t = list[i];
        final isCredit = t.amount >= 0;

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.slate200),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 16,
                backgroundColor: isCredit ? AppColors.emerald50 : AppColors.red50,
                child: Icon(
                  isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                  size: 16,
                  color: isCredit ? AppColors.emerald600 : AppColors.red600,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.type, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900)),
                    if (t.description != null && t.description!.isNotEmpty)
                      Text(t.description!, style: const TextStyle(fontSize: 11, color: AppColors.slate600)),
                    Text(
                      _formatDate(t.createdAt),
                      style: const TextStyle(fontSize: 10, color: AppColors.slate400),
                    ),
                  ],
                ),
              ),
              Text(
                '${isCredit ? "+" : ""}₹${t.amount.toStringAsFixed(2)}',
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: isCredit ? AppColors.emerald700 : AppColors.red700,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDepositsTab(List<AdminDepositModel> list) {
    if (list.isEmpty) return _buildEmptyPlaceholder('No deposits on record');

    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: list.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final d = list[i];
        final isApproved = d.status == 'APPROVED';

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('₹${d.totalAmount.toStringAsFixed(2)}', style: const TextStyle(fontFamily: 'monospace', fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.slate900)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: isApproved ? AppColors.emerald50 : AppColors.amber50,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: isApproved ? AppColors.emerald600.withValues(alpha: 0.3) : AppColors.amber600.withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      d.status,
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: isApproved ? AppColors.emerald700 : AppColors.amber800),
                    ),
                  ),
                ],
              ),
              if (d.utr != null && d.utr!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text('Bank UTR: ${d.utr}', style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.slate700)),
              ],
              if (d.userClaimedUtr != null && d.userClaimedUtr!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text('Claimed UTR: ${d.userClaimedUtr}', style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.amber800)),
              ],
              const SizedBox(height: 4),
              Text(_formatDate(d.createdAt), style: const TextStyle(fontSize: 10, color: AppColors.slate400)),
            ],
          ),
        );
      },
    );
  }

  Widget _buildWithdrawalsTab(List<AdminWithdrawalModel> list) {
    if (list.isEmpty) return _buildEmptyPlaceholder('No payouts requested');

    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: list.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final w = list[i];
        final isCompleted = w.status == 'COMPLETED';
        final isRejected = w.status == 'REJECTED';

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('₹${w.amount.toStringAsFixed(2)}', style: const TextStyle(fontFamily: 'monospace', fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.slate900)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: isCompleted ? AppColors.emerald50 : isRejected ? AppColors.red50 : AppColors.amber50,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      w.status,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: isCompleted ? AppColors.emerald700 : isRejected ? AppColors.red700 : AppColors.amber800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text('UPI: ${w.upiId}', style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.slate700)),
              if (w.payoutUtr != null && w.payoutUtr!.isNotEmpty)
                Text('Payout UTR: ${w.payoutUtr}', style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.emerald700)),
              if (w.rejectionReason != null && w.rejectionReason!.isNotEmpty)
                Text('Reason: ${w.rejectionReason}', style: const TextStyle(fontSize: 11, color: AppColors.red600)),
              const SizedBox(height: 4),
              Text(_formatDate(w.createdAt), style: const TextStyle(fontSize: 10, color: AppColors.slate400)),
            ],
          ),
        );
      },
    );
  }

  Widget _buildGamesTab(List<UserGameItem> list) {
    if (list.isEmpty) return _buildEmptyPlaceholder('No games played');

    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: list.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final g = list[i];

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.slate200),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: g.isWinner ? AppColors.emerald50 : AppColors.slate100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  g.isWinner ? Icons.emoji_events : Icons.casino_outlined,
                  size: 20,
                  color: g.isWinner ? AppColors.emerald600 : AppColors.slate600,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Room: ${g.roomCode}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900)),
                    Text(
                      'Guess: #${g.guessNumber}  |  Winning: #${g.winningNumber ?? "?"}',
                      style: const TextStyle(fontSize: 11, color: AppColors.slate600),
                    ),
                    Text(_formatDate(g.createdAt), style: const TextStyle(fontSize: 10, color: AppColors.slate400)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('₹${g.entryFee.toStringAsFixed(0)} Stake', style: const TextStyle(fontSize: 11, color: AppColors.slate500)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: g.isWinner ? AppColors.emerald50 : AppColors.slate100,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      g.isWinner ? 'WON' : 'LOST',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: g.isWinner ? AppColors.emerald700 : AppColors.slate600,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildFeedbacksTab(List<AdminFeedbackModel> list) {
    if (list.isEmpty) return _buildEmptyPlaceholder('No support tickets filed');

    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: list.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final f = list[i];
        final isResolved = f.status == 'RESOLVED';

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: AppColors.slate100, borderRadius: BorderRadius.circular(4)),
                    child: Text(f.category, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.slate700)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: isResolved ? AppColors.emerald50 : AppColors.amber50,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      f.status,
                      style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: isResolved ? AppColors.emerald700 : AppColors.amber800),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(f.subject, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900)),
              const SizedBox(height: 2),
              Text(f.message, style: const TextStyle(fontSize: 11, color: AppColors.slate700)),
              if (f.adminReply != null && f.adminReply!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: AppColors.slate50, borderRadius: BorderRadius.circular(6), border: Border.all(color: AppColors.slate200)),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.reply, size: 14, color: AppColors.slate500),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Reply: ${f.adminReply}',
                          style: const TextStyle(fontSize: 11, color: AppColors.slate800, fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 4),
              Text(_formatDate(f.createdAt), style: const TextStyle(fontSize: 9, color: AppColors.slate400)),
            ],
          ),
        );
      },
    );
  }

  Widget _buildAuditLogsTab(List<UserAuditLogItem> list) {
    if (list.isEmpty) return _buildEmptyPlaceholder('No audit logs for this user');

    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: list.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final log = list[i];

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(log.action, style: const TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate900)),
                  Text(_formatDate(log.createdAt), style: const TextStyle(fontSize: 9, color: AppColors.slate400)),
                ],
              ),
              const SizedBox(height: 4),
              Text('Actor: ${log.actorUsername}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate600)),
              if (log.details != null && log.details!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(log.details!, style: const TextStyle(fontFamily: 'monospace', fontSize: 10, color: AppColors.slate500)),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildEmptyPlaceholder(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          message,
          style: const TextStyle(fontSize: 12, color: AppColors.slate400),
        ),
      ),
    );
  }

  String _formatDate(String isoString) {
    try {
      final dt = DateTime.parse(isoString).toLocal();
      return DateFormat('dd MMM yyyy, hh:mm a').format(dt);
    } catch (_) {
      return isoString;
    }
  }
}

class _SliverAppBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar _tabBar;

  _SliverAppBarDelegate(this._tabBar);

  @override
  double get minExtent => _tabBar.preferredSize.height + 1;

  @override
  double get maxExtent => _tabBar.preferredSize.height + 1;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: AppColors.white,
      child: Column(
        children: [
          _tabBar,
          Container(color: AppColors.slate200, height: 1),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(_SliverAppBarDelegate oldDelegate) {
    return false;
  }
}
