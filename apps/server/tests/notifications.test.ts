import './test-env';
import http from 'http';
import express from 'express';
import { prisma, initDbDefaults } from '../src/db';
import { router as apiRouter } from '../src/routes/api.routes';
import { walletService } from '../src/modules/wallet/wallet.service';
import { notificationService } from '../src/modules/notification/notification.service';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

const server = http.createServer(app);

async function runNotificationTests() {
  await initDbDefaults();

  const testUsername = 'test_notification_user';
  const testPhone = '9888877771';
  const testEmail = 'notif_user@example.com';
  const testPassword = 'Password123!';

  await prisma.user.deleteMany({
    where: {
      OR: [
        { username: testUsername },
        { phone: testPhone },
        { email: testEmail },
      ],
    },
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}/api`;

  console.log('🧪 Starting Notification Center End-to-End Tests...\n');

  async function apiCall(endpoint: string, method = 'GET', body?: any, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  // 1. User Registration
  console.log('Test 1: User Registration');
  const regRes = await apiCall('/auth/register', 'POST', {
    username: testUsername,
    phone: testPhone,
    email: testEmail,
    password: testPassword,
  });
  if (regRes.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(regRes.data)}`);
  const token = regRes.data.tokens.accessToken;
  const user = regRes.data.user;
  console.log('Status: 201 ✅ PASS\n');

  // 2. Initial Notifications & Unread count should be 0
  console.log('Test 2: Initial Notifications Empty Check');
  const initRes = await apiCall('/notifications/my', 'GET', undefined, token);
  if (initRes.status !== 200 || initRes.data.notifications.length !== 0 || initRes.data.unreadCount !== 0) {
    throw new Error(`Expected empty notifications, got: ${JSON.stringify(initRes.data)}`);
  }
  console.log('Status: 200, 0 unread ✅ PASS\n');

  // 3. Direct Notification Creation
  console.log('Test 3: Direct Notification Creation');
  const n1 = await notificationService.create({
    userId: user.id,
    title: 'Welcome Bonus',
    message: 'Welcome to MoneyGame! Check your wallet for offers.',
    type: 'SYSTEM',
    metadata: { bonus: 50 },
  });
  const fetchRes1 = await apiCall('/notifications/my', 'GET', undefined, token);
  if (fetchRes1.data.notifications.length !== 1 || fetchRes1.data.unreadCount !== 1) {
    throw new Error(`Expected 1 notification, got: ${JSON.stringify(fetchRes1.data)}`);
  }
  console.log(`Notification created: "${fetchRes1.data.notifications[0].title}" ✅ PASS\n`);

  // 4. Withdrawal Lifecycle Triggers Notification
  console.log('Test 4: Withdrawal Completion creates Payout Notification');
  // Credit wallet first
  await walletService.adjustBalance(user.id, 500, 'Test Credit for Withdrawal', user.id);
  // Request withdrawal of 200
  const reqWithdraw = await walletService.requestWithdrawal(user.id, 200, '8340271508@upi');
  // Admin completes withdrawal
  const payoutUtr = 'UTR9988776655';
  await walletService.completeWithdrawal(reqWithdraw.withdrawal.id, payoutUtr);

  const fetchRes2 = await apiCall('/notifications/my', 'GET', undefined, token);
  const payoutNotif = fetchRes2.data.notifications.find((n: any) => n.type === 'WITHDRAWAL_COMPLETED');
  if (!payoutNotif) {
    throw new Error('Expected WITHDRAWAL_COMPLETED notification');
  }
  if (!payoutNotif.message.includes(payoutUtr) || payoutNotif.metadata.payoutUtr !== payoutUtr) {
    throw new Error(`UTR not recorded properly in notification: ${JSON.stringify(payoutNotif)}`);
  }
  console.log(`Payout notification verified with UTR ${payoutUtr} ✅ PASS\n`);

  // 5. Withdrawal Rejection Triggers Refund Notification
  console.log('Test 5: Withdrawal Rejection creates Refund Notification');
  const reqWithdraw2 = await walletService.requestWithdrawal(user.id, 100, 'invalid@upi');
  await walletService.rejectWithdrawal(reqWithdraw2.withdrawal.id, 'Invalid UPI VPA address');

  const fetchRes3 = await apiCall('/notifications/my', 'GET', undefined, token);
  const rejectNotif = fetchRes3.data.notifications.find((n: any) => n.type === 'WITHDRAWAL_REJECTED');
  if (!rejectNotif) {
    throw new Error('Expected WITHDRAWAL_REJECTED notification');
  }
  if (!rejectNotif.message.includes('Invalid UPI VPA address')) {
    throw new Error('Expected rejection reason in notification message');
  }
  console.log('Rejection & refund notification verified ✅ PASS\n');

  // 6. Mark Single Notification as Read
  console.log('Test 6: Mark Single Notification as Read');
  const notifToRead = payoutNotif.id;
  const readRes = await apiCall(`/notifications/${notifToRead}/read`, 'PATCH', undefined, token);
  if (readRes.status !== 200 || !readRes.data.success) {
    throw new Error(`Mark as read failed: ${JSON.stringify(readRes.data)}`);
  }
  const unreadCheck = await apiCall('/notifications/unread-count', 'GET', undefined, token);
  if (unreadCheck.data.unreadCount !== 4) {
    throw new Error(`Expected 4 unread, got: ${unreadCheck.data.unreadCount}`);
  }
  console.log('Single notification marked read ✅ PASS\n');

  // 7. Mark All Notifications as Read
  console.log('Test 7: Mark All Notifications as Read');
  const markAllRes = await apiCall('/notifications/mark-all-read', 'POST', undefined, token);
  if (markAllRes.status !== 200 || markAllRes.data.unreadCount !== 0) {
    throw new Error(`Mark all read failed: ${JSON.stringify(markAllRes.data)}`);
  }
  const unreadAfter = await apiCall('/notifications/unread-count', 'GET', undefined, token);
  if (unreadAfter.data.unreadCount !== 0) {
    throw new Error(`Expected 0 unread, got: ${unreadAfter.data.unreadCount}`);
  }
  console.log('All notifications marked read, unread count = 0 ✅ PASS\n');

  // 8. Delete Single Notification
  console.log('Test 8: Delete Single Notification');
  const deleteRes = await apiCall(`/notifications/${notifToRead}`, 'DELETE', undefined, token);
  if (deleteRes.status !== 200 || !deleteRes.data.success) {
    throw new Error(`Delete failed: ${JSON.stringify(deleteRes.data)}`);
  }
  const fetchRes4 = await apiCall('/notifications/my', 'GET', undefined, token);
  if (fetchRes4.data.notifications.some((n: any) => n.id === notifToRead)) {
    throw new Error('Deleted notification still returned in list');
  }
  console.log('Single notification deleted successfully ✅ PASS\n');

  // 9. Clear All Notifications
  console.log('Test 9: Clear All Notifications');
  const clearRes = await apiCall('/notifications/clear-all', 'DELETE', undefined, token);
  if (clearRes.status !== 200 || !clearRes.data.success) {
    throw new Error(`Clear all failed: ${JSON.stringify(clearRes.data)}`);
  }
  const fetchRes5 = await apiCall('/notifications/my', 'GET', undefined, token);
  if (fetchRes5.data.notifications.length !== 0) {
    throw new Error('Notifications list not empty after clear-all');
  }
  console.log('All notifications cleared successfully ✅ PASS\n');

  console.log('🎉 ALL 9 NOTIFICATION CENTER TESTS PASSED SUCCESSFULLY!\n');
  server.close();
}

runNotificationTests().catch((err) => {
  console.error('❌ Notification test failure:', err);
  server.close();
  process.exit(1);
});
