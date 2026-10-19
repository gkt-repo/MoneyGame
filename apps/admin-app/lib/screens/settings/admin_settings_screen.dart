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

  final _supportEmailController = TextEditingController();
  final _supportWhatsappController = TextEditingController();
  final _supportTelegramController = TextEditingController();
  final _supportHoursController = TextEditingController();

  bool _loading = true;
  bool _savingUpi = false;
  bool _savingSupport = false;

  String? _upiError;
  String? _upiSuccess;
  String? _supportError;
  String? _supportSuccess;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  @override
  void dispose() {
    _upiIdController.dispose();
    _upiNameController.dispose();
    _supportEmailController.dispose();
    _supportWhatsappController.dispose();
    _supportTelegramController.dispose();
    _supportHoursController.dispose();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    setState(() => _loading = true);
    try {
      final stats = await AdminApiClient.getStats();
      final support = await AdminApiClient.getSupportSettings().catchError((_) => SupportSettingsModel(
            email: stats.supportEmail,
            whatsapp: stats.supportWhatsapp,
            telegram: stats.supportTelegram,
            hours: stats.supportHours,
          ));

      if (mounted) {
        setState(() {
          _upiIdController.text = stats.adminUpiId;
          _upiNameController.text = stats.adminUpiName;

          _supportEmailController.text = support.email;
          _supportWhatsappController.text = support.whatsapp;
          _supportTelegramController.text = support.telegram;
          _supportHoursController.text = support.hours;

          _upiError = null;
          _supportError = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _upiError = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handleSaveUpi() async {
    final upiId = _upiIdController.text.trim();
    final upiName = _upiNameController.text.trim();

    if (!upiId.contains('@')) {
      setState(() => _upiError = 'Please enter a valid receiver UPI ID (e.g. name@okhdfcbank)');
      return;
    }

    setState(() {
      _savingUpi = true;
      _upiError = null;
      _upiSuccess = null;
    });

    try {
      await AdminApiClient.updateUpiSettings(upiId: upiId, upiName: upiName);
      setState(() => _upiSuccess = 'Gateway UPI settings updated successfully');
    } catch (e) {
      setState(() => _upiError = e.toString());
    } finally {
      if (mounted) setState(() => _savingUpi = false);
    }
  }

  Future<void> _handleSaveSupport() async {
    final email = _supportEmailController.text.trim();
    final whatsapp = _supportWhatsappController.text.trim();
    final telegram = _supportTelegramController.text.trim();
    final hours = _supportHoursController.text.trim();

    if (email.isNotEmpty && !email.contains('@')) {
      setState(() => _supportError = 'Please enter a valid support email address');
      return;
    }

    setState(() {
      _savingSupport = true;
      _supportError = null;
      _supportSuccess = null;
    });

    try {
      await AdminApiClient.updateSupportSettings(
        email: email,
        whatsapp: whatsapp,
        telegram: telegram,
        hours: hours,
      );
      setState(() => _supportSuccess = 'Player support contact channels saved successfully');
    } catch (e) {
      setState(() => _supportError = e.toString());
    } finally {
      if (mounted) setState(() => _savingSupport = false);
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
                  // SECTION 1: Gateway UPI Config
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
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_upiError != null) ...[
                          Container(
                            padding: const EdgeInsets.all(10),
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: AppColors.red50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                            ),
                            child: Text(_upiError!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
                          ),
                        ],
                        if (_upiSuccess != null) ...[
                          Container(
                            padding: const EdgeInsets.all(10),
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: AppColors.emerald50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.3)),
                            ),
                            child: Text(_upiSuccess!, style: const TextStyle(fontSize: 12, color: AppColors.emerald700, fontWeight: FontWeight.w600)),
                          ),
                        ],
                        const Text('Receiving UPI ID (VPA)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _upiIdController,
                          style: const TextStyle(fontFamily: 'monospace', fontSize: 13, fontWeight: FontWeight.w600),
                          decoration: const InputDecoration(
                            hintText: 'admin@okhdfcbank',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                        const SizedBox(height: 14),
                        const Text('Payee Display Name', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _upiNameController,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                          decoration: const InputDecoration(
                            hintText: 'MoneyGame Enterprise',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          height: 42,
                          child: ElevatedButton(
                            onPressed: _savingUpi ? null : _handleSaveUpi,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.slate900,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            child: _savingUpi
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                                : const Text('Save Gateway UPI', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.white)),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // SECTION 2: Support & Contact Channels
                  const Text(
                    'PLAYER SUPPORT & HELPLINE CHANNELS',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                      color: AppColors.slate500,
                    ),
                  ),
                  const SizedBox(height: 10),

                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_supportError != null) ...[
                          Container(
                            padding: const EdgeInsets.all(10),
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: AppColors.red50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                            ),
                            child: Text(_supportError!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
                          ),
                        ],
                        if (_supportSuccess != null) ...[
                          Container(
                            padding: const EdgeInsets.all(10),
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: AppColors.emerald50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.3)),
                            ),
                            child: Text(_supportSuccess!, style: const TextStyle(fontSize: 12, color: AppColors.emerald700, fontWeight: FontWeight.w600)),
                          ),
                        ],
                        const Text('Support Email Address', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _supportEmailController,
                          keyboardType: TextInputType.emailAddress,
                          style: const TextStyle(fontSize: 13),
                          decoration: const InputDecoration(
                            prefixIcon: Icon(Icons.mail_outline, size: 18),
                            hintText: 'support@moneygame.com',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text('WhatsApp Helpline Number', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _supportWhatsappController,
                          keyboardType: TextInputType.phone,
                          style: const TextStyle(fontSize: 13),
                          decoration: const InputDecoration(
                            prefixIcon: Icon(Icons.phone_outlined, size: 18),
                            hintText: '+91 98765 43210',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text('Telegram Support Handle', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _supportTelegramController,
                          style: const TextStyle(fontSize: 13),
                          decoration: const InputDecoration(
                            prefixIcon: Icon(Icons.send_outlined, size: 18),
                            hintText: '@MoneyGameSupport',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text('Operating Support Hours', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _supportHoursController,
                          style: const TextStyle(fontSize: 13),
                          decoration: const InputDecoration(
                            prefixIcon: Icon(Icons.access_time, size: 18),
                            hintText: '24/7 Live Support',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          height: 42,
                          child: ElevatedButton(
                            onPressed: _savingSupport ? null : _handleSaveSupport,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.slate900,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            child: _savingSupport
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                                : const Text('Save Support Settings', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.white)),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // SECTION 3: Super Admin Session Card
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
                    padding: const EdgeInsets.all(18),
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
                          height: 42,
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
