import '../../core/constants/app_theme.dart';
import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/api_client.dart';

const Map<String, String> kCuratedAvatars = {
  'avatar_1': '🦁',
  'avatar_2': '🐯',
  'avatar_3': '🦅',
  'avatar_4': '🐺',
  'avatar_5': '🦊',
  'avatar_6': '🐉',
  'avatar_7': '🎯',
  'avatar_8': '⚡',
  'avatar_9': '👑',
  'avatar_10': '🛡️',
  'avatar_11': '💎',
  'avatar_12': '🎲',
};

String getAvatarEmoji(String? avatarKey) {
  if (avatarKey == null) return '🦁';
  return kCuratedAvatars[avatarKey] ?? '🦁';
}

void showPublicProfileModal(BuildContext context, String userId) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.palette.adapt(Colors.white),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _PublicProfileSheet(userId: userId),
  );
}

class _PublicProfileSheet extends StatefulWidget {
  final String userId;
  const _PublicProfileSheet({required this.userId});

  @override
  State<_PublicProfileSheet> createState() => _PublicProfileSheetState();
}

class _PublicProfileSheetState extends State<_PublicProfileSheet> {
  bool _loading = true;
  String? _error;
  PublicProfileModel? _profile;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    try {
      final p = await ApiClient.getPublicProfile(widget.userId);
      if (mounted) {
        setState(() {
          _profile = p;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  String _formatDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return 'Recent';
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[dt.month - 1]} ${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: _loading
          ? const SizedBox(
              height: 220,
              child: Center(
                child: CircularProgressIndicator(color: AppColors.emerald600),
              ),
            )
          : _error != null
              ? SizedBox(
                  height: 200,
                  child: Center(
                    child: Text(_error!, style: const TextStyle(color: AppColors.red600)),
                  ),
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Player Profile',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: context.palette.adapt(AppColors.slate900)),
                        ),
                        IconButton(
                          icon: Icon(Icons.close, size: 20, color: context.palette.adapt(AppColors.slate500)),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    // Avatar & Names
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: context.palette.adapt(AppColors.slate100),
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.emerald600, width: 2),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        getAvatarEmoji(_profile!.avatar),
                        style: const TextStyle(fontSize: 34),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _profile!.displayName,
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: context.palette.adapt(AppColors.slate900)),
                    ),
                    Text(
                      '@${_profile!.username}',
                      style: TextStyle(fontSize: 12, color: context.palette.adapt(AppColors.slate500)),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Member since ${_formatDate(_profile!.createdAt)}',
                      style: TextStyle(fontSize: 11, color: context.palette.adapt(AppColors.slate400)),
                    ),
                    const SizedBox(height: 16),
                    // Stats 3-column
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                      decoration: BoxDecoration(
                        color: context.palette.adapt(AppColors.slate50),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: context.palette.adapt(AppColors.slate200)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _buildStatCol('Played', '${_profile!.stats.totalGames}'),
                          _buildStatCol('Won', '${_profile!.stats.totalWins}', color: AppColors.emerald600),
                          _buildStatCol('Win Rate', '${_profile!.stats.winRatePercent}%', color: context.palette.adapt(Color(0xFF6366F1))),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Game breakdown
                    if (_profile!.stats.byGame.isNotEmpty) ...[
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'GAME BREAKDOWN',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                            color: context.palette.adapt(AppColors.slate500),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      ..._profile!.stats.byGame.entries.map((entry) {
                        final g = entry.value;
                        final name = entry.key == 'SEEP' ? '♠ Seep' : entry.key == 'TWENTY_NINE'
                            ? '🃏 29 Card Game'
                            : entry.key == 'TEEN_PATTI'
                                ? '🎴 Teen Patti'
                                : entry.key == 'SPORTS_MATCH'
                                    ? '🏏 Live Sports'
                                    : '🎲 Dice Guess';
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.palette.adapt(AppColors.slate800))),
                              Text(
                                '${g.won}W / ${g.played}G (${g.winRatePercent}%)',
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: context.palette.adapt(AppColors.slate600)),
                              ),
                            ],
                          ),
                        );
                      }),
                      const SizedBox(height: 12),
                    ],
                  ],
                ),
    );
  }

  Widget _buildStatCol(String label, String value, {Color? color}) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: color ?? context.palette.adapt(AppColors.slate900),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: context.palette.adapt(AppColors.slate500)),
        ),
      ],
    );
  }
}

class EditProfileModal extends StatefulWidget {
  final VoidCallback onSaved;
  const EditProfileModal({super.key, required this.onSaved});

  @override
  State<EditProfileModal> createState() => _EditProfileModalState();
}

class _EditProfileModalState extends State<EditProfileModal> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _success;
  UserProfileDetailModel? _profile;
  final TextEditingController _nameController = TextEditingController();
  String _selectedAvatar = 'avatar_1';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final p = await ApiClient.getUserProfile();
      if (mounted) {
        setState(() {
          _profile = p;
          _selectedAvatar = p.avatar;
          _nameController.text = p.displayName;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Display name cannot be empty');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });

    try {
      final updated = await ApiClient.updateUserProfile(
        displayName: name,
        avatar: _selectedAvatar,
      );
      if (mounted) {
        setState(() {
          _profile = updated;
          _saving = false;
          _success = 'Profile updated successfully!';
        });
        widget.onSaved();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e.toString();
        });
      }
    }
  }

  String _formatDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return 'Recent';
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[dt.month - 1]} ${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.9,
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.only(
          top: 20,
          left: 20,
          right: 20,
          bottom: MediaQuery.of(context).viewInsets.bottom + 24,
        ),
        child: _loading
            ? const SizedBox(
                height: 250,
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.emerald600),
                ),
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Edit Profile',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: context.palette.adapt(AppColors.slate900)),
                      ),
                      IconButton(
                        icon: Icon(Icons.close, size: 20, color: context.palette.adapt(AppColors.slate500)),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(10),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: context.palette.adapt(AppColors.red50),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                      ),
                      child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
                    ),
                  ],
                  if (_success != null) ...[
                    Container(
                      padding: const EdgeInsets.all(10),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: context.palette.adapt(AppColors.emerald50),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.3)),
                      ),
                      child: Text(_success!, style: const TextStyle(fontSize: 12, color: AppColors.emerald700, fontWeight: FontWeight.w600)),
                    ),
                  ],

                  // Avatar Picker
                  Text(
                    'Choose Avatar',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.palette.adapt(AppColors.slate900)),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: kCuratedAvatars.entries.map((entry) {
                      final isSel = _selectedAvatar == entry.key;
                      return InkWell(
                        onTap: () => setState(() => _selectedAvatar = entry.key),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: isSel ? context.palette.adapt(Color(0xFFEFF6FF)) : context.palette.adapt(AppColors.slate100),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: isSel ? context.palette.adapt(Color(0xFF2563EB)) : Colors.transparent,
                              width: 2,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Text(entry.value, style: const TextStyle(fontSize: 24)),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),

                  // Display Name Input
                  Text(
                    'Display Name',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.palette.adapt(AppColors.slate900)),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _nameController,
                    decoration: InputDecoration(
                      hintText: 'Enter your nickname',
                      filled: true,
                      fillColor: context.palette.adapt(AppColors.slate50),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide(color: context.palette.adapt(AppColors.slate200)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Member since ${_formatDate(_profile!.createdAt)} • Role: ${_profile!.role}',
                    style: TextStyle(fontSize: 11, color: context.palette.adapt(AppColors.slate400)),
                  ),
                  const SizedBox(height: 16),

                  // Save Button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _save,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.emerald600,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: _saving
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Save Profile Changes', style: TextStyle(fontWeight: FontWeight.w700, color: Colors.white)),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Dynamic Performance Stats
                  Text(
                    'CAREER STATISTICS',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                      color: context.palette.adapt(AppColors.slate500),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                    decoration: BoxDecoration(
                      color: context.palette.adapt(AppColors.slate50),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.palette.adapt(AppColors.slate200)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _buildStatCol('Total Played', '${_profile!.stats.totalGames}'),
                        _buildStatCol('Won', '${_profile!.stats.totalWins}', color: AppColors.emerald600),
                        _buildStatCol('Win Rate', '${_profile!.stats.winRatePercent}%', color: context.palette.adapt(Color(0xFF6366F1))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Game Breakdown
                  if (_profile!.stats.byGame.isNotEmpty) ...[
                    Text(
                      'PER-GAME PERFORMANCE',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                        color: context.palette.adapt(AppColors.slate500),
                      ),
                    ),
                    const SizedBox(height: 8),
                    ..._profile!.stats.byGame.entries.map((entry) {
                      final g = entry.value;
                      final name = entry.key == 'SEEP' ? '♠ Seep' : entry.key == 'TWENTY_NINE'
                          ? '🃏 29 Card Game'
                          : entry.key == 'TEEN_PATTI'
                              ? '🎴 Teen Patti'
                              : entry.key == 'SPORTS_MATCH'
                                  ? '🏏 Live Sports'
                                  : '🎲 Dice Guess';
                      return Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: context.palette.adapt(AppColors.white),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: context.palette.adapt(AppColors.slate200)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(name, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: context.palette.adapt(AppColors.slate800))),
                            Text(
                              '${g.won}W / ${g.played}G (${g.winRatePercent}%)',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.emerald700),
                            ),
                          ],
                        ),
                      );
                    }),
                    const SizedBox(height: 16),
                  ],

                  // Recent Games List
                  if (_profile!.recentGames.isNotEmpty) ...[
                    Text(
                      'RECENT MATCH RESULTS',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                        color: context.palette.adapt(AppColors.slate500),
                      ),
                    ),
                    const SizedBox(height: 8),
                    ..._profile!.recentGames.take(5).map((m) {
                      final name = m.gameType == 'SEEP' ? '♠ Seep' : m.gameType == 'TWENTY_NINE'
                          ? '🃏 29 Cards'
                          : m.gameType == 'TEEN_PATTI'
                              ? '🎴 Teen Patti'
                              : m.gameType == 'SPORTS_MATCH'
                                  ? '🏏 Live Sports'
                                  : '🎲 Dice Guess';
                      return Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: context.palette.adapt(AppColors.white),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: context.palette.adapt(AppColors.slate200)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: context.palette.adapt(AppColors.slate800))),
                                Text('Stake ₹${m.entryFee.toStringAsFixed(0)}', style: TextStyle(fontSize: 10, color: context.palette.adapt(AppColors.slate500))),
                              ],
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: m.isWin ? context.palette.adapt(AppColors.emerald50) : context.palette.adapt(AppColors.slate100),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                m.isWin ? 'WON (+₹${m.prize.toStringAsFixed(0)})' : 'LOST',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: m.isWin ? AppColors.emerald700 : context.palette.adapt(AppColors.slate500),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ],
              ),
      ),
    );
  }

  Widget _buildStatCol(String label, String value, {Color? color}) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: color ?? context.palette.adapt(AppColors.slate900),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: context.palette.adapt(AppColors.slate500)),
        ),
      ],
    );
  }
}
