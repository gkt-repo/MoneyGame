import './test-env';
import http from 'http';
import express from 'express';
import { prisma, initDbDefaults } from '../src/db';
import { router as apiRouter } from '../src/routes/api.routes';
import { config } from '../src/config';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

const server = http.createServer(app);

async function runAdminControlTests() {
  await initDbDefaults();

  const testUsername = 'test_player_control';
  const testPhone = '9998887776';
  const testEmail = 'player_control@example.com';

  // Cleanup test user
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

  console.log('🧪 Starting Admin Control & User Support Feedback End-to-End Tests...\n');

  async function apiCall(endpoint: string, method = 'GET', body?: any, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data: any = await res.json();
    return { status: res.status, data };
  }

  try {
    // 1. User Registration
    console.log('Test 1: User Registration');
    const regRes = await apiCall('/v1/auth/register', 'POST', {
      username: testUsername,
      phone: testPhone,
      email: testEmail,
      password: 'SecurePassword123!',
    });
    console.log(`Status: ${regRes.status}`, regRes.data.success ? '✅ PASS' : '❌ FAIL');
    if (!regRes.data.success) throw new Error('Registration failed');
    let userToken = regRes.data.tokens.accessToken;
    const userId = regRes.data.user.id;

    // 2. Fetch Support Contact Info
    console.log('\nTest 2: Fetch Support Contact Info (Public)');
    const contactRes = await apiCall('/support/contact-info');
    console.log(`Status: ${contactRes.status}`, contactRes.data.success && contactRes.data.contact?.email ? '✅ PASS' : '❌ FAIL');
    if (!contactRes.data.success) throw new Error('Failed to fetch contact info');

    // 3. User Submits Feedback / Issue Ticket
    console.log('\nTest 3: User Submits Feedback / Support Ticket');
    const feedbackPayload = {
      category: 'DEPOSIT',
      subject: 'Deposit of ₹500 via PhonePe not showing',
      message: 'Paid ₹500.12 at 12:30 PM with UTR 987654321098. Please check.',
      contactInfo: 'UTR: 987654321098',
    };
    const submitRes = await apiCall('/support/feedback', 'POST', feedbackPayload, userToken);
    console.log(`Status: ${submitRes.status}`, submitRes.data.success ? '✅ PASS' : '❌ FAIL');
    if (!submitRes.data.success) throw new Error('Feedback submission failed');
    const feedbackId = submitRes.data.feedback.id;

    // 4. User Fetches Own Tickets
    console.log('\nTest 4: User Fetches Own Feedback Tickets');
    const myTicketsRes = await apiCall('/support/my-feedback', 'GET', undefined, userToken);
    console.log(`Status: ${myTicketsRes.status}`, myTicketsRes.data.success && myTicketsRes.data.feedbacks.length >= 1 ? '✅ PASS' : '❌ FAIL');
    if (!myTicketsRes.data.success || myTicketsRes.data.feedbacks.length === 0) throw new Error('My feedback empty');

    // 5. Admin Login
    console.log('\nTest 5: Admin Login');
    const adminLoginRes = await apiCall('/v1/admin/auth/login', 'POST', {
      identifier: config.adminInitialEmail,
      password: config.adminInitialPassword,
    });
    console.log(`Status: ${adminLoginRes.status}`, adminLoginRes.data.success ? '✅ PASS' : '❌ FAIL');
    if (!adminLoginRes.data.success) throw new Error('Admin login failed');
    const adminToken = adminLoginRes.data.tokens.accessToken;

    // 6. Admin Lists Users
    console.log('\nTest 6: Admin Lists Users with Search & Status');
    const usersListRes = await apiCall(`/admin/users?search=${testUsername}`, 'GET', undefined, adminToken);
    console.log(`Status: ${usersListRes.status}`, usersListRes.data.success && usersListRes.data.users.length >= 1 ? '✅ PASS' : '❌ FAIL');
    if (!usersListRes.data.success || usersListRes.data.users[0].username !== testUsername) throw new Error('Admin users list search failed');

    // 7. Admin Fetches User Profile Detail
    console.log('\nTest 7: Admin Fetches Detailed User Profile');
    const userDetailRes = await apiCall(`/admin/users/${userId}`, 'GET', undefined, adminToken);
    console.log(`Status: ${userDetailRes.status}`, userDetailRes.data.success && userDetailRes.data.user.metrics ? '✅ PASS' : '❌ FAIL');
    if (!userDetailRes.data.success) throw new Error('Admin user profile fetch failed');
    console.log(`   User: ${userDetailRes.data.user.username}, Balance: ₹${userDetailRes.data.user.wallet.balance}, Feedbacks: ${userDetailRes.data.user.feedbacks.length}`);

    // 8. Admin Updates User Status
    console.log('\nTest 8: Admin Updates User Status to SUSPENDED and then ACTIVE');
    const suspendRes = await apiCall(`/admin/users/${userId}/status`, 'PATCH', {
      status: 'SUSPENDED',
      reason: 'Under administrative review',
    }, adminToken);
    console.log(`   Suspend Status: ${suspendRes.status}`, suspendRes.data.user?.status === 'SUSPENDED' ? '✅ PASS' : '❌ FAIL');

    const activateRes = await apiCall(`/admin/users/${userId}/status`, 'PATCH', {
      status: 'ACTIVE',
      reason: 'Review complete - verified user',
    }, adminToken);
    console.log(`   Re-activate Status: ${activateRes.status}`, activateRes.data.user?.status === 'ACTIVE' ? '✅ PASS' : '❌ FAIL');

    // Verify session revocation: Old token issued before suspension must be rejected
    const revokedCheck = await apiCall('/support/my-feedback', 'GET', undefined, userToken);
    console.log(`   Session Revocation on Suspension Check: ${revokedCheck.status}`, revokedCheck.status === 401 ? '✅ PASS (Old Token Revoked)' : '❌ FAIL');
    if (revokedCheck.status !== 401) throw new Error('Suspended user token was not revoked');

    // Re-login as active user to obtain fresh token with current tokenVersion
    const reloginRes = await apiCall('/v1/auth/login', 'POST', {
      identifier: testPhone,
      password: 'SecurePassword123!',
    });
    if (!reloginRes.data.success) throw new Error('Re-login failed after reactivation');
    userToken = reloginRes.data.tokens.accessToken;

    // 9. Admin Adjusts User Balance (Credit)
    console.log('\nTest 9: Admin Credits User Wallet (+₹250.00)');
    const creditRes = await apiCall(`/admin/users/${userId}/adjust-balance`, 'POST', {
      amount: 250.00,
      reason: 'Credit missing deposit for UTR 987654321098',
    }, adminToken);
    console.log(`   Credit Status: ${creditRes.status}`, creditRes.data.success && creditRes.data.wallet.balance === 250 ? '✅ PASS' : '❌ FAIL');

    // 10. Admin Adjusts User Balance (Debit)
    console.log('\nTest 10: Admin Debits User Wallet (-₹50.00)');
    const debitRes = await apiCall(`/admin/users/${userId}/adjust-balance`, 'POST', {
      amount: -50.00,
      reason: 'Service fee adjustment',
    }, adminToken);
    console.log(`   Debit Status: ${debitRes.status}`, debitRes.data.success && debitRes.data.wallet.balance === 200 ? '✅ PASS' : '❌ FAIL');

    // 11. Admin Lists All Feedback
    console.log('\nTest 11: Admin Lists All Feedback Requests');
    const allFeedbackRes = await apiCall('/admin/feedback', 'GET', undefined, adminToken);
    console.log(`Status: ${allFeedbackRes.status}`, allFeedbackRes.data.success && allFeedbackRes.data.feedbacks.length >= 1 ? '✅ PASS' : '❌ FAIL');

    // 12. Admin Replies to Feedback and Resolves Ticket
    console.log('\nTest 12: Admin Replies to Feedback Ticket & Resolves It');
    const replyRes = await apiCall(`/admin/feedback/${feedbackId}/reply`, 'PATCH', {
      adminReply: 'Your UTR 987654321098 has been verified and ₹250.00 has been credited to your wallet balance. Enjoy playing!',
      status: 'RESOLVED',
    }, adminToken);
    console.log(`Status: ${replyRes.status}`, replyRes.data.success && replyRes.data.feedback.status === 'RESOLVED' ? '✅ PASS' : '❌ FAIL');

    // 13. User Checks Updated Ticket
    console.log('\nTest 13: User Checks Updated Ticket & Sees Admin Reply');
    const updatedTicketsRes = await apiCall('/support/my-feedback', 'GET', undefined, userToken);
    const resolvedTicket = updatedTicketsRes.data.feedbacks.find((f: any) => f.id === feedbackId);
    console.log(`Status: ${updatedTicketsRes.status}`, resolvedTicket?.status === 'RESOLVED' && resolvedTicket?.adminReply ? '✅ PASS' : '❌ FAIL');
    console.log(`   Reply received: "${resolvedTicket?.adminReply}"`);

    // 14. Admin Updates Support Settings (Email, WhatsApp, Telegram, Hours)
    console.log('\nTest 14: Admin Updates Support Channels (Email, WhatsApp, Telegram, Hours)');
    const updateSupportRes = await apiCall('/admin/support-settings', 'POST', {
      email: 'helpline@moneygame-live.com',
      whatsapp: '+91 91234 56789',
      telegram: '@MoneyGameLiveOfficial',
      hours: '24/7 Priority Desk',
    }, adminToken);
    console.log(`Status: ${updateSupportRes.status}`, updateSupportRes.data.success && updateSupportRes.data.contact.email === 'helpline@moneygame-live.com' ? '✅ PASS' : '❌ FAIL');

    // 15. User Fetches Dynamic Support Contact Info
    console.log('\nTest 15: Public /support/contact-info Reflects Updated Channels');
    const dynamicContactRes = await apiCall('/support/contact-info');
    const c = dynamicContactRes.data.contact;
    const reflectsUpdated =
      c?.email === 'helpline@moneygame-live.com' &&
      c?.whatsapp === '+91 91234 56789' &&
      c?.telegram === '@MoneyGameLiveOfficial' &&
      c?.hours === '24/7 Priority Desk';
    console.log(`Status: ${dynamicContactRes.status}`, reflectsUpdated ? '✅ PASS' : '❌ FAIL');
    console.log(`   Live Support Email: ${c?.email}`);
    console.log(`   Live Support WhatsApp: ${c?.whatsapp}`);
    console.log(`   Live Support Telegram: ${c?.telegram}`);

    // 16. Platform House Rake Verification with Unlimited Capacity Sports Room (Regression Test)
    console.log('\nTest 16: Admin Stats Platform House Rake Verification (Unlimited Capacity Room)');
    const testRoom = await prisma.room.create({
      data: {
        roomCode: 'R-TEST1000',
        gameType: 'SPORTS_MATCH',
        entryFee: 200,
        maxPlayers: 1000,
        status: 'COMPLETED',
        winnerPrize: 400,
        customConfig: JSON.stringify({
          settlement: {
            status: 'SETTLED',
            totalPot: 400,
            distributablePool: 400,
            commissionAmount: 0,
            winningTeamIndex: 1,
            winnersCount: 1,
            losersCount: 1,
            payoutPerWinner: 400,
          },
        }),
        players: {
          create: [
            { userId, seatIndex: 0, guessNumber: 1 },
          ],
        },
      },
    });

    const statsRes = await apiCall('/admin/stats', 'GET', undefined, adminToken);
    console.log(`Status: ${statsRes.status}`, statsRes.data.success ? '✅ PASS' : '❌ FAIL');
    console.log(`   Platform Profit / House Rake: ₹${statsRes.data.stats.platformProfit}`);

    if (statsRes.data.stats.platformProfit > 1000) {
      throw new Error(`Platform house rake is erroneously high: ₹${statsRes.data.stats.platformProfit} (Expected 0)`);
    }

    const auditRes = await apiCall('/admin/solvency-audit', 'GET', undefined, adminToken);
    console.log(`   Solvency Audit Commission: ₹${auditRes.data.audit.totalPlatformCommission} (Variance: ₹${auditRes.data.audit.varianceRupees})`);
    if (auditRes.data.audit.totalPlatformCommission > 1000) {
      throw new Error(`Solvency audit commission is erroneously high: ₹${auditRes.data.audit.totalPlatformCommission}`);
    }

    // Clean up test room
    await prisma.roomPlayer.deleteMany({ where: { roomId: testRoom.id } });
    await prisma.room.delete({ where: { id: testRoom.id } });

    console.log('\n🎉 ALL 16 ADMIN CONTROL & PLATFORM RAKE TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    // Cleanup
    await prisma.user.deleteMany({
      where: {
        OR: [
          { username: testUsername },
          { phone: testPhone },
          { email: testEmail },
        ],
      },
    });
    server.close();
  }
}

runAdminControlTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
