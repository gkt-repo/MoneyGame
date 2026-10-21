import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'core/network/moderator_api.dart';
import 'core/services/moderator_listener.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  ModeratorApi.baseUrl =
      await ModeratorApi.storage.read(key: 'server') ?? ModeratorApi.baseUrl;
  runApp(const ModeratorApp());
}

class ModeratorApp extends StatefulWidget {
  const ModeratorApp({super.key});
  @override
  State<ModeratorApp> createState() => _ModeratorAppState();
}

class _ModeratorAppState extends State<ModeratorApp> {
  Map<String, dynamic>? user;
  bool loading = true;
  @override
  void initState() {
    super.initState();
    restore();
  }

  Future<void> restore() async {
    try {
      if (await ModeratorApi.storage.read(key: 'access') != null) {
        final profile = await ModeratorApi.me();
        if (profile['role'] == 'MODERATOR') user = profile;
      }
    } catch (_) {
      /* Login allows reconnecting without retaining a stale view. */
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> logout() async {
    try {
      await ModeratorApi.request('/admin/logout', method: 'POST');
    } catch (_) {
      /* Local logout still works offline. */
    }
    await ModeratorListener.stop();
    await ModeratorApi.clear();
    if (mounted) setState(() => user = null);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'MoneyGame Moderator',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff0b776f)),
      scaffoldBackgroundColor: const Color(0xfff3f6f7),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
      ),
    ),
    home: loading
        ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : user == null
        ? ModeratorLogin(onLogin: (u) => setState(() => user = u))
        : ModeratorHome(user: user!, onLogout: logout),
  );
}

class ModeratorLogin extends StatefulWidget {
  final void Function(Map<String, dynamic>) onLogin;
  const ModeratorLogin({super.key, required this.onLogin});
  @override
  State<ModeratorLogin> createState() => _ModeratorLoginState();
}

class _ModeratorLoginState extends State<ModeratorLogin> {
  final server = TextEditingController(text: ModeratorApi.baseUrl);
  final username = TextEditingController();
  final password = TextEditingController();
  bool busy = false, obscure = true;
  String? error;
  @override
  void dispose() {
    server.dispose();
    username.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final u = await ModeratorApi.login(
        server.text,
        username.text,
        password.text,
      );
      if (mounted) widget.onLogin(u);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(
                  Icons.shield_outlined,
                  size: 64,
                  color: Color(0xff0b776f),
                ),
                const SizedBox(height: 24),
                Text(
                  'Moderator workspace',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const Text('Deposits, payouts and player support'),
                const SizedBox(height: 32),
                TextField(
                  controller: username,
                  decoration: const InputDecoration(
                    labelText: 'Moderator username',
                  ),
                  autofillHints: const [AutofillHints.username],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: password,
                  obscureText: obscure,
                  onSubmitted: (_) => busy ? null : submit(),
                  decoration: InputDecoration(
                    labelText: 'Password',
                    suffixIcon: IconButton(
                      onPressed: () => setState(() => obscure = !obscure),
                      icon: Icon(
                        obscure ? Icons.visibility : Icons.visibility_off,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: server,
                  decoration: const InputDecoration(labelText: 'Server URL'),
                  keyboardType: TextInputType.url,
                ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      error!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: busy ? null : submit,
                  child: Text(busy ? 'Signing in…' : 'Sign in'),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Use the credentials provided by your Super Admin.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class ModeratorHome extends StatefulWidget {
  final Map<String, dynamic> user;
  final bool enableRealtime;
  final Future<void> Function() onLogout;
  const ModeratorHome({
    super.key,
    required this.user,
    required this.onLogout,
    this.enableRealtime = true,
  });
  @override
  State<ModeratorHome> createState() => _ModeratorHomeState();
}

class _ModeratorHomeState extends State<ModeratorHome>
    with WidgetsBindingObserver {
  int tab = 0;
  bool loading = true, acting = false, refreshing = false;
  String? error, listenerError;
  List<Map<String, dynamic>> items = [];
  Map<String, dynamic>? account;
  Map<String, dynamic> device = {};
  Timer? timer;
  io.Socket? socket;
  static const titles = ['Deposits', 'Payouts', 'Support'];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    connect();
    refresh();
    if (widget.enableRealtime) {
      connectSocket();
    }
    timer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => refresh(quiet: true),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    timer?.cancel();
    socket?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      refresh(quiet: true);
    }
  }

  Future<void> connectSocket() async {
    try {
      final token = await ModeratorApi.session.validAccessToken();
      if (!mounted || token == null) return;
      socket?.dispose();
      socket = io.io(
        ModeratorApi.baseUrl,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .setAuth({'token': token})
            .disableAutoConnect()
            .build(),
      );
      socket!.onDisconnect((reason) async {
        if (!mounted || reason != 'io server disconnect') return;
        // Revocation and expiry both disconnect the socket. Refresh/me distinguishes them.
        await refresh(quiet: true);
        if (mounted && await ModeratorApi.storage.read(key: 'access') != null) {
          await connectSocket();
        }
      });
      socket!.connect();
    } catch (_) {
      /* Periodic authenticated refresh remains available offline. */
    }
  }

  Future<void> connect() async {
    try {
      await ModeratorListener.connect();
      if (mounted) setState(() => listenerError = null);
    } catch (e) {
      if (mounted) setState(() => listenerError = '$e');
    }
  }

  Future<void> refresh({bool quiet = false}) async {
    if (refreshing) return;
    refreshing = true;
    final selected = tab;
    if (!quiet && mounted) setState(() => loading = true);
    try {
      final profile = await ModeratorApi.me();
      if (profile['role'] != 'MODERATOR') {
        await widget.onLogout();
        return;
      }
      final paths = [
        '/admin/deposits',
        '/admin/withdrawals',
        '/admin/feedback',
      ];
      final keys = ['deposits', 'withdrawals', 'feedbacks'];
      final result = await ModeratorApi.request(paths[selected]);
      final state = await ModeratorApi.request('/admin/moderator-status');
      final native = await ModeratorListener.status();
      if (mounted && selected == tab) {
        setState(() {
          items = List<Map<String, dynamic>>.from(result[keys[selected]] ?? []);
          account = state['account'] == null
              ? null
              : Map<String, dynamic>.from(state['account']);
          device = native;
          error = null;
        });
      }
    } catch (e) {
      if (await ModeratorApi.storage.read(key: 'access') == null ||
          '$e'.contains('suspended') ||
          '$e'.contains('banned')) {
        timer?.cancel();
        await widget.onLogout();
        return;
      }
      if (mounted) setState(() => error = '$e');
    } finally {
      refreshing = false;
      if (mounted) setState(() => loading = false);
    }
  }

  Future<String?> input(
    String title,
    String label, {
    String initial = '',
    String? note,
  }) async {
    final controller = TextEditingController(text: initial);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (note != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(note),
              ),
            TextField(
              controller: controller,
              autofocus: true,
              decoration: InputDecoration(labelText: label),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().isNotEmpty) {
                Navigator.pop(ctx, controller.text.trim());
              }
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    // The dialog route may still be animating; controller is collected with the route.
    return result;
  }

  Future<void> action(
    String path,
    Map<String, dynamic> data, {
    String method = 'POST',
  }) async {
    if (acting) return;
    setState(() => acting = true);
    try {
      await ModeratorApi.request(path, method: method, data: data);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Saved')));
      }
      await refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => acting = false);
    }
  }

  Future<void> setup() async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Payment listener',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              Text('UPI: ${account?['upiId'] ?? 'Not assigned'}'),
              Text(
                'Notification access: ${device['isPermissionGranted'] == true ? 'Granted' : 'Required'}',
              ),
              Text(
                'Listener: ${device['isListenerConnected'] == true ? 'Connected' : 'Disconnected'}',
              ),
              Text('Queued reports: ${device['queuedPayments'] ?? 0}'),
              if (listenerError != null)
                Text(listenerError!, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 16),
              FilledButton.tonal(
                onPressed: () async {
                  await ModeratorListener.permission();
                },
                child: const Text('Allow notification access'),
              ),
              OutlinedButton(
                onPressed: () async {
                  await ModeratorListener.battery();
                },
                child: const Text('Allow background operation'),
              ),
              OutlinedButton(
                onPressed: () async {
                  await connect();
                  if (ctx.mounted) Navigator.pop(ctx);
                  await refresh();
                },
                child: const Text('Reconnect listener'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget row(Map<String, dynamic> item) {
    final status = '${item['status']}';
    final owner = item['processingById'];
    final mine = owner == widget.user['id'];
    final user =
        item['username'] ?? item['user']?['username'] ?? item['userId'] ?? '';
    final id = '${item['id']}';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '$user',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                Chip(label: Text(status)),
              ],
            ),
            if (tab == 2) ...[
              Text(
                '${item['subject']}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text('${item['message']}'),
              if (item['adminReply'] != null)
                Text('Reply: ${item['adminReply']}'),
            ] else ...[
              Text(
                '₹${item[tab == 0 ? 'totalAmount' : 'amount']}',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              SelectableText(
                '${item[tab == 0 ? 'receivingUpi' : 'upiId'] ?? ''}',
              ),
              if (tab == 0) Text('Wallet credit: ₹${item['baseAmount']}'),
              if (item['userClaimedUtr'] != null)
                SelectableText('Claimed UTR: ${item['userClaimedUtr']}'),
              if (item['payoutUtr'] != null)
                SelectableText('Payout UTR: ${item['payoutUtr']}'),
            ],
            Text(
              '${item['createdAt'] ?? ''}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (tab == 0 &&
                    ['PENDING', 'CLAIMED', 'EXPIRED'].contains(status)) ...[
                  FilledButton(
                    onPressed: acting
                        ? null
                        : () async {
                            final utr = await input(
                              'Verify received payment',
                              'Actual bank UTR',
                              initial: '${item['userClaimedUtr'] ?? ''}',
                              note:
                                  'Check the receiving account and exact amount in the bank record before crediting this player.',
                            );
                            if (utr != null) {
                              await action('/admin/deposits/$id/approve', {
                                'utr': utr,
                              });
                            }
                          },
                    child: const Text('Verify & credit'),
                  ),
                  TextButton(
                    onPressed: acting
                        ? null
                        : () async {
                            final reason = await input(
                              'Reject deposit',
                              'Reason',
                            );
                            if (reason != null) {
                              await action('/admin/deposits/$id/reject', {
                                'reason': reason,
                              });
                            }
                          },
                    child: const Text('Reject'),
                  ),
                ],
                if (tab == 1 && status == 'PENDING')
                  FilledButton(
                    onPressed: acting
                        ? null
                        : () => action('/admin/withdrawals/claim', {
                            'withdrawalId': id,
                          }),
                    child: const Text('Take payout'),
                  ),
                if (tab == 1 && status == 'PROCESSING' && !mine)
                  const Text('Being handled by another operator'),
                if (tab == 1 && status == 'PROCESSING' && mine) ...[
                  OutlinedButton(
                    onPressed: () => Clipboard.setData(
                      ClipboardData(text: '${item['upiId']}'),
                    ),
                    child: const Text('Copy UPI'),
                  ),
                  FilledButton(
                    onPressed: acting
                        ? null
                        : () async {
                            final utr = await input(
                              'Confirm payment sent',
                              'Actual payout UTR',
                              note:
                                  'Send ₹${item['amount']} to ${item['upiId']} using your banking app. Record the real bank reference after success.',
                            );
                            if (utr != null) {
                              await action('/admin/withdrawals/complete', {
                                'withdrawalId': id,
                                'payoutUtr': utr,
                              });
                            }
                          },
                    child: const Text('Mark paid'),
                  ),
                  TextButton(
                    onPressed: acting
                        ? null
                        : () async {
                            final reason = await input(
                              'Reject unpaid withdrawal',
                              'Reason',
                              note:
                                  'Only reject if you have not sent the payment. Funds will return to the player.',
                            );
                            if (reason != null) {
                              await action('/admin/withdrawals/reject', {
                                'withdrawalId': id,
                                'reason': reason,
                              });
                            }
                          },
                    child: const Text('Reject & refund'),
                  ),
                ],
                if (tab == 2)
                  FilledButton(
                    onPressed: acting
                        ? null
                        : () async {
                            final reply = await input(
                              'Reply to player',
                              'Reply',
                              initial: '${item['adminReply'] ?? ''}',
                            );
                            if (reply != null) {
                              await action('/admin/feedback/$id/reply', {
                                'adminReply': reply,
                                'status': 'RESOLVED',
                              }, method: 'PATCH');
                            }
                          },
                    child: const Text('Reply & resolve'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text('${titles[tab]} · ${widget.user['username']}'),
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: () => refresh(),
          icon: const Icon(Icons.refresh),
        ),
        IconButton(
          tooltip: 'Sign out',
          onPressed: widget.onLogout,
          icon: const Icon(Icons.logout),
        ),
      ],
    ),
    body: Column(
      children: [
        Material(
          color: const Color(0xffe0f1ed),
          child: ListTile(
            onTap: setup,
            leading: Icon(
              device['isListenerConnected'] == true
                  ? Icons.sensors
                  : Icons.sensors_off,
            ),
            title: Text(
              account == null
                  ? 'Set up your payment listener'
                  : '${account!['upiId']} · ${account!['poolStatus']}',
            ),
            subtitle: Text(
              account == null
                  ? 'Ask Super Admin to assign a UPI, then connect.'
                  : '${account!['issuedCount']}/${account!['dailyLimit']} slots issued · ${account!['todayTxCount']} received today',
            ),
            trailing: const Icon(Icons.chevron_right),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(error!, style: const TextStyle(color: Colors.red)),
          ),
        if (acting) const LinearProgressIndicator(),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: refresh,
                  child: ListView(
                    padding: const EdgeInsets.all(12),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: items.isEmpty
                        ? [
                            Padding(
                              padding: const EdgeInsets.all(48),
                              child: Center(
                                child: Text(
                                  'No ${titles[tab].toLowerCase()} to show',
                                ),
                              ),
                            ),
                          ]
                        : items.map(row).toList(),
                  ),
                ),
        ),
      ],
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: tab,
      onDestinationSelected: (i) async {
        if (refreshing || acting) return;
        setState(() {
          tab = i;
          items = [];
        });
        await refresh();
      },
      destinations: const [
        NavigationDestination(icon: Icon(Icons.south_west), label: 'Deposits'),
        NavigationDestination(icon: Icon(Icons.north_east), label: 'Payouts'),
        NavigationDestination(
          icon: Icon(Icons.support_agent),
          label: 'Support',
        ),
      ],
    ),
  );
}
