import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/admin_api_client.dart';
import '../../core/storage/admin_secure_storage.dart';

class AdminSettingsScreen extends StatefulWidget {
  final AdminProfileModel admin;
  final VoidCallback onLogout;

  const AdminSettingsScreen({
    super.key,
    required this.admin,
    required this.onLogout,
  });

  @override
  State<AdminSettingsScreen> createState() => _AdminSettingsScreenState();
}

class _AdminSettingsScreenState extends State<AdminSettingsScreen> {
  final _upiIdController = TextEditingController();
  final _upiNameController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _success;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  @override
  void dispose() {
    _upiIdController.dispose();
    _upiNameController.dispose();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    setState(() => _loading = true);
    try {
      final stats = await AdminApiClient.getStats();
      if (mounted) {
        setState(() {
          _upiIdController.text = stats.adminUpiId;
          _upiNameController.text = stats.adminUpiName;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handleSave() async {
    final upiId = _upiIdController.text.trim();
    final upiName = _upiNameController.text.trim();

    if (!upiId.contains('@')) {
      setState(() => _error = 'Please enter a valid receiver UPI ID (e.g. name@okhdfcbank)');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });

    try {
      await AdminApiClient.updateUpiSettings(upiId: upiId, upiName: upiName);
      setState(() => _success = 'Gateway UPI settings updated successfully');
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      body: _loading
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'PAYMENT GATEWAY CONFIGURATION',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                      color: AppColors.slate500,
                    ),
                  ),
                  const SizedBox(height: 10),

                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_error != null) ...[
                          Container(
                            padding: const EdgeInsets.all(10),
                            margin: const EdgeInsets.only(bottom: 14),
                            decoration: BoxDecoration(
                              color: AppColors.red50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                            ),
                            child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
                          ),
                        ],

                        if (_success != null) ...[
                          Container(
                            padding: const EdgeInsets.all(10),
                            margin: const EdgeInsets.only(bottom: 14),
                            decoration: BoxDecoration(
                              color: AppColors.emerald50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.3)),
                            ),
                            child: Text(_success!, style: const TextStyle(fontSize: 12, color: AppColors.emerald700, fontWeight: FontWeight.w600)),
                          ),
                        ],

                        const Text(
                          'Receiving UPI ID (VPA)',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _upiIdController,
                          style: const TextStyle(fontFamily: 'monospace', fontSize: 14, fontWeight: FontWeight.w600),
                          decoration: const InputDecoration(
                            hintText: 'admin@okhdfcbank',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          ),
                        ),
                        const SizedBox(height: 16),

                        const Text(
                          'Payee Display Name',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _upiNameController,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                          decoration: const InputDecoration(
                            hintText: 'MoneyGame Enterprise',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          ),
                        ),
                        const SizedBox(height: 20),

                        SizedBox(
                          width: double.infinity,
                          height: 44,
                          child: ElevatedButton(
                            onPressed: _saving ? null : _handleSave,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.slate900,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            child: _saving
                                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                                : const Text('Save Gateway UPI', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.white)),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Super Admin Session Card
                  const Text(
                    'SECURITY & SESSION',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                      color: AppColors.slate500,
                    ),
                  ),
                  const SizedBox(height: 10),

                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildRow('Admin ID', widget.admin.id),
                        const Divider(height: 18),
                        _buildRow('Username', widget.admin.username),
                        const Divider(height: 18),
                        _buildRow('Email', widget.admin.email),
                        const Divider(height: 18),
                        _buildRow('Role Permission', widget.admin.role),
                        const Divider(height: 18),
                        _buildRow('Audience Claim', 'moneygame-admin'),
                        const SizedBox(height: 20),

                        SizedBox(
                          width: double.infinity,
                          height: 44,
                          child: OutlinedButton.icon(
                            onPressed: () async {
                              await AdminSecureStorage.clearSession();
                              widget.onLogout();
                            },
                            icon: const Icon(Icons.logout, size: 16, color: AppColors.red600),
                            label: const Text('End Admin Session', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.red600)),
                            style: OutlinedButton.styleFrom(
                              side: BorderSide(color: AppColors.red600.withValues(alpha: 0.3)),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, color: AppColors.slate500)),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900)),
      ],
    );
  }
}
