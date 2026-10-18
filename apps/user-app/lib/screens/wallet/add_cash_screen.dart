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

class _AddCashScreenState extends State<AddCashScreen> with WidgetsBindingObserver {
  final _amountController = TextEditingController(text: '100');
  final List<String> _presets = ['50', '100', '200', '500', '1000'];

  DepositResponseModel? _deposit;
  bool _loading = false;
  String? _error;
  bool _isApproved = false;
  Timer? _statusPollTimer;
  Timer? _countdownTimer;
  int _secondsRemaining = 600;

  // Post-Payment 1-Minute Verification Countdown
  bool _hasTappedPaid = false;
  int _paidCountdown = 60;
  Timer? _paidCountdownTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _amountController.dispose();
    _statusPollTimer?.cancel();
    _countdownTimer?.cancel();
    _paidCountdownTimer?.cancel();
    super.dispose();
  }

  // Instant Check the exact millisecond user returns from GPay/PhonePe to the app!
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _deposit != null && !_isApproved) {
      _checkPaymentStatusOnce();
    }
  }

  Future<void> _checkPaymentStatusOnce() async {
    if (_deposit == null || _isApproved) return;
    try {
      final approved = await ApiClient.checkDepositStatus(_deposit!.depositId);
      if (approved && mounted) {
        _onPaymentConfirmed();
      }
    } catch (_) {}
  }

  void _onPaymentConfirmed() {
    _statusPollTimer?.cancel();
    _countdownTimer?.cancel();
    _paidCountdownTimer?.cancel();
    HapticFeedback.heavyImpact();
    setState(() => _isApproved = true);
    widget.onPaymentSuccess();
  }

  void _onTapPaid() {
    setState(() {
      _hasTappedPaid = true;
      _paidCountdown = 60;
    });
    _checkPaymentStatusOnce();

    _paidCountdownTimer?.cancel();
    _paidCountdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        if (_paidCountdown <= 1) {
          _paidCountdown = 0;
          timer.cancel();
        } else {
          _paidCountdown--;
        }
      });
    });
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
      _secondsRemaining = 600;
      _hasTappedPaid = false;
      _paidCountdown = 60;
    });
    _paidCountdownTimer?.cancel();

    try {
      final res = await ApiClient.createDeposit(widget.user.id, amt);
      setState(() => _deposit = res);
      _startPollingAndCountdown(res.depositId);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _startPollingAndCountdown(String depositId) {
    _statusPollTimer?.cancel();
    _countdownTimer?.cancel();

    // 1. Regular 3s poll
    _statusPollTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      final approved = await ApiClient.checkDepositStatus(depositId);
      if (approved) {
        timer.cancel();
        _countdownTimer?.cancel();
        if (mounted) {
          _onPaymentConfirmed();
        }
      }
    });

    // 2. 1-second Countdown
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_secondsRemaining <= 1) {
        timer.cancel();
        _statusPollTimer?.cancel();
        if (mounted) setState(() => _secondsRemaining = 0);
      } else {
        if (mounted) setState(() => _secondsRemaining--);
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

  void _showUtrClaimDialog() {
    if (_deposit == null) return;
    final utrController = TextEditingController();
    bool submitting = false;
    String? dialogError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            title: const Text(
              'Verify Payment with UTR',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.slate900),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Enter the 12-digit UPI Reference Number / UTR from your bank or UPI payment receipt.',
                  style: TextStyle(fontSize: 12, color: AppColors.slate600),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: utrController,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold),
                  decoration: const InputDecoration(
                    hintText: 'e.g. 429384729182',
                    labelText: '12-Digit UTR',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
                if (dialogError != null) ...[
                  const SizedBox(height: 8),
                  Text(dialogError!, style: const TextStyle(color: AppColors.red600, fontSize: 12)),
                ],
              ],
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
                        final utr = utrController.text.trim();
                        if (utr.length < 8) {
                          setDialogState(() => dialogError = 'Please enter a valid 12-digit UTR');
                          return;
                        }
                        setDialogState(() {
                          submitting = true;
                          dialogError = null;
                        });

                        try {
                          final res = await ApiClient.claimDepositUtr(_deposit!.depositId, utr);
                          if (ctx.mounted) Navigator.of(ctx).pop();

                          if (res['instantApproval'] == true) {
                            _onPaymentConfirmed();
                          } else {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(res['message'] ?? 'UTR recorded. Verifying with bank...'),
                                  backgroundColor: AppColors.emerald700,
                                ),
                              );
                            }
                          }
                        } catch (e) {
                          setDialogState(() {
                            submitting = false;
                            dialogError = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald600),
                child: submitting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                    : const Text('Verify UTR', style: TextStyle(color: AppColors.white)),
              ),
            ],
          );
        },
      ),
    );
  }

  String _formatTimer(int totalSecs) {
    final mins = (totalSecs ~/ 60).toString().padLeft(2, '0');
    final secs = (totalSecs % 60).toString().padLeft(2, '0');
    return '$mins:$secs';
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
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
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _secondsRemaining < 120 ? AppColors.red50 : AppColors.slate100,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: AppColors.slate200),
                        ),
                        child: Text(
                          _secondsRemaining == 0 ? 'Expired' : _formatTimer(_secondsRemaining),
                          style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: _secondsRemaining < 120 ? AppColors.red600 : AppColors.slate800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

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

                  // Post-Payment 1-Minute Verification Workflow
                  if (!_hasTappedPaid) ...[
                    // Stage A: User hasn't tapped "I Have Paid" yet
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
                        onPressed: _onTapPaid,
                        icon: const Icon(Icons.check_circle_outline, size: 18),
                        label: const Text(
                          'I Have Paid via UPI',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Tap after completing payment in your UPI app to start 1-minute bank verification.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: AppColors.slate500),
                    ),
                  ] else if (_paidCountdown > 0) ...[
                    // Stage B: 1-Minute Verification Countdown
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.emerald50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.emerald500.withValues(alpha: 0.3)),
                      ),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.emerald700),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Verifying with bank... (${_paidCountdown}s remaining)',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.emerald900,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: (60 - _paidCountdown) / 60,
                              backgroundColor: AppColors.emerald100,
                              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.emerald600),
                              minHeight: 4,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Listening for automated bank notification. Screen updates immediately.',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 10, color: AppColors.emerald800),
                          ),
                        ],
                      ),
                    ),
                  ] else ...[
                    // Stage C: 1 Minute Elapsed Without Notification -> Option appears to enter UTR
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.amber50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.amber700.withValues(alpha: 0.3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.schedule, size: 16, color: AppColors.amber700),
                              SizedBox(width: 6),
                              Text(
                                'Bank confirmation taking longer than 1 min',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.amber900,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'If money was debited from your UPI app, enter your 12-digit UTR to verify immediately.',
                            style: TextStyle(fontSize: 11, color: AppColors.amber800),
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _showUtrClaimDialog,
                              icon: const Icon(Icons.flash_on, size: 16, color: AppColors.white),
                              label: const Text(
                                'Paid? Enter 12-Digit UTR',
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.slate900,
                                foregroundColor: AppColors.white,
                                elevation: 0,
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),

                  TextButton(
                    onPressed: () {
                      _statusPollTimer?.cancel();
                      _countdownTimer?.cancel();
                      _paidCountdownTimer?.cancel();
                      setState(() {
                        _deposit = null;
                        _hasTappedPaid = false;
                        _paidCountdown = 60;
                      });
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
