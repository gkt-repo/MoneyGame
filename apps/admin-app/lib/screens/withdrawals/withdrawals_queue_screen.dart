import '../../core/services/cash_desk_updates.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';
import '../users/user_profile_screen.dart';

class WithdrawalsQueueScreen extends StatefulWidget {
  final VoidCallback onQueueUpdated;

  const WithdrawalsQueueScreen({super.key, required this.onQueueUpdated});

  @override
  State<WithdrawalsQueueScreen> createState() => _WithdrawalsQueueScreenState();
}

class _WithdrawalsQueueScreenState extends State<WithdrawalsQueueScreen> {
  CashDeskUpdates? _updates;
  AdminProfileModel? _admin;
  List<AdminWithdrawalModel> _withdrawals = [];
  bool _loading = true;
  String? _error;
  String _activeFilter = 'PENDING'; // PENDING, COMPLETED, REJECTED, ALL
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchWithdrawals();
    _updates = CashDeskUpdates(_fetchWithdrawals);
  }

  @override
  void dispose() {
    _updates?.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _openUserProfile(String userId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => UserProfileScreen(userId: userId, onUserUpdated: _fetchWithdrawals),
      ),
    );
  }

  Future<void> _fetchWithdrawals() async {
    setState(() => _loading = true);
    try {
      _admin ??= await AdminApiClient.getMe();
      final list = await AdminApiClient.getWithdrawals();
      if (mounted) {
        setState(() {
          _withdrawals = list;
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

  Future<void> _showCompleteDialog(AdminWithdrawalModel withdrawal) async {
    if (withdrawal.status == 'PENDING') {
      final external = withdrawal.assignedModeratorId == null;
      final accepted = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
        title: const Text('Claim payout before paying'),
        content: Text(external
          ? 'Pay ₹${withdrawal.amount.toStringAsFixed(2)} from external admin funds? This will not debit a moderator account.'
          : 'You will take this payout from @${withdrawal.assignedModeratorName ?? withdrawal.assignedModeratorId}. Pay using ${withdrawal.payoutAccountUpi}; its reserved float will be deducted.'),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Claim payout'))],
      ));
      if (accepted != true) return;
    }
    try {
      await AdminApiClient.claimWithdrawal(withdrawal.id, external: withdrawal.assignedModeratorId == null);
      await _fetchWithdrawals();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      return;
    }
    if (!mounted) return;
    final utrController = TextEditingController();
    bool submitting = false;
    String? submitError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            title: const Text(
              'Confirm Payout Clearance',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'User: ${withdrawal.username} (${withdrawal.phone ?? 'N/A'})',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700),
                ),
                const SizedBox(height: 4),
                Text(
                  'Amount: ₹${withdrawal.amount.toStringAsFixed(2)}',
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.emerald700),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'UPI: ${withdrawal.upiId}',
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.slate600),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.copy, size: 16),
                      onPressed: () => _copyToClipboard(withdrawal.upiId, 'UPI ID'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Text(
                  'Pay once, then enter the bank IMPS / UPI reference:',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate900),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: utrController,
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13, fontWeight: FontWeight.w700),
                  decoration: const InputDecoration(
                    hintText: 'e.g. 429381749281',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
                if (submitError != null) ...[
                  const SizedBox(height: 8),
                  Text(submitError!, style: const TextStyle(color: AppColors.red600, fontSize: 12)),
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
                        final utr = utrController.text.trim();
                        if (utr.isEmpty) {
                          setDialogState(() => submitError = 'Please enter a valid bank UTR');
                          return;
                        }
                        setDialogState(() {
                          submitting = true;
                          submitError = null;
                        });
                        try {
                          await AdminApiClient.completeWithdrawal(
                            withdrawalId: withdrawal.id,
                            payoutUtr: utr,
                          );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          _fetchWithdrawals();
                          widget.onQueueUpdated();
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Withdrawal marked COMPLETED'),
                                backgroundColor: AppColors.emerald700,
                              ),
                            );
                          }
                        } catch (e) {
                          setDialogState(() {
                            submitting = false;
                            submitError = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald600),
                child: submitting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                    : const Text('Mark Complete', style: TextStyle(color: AppColors.white)),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _reconcile(AdminWithdrawalModel withdrawal) async {
    final note = TextEditingController();
    final utr = TextEditingController();
    bool saving = false;
    String? error;
    await showDialog<void>(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, update) {
      Future<void> resolve(String outcome) async {
        update(() => saving = true);
        try {
          await AdminApiClient.reconcileWithdrawal(withdrawal.id, outcome, note.text, utr.text);
          if (ctx.mounted) Navigator.pop(ctx);
          await _fetchWithdrawals();
          widget.onQueueUpdated();
        } catch (e) { if (ctx.mounted) update(() { saving = false; error = '$e'; }); }
      }
      return AlertDialog(
        title: const Text('Reconcile locked payout'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Contact the operator and verify the bank transaction first. Do not send another payment. Confirm unpaid only after checking that no transfer succeeded or remains pending.'),
          TextField(controller: note, decoration: const InputDecoration(labelText: 'Bank evidence / operator confirmation')),
          TextField(controller: utr, decoration: const InputDecoration(labelText: 'Existing bank UTR (if paid)')),
          if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
        ]),
        actions: [
          TextButton(onPressed: saving ? null : () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(onPressed: saving ? null : () => resolve('NOT_PAID'), child: const Text('Confirmed unpaid · Refund')),
          FilledButton(onPressed: saving ? null : () => resolve('PAID'), child: const Text('Record verified payment')),
        ],
      );
    }));
  }

  Future<void> _reassign(AdminWithdrawalModel withdrawal) async {
    try {
      final moderators = await AdminApiClient.listModerators();
      if (!mounted) return;
      final eligible = moderators.where((m) {
        final a = m['upiAccount'];
        return m['status'] == 'ACTIVE' && a != null && a['isActive'] == true && a['floatReady'] == true && a['deviceStatus'] == 'ONLINE'
          && (a['availableBalance'] as num? ?? 0) + (m['id'] == withdrawal.assignedModeratorId ? withdrawal.amount : 0) >= withdrawal.amount;
      }).toList();
      final selected = await showDialog<String>(context: context, builder: (ctx) => SimpleDialog(
        title: const Text('Select payout moderator'),
        children: eligible.isEmpty ? [const Padding(padding: EdgeInsets.all(24), child: Text('No online moderator has enough available float.'))]
          : eligible.map((m) => SimpleDialogOption(onPressed: () => Navigator.pop(ctx, m['id']), child: Text('@${m['username']} · ₹${m['upiAccount']['availableBalance']} available'))).toList(),
      ));
      if (selected != null) {
        await AdminApiClient.reassignWithdrawal(withdrawal.id, selected);
        await _fetchWithdrawals();
        widget.onQueueUpdated();
      }
    } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'))); }
  }

  void _showRejectDialog(AdminWithdrawalModel withdrawal) {
    final reasonController = TextEditingController(text: 'Incorrect UPI VPA or name mismatch');
    bool submitting = false;
    String? submitError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            title: const Text(
              'Reject Withdrawal & Refund',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.red600),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Rejecting will instantly refund ₹${withdrawal.amount.toStringAsFixed(2)} back to ${withdrawal.username}\'s wallet.',
                  style: const TextStyle(fontSize: 12, color: AppColors.slate600, height: 1.4),
                ),
                const SizedBox(height: 12),
                const Text('Rejection Reason:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                TextField(
                  controller: reasonController,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    hintText: 'Reason for rejection...',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.all(10),
                  ),
                ),
                if (submitError != null) ...[
                  const SizedBox(height: 8),
                  Text(submitError!, style: const TextStyle(color: AppColors.red600, fontSize: 12)),
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
                          submitError = null;
                        });
                        try {
                          await AdminApiClient.rejectWithdrawal(
                            withdrawalId: withdrawal.id,
                            reason: reasonController.text.trim(),
                          );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          _fetchWithdrawals();
                          widget.onQueueUpdated();
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Withdrawal rejected and refunded to user'),
                                backgroundColor: AppColors.slate900,
                              ),
                            );
                          }
                        } catch (e) {
                          setDialogState(() {
                            submitting = false;
                            submitError = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.red600),
                child: submitting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                    : const Text('Reject & Refund', style: TextStyle(color: AppColors.white)),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final query = _searchController.text.trim().toLowerCase();
    final filtered = _withdrawals.where((w) {
      if (_activeFilter != 'ALL' && w.status != _activeFilter) return false;
      if (query.isNotEmpty) {
        final matchUser = w.username.toLowerCase().contains(query);
        final matchPhone = w.phone?.contains(query) ?? false;
        final matchUpi = w.upiId.toLowerCase().contains(query);
        final matchAmount = w.amount.toString().contains(query);
        final matchUtr = w.payoutUtr?.toLowerCase().contains(query) ?? false;
        return matchUser || matchPhone || matchUpi || matchAmount || matchUtr;
      }
      return true;
    }).toList();

    final pendingCount = _withdrawals.where((w) => w.status == 'PENDING').length;

    return Scaffold(
      backgroundColor: AppColors.slate50,
      body: RefreshIndicator(
        onRefresh: _fetchWithdrawals,
        color: AppColors.slate900,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'PAYOUT CLEARANCE QUEUE',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                            color: AppColors.slate500,
                          ),
                        ),
                        if (pendingCount > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppColors.red50,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                            ),
                            child: Text(
                              '$pendingCount PENDING',
                              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.red600),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Search Bar
                    TextField(
                      controller: _searchController,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        hintText: 'Filter by user, phone, UPI ID, or amount...',
                        prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.slate400),
                        suffixIcon: _searchController.text.isNotEmpty
                            ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _searchController.clear()))
                            : null,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 10),

                    // Filter Chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: ['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'ALL'].map((filter) {
                          final isSel = _activeFilter == filter;
                          return Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(filter),
                              selected: isSel,
                              onSelected: (selected) {
                                if (selected) setState(() => _activeFilter = filter);
                              },
                              backgroundColor: AppColors.white,
                              selectedColor: AppColors.slate900,
                              labelStyle: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: isSel ? AppColors.white : AppColors.slate700,
                              ),
                              side: BorderSide(color: isSel ? AppColors.slate900 : AppColors.slate200),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            if (_loading && _withdrawals.isEmpty)
              const SliverFillRemaining(
                child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900),
                ),
              )
            else if (_error != null && _withdrawals.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 36, color: AppColors.red600),
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: AppColors.slate600)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _fetchWithdrawals,
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.slate900),
                        child: const Text('Retry', style: TextStyle(color: AppColors.white)),
                      )
                    ],
                  ),
                ),
              )
            else if (filtered.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.check_circle_outline, size: 48, color: AppColors.slate400),
                        const SizedBox(height: 12),
                        Text(
                          _activeFilter == 'PENDING' ? 'All Payouts Cleared' : 'No records found for $_activeFilter',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'No pending withdrawal requests at this moment.',
                          style: TextStyle(fontSize: 12, color: AppColors.slate500),
                        ),
                      ],
                    ),
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final item = filtered[index];
                      return _buildWithdrawalCard(item);
                    },
                    childCount: filtered.length,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildWithdrawalCard(AdminWithdrawalModel item) {
    Color statusBg = AppColors.slate100;
    Color statusText = AppColors.slate700;
    if (item.status == 'PENDING' || item.status == 'PROCESSING') {
      statusBg = AppColors.amber50;
      statusText = AppColors.amber800;
    } else if (item.status == 'COMPLETED') {
      statusBg = AppColors.emerald50;
      statusText = AppColors.emerald700;
    } else if (item.status == 'REJECTED') {
      statusBg = AppColors.red50;
      statusText = AppColors.red600;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: item.status == 'PENDING' ? AppColors.amber600.withValues(alpha: 0.3) : AppColors.slate200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: Amount & Status
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '₹${item.amount.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.slate900,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  item.status,
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: statusText),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // User details
          InkWell(
            onTap: () => _openUserProfile(item.userId),
            child: Row(
              children: [
                const Icon(Icons.person_outline, size: 14, color: AppColors.slate500),
                const SizedBox(width: 6),
                Text(
                  item.username,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate800),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.open_in_new, size: 12, color: AppColors.slate400),
                if (item.phone != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    '•  ${item.phone}',
                    style: const TextStyle(fontSize: 12, color: AppColors.slate500),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 6),

          Text(item.assignedModeratorId == null ? 'Unassigned · Admin funds or awaiting liquidity' : 'Assigned to @${item.assignedModeratorName ?? item.assignedModeratorId}'),
          if (item.payoutAccountUpi != null) Text('Funding account: ${item.payoutAccountUpi}'),
          if (item.processingById != null) Text('Processing: @${item.processingByName ?? item.processingById}'),
          if (item.status == 'PENDING' && _admin?.role == 'SUPER_ADMIN')
            TextButton(onPressed: () => _reassign(item), child: const Text('Assign / reassign moderator')),
          // UPI ID row with 1-tap copy
          Row(
            children: [
              const Icon(Icons.account_balance_wallet_outlined, size: 14, color: AppColors.slate500),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  item.upiId,
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
                ),
              ),
              InkWell(
                onTap: item.status == 'PROCESSING' && item.processingById == _admin?.id ? () => _copyToClipboard(item.upiId, 'UPI ID') : null,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.slate100,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text('COPY', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.slate800)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // UTR or Rejection Reason info
          if (item.payoutUtr != null && item.payoutUtr!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.slate50,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.slate200),
              ),
              child: Row(
                children: [
                  const Text('Bank UTR: ', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                  Expanded(
                    child: Text(
                      item.payoutUtr!,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate800),
                    ),
                  ),
                  InkWell(
                    onTap: () => _copyToClipboard(item.payoutUtr!, 'UTR'),
                    child: const Icon(Icons.copy, size: 14, color: AppColors.slate500),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],

          if (item.rejectionReason != null && item.rejectionReason!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.red50,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                'Reason: ${item.rejectionReason}',
                style: const TextStyle(fontSize: 11, color: AppColors.red700),
              ),
            ),
            const SizedBox(height: 8),
          ],

          // Footer: Timestamp
          Text(
            item.createdAt.isNotEmpty ? item.createdAt.substring(0, 19).replaceAll('T', ' ') : '',
            style: const TextStyle(fontSize: 10, color: AppColors.slate400),
          ),

          if (item.status == 'PROCESSING' && _admin?.role == 'SUPER_ADMIN' && item.processingById != _admin?.id)
            TextButton(onPressed: () => _reconcile(item), child: const Text('Reconcile bank outcome')),
          // Pending Action Buttons
          if (item.status == 'PENDING' || (item.status == 'PROCESSING' && item.processingById == _admin?.id)) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _showCompleteDialog(item),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.emerald600,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    child: const Text(
                      'Claim / Pay & Enter UTR',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.white),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => _showRejectDialog(item),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.red600,
                    side: const BorderSide(color: AppColors.slate200),
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  ),
                  child: const Text('Reject', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
