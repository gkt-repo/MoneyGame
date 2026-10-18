import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/colors.dart';
import '../../core/network/api_client.dart';

class AddCashScreen extends StatefulWidget {
  final UserProfileModel user;
  final VoidCallback onPaymentSuccess;

  const AddCashScreen({
    super.key,
    required this.user,
    required this.onPaymentSuccess,
  });

  @override
  State<AddCashScreen> createState() => _AddCashScreenState();
}

class _AddCashScreenState extends State<AddCashScreen> {
  final _amountController = TextEditingController(text: '100');
  final List<String> _presets = ['50', '100', '200', '500', '1000'];

  DepositResponseModel? _deposit;
  bool _loading = false;
  String? _error;
  bool _isApproved = false;
  Timer? _statusPollTimer;

  @override
  void dispose() {
    _amountController.dispose();
    _statusPollTimer?.cancel();
    super.dispose();
  }

  Future<void> _handleGenerate() async {
    final amt = double.tryParse(_amountController.text) ?? 0;
    if (amt < 10) {
      setState(() => _error = 'Minimum deposit amount is ₹10');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _deposit = null;
      _isApproved = false;
    });

    try {
      final res = await ApiClient.createDeposit(widget.user.id, amt);
      setState(() => _deposit = res);
      _startPolling(res.depositId);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _startPolling(String depositId) {
    _statusPollTimer?.cancel();
    _statusPollTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      final approved = await ApiClient.checkDepositStatus(depositId);
      if (approved) {
        timer.cancel();
        if (mounted) {
          setState(() => _isApproved = true);
          widget.onPaymentSuccess();
        }
      }
    });
  }

  Future<void> _launchUpiIntent() async {
    if (_deposit == null) return;
    final uri = Uri.parse(_deposit!.upiDeepLink);
    try {
      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!launched) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No supported UPI app found. Please copy UPI address.')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not launch UPI app: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Add Cash via UPI',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppColors.slate900,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Zero payment gateway fees. Instant auto-credit using unique paise offset.',
            style: TextStyle(fontSize: 12, color: AppColors.slate500),
          ),
          const SizedBox(height: 20),

          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.red50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
              ),
              child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.red700)),
            ),
            const SizedBox(height: 16),
          ],

          if (_isApproved) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.emerald500),
              ),
              child: Column(
                children: [
                  const Icon(Icons.check_circle_outline, color: AppColors.emerald600, size: 54),
                  const SizedBox(height: 12),
                  const Text(
                    'Payment Verified & Credited!',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.slate900),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '₹${_deposit?.totalAmount.toStringAsFixed(2)} added to your wallet.',
                    style: const TextStyle(fontSize: 12, color: AppColors.slate500),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.emerald600,
                      foregroundColor: AppColors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onPressed: () => setState(() => _deposit = null),
                    child: const Text('Make Another Deposit'),
                  ),
                ],
              ),
            ),
          ] else if (_deposit != null) ...[
            // Generated Deposit Details & UPI Launch Sheet
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.slate200),
              ),
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.amber50,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: AppColors.amber600.withValues(alpha: 0.3)),
                    ),
                    child: const Text(
                      'Pay Exact Amount (With Paise)',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.amber800),
                    ),
                  ),
                  const SizedBox(height: 12),

                  Text(
                    '₹${_deposit!.totalAmount.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: AppColors.slate900,
                      fontFamily: 'monospace',
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Includes ${_deposit!.offsetPaise} paise unique offset for instant verification',
                    style: const TextStyle(fontSize: 11, color: AppColors.slate500),
                  ),
                  const SizedBox(height: 24),

                  // 1-Tap UPI Intent CTA
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.emerald600,
                        foregroundColor: AppColors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: _launchUpiIntent,
                      icon: const Icon(Icons.open_in_new, size: 18),
                      label: const Text(
                        'Pay via UPI App (GPay / PhonePe / Paytm)',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Copyable Details
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.slate50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('UPI ID', style: TextStyle(fontSize: 10, color: AppColors.slate500)),
                            Text(
                              _deposit!.receivingUpi,
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, fontFamily: 'monospace'),
                            ),
                          ],
                        ),
                        IconButton(
                          icon: const Icon(Icons.copy, size: 18, color: AppColors.slate600),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: _deposit!.receivingUpi));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('UPI ID copied to clipboard')),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),

                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.slate50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Exact Payable Amount', style: TextStyle(fontSize: 10, color: AppColors.slate500)),
                            Text(
                              '₹${_deposit!.totalAmount.toStringAsFixed(2)}',
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, fontFamily: 'monospace', color: AppColors.emerald700),
                            ),
                          ],
                        ),
                        IconButton(
                          icon: const Icon(Icons.copy, size: 18, color: AppColors.slate600),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: _deposit!.totalAmount.toStringAsFixed(2)));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Amount copied to clipboard')),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Awaiting confirmation indicator
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.emerald600)),
                      SizedBox(width: 8),
                      Text('Awaiting bank payment confirmation...', style: TextStyle(fontSize: 11, color: AppColors.slate500)),
                    ],
                  ),
                  const SizedBox(height: 12),

                  TextButton(
                    onPressed: () {
                      _statusPollTimer?.cancel();
                      setState(() => _deposit = null);
                    },
                    child: const Text('Change Amount', style: TextStyle(fontSize: 12, color: AppColors.slate500)),
                  ),
                ],
              ),
            ),
          ] else ...[
            // Amount Selector Card
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
                  const Text('Select Deposit Amount', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.slate800)),
                  const SizedBox(height: 12),

                  // Preset Chips Grid
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _presets.map((val) {
                      final selected = _amountController.text == val;
                      return InkWell(
                        onTap: () => setState(() => _amountController.text = val),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          decoration: BoxDecoration(
                            color: selected ? AppColors.emerald600 : AppColors.slate50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: selected ? AppColors.emerald600 : AppColors.slate200),
                          ),
                          child: Text(
                            '₹$val',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: selected ? AppColors.white : AppColors.slate800,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),

                  TextField(
                    controller: _amountController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Custom Amount (₹)',
                      prefixText: '₹ ',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    ),
                  ),
                  const SizedBox(height: 20),

                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.emerald600,
                        foregroundColor: AppColors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: _loading ? null : _handleGenerate,
                      child: _loading
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                          : const Text('Proceed to Pay via UPI', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
