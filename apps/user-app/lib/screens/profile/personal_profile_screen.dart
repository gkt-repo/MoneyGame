import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_client.dart';
import '../../core/network/socket_service.dart';
import '../wallet/add_cash_screen.dart';
import '../wallet/withdraw_screen.dart';
import 'profile_dialogs.dart';

class PersonalProfileScreen extends StatefulWidget {
  final UserProfileModel user;
  final VoidCallback onChanged, onNotifications, onLogout;
  const PersonalProfileScreen({
    super.key,
    required this.user,
    required this.onChanged,
    required this.onNotifications,
    required this.onLogout,
  });
  @override
  State<PersonalProfileScreen> createState() => _PersonalProfileScreenState();
}

class _PersonalProfileScreenState extends State<PersonalProfileScreen> {
  late UserProfileModel _user;
  UserProfileDetailModel? _profile;
  bool _loading = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _user = widget.user;
    _refresh();
    SocketService.on('wallet_updated', _onWallet);
    SocketService.on('balance_updated', _onWallet);
  }

  @override
  void dispose() {
    SocketService.off('wallet_updated', _onWallet);
    SocketService.off('balance_updated', _onWallet);
    super.dispose();
  }

  void _onWallet(dynamic _) => _refresh();
  Future<void> _refresh() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await Future.wait([
        ApiClient.getMe().then((user) {
          if (mounted) setState(() => _user = user);
        }),
        ApiClient.getUserProfile().then((profile) {
          if (mounted) setState(() => _profile = profile);
        }),
      ]);
      if (mounted) widget.onChanged();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Could not refresh your profile. Pull down to retry.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _money(bool deposit) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => deposit
            ? AddCashScreen(user: _user, onPaymentSuccess: _refresh)
            : WithdrawScreen(user: _user, onWithdrawalSuccess: _refresh),
      ),
    );
    if (mounted) _refresh();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.white,
    appBar: AppBar(
      title: const Text('My profile'),
      actions: [
        IconButton(
          tooltip: 'Edit profile',
          icon: const Icon(Icons.edit_outlined),
          onPressed: () async {
            await showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => EditProfileModal(onSaved: _refresh),
            );
            if (mounted) _refresh();
          },
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: _refresh,
      color: Colors.black,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          if (_loading)
            const LinearProgressIndicator(color: Colors.black, minHeight: 2),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          Row(
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: const Color(0xfff3f3f3),
                child: Text(
                  getAvatarEmoji(_user.avatar),
                  style: const TextStyle(fontSize: 30),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _user.displayName ?? _user.username,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '@${_user.username}',
                      style: const TextStyle(color: Colors.black54),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xff141414),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'AVAILABLE BALANCE',
                  style: TextStyle(
                    color: Colors.white60,
                    fontSize: 11,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  '₹${_user.balance.toStringAsFixed(2)}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 34,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  'In play / reserved  ₹${_user.lockedBalance.toStringAsFixed(2)}',
                  style: const TextStyle(color: Colors.white60, fontSize: 12),
                ),
                const SizedBox(height: 22),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton(
                        onPressed: () => _money(true),
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                        ),
                        child: const Text('Deposit'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _money(false),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white38),
                        ),
                        child: const Text('Withdraw'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.receipt_long_outlined),
            title: const Text('Transaction history'),
            subtitle: const Text('All deposits, withdrawals and game activity'),
            trailing: const Icon(Icons.arrow_forward),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => const TransactionHistoryScreen(),
              ),
            ),
          ),
          const Divider(height: 32),
          const Text(
            'ACCOUNT DETAILS',
            style: TextStyle(
              fontSize: 11,
              letterSpacing: 1.5,
              color: Colors.black54,
            ),
          ),
          const SizedBox(height: 12),
          _detail('Email', _user.email ?? 'Not provided'),
          _detail('Phone', _user.phone ?? 'Not provided'),
          _detail('Account ID', _user.id),
          _detail('Status', _user.status),
          _detail('Role', _user.role),
          _detail(
            'Member since',
            _profile == null
                ? '—'
                : DateFormat.yMMMd().format(
                    DateTime.parse(_profile!.createdAt),
                  ),
          ),
          if (_profile != null) ...[
            const Divider(height: 32),
            const Text(
              'YOUR GAME RECORD',
              style: TextStyle(
                fontSize: 11,
                letterSpacing: 1.5,
                color: Colors.black54,
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 28,
              runSpacing: 12,
              children: [
                Text('${_profile!.stats.totalGames} played'),
                Text('${_profile!.stats.totalWins} won'),
                Text(
                  '${_profile!.stats.winRatePercent.toStringAsFixed(0)}% win rate',
                ),
              ],
            ),
            const SizedBox(height: 18),
            ..._profile!.stats.byGame.entries.map(
              (e) => _detail(
                e.key.replaceAll('_', ' '),
                '${e.value.played} played · ${e.value.won} won',
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Recent results',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            if (_profile!.recentGames.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text('Your completed games will appear here.'),
              ),
            ..._profile!.recentGames.map(
              (g) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(g.gameType.replaceAll('_', ' ')),
                subtitle: Text('#${g.roomCode}'),
                trailing: Text(
                  g.isWin ? '+₹${g.prize.toStringAsFixed(2)}' : 'Lost',
                ),
              ),
            ),
          ],
          const Divider(height: 32),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.notifications_none),
            title: const Text('Notifications'),
            onTap: widget.onNotifications,
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.logout),
            title: const Text('Log out'),
            onTap: widget.onLogout,
          ),
        ],
      ),
    ),
  );
  Widget _detail(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 9),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 110,
          child: Text(label, style: const TextStyle(color: Colors.black54)),
        ),
        Expanded(child: SelectableText(value)),
      ],
    ),
  );
}

typedef HistoryPage = ({List<TransactionModel> items, String? nextCursor});

class TransactionHistoryScreen extends StatefulWidget {
  final Future<HistoryPage> Function({String? cursor})? loadPage;
  const TransactionHistoryScreen({super.key, this.loadPage});
  @override
  State<TransactionHistoryScreen> createState() =>
      _TransactionHistoryScreenState();
}

class _TransactionHistoryScreenState extends State<TransactionHistoryScreen> {
  final List<TransactionModel> _items = [];
  String? _cursor, _error;
  bool _loading = false, _hasMore = true;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await (widget.loadPage ?? ApiClient.getTransactionPage)(
        cursor: reset ? null : _cursor,
      );
      if (mounted) {
        setState(() {
          if (reset) _items.clear();
          _items.addAll(page.items);
          _cursor = page.nextCursor;
          _hasMore = _cursor != null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not load history. Please retry.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.white,
    appBar: AppBar(title: const Text('Transaction history')),
    body: RefreshIndicator(
      onRefresh: () => _load(reset: true),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Your complete wallet ledger',
            style: TextStyle(color: Colors.black54),
          ),
          const SizedBox(height: 20),
          if (_items.isEmpty && !_loading && _error == null)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Text('No transactions yet.'),
            ),
          ..._items.map(
            (tx) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    tx.amount > 0
                        ? Icons.south_west
                        : tx.amount < 0
                        ? Icons.north_east
                        : Icons.check_circle_outline,
                    size: 20,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tx.description ?? tx.type.replaceAll('_', ' '),
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        Text(
                          DateFormat(
                            'dd MMM yyyy · HH:mm',
                          ).format(tx.createdAt),
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.black54,
                          ),
                        ),
                        SelectableText(
                          tx.referenceId ?? tx.id,
                          style: const TextStyle(
                            fontSize: 10,
                            color: Colors.black45,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${tx.amount > 0
                        ? '+'
                        : tx.amount < 0
                        ? '−'
                        : ''}₹${tx.amount.abs().toStringAsFixed(2)}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: Colors.red)),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(color: Colors.black),
              ),
            )
          else if (_hasMore || _error != null)
            OutlinedButton(
              onPressed: _load,
              child: Text(_error != null ? 'Retry' : 'Load older transactions'),
            ),
          if (!_hasMore && _items.isNotEmpty)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Text(
                'You’re up to date — all transactions shown.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.black54),
              ),
            ),
        ],
      ),
    ),
  );
}
