import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';

class DepositsLedgerScreen extends StatefulWidget {
  const DepositsLedgerScreen({super.key});

  @override
  State<DepositsLedgerScreen> createState() => _DepositsLedgerScreenState();
}

class _DepositsLedgerScreenState extends State<DepositsLedgerScreen> {
  List<AdminDepositModel> _deposits = [];
  bool _loading = true;
  String? _error;
  String _activeFilter = 'ALL'; // ALL, CLAIMED, APPROVED, PENDING

  @override
  void initState() {
    super.initState();
    _fetchDeposits();
  }

  Future<void> _fetchDeposits() async {
    setState(() => _loading = true);
    try {
      final list = await AdminApiClient.getDeposits();
      if (mounted) {
        setState(() {
          _deposits = list;
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
                  'Base Amount: ₹${deposit.baseAmount.toStringAsFixed(2)}  (Payable: ₹${deposit.totalAmount.toStringAsFixed(2)})',
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
                          _fetchDeposits();
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
                    : const Text('Confirm & Credit', style: TextStyle(color: AppColors.white)),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showRejectDialog(AdminDepositModel deposit) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text('Reject Deposit', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.red600)),
        content: Text('Are you sure you want to reject deposit #${deposit.id.substring(0, 8)}?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              try {
                await AdminApiClient.rejectDeposit(depositId: deposit.id);
                _fetchDeposits();
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                }
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.red600),
            child: const Text('Reject', style: TextStyle(color: AppColors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _deposits.where((d) {
      if (_activeFilter == 'ALL') return true;
      return d.status == _activeFilter;
    }).toList();

    return Scaffold(
      backgroundColor: AppColors.slate50,
      body: RefreshIndicator(
        onRefresh: _fetchDeposits,
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
                          'RECONCILIATION DEPOSITS LEDGER',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                            color: AppColors.slate500,
                          ),
                        ),
                        Text(
                          '${_deposits.length} Records',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate600),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Filter Chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: ['ALL', 'CLAIMED', 'APPROVED', 'PENDING'].map((filter) {
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

            if (_loading && _deposits.isEmpty)
              const SliverFillRemaining(
                child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900),
                ),
              )
            else if (_error != null && _deposits.isEmpty)
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
                        onPressed: _fetchDeposits,
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
                        const Icon(Icons.receipt_long_outlined, size: 48, color: AppColors.slate400),
                        const SizedBox(height: 12),
                        const Text(
                          'No Deposits Found',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'No deposit records match filter $_activeFilter.',
                          style: const TextStyle(fontSize: 12, color: AppColors.slate500),
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
                      return _buildDepositCard(item);
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

  Widget _buildDepositCard(AdminDepositModel item) {
    final isApproved = item.status == 'APPROVED';
    final isClaimed = item.status == 'CLAIMED';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isApproved
              ? AppColors.emerald600.withValues(alpha: 0.2)
              : isClaimed
                  ? AppColors.amber600
                  : AppColors.slate200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(
                    '₹${item.totalAmount.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.slate900,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.slate100,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      '+${item.offsetPaise}p offset',
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: AppColors.slate600,
                      ),
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isApproved
                      ? AppColors.emerald50
                      : isClaimed
                          ? AppColors.amber50
                          : AppColors.slate100,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  item.status,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: isApproved
                        ? AppColors.emerald700
                        : isClaimed
                            ? AppColors.amber800
                            : AppColors.slate700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          Row(
            children: [
              const Icon(Icons.person_outline, size: 14, color: AppColors.slate500),
              const SizedBox(width: 6),
              Text(
                item.username,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate800),
              ),
              const Spacer(),
              Text(
                'Base: ₹${item.baseAmount.toStringAsFixed(0)}',
                style: const TextStyle(fontSize: 12, color: AppColors.slate500),
              ),
            ],
          ),

          if (item.utr != null && item.utr!.isNotEmpty) ...[
            const SizedBox(height: 8),
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
                      item.utr!,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate800),
                    ),
                  ),
                  InkWell(
                    onTap: () => _copyToClipboard(item.utr!, 'UTR'),
                    child: const Icon(Icons.copy, size: 14, color: AppColors.slate500),
                  ),
                ],
              ),
            ),
          ],

          if (item.userClaimedUtr != null && item.userClaimedUtr!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.amber50,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.amber600.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Text('Player Claimed UTR: ', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.amber900)),
                  Expanded(
                    child: Text(
                      item.userClaimedUtr!,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.amber900),
                    ),
                  ),
                  InkWell(
                    onTap: () => _copyToClipboard(item.userClaimedUtr!, 'User Claimed UTR'),
                    child: const Icon(Icons.copy, size: 14, color: AppColors.amber900),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 8),
          Text(
            item.createdAt.isNotEmpty ? item.createdAt.substring(0, 19).replaceAll('T', ' ') : '',
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
  }
}
