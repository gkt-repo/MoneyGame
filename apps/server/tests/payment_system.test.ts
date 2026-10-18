import { prisma, initDbDefaults } from '../src/db';
import { paymentService } from '../src/modules/payment/payment.service';
import { walletService } from '../src/modules/wallet/wallet.service';
import { adminService } from '../src/modules/admin/admin.service';
import { authService } from '../src/modules/auth/auth.service';

async function runPaymentSystemTests() {
  console.log('🧪 Starting End-to-End Payment & Settlement System Tests...\n');

  await initDbDefaults();

  // Clean test slate
  await prisma.transaction.deleteMany();
  await prisma.unmatchedPayment.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany({
    where: {
      OR: [
        { username: 'payment_test_user' },
        { phone: '9888877777' },
        { email: 'payment_test@example.com' },
      ],
    },
  });

  // 1. Create Test User
  console.log('Test 1: User Registration');
  const user = await authService.registerUser({
    username: 'payment_test_user',
    phone: '9888877777',
    email: 'payment_test@example.com',
    password: 'Password@123',
  });
  console.log(`   User created: ${user.user.username} (ID: ${user.user.id}) ✅ PASS\n`);

  // 2. Generate First Deposit (₹100)
  console.log('Test 2: Create First Dynamic Deposit Request (₹100)');
  const dep1 = await paymentService.createDepositRequest(user.user.id, 100);
  console.log(`   Deposit 1 ID: ${dep1.depositId}, Total: ₹${dep1.totalAmount} (Offset: +${dep1.offsetPaise}p) ✅ PASS\n`);

  // 3. Generate Second Deposit (₹200) -> First deposit must be auto-expired
  console.log('Test 3: Single-Active-Deposit: Generating Second Request (₹200) Auto-Cancels First');
  const dep2 = await paymentService.createDepositRequest(user.user.id, 200);
  const dep1Check = await prisma.deposit.findUnique({ where: { id: dep1.depositId } });
  if (dep1Check?.status !== 'EXPIRED') {
    throw new Error(`Expected Dep 1 to be EXPIRED, found: ${dep1Check?.status}`);
  }
  console.log(`   Dep 1 is now EXPIRED (offset freed), Dep 2 is PENDING: ₹${dep2.totalAmount} ✅ PASS\n`);

  // 4. Webhook arrives with unexpected payment (₹350.00, UTR: UTR_UNMATCHED_01)
  console.log('Test 4: Webhook Receives Unmatched Bank Payment (Never Discard Money!)');
  const unmatchedRes = await paymentService.verifyIncomingPayment(350.00, 'UTR_UNMATCHED_01', {
    senderUpi: 'payer@bank',
    senderName: 'Random Payer',
  });
  if (unmatchedRes.success !== false || !unmatchedRes.unmatched) {
    throw new Error('Expected unmatched webhook to be saved in Unmatched ledger');
  }
  const savedUnmatched = await prisma.unmatchedPayment.findUnique({
    where: { utr: 'UTR_UNMATCHED_01' },
  });
  if (!savedUnmatched) throw new Error('Unmatched payment record not found in database');
  console.log(`   Unmatched bank payment of ₹350.00 recorded in DB (Status: ${savedUnmatched.status}) ✅ PASS\n`);

  // 5. User Fallback UTR Claim: Player claims UTR_UNMATCHED_01 on their active deposit
  console.log('Test 5: Zero-Lost-Payment: Player Claims UTR Matching Already-Received Bank Notification');
  const claimRes = await paymentService.claimDepositUtr(user.user.id, dep2.depositId, 'UTR_UNMATCHED_01');
  if (!claimRes.instantApproval) {
    throw new Error('Expected instant approval when UTR already exists in unmatched bank records');
  }
  const dep2After = await prisma.deposit.findUnique({ where: { id: dep2.depositId } });
  if (dep2After?.status !== 'APPROVED') {
    throw new Error(`Expected Dep 2 to be APPROVED, found: ${dep2After?.status}`);
  }
  const walletCheck1 = await walletService.getWallet(user.user.id);
  console.log(`   Instant auto-approval triggered! Wallet balance credited: ₹${walletCheck1?.balance.toFixed(2)} ✅ PASS\n`);

  // 6. Player generates new deposit and claims UTR BEFORE the bank notification arrives
  console.log('Test 6: Player Claims UTR BEFORE Bank Notification Arrives (Marked CLAIMED)');
  const dep3 = await paymentService.createDepositRequest(user.user.id, 50);
  const claimPreRes = await paymentService.claimDepositUtr(user.user.id, dep3.depositId, 'UTR_FUTURE_02');
  if (claimPreRes.instantApproval) {
    throw new Error('Should not instantly approve when bank record is not yet present');
  }
  const dep3Claimed = await prisma.deposit.findUnique({ where: { id: dep3.depositId } });
  if (dep3Claimed?.status !== 'CLAIMED' || dep3Claimed.userClaimedUtr !== 'UTR_FUTURE_02') {
    throw new Error('Expected status to be CLAIMED with userClaimedUtr set');
  }
  console.log(`   Deposit status is CLAIMED (userClaimedUtr: ${dep3Claimed.userClaimedUtr}) ✅ PASS\n`);

  // 7. Webhook arrives subsequently with UTR_FUTURE_02
  console.log('Test 7: Webhook Arrives Subsequently and Auto-Approves the Claimed Deposit');
  const delayedWebhook = await paymentService.verifyIncomingPayment(dep3.totalAmount, 'UTR_FUTURE_02');
  if (!delayedWebhook.success) {
    throw new Error(`Delayed webhook failed: ${delayedWebhook.message}`);
  }
  const dep3Final = await prisma.deposit.findUnique({ where: { id: dep3.depositId } });
  if (dep3Final?.status !== 'APPROVED') {
    throw new Error(`Expected Dep 3 to be APPROVED, found: ${dep3Final?.status}`);
  }
  console.log(`   Claimed deposit auto-reconciled and approved upon bank webhook arrival! ✅ PASS\n`);

  // 8. Admin Manual Approval with custom UTR
  console.log('Test 8: Admin Manual Deposit Approval with Bank UTR');
  const adminUser = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } });
  if (!adminUser) throw new Error('Admin user required for admin tests');

  const dep4 = await paymentService.createDepositRequest(user.user.id, 100);
  const adminApproveRes = await paymentService.adminApproveDeposit(dep4.depositId, 'MANUAL_UTR_999', adminUser.id);
  if (!adminApproveRes.success) throw new Error('Admin manual approval failed');
  const dep4Approved = await prisma.deposit.findUnique({ where: { id: dep4.depositId } });
  if (dep4Approved?.status !== 'APPROVED' || dep4Approved.claimStatus !== 'MANUALLY_VERIFIED') {
    throw new Error('Expected MANUALLY_VERIFIED status');
  }
  console.log(`   Admin manually verified and credited ₹100.00 (UTR: MANUAL_UTR_999) ✅ PASS\n`);

  // 9. Admin Rejects an Invalid Deposit
  console.log('Test 9: Admin Rejection of Invalid Deposit');
  const dep5 = await paymentService.createDepositRequest(user.user.id, 50);
  const rejectRes = await paymentService.adminRejectDeposit(dep5.depositId, 'Fake screenshot submitted', adminUser.id);
  if (!rejectRes.success) throw new Error('Reject failed');
  const dep5Rejected = await prisma.deposit.findUnique({ where: { id: dep5.depositId } });
  if (dep5Rejected?.status !== 'REJECTED') {
    throw new Error('Expected REJECTED status');
  }
  console.log(`   Deposit #${dep5.depositId.slice(0, 8)} rejected with audit trail ✅ PASS\n`);

  // 10. Passbook & Transaction Ledger
  console.log('Test 10: Complete Financial Passbook / Transaction Ledger for User');
  const transactions = await walletService.getUserTransactions(user.user.id);
  if (transactions.length < 3) {
    throw new Error(`Expected at least 3 transactions in user passbook, found ${transactions.length}`);
  }
  console.log(`   Passbook retrieved: ${transactions.length} itemized financial entries logged ✅ PASS\n`);

  // 11. Withdrawal Policy: Minimum Limit & Balance Locking
  console.log('Test 11: Withdrawal Request with Balance Locking');
  const walletBeforeWithdraw = await walletService.getWallet(user.user.id);
  const withdrawAmount = 50.0;
  const withdrawRes = await walletService.requestWithdrawal(user.user.id, withdrawAmount, 'user@okhdfcbank');
  const walletAfterWithdraw = await walletService.getWallet(user.user.id);
  if (walletAfterWithdraw!.lockedBalance !== withdrawAmount) {
    throw new Error('Locked balance should match requested withdrawal amount');
  }
  console.log(`   ₹50.00 locked for withdrawal to user@okhdfcbank. Available balance: ₹${walletAfterWithdraw!.balance.toFixed(2)} ✅ PASS\n`);

  // 12. Withdrawal Policy: Single Active Pending Withdrawal Policy
  console.log('Test 12: Enforce Single Pending Withdrawal Policy (Prevent Queue Flooding)');
  let secondWithdrawBlocked = false;
  try {
    await walletService.requestWithdrawal(user.user.id, 20.0, 'user@okhdfcbank');
  } catch (err: any) {
    secondWithdrawBlocked = true;
    console.log(`   Correctly rejected second withdrawal: "${err.message}"`);
  }
  if (!secondWithdrawBlocked) {
    throw new Error('Should have blocked second pending withdrawal');
  }
  console.log(`   Single pending withdrawal policy enforced ✅ PASS\n`);

  // 13. Admin Payout Clearance with Unique UTR
  console.log('Test 13: Admin Clears Withdrawal with Bank IMPS UTR');
  const payoutUtr = 'PAYOUT_UTR_101010';
  const completedWithdrawal = await walletService.completeWithdrawal(withdrawRes.withdrawal.id, payoutUtr);
  if (completedWithdrawal.withdrawal.status !== 'COMPLETED') {
    throw new Error('Withdrawal should be COMPLETED');
  }
  const finalWallet = await walletService.getWallet(user.user.id);
  if (finalWallet!.lockedBalance !== 0) {
    throw new Error('Locked balance should be 0 after settlement');
  }
  console.log(`   Withdrawal settled. Payout UTR: ${payoutUtr}, Locked balance: ₹0.00 ✅ PASS\n`);

  // 14. Duplicate Payout UTR Prevention
  console.log('Test 14: Prevent Replay / Duplicate Payout UTR on Subsequent Withdrawals');
  const secondWithdraw = await walletService.requestWithdrawal(user.user.id, 20.0, 'user2@paytm');
  let duplicateUtrBlocked = false;
  try {
    await walletService.completeWithdrawal(secondWithdraw.withdrawal.id, payoutUtr);
  } catch (err: any) {
    duplicateUtrBlocked = true;
    console.log(`   Correctly blocked duplicate payout UTR: "${err.message}"`);
  }
  if (!duplicateUtrBlocked) {
    throw new Error('Should have blocked duplicate payout UTR');
  }
  console.log(`   Duplicate payout UTR blocked successfully ✅ PASS\n`);

  console.log('🎉 ALL 14 PAYMENT SYSTEM TESTS PASSED SUCCESSFULLY!');
}

runPaymentSystemTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  });
