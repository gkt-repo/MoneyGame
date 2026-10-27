import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
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
  final List<String> _presets = ['100', '200', '500', '1000', '2000', '5000'];

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
    final amt = double.tryParse(_amountController.text.trim()) ?? 0;
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
      bool launched = false;
      try {
        launched = await launchUrl(uri, mode: LaunchMode.externalNonBrowserApplication);
      } catch (_) {
        launched = false;
      }

      if (!launched) {
        try {
          launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
        } catch (_) {
          launched = false;
        }
      }

      if (!launched && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('UPI app could not open directly. Please scan the QR code below.'),
            backgroundColor: AppColors.amber700,
            duration: Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not open UPI app directly. Please scan the QR code below.'),
            backgroundColor: AppColors.amber700,
            duration: Duration(seconds: 4),
          ),
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
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: const Row(
              children: [
                Icon(Icons.verified_outlined, size: 20, color: AppColors.emerald600),
                SizedBox(width: 8),
                Text(
                  'Verify with UTR',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                ),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Enter the 12-digit UPI Reference Number / UTR from your bank SMS or payment receipt.',
                  style: TextStyle(fontSize: 12, color: AppColors.slate600, height: 1.4),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: utrController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(12),
                  ],
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    letterSpacing: 1.2,
                    color: AppColors.slate900,
                  ),
                  decoration: InputDecoration(
                    hintText: 'e.g. 429384729182',
                    hintStyle: const TextStyle(fontSize: 13, color: AppColors.slate400, letterSpacing: 0),
                    labelText: '12-Digit UTR',
                    filled: true,
                    fillColor: AppColors.slate50,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: AppColors.slate200),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: AppColors.emerald600, width: 1.5),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  ),
                ),
                if (dialogError != null) ...[
                  const SizedBox(height: 8),
                  Text(dialogError!, style: const TextStyle(color: AppColors.red600, fontSize: 12, fontWeight: FontWeight.w500)),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Cancel', style: TextStyle(color: AppColors.slate500, fontWeight: FontWeight.w600)),
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
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.emerald600,
                  foregroundColor: AppColors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: submitting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                    : const Text('Verify UTR', style: TextStyle(fontWeight: FontWeight.w700)),
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
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        title: const Text(
          'Add Cash',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.slate900,
          ),
        ),
        backgroundColor: AppColors.white,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: AppColors.slate900),
          onPressed: () => Navigator.of(context).pop(),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: AppColors.slate200, height: 1),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: _isApproved
              ? _buildSuccessView()
              : _deposit != null
                  ? _buildActiveDepositView()
                  : _buildAmountInputView(),
        ),
      ),
    );
  }

  Widget _buildAmountInputView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Available Balance Header Card
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.slate200),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'CURRENT WALLET BALANCE',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.5,
                      color: AppColors.slate500,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '₹${widget.user.balance.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: AppColors.slate900,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.emerald50,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.25)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.account_balance_wallet, size: 14, color: AppColors.emerald700),
                    SizedBox(width: 5),
                    Text(
                      'Wallet Active',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.emerald700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Deposit Amount Card
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.slate200),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 10,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Select Deposit Amount',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.slate900,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.emerald50,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'UPI Direct',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.emerald700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // 6 Preset Chips in a Balanced 2x3 Grid
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _presets.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  childAspectRatio: 2.2,
                ),
                itemBuilder: (context, index) {
                  final val = _presets[index];
                  final isSelected = _amountController.text == val;
                  return InkWell(
                    onTap: () {
                      setState(() {
                        _amountController.text = val;
                      });
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      decoration: BoxDecoration(
                        color: isSelected ? AppColors.emerald50 : AppColors.slate50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isSelected ? AppColors.emerald600 : AppColors.slate200,
                          width: isSelected ? 1.5 : 1.0,
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (isSelected) ...[
                            const Icon(Icons.check_circle, size: 14, color: AppColors.emerald600),
                            const SizedBox(width: 4),
                          ],
                          Text(
                            '₹$val',
                            style: TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: isSelected ? AppColors.emerald700 : AppColors.slate800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 18),

              // Custom Amount Input
              const Text(
                'Custom Amount (₹)',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.slate600,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: (_) => setState(() {}),
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: AppColors.slate900,
                ),
                decoration: InputDecoration(
                  prefixIcon: const Padding(
                    padding: EdgeInsets.only(left: 14, right: 8),
                    child: Center(
                      widthFactor: 0,
                      child: Text('₹', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.slate400)),
                    ),
                  ),
                  suffixIcon: _amountController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear, size: 18, color: AppColors.slate400),
                          onPressed: () {
                            _amountController.clear();
                            setState(() {});
                          },
                        )
                      : null,
                  hintText: 'Enter amount',
                  hintStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.normal, color: AppColors.slate400),
                  filled: true,
                  fillColor: AppColors.slate50,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: AppColors.slate200),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: AppColors.slate200),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: AppColors.emerald600, width: 1.5),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Row(
                children: [
                  Icon(Icons.info_outline, size: 13, color: AppColors.slate400),
                  SizedBox(width: 5),
                  Text(
                    'Minimum deposit: ₹10 • Instant auto-credit',
                    style: TextStyle(fontSize: 11, color: AppColors.slate500),
                  ),
                ],
              ),

              if (_error != null) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.red50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, size: 16, color: AppColors.red600),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(fontSize: 12, color: AppColors.red600, fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 22),

              // Proceed CTA Button
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.emerald600,
                    foregroundColor: AppColors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: _loading ? null : _handleGenerate,
                  child: _loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.white),
                        )
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.bolt, size: 20),
                            SizedBox(width: 8),
                            Text(
                              'Proceed to Pay via UPI',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Trust Features Box
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.slate200),
          ),
          child: Column(
            children: [
              _buildTrustRow(
                icon: Icons.flash_on_rounded,
                iconColor: AppColors.emerald600,
                title: 'Instant Auto-Credit',
                subtitle: 'Bank-verified within seconds using unique paise offset matching.',
              ),
              const Divider(height: 20, color: AppColors.slate100),
              _buildTrustRow(
                icon: Icons.verified_user_rounded,
                iconColor: AppColors.emerald600,
                title: 'Direct Bank Security',
                subtitle: 'Safe direct peer transfer on official NPCI UPI network.',
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Supported Apps Footer
        Center(
          child: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 6,
            runSpacing: 4,
            children: [
              const Icon(Icons.shield_outlined, size: 14, color: AppColors.slate400),
              const Text(
                'Supports all apps:',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate400),
              ),
              _buildAppPill('GPay'),
              _buildAppPill('PhonePe'),
              _buildAppPill('Paytm'),
              _buildAppPill('Cred / BHIM'),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildAppPill(String name) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.slate100,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        name,
        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.slate600),
      ),
    );
  }

  Widget _buildTrustRow({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: iconColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 18, color: iconColor),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: const TextStyle(fontSize: 11, color: AppColors.slate500, height: 1.3),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildActiveDepositView() {
    return Column(
      children: [
        // Countdown & Status Banner
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: _secondsRemaining < 120 ? AppColors.red50 : AppColors.amber50,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: _secondsRemaining < 120 ? AppColors.red600.withValues(alpha: 0.3) : AppColors.amber600.withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.timer_outlined,
                    size: 16,
                    color: _secondsRemaining < 120 ? AppColors.red600 : AppColors.amber800,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Session Active',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: _secondsRemaining < 120 ? AppColors.red700 : AppColors.amber900,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: _secondsRemaining < 120 ? AppColors.red600 : AppColors.amber700,
                  ),
                ),
                child: Text(
                  _secondsRemaining == 0 ? 'Expired' : _formatTimer(_secondsRemaining),
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: _secondsRemaining < 120 ? AppColors.red600 : AppColors.amber800,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // Main Payment Details Card
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.slate200),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 10,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            children: [
              const Text(
                'EXACT AMOUNT TO PAY',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: AppColors.slate500,
                ),
              ),
              const SizedBox(height: 8),

              // Exact Payable Amount + Copy Button
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(
                    '₹${_deposit!.totalAmount.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      color: AppColors.slate900,
                    ),
                  ),
                  const SizedBox(width: 10),
                  InkWell(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: _deposit!.totalAmount.toStringAsFixed(2)));
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Amount ₹${_deposit!.totalAmount.toStringAsFixed(2)} copied to clipboard'),
                          duration: const Duration(seconds: 2),
                        ),
                      );
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.slate100,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.slate200),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.copy, size: 14, color: AppColors.slate700),
                          SizedBox(width: 4),
                          Text(
                            'Copy',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate700),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              // Breakdown Chip
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.slate100,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Base: ₹${_deposit!.baseAmount.toStringAsFixed(2)} + Match Code: ₹${(_deposit!.offsetPaise / 100).toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.slate700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),

              // High-Impact Paise Offset Alert Notice
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.amber50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.amber600.withValues(alpha: 0.5), width: 1.5),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.warning_amber_rounded, size: 18, color: AppColors.amber800),
                    const SizedBox(width: 8),
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(fontSize: 11.5, color: AppColors.amber900, height: 1.35),
                          children: [
                            const TextSpan(
                              text: 'IMPORTANT: Pay EXACTLY ',
                              style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.amber900),
                            ),
                            TextSpan(
                              text: '₹${_deposit!.totalAmount.toStringAsFixed(2)}. ',
                              style: const TextStyle(fontWeight: FontWeight.w900, decoration: TextDecoration.underline),
                            ),
                            TextSpan(
                              text: 'Do NOT round off to ₹${_deposit!.baseAmount.toStringAsFixed(2)} or automated verification will fail.',
                              style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.red700),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),

              // 1-Tap UPI Intent CTA Button
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.emerald600,
                    foregroundColor: AppColors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: _launchUpiIntent,
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.open_in_new, size: 20),
                      SizedBox(width: 8),
                      Text(
                        'Pay via UPI App',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                      SizedBox(width: 6),
                      Text(
                        '(GPay / PhonePe / Paytm)',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.normal, color: AppColors.emerald100),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // OR Divider
              Row(
                children: [
                  Expanded(child: Container(color: AppColors.slate200, height: 1)),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      'OR SCAN QR CODE',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.slate400,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                  Expanded(child: Container(color: AppColors.slate200, height: 1)),
                ],
              ),
              const SizedBox(height: 20),

              // QR Code Box
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.slate200, width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    QrImageView(
                      data: _deposit!.upiDeepLink,
                      version: QrVersions.auto,
                      size: 190.0,
                      backgroundColor: Colors.white,
                      padding: const EdgeInsets.all(4),
                    ),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.slate100,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.qr_code_scanner, size: 14, color: AppColors.slate700),
                          SizedBox(width: 6),
                          Text(
                            'Scan with any UPI Scanner app',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.slate700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),


              const SizedBox(height: 22),

              // Verification Workflow
              if (!_hasTappedPaid) ...[
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.slate900,
                      foregroundColor: AppColors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    onPressed: _onTapPaid,
                    icon: const Icon(Icons.check_circle_outline, size: 18),
                    label: const Text(
                      'I Have Completed Payment',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Tap after paying in your UPI app to start automated bank verification.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: AppColors.slate500),
                ),
              ] else if (_paidCountdown > 0) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.emerald50,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.emerald500.withValues(alpha: 0.3)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2.2, color: AppColors.emerald700),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            'Verifying with bank... (${_paidCountdown}s)',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.emerald900,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: (60 - _paidCountdown) / 60,
                          backgroundColor: AppColors.emerald100,
                          valueColor: const AlwaysStoppedAnimation<Color>(AppColors.emerald600),
                          minHeight: 5,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Listening for automated bank notification. Screen updates immediately once verified.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11, color: AppColors.emerald800),
                      ),
                    ],
                  ),
                ),
              ] else ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.amber50,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.amber700.withValues(alpha: 0.3)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.schedule, size: 16, color: AppColors.amber700),
                          SizedBox(width: 8),
                          Text(
                            'Bank confirmation taking longer than 1 min',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.amber900,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'If money was debited from your bank, enter your 12-digit UTR from your receipt to verify immediately.',
                        style: TextStyle(fontSize: 11, color: AppColors.amber800, height: 1.3),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        height: 44,
                        child: ElevatedButton.icon(
                          onPressed: _showUtrClaimDialog,
                          icon: const Icon(Icons.flash_on, size: 16, color: AppColors.white),
                          label: const Text(
                            'Enter 12-Digit UTR',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.slate900,
                            foregroundColor: AppColors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 16),
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
                child: const Text('Cancel & Change Amount', style: TextStyle(fontSize: 13, color: AppColors.slate500)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSuccessView() {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.emerald500),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.emerald50,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.emerald600, width: 2),
            ),
            child: const Icon(Icons.check_rounded, color: AppColors.emerald600, size: 38),
          ),
          const SizedBox(height: 18),
          const Text(
            'Payment Verified & Credited!',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.slate900),
          ),
          const SizedBox(height: 8),
          Text(
            '₹${_deposit?.totalAmount.toStringAsFixed(2)}',
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              fontFamily: 'monospace',
              color: AppColors.emerald600,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Successfully added to your wallet balance.',
            style: TextStyle(fontSize: 13, color: AppColors.slate500),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.slate50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.slate200),
            ),
            child: Column(
              children: [
                _buildReceiptRow('Deposit ID', _deposit?.depositId ?? '-'),
                const Divider(height: 16, color: AppColors.slate200),
                _buildReceiptRow('Payment Method', 'Direct UPI Transfer'),
                const Divider(height: 16, color: AppColors.slate200),
                _buildReceiptRow('Status', 'Auto-Approved', isStatus: true),
              ],
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.emerald600,
                foregroundColor: AppColors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Back to Home & Play', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(height: 10),
          TextButton(
            onPressed: () {
              setState(() {
                _deposit = null;
                _isApproved = false;
                _hasTappedPaid = false;
              });
            },
            child: const Text('Make Another Deposit', style: TextStyle(fontSize: 13, color: AppColors.slate600)),
          ),
        ],
      ),
    );
  }

  Widget _buildReceiptRow(String label, String value, {bool isStatus = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.slate500)),
        if (isStatus)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.emerald50,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.3)),
            ),
            child: Text(
              value,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.emerald700),
            ),
          )
        else
          Text(
            value,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate800, fontFamily: 'monospace'),
          ),
      ],
    );
  }
}
