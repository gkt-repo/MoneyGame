import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';
import '../users/user_profile_screen.dart';

class FeedbackScreen extends StatefulWidget {
  const FeedbackScreen({super.key});

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  List<AdminFeedbackModel> _feedbacks = [];
  bool _loading = true;
  String? _error;
  String _statusFilter = 'ALL';

  @override
  void initState() {
    super.initState();
    _fetchFeedbacks();
  }

  Future<void> _fetchFeedbacks() async {
    setState(() => _loading = true);
    try {
      final list = await AdminApiClient.getFeedbacks(status: _statusFilter);
      if (mounted) {
        setState(() {
          _feedbacks = list;
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
        builder: (_) => UserProfileScreen(userId: userId, onUserUpdated: _fetchFeedbacks),
      ),
    );
  }

  Future<void> _showReplyDialog(AdminFeedbackModel item) async {
    final replyController = TextEditingController(text: item.adminReply ?? '');
    String selectedStatus = item.status == 'OPEN' ? 'RESOLVED' : item.status;
    bool submitting = false;
    String? dialogError;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: AppColors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('Reply to Support Ticket', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('User: ${item.username}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                Text('Subject: ${item.subject}', style: const TextStyle(fontSize: 12, color: AppColors.slate600)),
                const SizedBox(height: 14),
                const Text('Your Reply:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                TextField(
                  controller: replyController,
                  maxLines: 4,
                  style: const TextStyle(fontSize: 13),
                  decoration: const InputDecoration(
                    hintText: 'Enter response message to player...',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
                const SizedBox(height: 14),
                const Text('Ticket Status:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  children: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((st) {
                    final isSel = selectedStatus == st;
                    return ChoiceChip(
                      label: Text(st.replaceAll('_', ' ')),
                      selected: isSel,
                      onSelected: (val) {
                        if (val) setDialogState(() => selectedStatus = st);
                      },
                      labelStyle: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: isSel ? AppColors.white : AppColors.slate700),
                      selectedColor: st == 'RESOLVED' ? AppColors.emerald600 : AppColors.slate800,
                      backgroundColor: AppColors.slate100,
                      elevation: 0,
                    );
                  }).toList(),
                ),
                if (dialogError != null) ...[
                  const SizedBox(height: 8),
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
                      final reply = replyController.text.trim();
                      if (reply.isEmpty) {
                        setDialogState(() => dialogError = 'Reply message cannot be empty');
                        return;
                      }
                      setDialogState(() {
                        submitting = true;
                        dialogError = null;
                      });
                      try {
                        await AdminApiClient.replyFeedback(
                          feedbackId: item.id,
                          adminReply: reply,
                          status: selectedStatus,
                        );
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        _fetchFeedbacks();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Support reply dispatched!'), backgroundColor: AppColors.emerald700),
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
              child: const Text('Send Reply', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final openCount = _feedbacks.where((f) => f.status == 'OPEN').length;

    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        title: Row(
          children: [
            const Text(
              'Support Desk',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.slate900),
            ),
            if (openCount > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: AppColors.amber50, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.amber600)),
                child: Text('$openCount open', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.amber800)),
              ),
            ],
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, size: 20, color: AppColors.slate600),
            onPressed: _fetchFeedbacks,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(49),
          child: Column(
            children: [
              Container(
                color: AppColors.white,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((st) {
                      final isSelected = _statusFilter == st;
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(st == 'ALL' ? 'All Tickets' : st.replaceAll('_', ' ')),
                          selected: isSelected,
                          onSelected: (val) {
                            if (val) {
                              setState(() => _statusFilter = st);
                              _fetchFeedbacks();
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
              ),
              Container(color: AppColors.slate200, height: 1),
            ],
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchFeedbacks,
        child: _loading && _feedbacks.isEmpty
            ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900))
            : _error != null && _feedbacks.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(_error!, style: const TextStyle(color: AppColors.red600)),
                        const SizedBox(height: 10),
                        ElevatedButton(onPressed: _fetchFeedbacks, child: const Text('Retry')),
                      ],
                    ),
                  )
                : _feedbacks.isEmpty
                    ? const Center(
                        child: Text('No support tickets in this view', style: TextStyle(color: AppColors.slate400, fontSize: 13)),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(14),
                        itemCount: _feedbacks.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (context, i) {
                          final item = _feedbacks[i];
                          final isResolved = item.status == 'RESOLVED';
                          final isOpen = item.status == 'OPEN';

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
                                // Top row: Category, Status, Date
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppColors.slate100,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        item.category,
                                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.slate700),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: isResolved ? AppColors.emerald50 : isOpen ? AppColors.amber50 : AppColors.slate100,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        item.status.replaceAll('_', ' '),
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800,
                                          color: isResolved ? AppColors.emerald700 : isOpen ? AppColors.amber800 : AppColors.slate600,
                                        ),
                                      ),
                                    ),
                                    const Spacer(),
                                    Text(
                                      _formatDate(item.createdAt),
                                      style: const TextStyle(fontSize: 10, color: AppColors.slate400),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),

                                // User Identity Row
                                InkWell(
                                  onTap: () => _openUserProfile(item.userId),
                                  child: Row(
                                    children: [
                                      CircleAvatar(
                                        radius: 12,
                                        backgroundColor: AppColors.slate900,
                                        child: Text(
                                          item.username.isNotEmpty ? item.username.substring(0, 1).toUpperCase() : 'U',
                                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.white),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        item.username,
                                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                                      ),
                                      if (item.userBalance != null) ...[
                                        const SizedBox(width: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                          decoration: BoxDecoration(
                                            color: AppColors.emerald50,
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: Text(
                                            '₹${item.userBalance!.toStringAsFixed(2)}',
                                            style: const TextStyle(fontFamily: 'monospace', fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.emerald700),
                                          ),
                                        ),
                                      ],
                                      const Spacer(),
                                      const Icon(Icons.open_in_new, size: 14, color: AppColors.slate400),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 8),

                                // Subject & Message
                                Text(
                                  item.subject,
                                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.slate900),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  item.message,
                                  style: const TextStyle(fontSize: 12, color: AppColors.slate700, height: 1.4),
                                ),

                                if (item.contactInfo != null && item.contactInfo!.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    'Contact Provided: ${item.contactInfo}',
                                    style: const TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: AppColors.slate500),
                                  ),
                                ],

                                // Admin Reply Box if present
                                if (item.adminReply != null && item.adminReply!.isNotEmpty) ...[
                                  const SizedBox(height: 10),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                      color: AppColors.slate50,
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(color: AppColors.slate200),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            const Icon(Icons.reply, size: 14, color: AppColors.slate600),
                                            const SizedBox(width: 6),
                                            const Text(
                                              'Official Support Response:',
                                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate800),
                                            ),
                                            const Spacer(),
                                            if (item.repliedAt != null)
                                              Text(
                                                _formatDate(item.repliedAt!),
                                                style: const TextStyle(fontSize: 9, color: AppColors.slate400),
                                              ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          item.adminReply!,
                                          style: const TextStyle(fontSize: 12, color: AppColors.slate800),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],

                                const SizedBox(height: 10),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: ElevatedButton.icon(
                                    onPressed: () => _showReplyDialog(item),
                                    icon: const Icon(Icons.reply, size: 14, color: AppColors.white),
                                    label: Text(
                                      item.adminReply == null ? 'Reply to Ticket' : 'Edit Response',
                                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.white),
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.slate900,
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
      ),
    );
  }

  String _formatDate(String isoString) {
    try {
      final dt = DateTime.parse(isoString).toLocal();
      return DateFormat('dd MMM, hh:mm a').format(dt);
    } catch (_) {
      return isoString;
    }
  }
}
