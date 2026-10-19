import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';
import '../users/user_profile_screen.dart';

class DepositsLedgerScreen extends StatefulWidget {
  const DepositsLedgerScreen({super.key});

  @override
  State<DepositsLedgerScreen> createState() => _DepositsLedgerScreenState();
}

class _DepositsLedgerScreenState extends State<DepositsLedgerScreen> {
  List<AdminDepositModel> _deposits = [];
  List<UnmatchedPaymentModel> _unmatched = [];
  bool _loading = true;
  String? _error;
  String _activeFilter = 'ALL'; // ALL, CLAIMED, APPROVED, PENDING, UNMATCHED
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchData();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchData() async {
    setState(() => _loading = true);
    try {
      final depositsFuture = AdminApiClient.getDeposits();
      final unmatchedFuture = AdminApiClient.getUnmatchedPayments(status: 'UNCLAIMED').catchError((_) => <UnmatchedPaymentModel>[]);

      final results = await Future.wait([depositsFuture, unmatchedFuture]);
      if (mounted) {
        setState(() {
          _deposits = results[0] as List<AdminDepositModel>;
          _unmatched = results[1] as List<UnmatchedPaymentModel>;
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

  void _openUserProfile(String userId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => UserProfileScreen(userId: userId, onUserUpdated: _fetchData),
      ),
    );
  }

  void _showApproveDialog(AdminDepositModel deposit) {
    final utrController = TextEditingController(text: deposit.userClaimedUtr ?? '');
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
              'Approve & Credit Deposit',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Player: ${deposit.username}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate800),
                ),
                const SizedBox(height: 4),
                Text(
                  'Base: ₹${deposit.baseAmount.toStringAsFixed(2)}  (Payable: ₹${deposit.totalAmount.toStringAsFixed(2)})',
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.emerald700),
                ),
                if (deposit.userClaimedUtr != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'User Claimed UTR: ${deposit.userClaimedUtr}',
                    style: const TextStyle(fontSize: 12, color: AppColors.amber800, fontWeight: FontWeight.w600),
                  ),
                ],
                const SizedBox(height: 12),
                const Text(
                  'Bank / UPI Reference Number (UTR):',
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
                          await AdminApiClient.approveDeposit(
                            depositId: deposit.id,
                            utr: utr,
                          );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          _fetchData();
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Deposit approved and credited to player!'),
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
                    : const Text('Approve & Credit', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.white)),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showRejectDialog(AdminDepositModel deposit) {
    final reasonController = TextEditingController(text: 'Declined by administrator');
    bool submitting = false;
    String? submitError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            title: const Text('Reject Deposit Request', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.red600)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Player: ${deposit.username}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                Text('Amount: ₹${deposit.totalAmount.toStringAsFixed(2)}', style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 12),
                const Text('Rejection Reason:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                TextField(
                  controller: reasonController,
                  decoration: const InputDecoration(
                    hintText: 'e.g. Unverifiable bank reference',
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
              TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
              ElevatedButton(
                onPressed: submitting
                    ? null
                    : () async {
                        setDialogState(() {
                          submitting = true;
                          submitError = null;
                        });
                        try {
                          await AdminApiClient.rejectDeposit(
                            depositId: deposit.id,
                            reason: reasonController.text.trim(),
                          );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          _fetchData();
                        } catch (e) {
                          setDialogState(() {
                            submitting = false;
                            submitError = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.red600),
                child: const Text('Confirm Reject', style: TextStyle(color: AppColors.white)),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showAssignUnmatchedDialog(UnmatchedPaymentModel unmatchedItem) {
    final userIdController = TextEditingController();
    bool submitting = false;
    String? submitError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            title: const Text('Assign Unmatched Bank Payment', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Amount: ₹${unmatchedItem.amount.toStringAsFixed(2)}', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.emerald700)),
                if (unmatchedItem.utr != null)
                  Text('Bank UTR: ${unmatchedItem.utr}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.slate700)),
                if (unmatchedItem.senderUpi != null)
                  Text('Sender VPA: ${unmatchedItem.senderUpi}', style: const TextStyle(fontSize: 12, color: AppColors.slate600)),
                const SizedBox(height: 14),
                const Text('Player User ID (or phone/username):', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                TextField(
                  controller: userIdController,
                  decoration: const InputDecoration(
                    hintText: 'Enter user ID or identifier',
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
              TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
              ElevatedButton(
                onPressed: submitting
                    ? null
                    : () async {
                        final targetUser = userIdController.text.trim();
                        if (targetUser.isEmpty) {
                          setDialogState(() => submitError = 'User identifier is required');
                          return;
                        }
                        setDialogState(() {
                          submitting = true;
                          submitError = null;
                        });
                        try {
                          await AdminApiClient.assignUnmatchedPayment(
                            id: unmatchedItem.id,
                            userId: targetUser,
                          );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          _fetchData();
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Payment assigned and credited to player!'), backgroundColor: AppColors.emerald700),
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
                child: const Text('Credit to Player', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold)),
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
    final filteredDeposits = _deposits.where((d) {
      if (_activeFilter != 'ALL' && _activeFilter != 'UNMATCHED') {
        if (d.status != _activeFilter) return false;
      }
      if (query.isNotEmpty) {
        final matchUtr = d.utr?.toLowerCase().contains(query) ?? false;
        final matchClaimed = d.userClaimedUtr?.toLowerCase().contains(query) ?? false;
        final matchUser = d.username.toLowerCase().contains(query);
        final matchPhone = d.phone?.contains(query) ?? false;
        final matchAmount = d.totalAmount.toString().contains(query);
        return matchUtr || matchClaimed || matchUser || matchPhone || matchAmount;
      }
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: AppColors.slate50,
      body: Column(
        children: [
          // Search & Filter header
          Container(
            padding: const EdgeInsets.all(16),
            color: AppColors.white,
            child: Column(
              children: [
                if (_activeFilter != 'UNMATCHED') ...[
                  TextField(
                    controller: _searchController,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: 'Filter by UTR, player phone, username, or amount...',
                      prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.slate400),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _searchController.clear()))
                          : null,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['ALL', 'CLAIMED', 'APPROVED', 'PENDING', 'UNMATCHED'].map((st) {
                      final isSelected = _activeFilter == st;
                      final label = st == 'UNMATCHED' ? 'Unmatched (${_unmatched.length})' : st;

                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(label),
                          selected: isSelected,
                          onSelected: (val) {
                            if (val) setState(() => _activeFilter = st);
                          },
                          labelStyle: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: isSelected ? AppColors.white : AppColors.slate700,
                          ),
                          selectedColor: st == 'UNMATCHED' ? AppColors.amber800 : AppColors.slate900,
                          backgroundColor: AppColors.slate100,
                          elevation: 0,
                          visualDensity: VisualDensity.compact,
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
          Container(height: 1, color: AppColors.slate200),

          // Main Content
          Expanded(
            child: RefreshIndicator(
              onRefresh: _fetchData,
              child: _loading && _deposits.isEmpty
                  ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900))
                  : _error != null && _deposits.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(_error!, style: const TextStyle(color: AppColors.red600)),
                              const SizedBox(height: 10),
                              ElevatedButton(onPressed: _fetchData, child: const Text('Retry')),
                            ],
                          ),
                        )
                      : _activeFilter == 'UNMATCHED'
                          ? _buildUnmatchedList()
                          : _buildDepositsList(filteredDeposits),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUnmatchedList() {
    if (_unmatched.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text('No unmatched bank payments right now. All clear!', style: TextStyle(color: AppColors.slate400, fontSize: 13)),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: _unmatched.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final u = _unmatched[i];

        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.amber600.withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '₹${u.amount.toStringAsFixed(2)}',
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.emerald700),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.amber50,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: AppColors.amber600.withValues(alpha: 0.3)),
                    ),
                    child: const Text('Unassigned', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.amber800)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (u.utr != null) ...[
                Row(
                  children: [
                    const Text('Bank UTR: ', style: TextStyle(fontSize: 12, color: AppColors.slate500)),
                    Text(u.utr!, style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate800)),
                    const SizedBox(width: 6),
                    InkWell(onTap: () => _copyToClipboard(u.utr!, 'UTR'), child: const Icon(Icons.copy, size: 14, color: AppColors.slate400)),
                  ],
                ),
                const SizedBox(height: 4),
              ],
              Text('Sender VPA: ${u.senderUpi ?? "Unknown"}', style: const TextStyle(fontSize: 11, color: AppColors.slate600)),
              Text(u.createdAt.length >= 19 ? u.createdAt.substring(0, 19).replaceAll('T', ' ') : u.createdAt, style: const TextStyle(fontSize: 10, color: AppColors.slate400)),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _showAssignUnmatchedDialog(u),
                  icon: const Icon(Icons.person_add, size: 16, color: AppColors.white),
                  label: const Text('Credit to Player', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.white)),
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald600),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDepositsList(List<AdminDepositModel> list) {
    if (list.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text('No deposit records match your filter.', style: TextStyle(color: AppColors.slate400, fontSize: 13)),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: list.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final item = list[i];
        final isApproved = item.status == 'APPROVED';
        final isClaimed = item.status == 'CLAIMED';

        return Container(
          padding: const EdgeInsets.all(14),
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
                  Text(
                    '₹${item.totalAmount.toStringAsFixed(2)}',
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.slate900),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: isApproved ? AppColors.emerald50 : isClaimed ? AppColors.amber50 : AppColors.slate100,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                        color: isApproved ? AppColors.emerald600.withValues(alpha: 0.3) : isClaimed ? AppColors.amber600.withValues(alpha: 0.3) : AppColors.slate300,
                      ),
                    ),
                    child: Text(
                      item.status,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: isApproved ? AppColors.emerald700 : isClaimed ? AppColors.amber800 : AppColors.slate700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Player row (tap to view profile)
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
                    const Spacer(),
                    Text('Base: ₹${item.baseAmount.toStringAsFixed(0)}', style: const TextStyle(fontSize: 12, color: AppColors.slate500)),
                  ],
                ),
              ),

              if (item.utr != null && item.utr!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: AppColors.slate50, borderRadius: BorderRadius.circular(6), border: Border.all(color: AppColors.slate200)),
                  child: Row(
                    children: [
                      const Text('Bank UTR: ', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                      Expanded(
                        child: Text(item.utr!, style: const TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate800)),
                      ),
                      InkWell(onTap: () => _copyToClipboard(item.utr!, 'UTR'), child: const Icon(Icons.copy, size: 14, color: AppColors.slate500)),
                    ],
                  ),
                ),
              ],

              if (item.userClaimedUtr != null && item.userClaimedUtr!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: AppColors.amber50, borderRadius: BorderRadius.circular(6), border: Border.all(color: AppColors.amber600.withValues(alpha: 0.3))),
                  child: Row(
                    children: [
                      const Text('Claimed UTR: ', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.amber900)),
                      Expanded(
                        child: Text(item.userClaimedUtr!, style: const TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.amber900)),
                      ),
                      InkWell(onTap: () => _copyToClipboard(item.userClaimedUtr!, 'Claimed UTR'), child: const Icon(Icons.copy, size: 14, color: AppColors.amber900)),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 8),
              Text(
                item.createdAt.length >= 19 ? item.createdAt.substring(0, 19).replaceAll('T', ' ') : item.createdAt,
                style: const TextStyle(fontSize: 10, color: AppColors.slate400),
              ),

              if (item.status == 'PENDING' || item.status == 'CLAIMED') ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => _showApproveDialog(item),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.emerald600,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                        ),
                        child: const Text('Approve & Credit', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.white)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: () => _showRejectDialog(item),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.red600,
                        side: const BorderSide(color: AppColors.slate300),
                        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                      ),
                      child: const Text('Reject', style: TextStyle(fontSize: 12)),
                    ),
                  ],
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
