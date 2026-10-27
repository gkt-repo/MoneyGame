import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/constants/colors.dart';
import '../../core/network/api_client.dart';

class WithdrawScreen extends StatefulWidget {
  final UserProfileModel user;
  final VoidCallback onWithdrawalSuccess;

  const WithdrawScreen({
    super.key,
    required this.user,
    required this.onWithdrawalSuccess,
  });

  @override
  State<WithdrawScreen> createState() => _WithdrawScreenState();
}

class _WithdrawScreenState extends State<WithdrawScreen> {
  final _amountController = TextEditingController(text: '100');
  final _upiController = TextEditingController();

  final List<String> _presets = ['10', '50', '100', '200', '500'];

  bool _loading = false;
  String? _error;
  bool _submitted = false;
  double _submittedAmount = 0;
  String _submittedUpi = '';

  @override
  void dispose() {
    _amountController.dispose();
    _upiController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    final amt = double.tryParse(_amountController.text.trim()) ?? 0;
    final upi = _upiController.text.trim();

    if (amt < 10) {
      setState(() => _error = 'Minimum withdrawal is ₹10');
      return;
    }

    if (amt > widget.user.balance) {
      setState(() => _error = 'Insufficient funds. Available: ₹${widget.user.balance.toStringAsFixed(2)}');
      return;
    }

    if (!upi.contains('@') || upi.length < 5) {
      setState(() => _error = 'Please enter a valid UPI ID (e.g. name@okhdfcbank)');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ApiClient.requestWithdrawal(widget.user.id, amt, upi);
      setState(() {
        _submitted = true;
        _submittedAmount = amt;
        _submittedUpi = upi;
      });
      widget.onWithdrawalSuccess();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        title: const Text(
          'Withdraw Earnings',
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
          padding: const EdgeInsets.all(20),
          child: _submitted ? _buildSuccessView() : _buildFormView(),
        ),
      ),
    );
  }

  Widget _buildSuccessView() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.slate200),
      ),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.amber50,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.amber600),
            ),
            child: const Icon(Icons.hourglass_top_rounded, color: AppColors.amber600, size: 28),
          ),
          const SizedBox(height: 16),
          const Text(
            'Withdrawal Initiated',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.slate900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '₹${_submittedAmount.toStringAsFixed(2)}',
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 28,
              fontWeight: FontWeight.w700,
              color: AppColors.slate900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Destination: $_submittedUpi',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.slate600,
            ),
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.slate50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.slate200),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.check_circle, size: 15, color: AppColors.emerald600),
                    SizedBox(width: 8),
                    Text(
                      '1. Withdrawal Initiated',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate900),
                    ),
                  ],
                ),
                SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.radio_button_checked, size: 15, color: AppColors.amber600),
                    SizedBox(width: 8),
                    Text(
                      '2. Processing & IMPS Clearance',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.amber700),
                    ),
                  ],
                ),
                SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.circle_outlined, size: 15, color: AppColors.slate400),
                    SizedBox(width: 8),
                    Text(
                      '3. Paid (Dispatched with Bank UTR)',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.slate500),
                    ),
                  ],
                ),
                SizedBox(height: 10),
                Divider(height: 1, color: AppColors.slate200),
                SizedBox(height: 8),
                Text(
                  'Your payout has been initiated. Once approved by Super Admin, the status will automatically update to Paid with your bank IMPS UTR.',
                  style: TextStyle(fontSize: 11, color: AppColors.slate600, height: 1.4),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 46,
            child: ElevatedButton(
              onPressed: () => Navigator.of(context).pop(),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.slate900,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text(
                'Back to Wallet',
                style: TextStyle(color: AppColors.white, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFormView() {
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
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'AVAILABLE WITHDRAWABLE BALANCE',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                  color: AppColors.slate500,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '₹${widget.user.balance.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 26,
                      fontWeight: FontWeight.w700,
                      color: AppColors.slate900,
                    ),
                  ),
                  if (widget.user.balance >= 10)
                    InkWell(
                      onTap: () {
                        setState(() {
                          _amountController.text = widget.user.balance.toStringAsFixed(0);
                        });
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: AppColors.emerald50,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: AppColors.emerald600),
                        ),
                        child: const Text(
                          'Max',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.emerald700,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // SLA Fast Transfer Banner
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: AppColors.emerald50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.emerald600.withValues(alpha: 0.3)),
          ),
          child: const Row(
            children: [
              Icon(Icons.bolt, size: 16, color: AppColors.emerald600),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Fast IMPS Transfer: Typically processed and dispatched within 5–15 minutes.',
                  style: TextStyle(fontSize: 11, color: AppColors.emerald900, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),

        // Error message if any
        if (_error != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
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

        // Amount Field
        const Text(
          'Withdrawal Amount (₹)',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _amountController,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          style: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppColors.slate900,
          ),
          decoration: InputDecoration(
            prefixIcon: const Padding(
              padding: EdgeInsets.only(left: 14, right: 8),
              child: Center(
                widthFactor: 0,
                child: Text('₹', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.slate400)),
              ),
            ),
            filled: true,
            fillColor: AppColors.white,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: AppColors.slate200),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: AppColors.slate200),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: AppColors.emerald600, width: 1.5),
            ),
          ),
        ),
        const SizedBox(height: 10),

        // Quick Preset Chips + Max
        Wrap(
          spacing: 8,
          children: [
            ..._presets.map((p) => ChoiceChip(
                  label: Text('₹$p'),
                  selected: _amountController.text == p,
                  onSelected: (selected) {
                    if (selected) setState(() => _amountController.text = p);
                  },
                  backgroundColor: AppColors.white,
                  selectedColor: AppColors.emerald50,
                  labelStyle: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: _amountController.text == p ? AppColors.emerald700 : AppColors.slate700,
                  ),
                  side: BorderSide(
                    color: _amountController.text == p ? AppColors.emerald600 : AppColors.slate200,
                  ),
                )),
            ChoiceChip(
              label: const Text('MAX'),
              selected: _amountController.text == widget.user.balance.toInt().toString(),
              onSelected: (selected) {
                if (selected) {
                  setState(() => _amountController.text = widget.user.balance.toInt().toString());
                }
              },
              backgroundColor: AppColors.white,
              selectedColor: AppColors.emerald50,
              labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.emerald700),
              side: const BorderSide(color: AppColors.slate200),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // UPI ID Field
        const Text(
          'Beneficiary UPI ID',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _upiController,
          keyboardType: TextInputType.emailAddress,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.slate900),
          decoration: InputDecoration(
            hintText: 'e.g. 9876543210@paytm or user@okhdfcbank',
            hintStyle: const TextStyle(fontSize: 13, color: AppColors.slate400),
            filled: true,
            fillColor: AppColors.white,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            prefixIcon: const Icon(Icons.account_balance_wallet_outlined, size: 18, color: AppColors.slate400),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: AppColors.slate200),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: AppColors.slate200),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: AppColors.emerald600, width: 1.5),
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Security Notice Box
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.slate100,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.slate200),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.shield_outlined, size: 16, color: AppColors.slate600),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Minimum withdrawal is ₹10. Ensure your VPA/UPI ID is entered accurately. Funds sent to an incorrect UPI ID cannot be reversed.',
                  style: TextStyle(fontSize: 12, color: AppColors.slate600, height: 1.4),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Submit Button
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton(
            onPressed: _loading ? null : _handleSubmit,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.emerald600,
              elevation: 0,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: _loading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white),
                  )
                : const Text(
                    'Request Payout',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.white,
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}
