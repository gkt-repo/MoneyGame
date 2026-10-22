import '../../core/services/cash_desk_updates.dart';
import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';

class ModeratorsScreen extends StatefulWidget {
  const ModeratorsScreen({super.key});

  @override
  State<ModeratorsScreen> createState() => _ModeratorsScreenState();
}

class _ModeratorsScreenState extends State<ModeratorsScreen> {
  List<Map<String, dynamic>> _moderators = [];
  CashDeskUpdates? _updates;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
    _updates = CashDeskUpdates(_load);
  }

  @override
  void dispose() { _updates?.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await AdminApiClient.listModerators();
      if (!mounted) return;
      setState(() {
        _moderators = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _confirmOpening(Map<String, dynamic> upi) async {
    final balance = TextEditingController();
    final note = TextEditingController();
    String? error;
    bool saving = false;
    await showDialog<void>(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, update) => AlertDialog(
      title: const Text('Confirm opening bank balance'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('Check ${upi['upiId']} after resolving legacy payouts. Enter float from approved MoneyGame payments; exclude uncredited receipts and personal funds.'),
        TextField(controller: balance, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Current bank float (₹)')),
        TextField(controller: note, decoration: const InputDecoration(labelText: 'Reconciliation note')),
        if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
      ]),
      actions: [TextButton(onPressed: saving ? null : () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(onPressed: saving ? null : () async {
          update(() => saving = true);
          try {
            final amount = double.tryParse(balance.text);
            if (amount == null) throw Exception('Enter a valid amount');
            await AdminApiClient.confirmOpeningBalance(upi['id'], amount, note.text);
            if (ctx.mounted) Navigator.pop(ctx);
            await _load();
          } catch (e) { if (ctx.mounted) update(() { error = '$e'; saving = false; }); }
        }, child: const Text('Confirm balance'))],
    )));
  }

  Color _statusColor(String s) =>
      s == 'ACTIVE' ? AppColors.emerald600 : AppColors.red600;

  void _showAddModerator() {
    final usernameCtrl = TextEditingController();
    final passwordCtrl = TextEditingController();
    final upiIdCtrl = TextEditingController();
    final receiverCtrl = TextEditingController();
    final limitCtrl = TextEditingController(text: '15');
    bool saving = false;
    String? error;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.slate800,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) {
        return Padding(
          padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 20,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Add Moderator',
                    style: TextStyle(
                        color: AppColors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 16),
                _buildField(usernameCtrl, 'Username *'),
                const SizedBox(height: 10),
                _buildField(passwordCtrl, 'Password * (min 12 chars)',
                    obscure: true),
                const SizedBox(height: 16),
                const Text('UPI Assignment (optional)',
                    style: TextStyle(
                        color: AppColors.slate400,
                        fontSize: 12,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                _buildField(upiIdCtrl, 'UPI ID (e.g. pay1@oksbi)'),
                const SizedBox(height: 10),
                _buildField(receiverCtrl, 'Receiver Name (e.g. MG Desk 1)'),
                const SizedBox(height: 10),
                _buildField(limitCtrl, 'Daily Limit',
                    keyboardType: TextInputType.number),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(error!,
                      style: const TextStyle(
                          color: AppColors.red600, fontSize: 13)),
                ],
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.emerald600,
                        padding: const EdgeInsets.symmetric(vertical: 14)),
                    onPressed: saving
                        ? null
                        : () async {
                            setSheet(() {
                              saving = true;
                              error = null;
                            });
                            try {
                              await AdminApiClient.createModerator(
                                username: usernameCtrl.text.trim(),
                                password: passwordCtrl.text.trim(),
                                upiId: upiIdCtrl.text.trim().isEmpty
                                    ? null
                                    : upiIdCtrl.text.trim(),
                                receiverName: receiverCtrl.text.trim().isEmpty
                                    ? null
                                    : receiverCtrl.text.trim(),
                                dailyLimit:
                                    int.tryParse(limitCtrl.text.trim()) ?? 15,
                              );
                              if (ctx.mounted) Navigator.pop(ctx);
                              _load();
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                      content: Text('Moderator created ✓'),
                                      backgroundColor: Colors.green),
                                );
                              }
                            } catch (e) {
                              setSheet(() {
                                error = e
                                    .toString()
                                    .replaceFirst('Exception: ', '');
                                saving = false;
                              });
                            }
                          },
                    child: saving
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: AppColors.white))
                        : const Text('Create Moderator',
                            style: TextStyle(
                                color: AppColors.white,
                                fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }

  Widget _buildField(TextEditingController ctrl, String hint,
      {bool obscure = false, TextInputType? keyboardType}) {
    return TextField(
      controller: ctrl,
      obscureText: obscure,
      keyboardType: keyboardType,
      style: const TextStyle(color: AppColors.white),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppColors.slate500),
        filled: true,
        fillColor: AppColors.slate700,
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide.none),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      ),
    );
  }

  void _showDelete(Map<String, dynamic> mod) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.slate800,
        title: const Text('Delete Moderator?',
            style: TextStyle(color: AppColors.white)),
        content: Text(
            'Archive @${mod['username']} and deactivate their UPI from the pool. Financial history is retained.',
            style: const TextStyle(color: AppColors.slate300)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel',
                  style: TextStyle(color: AppColors.slate400))),
          ElevatedButton(
            style:
                ElevatedButton.styleFrom(backgroundColor: AppColors.red600),
            onPressed: () async {
              Navigator.pop(context);
              try {
                await AdminApiClient.deleteModerator(mod['id']);
                _load();
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('Moderator deleted'),
                      backgroundColor: Colors.red));
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(e.toString()),
                      backgroundColor: Colors.red));
                }
              }
            },
            child: const Text('Delete',
                style: TextStyle(color: AppColors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _resetPassword(Map<String, dynamic> mod) async {
    final controller = TextEditingController();
    final username = TextEditingController(text: mod['username']);
    String? error;
    bool saving = false;
    await showDialog<void>(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, setDialog) => AlertDialog(
      title: Text('Edit ${mod['username']} credentials'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('This signs out the moderator and revokes their listener credential.'),
        TextField(controller: username, decoration: const InputDecoration(labelText: 'Username')),
        TextField(controller: controller, obscureText: true, decoration: const InputDecoration(labelText: 'New password (optional, 12+ characters)')),
        if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
      ]), actions: [TextButton(onPressed: saving ? null : () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(onPressed: saving ? null : () async {
          setDialog(() => saving = true);
          try { await AdminApiClient.updateModerator(mod['id'], {'username': username.text.trim(), if (controller.text.isNotEmpty) 'password': controller.text}); if (ctx.mounted) Navigator.pop(ctx); }
          catch(e) { if (ctx.mounted) setDialog(() { error = '$e'; saving = false; }); }
        }, child: const Text('Save credentials'))],
    )));
  }

  void _showSuspend(Map<String, dynamic> mod) {
    final isActive = mod['status'] == 'ACTIVE';
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.slate800,
        title: Text('${isActive ? 'Suspend' : 'Activate'} Moderator?',
            style: const TextStyle(color: AppColors.white)),
        content: Text('${isActive ? 'Suspend' : 'Re-activate'} @${mod['username']}?',
            style: const TextStyle(color: AppColors.slate300)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel',
                  style: TextStyle(color: AppColors.slate400))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
                backgroundColor:
                    isActive ? AppColors.amber600 : AppColors.emerald600),
            onPressed: () async {
              Navigator.pop(context);
              try {
                await AdminApiClient.updateModerator(mod['id'],
                    {'status': isActive ? 'SUSPENDED' : 'ACTIVE'});
                _load();
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(e.toString()),
                      backgroundColor: Colors.red));
                }
              }
            },
            child: Text(isActive ? 'Suspend' : 'Activate',
                style: const TextStyle(color: AppColors.white)),
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
        title: Text('Moderators (${_moderators.length})',
            style: const TextStyle(
                fontWeight: FontWeight.w800, color: AppColors.slate900)),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
        bottom: const PreferredSize(
            preferredSize: Size.fromHeight(1), child: Divider(height: 1)),
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: AppColors.emerald600,
        onPressed: _showAddModerator,
        child: const Icon(Icons.add, color: AppColors.white),
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.emerald500))
          : _error != null
              ? Center(
                  child: Text(_error!,
                      style: const TextStyle(color: AppColors.red600)))
              : _moderators.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.person_off_outlined,
                              size: 48, color: AppColors.slate300),
                          const SizedBox(height: 12),
                          const Text('No moderators yet',
                              style: TextStyle(color: AppColors.slate500)),
                          const SizedBox(height: 8),
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.emerald600),
                            onPressed: _showAddModerator,
                            icon: const Icon(Icons.add,
                                color: AppColors.white, size: 18),
                            label: const Text('Add First Moderator',
                                style: TextStyle(color: AppColors.white)),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      color: AppColors.emerald500,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _moderators.length,
                        separatorBuilder: (context, index) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final mod = _moderators[i];
                          final upi =
                              mod['upiAccount'] as Map<String, dynamic>?;
                          final todayCount = upi?['issuedCount'] ?? 0;
                          final dailyLimit = upi?['dailyLimit'] ?? 15;
                          final progress = upi != null
                              ? (todayCount / dailyLimit).clamp(0.0, 1.0)
                              : 0.0;
                          return Card(
                            color: AppColors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                                side: const BorderSide(
                                    color: AppColors.slate200)),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(children: [
                                    Expanded(
                                        child: Row(children: [
                                      Text('@${mod['username']}',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15,
                                              color: AppColors.slate900)),
                                      const SizedBox(width: 8),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                            color: _statusColor(
                                                    mod['status'] ?? 'ACTIVE')
                                                .withValues(alpha: 0.1),
                                            borderRadius:
                                                BorderRadius.circular(4)),
                                        child: Text(mod['status'] ?? 'ACTIVE',
                                            style: TextStyle(
                                                fontSize: 9,
                                                fontWeight: FontWeight.w700,
                                                color: _statusColor(
                                                    mod['status'] ??
                                                        'ACTIVE'))),
                                      ),
                                    ])),
                                    PopupMenuButton<String>(
                                      onSelected: (v) {
                                        if (v == 'password') _resetPassword(mod);
                                        if (v == 'suspend') _showSuspend(mod);
                                        if (v == 'delete') _showDelete(mod);
                                      },
                                      itemBuilder: (_) => [
                                        PopupMenuItem(
                                            value: 'suspend',
                                            child: Text(mod['status'] ==
                                                    'ACTIVE'
                                                ? 'Suspend'
                                                : 'Activate')),
                                        const PopupMenuItem(value: 'password', child: Text('Edit credentials')),
                                        const PopupMenuItem(
                                            value: 'delete',
                                            child: Text('Delete',
                                                style: TextStyle(
                                                    color: Colors.red))),
                                      ],
                                    ),
                                  ]),
                                  if (upi != null) ...[
                                    Text('${upi['deviceStatus']} · ${upi['poolStatus']} · Battery ${upi['batteryLevel'] ?? '—'}%',
                                      style: TextStyle(color: upi['lowBattery'] == true || upi['deviceStatus'] == 'OFFLINE' ? Colors.red : AppColors.emerald700)),
                                    Text('${upi['issuedCount']} slots issued · ${upi['todayTxCount']} received today'),
                                    const Divider(),
                                    Text('Deposits received: ₹${(upi['totalDeposited'] as num? ?? 0).toStringAsFixed(2)}'),
                                    Text('Payouts sent: ₹${(upi['totalPaidOut'] as num? ?? 0).toStringAsFixed(2)}'),
                                    Text('Current float: ₹${(upi['currentBalance'] as num? ?? 0).toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                    Text('Reserved: ₹${(upi['reservedPayouts'] as num? ?? 0).toStringAsFixed(2)} · Available: ₹${(upi['availableBalance'] as num? ?? 0).toStringAsFixed(2)}'),
                                    if ((upi['openingAdjustment'] as num? ?? 0) != 0)
                                      Text('Opening adjustment: ₹${(upi['openingAdjustment'] as num).toStringAsFixed(2)}'),
                                    if (upi['floatReady'] == false)
                                      TextButton(onPressed: () => _confirmOpening(upi), child: const Text('Confirm opening bank balance')),
                                    const Divider(),
                                    Text('Last seen: ${upi['lastHeartbeatAt'] ?? 'Never'}'),
                                    const SizedBox(height: 10),
                                    Row(children: [
                                      const Icon(
                                          Icons.account_balance_wallet_outlined,
                                          size: 14,
                                          color: AppColors.slate400),
                                      const SizedBox(width: 6),
                                      Expanded(
                                          child: Text(upi['upiId'] ?? '',
                                              style: const TextStyle(
                                                  fontFamily: 'monospace',
                                                  fontSize: 12,
                                                  color: AppColors.slate600))),
                                      Text('$todayCount/$dailyLimit',
                                          style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w700,
                                              color: progress > 0.8
                                                  ? AppColors.red600
                                                  : AppColors.slate500)),
                                    ]),
                                    const SizedBox(height: 6),
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(3),
                                      child: LinearProgressIndicator(
                                        value: progress,
                                        backgroundColor: AppColors.slate200,
                                        color: progress > 0.8
                                            ? AppColors.red600
                                            : progress > 0.5
                                                ? AppColors.amber600
                                                : AppColors.emerald500,
                                        minHeight: 4,
                                      ),
                                    ),
                                  ] else ...[
                                    const SizedBox(height: 6),
                                    const Text('No UPI assigned',
                                        style: TextStyle(
                                            color: AppColors.slate400,
                                            fontSize: 12)),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
