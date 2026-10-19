import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';
import 'user_profile_screen.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  List<AdminUserModel> _users = [];
  bool _loading = true;
  String? _error;
  String _statusFilter = 'ALL';
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchUsers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchUsers() async {
    setState(() => _loading = true);
    try {
      final list = await AdminApiClient.getUsers(
        search: _searchController.text.trim(),
        status: _statusFilter,
      );
      if (mounted) {
        setState(() {
          _users = list;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openUserProfile(String userId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => UserProfileScreen(
          userId: userId,
          onUserUpdated: _fetchUsers,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      body: Column(
        children: [
          // Header Search & Filters
          Container(
            padding: const EdgeInsets.all(16),
            color: AppColors.white,
            child: Column(
              children: [
                // Search Bar
                TextField(
                  controller: _searchController,
                  onSubmitted: (_) => _fetchUsers(),
                  decoration: InputDecoration(
                    hintText: 'Search username, phone, email, or ID...',
                    prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.slate400),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              _fetchUsers();
                            },
                          )
                        : IconButton(
                            icon: const Icon(Icons.arrow_forward, size: 18, color: AppColors.slate600),
                            onPressed: _fetchUsers,
                          ),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  ),
                ),
                const SizedBox(height: 10),

                // Status Filter Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['ALL', 'ACTIVE', 'SUSPENDED', 'BANNED'].map((st) {
                      final isSelected = _statusFilter == st;
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(st),
                          selected: isSelected,
                          onSelected: (val) {
                            if (val) {
                              setState(() => _statusFilter = st);
                              _fetchUsers();
                            }
                          },
                          labelStyle: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: isSelected ? AppColors.white : AppColors.slate700,
                          ),
                          selectedColor: AppColors.slate900,
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

          // User list
          Expanded(
            child: RefreshIndicator(
              onRefresh: _fetchUsers,
              child: _loading && _users.isEmpty
                  ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900))
                  : _error != null && _users.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(_error!, style: const TextStyle(color: AppColors.red600)),
                              const SizedBox(height: 10),
                              ElevatedButton(onPressed: _fetchUsers, child: const Text('Retry')),
                            ],
                          ),
                        )
                      : _users.isEmpty
                          ? const Center(
                              child: Text('No users match search or filter criteria', style: TextStyle(color: AppColors.slate400, fontSize: 13)),
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.all(14),
                              itemCount: _users.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 10),
                              itemBuilder: (context, i) {
                                final u = _users[i];
                                final statusColor = u.status == 'ACTIVE'
                                    ? AppColors.emerald600
                                    : u.status == 'SUSPENDED'
                                        ? AppColors.amber600
                                        : AppColors.red600;

                                return InkWell(
                                  onTap: () => _openUserProfile(u.id),
                                  borderRadius: BorderRadius.circular(12),
                                  child: Container(
                                    padding: const EdgeInsets.all(14),
                                    decoration: BoxDecoration(
                                      color: AppColors.white,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: AppColors.slate200),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        // Top Row: Avatar, Username, Status, Role
                                        Row(
                                          children: [
                                            CircleAvatar(
                                              radius: 18,
                                              backgroundColor: AppColors.slate900,
                                              child: Text(
                                                u.username.isNotEmpty ? u.username.substring(0, 1).toUpperCase() : 'U',
                                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.white),
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Row(
                                                    children: [
                                                      Text(
                                                        u.username,
                                                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.slate900),
                                                      ),
                                                      const SizedBox(width: 6),
                                                      Container(
                                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                        decoration: BoxDecoration(
                                                          color: statusColor.withValues(alpha: 0.1),
                                                          borderRadius: BorderRadius.circular(4),
                                                        ),
                                                        child: Text(
                                                          u.status,
                                                          style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: statusColor),
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                  Text(
                                                    u.phone ?? u.email ?? u.id,
                                                    style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                                                  ),
                                                ],
                                              ),
                                            ),
                                            Column(
                                              crossAxisAlignment: CrossAxisAlignment.end,
                                              children: [
                                                Text(
                                                  '₹${u.balance.toStringAsFixed(2)}',
                                                  style: const TextStyle(fontFamily: 'monospace', fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.emerald700),
                                                ),
                                                if (u.lockedBalance > 0)
                                                  Text(
                                                    '₹${u.lockedBalance.toStringAsFixed(2)} in play',
                                                    style: const TextStyle(fontSize: 10, color: AppColors.slate400),
                                                  ),
                                              ],
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 10),
                                        const Divider(height: 1),
                                        const SizedBox(height: 8),

                                        // Bottom Row: Stats Summary
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Text(
                                              'Dep: ₹${u.totalDepositedAmount.toStringAsFixed(0)} (${u.totalDepositsCount})',
                                              style: const TextStyle(fontSize: 11, color: AppColors.slate600),
                                            ),
                                            Text(
                                              'With: ₹${u.totalWithdrawnAmount.toStringAsFixed(0)} (${u.totalWithdrawalsCount})',
                                              style: const TextStyle(fontSize: 11, color: AppColors.slate600),
                                            ),
                                            Text(
                                              'Games: ${u.roomsPlayedCount} (Won ${u.roomsWonCount})',
                                              style: const TextStyle(fontSize: 11, color: AppColors.slate600),
                                            ),
                                            const Icon(Icons.arrow_forward_ios, size: 12, color: AppColors.slate400),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
            ),
          ),
        ],
      ),
    );
  }
}
