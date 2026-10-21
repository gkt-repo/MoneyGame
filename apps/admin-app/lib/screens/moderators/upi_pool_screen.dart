import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/network/admin_api_client.dart';

class UpiPoolScreen extends StatefulWidget {
  const UpiPoolScreen({super.key});
  @override State<UpiPoolScreen> createState() => _UpiPoolScreenState();
}
class _UpiPoolScreenState extends State<UpiPoolScreen> {
  List<Map<String,dynamic>> pool = [], moderators = [];
  int batchSize = 2;
  String? error;
  Timer? timer;
  @override void initState() { super.initState(); load(); timer = Timer.periodic(const Duration(seconds: 30), (_) => load()); }
  @override void dispose() { timer?.cancel(); super.dispose(); }
  Future<void> load() async {
    try {
      final values = await Future.wait([AdminApiClient.listUpiPool(), AdminApiClient.listModerators(), AdminApiClient.rotationSettings()]);
      if (mounted) { setState(() { pool = values[0] as List<Map<String,dynamic>>; moderators = values[1] as List<Map<String,dynamic>>;
        batchSize = (values[2] as Map<String,dynamic>)['batchSize'] as int; error = null; }); }
    } catch(e) { if (mounted) setState(() => error = '$e'); }
  }
  Future<void> edit([Map<String,dynamic>? a]) async {
    final upi = TextEditingController(text: a?['upiId']);
    final name = TextEditingController(text: a?['receiverName']);
    final limit = TextEditingController(text: '${a?['dailyLimit'] ?? 15}');
    final order = TextEditingController(text: '${a?['sortOrder'] ?? pool.length}');
    String? owner = a?['assignedUserId'];
    bool active = a?['isActive'] ?? true, saving = false;
    String? issue;
    await showDialog<void>(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, setDialog) => AlertDialog(
      title: Text(a == null ? 'Add receiving UPI' : 'Edit receiving UPI'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: upi, decoration: const InputDecoration(labelText: 'UPI ID')),
        TextField(controller: name, decoration: const InputDecoration(labelText: 'Receiver name')),
        TextField(controller: limit, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Daily issued-slot limit')),
        TextField(controller: order, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Rotation order')),
        DropdownButtonFormField<String>(initialValue: owner ?? '', isExpanded: true, decoration: const InputDecoration(labelText: 'Moderator'),
          items: [const DropdownMenuItem(value: '', child: Text('Unassigned / admin listener')),
            ...moderators.map((m) => DropdownMenuItem(value: '${m['id']}', child: Text('${m['username']}')))],
          onChanged: (v) => owner = v == '' ? null : v),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Accept new deposits'), value: active, onChanged: (v) => setDialog(() => active = v)),
        const Text('Slots stay reserved until midnight IST, including expired QR codes. Disable an old UPI before adding a replacement.'),
        if (issue != null) Text(issue!, style: const TextStyle(color: Colors.red)),
      ])), actions: [TextButton(onPressed: saving ? null : () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(onPressed: saving ? null : () async {
          setDialog(() { saving = true; issue = null; });
          try {
            final data = <String,dynamic>{'upiId': upi.text.trim(), 'receiverName': name.text.trim(), 'dailyLimit': int.tryParse(limit.text),
              'sortOrder': int.tryParse(order.text), 'assignedUserId': owner, 'isActive': active};
            if (a == null) {
              // Creation and assignment are one server transaction.
              await AdminApiClient.createPoolAccount(data);
            } else { await AdminApiClient.updateUpiAccount(a['id'], data); }
            if (ctx.mounted) Navigator.pop(ctx);
            await load();
          } catch(e) { if (ctx.mounted) setDialog(() { saving = false; issue = '$e'; }); }
        }, child: Text(saving ? 'Saving…' : 'Save'))],
    )));
  }
  Future<void> rotation() async {
    final controller = TextEditingController(text: '$batchSize');
    String? issue;
    await showDialog<void>(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, setDialog) => AlertDialog(
      title: const Text('Deposits per rotation turn'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: controller, keyboardType: TextInputType.number),
        if (issue != null) Text(issue!, style: const TextStyle(color: Colors.red))]),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(onPressed: () async {
          try { await AdminApiClient.saveRotation(int.tryParse(controller.text) ?? 0); if (ctx.mounted) Navigator.pop(ctx); await load(); }
          catch(e) { if (ctx.mounted) setDialog(() => issue = '$e'); }
        }, child: const Text('Save'))],
    )));
  }
  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('UPI Pool'), actions: [IconButton(onPressed: load, icon: const Icon(Icons.refresh))]),
    floatingActionButton: FloatingActionButton.extended(onPressed: () => edit(), icon: const Icon(Icons.add), label: const Text('Add UPI')),
    body: RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.fromLTRB(16,16,16,90), children: [
      Card(child: ListTile(title: Text('Batch size: $batchSize'), subtitle: const Text('Daily counters use midnight IST'), trailing: const Icon(Icons.edit), onTap: rotation)),
      if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
      if (pool.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Text('Add UPI accounts to start pool rotation.')),
      ...pool.map((a) => Card(child: ListTile(onTap: () => edit(a),
        title: Text('${a['upiId']} · ${a['poolStatus']}'),
        subtitle: Text('${a['receiverName']}\n${a['issuedCount']}/${a['dailyLimit']} issued · ${a['todayTxCount']} received\n${a['assignedUser']?['username'] ?? 'Admin listener'} · Battery ${a['batteryLevel'] ?? '—'}%'),
        isThreeLine: true, trailing: const Icon(Icons.edit)))),
    ])),
  );
}
