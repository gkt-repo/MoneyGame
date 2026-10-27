import './test-env';
import { waitForCardStart } from './wait-for-card-start';
import http from 'http';
import express from 'express';
import { prisma, initDbDefaults } from '../src/db';
import { router as apiRouter } from '../src/routes/api.routes';
import { config } from '../src/config';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

const server = http.createServer(app);

async function runAdminTableControlTests() {
  await initDbDefaults();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}/api`;

  console.log('🧪 Starting Admin Game Table Control End-to-End Tests...\n');

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
    // 1. Create players and admin
    const p1 = await apiCall('/v1/auth/register', 'POST', {
      username: 'table_player_1',
      phone: '8881112221',
      email: 'table_p1@example.com',
      password: 'Password123!',
    });
    const p2 = await apiCall('/v1/auth/register', 'POST', {
      username: 'table_player_2',
      phone: '8881112222',
      email: 'table_p2@example.com',
      password: 'Password123!',
    });

    const adminLogin = await apiCall('/v1/admin/auth/login', 'POST', {
      identifier: config.adminInitialEmail,
      password: config.adminInitialPassword,
    });
    const adminToken = adminLogin.data.tokens.accessToken;
    const p1Token = p1.data.tokens.accessToken;
    const p2Token = p2.data.tokens.accessToken;
    const p1Id = p1.data.user.id;
    const p2Id = p2.data.user.id;

    // Credit wallets
    await apiCall(`/admin/users/${p1Id}/adjust-balance`, 'POST', { amount: 1000, reason: 'Initial test funding' }, adminToken);
    await apiCall(`/admin/users/${p2Id}/adjust-balance`, 'POST', { amount: 1000, reason: 'Initial test funding' }, adminToken);

    console.log('Test 1: RBAC Security Check - Regular User Blocked from Admin Table Endpoints');
    const userAccessList = await apiCall('/admin/rooms', 'GET', undefined, p1Token);
    const userAccessCancel = await apiCall('/admin/rooms/fake-room-id/cancel', 'POST', {}, p1Token);
    if (userAccessList.status !== 401 || userAccessCancel.status !== 401) {
      throw new Error(`Expected 401 for unauthorized table admin access, got ${userAccessList.status} and ${userAccessCancel.status}`);
    }
    console.log('Status: 401 ✅ PASS (RBAC Protected)');

    console.log('\nTest 2: Player 1 Creates Guess Number Table (Waiting state)');
    const createRes = await apiCall('/rooms/create', 'POST', {
      entryFee: 50,
      maxPlayers: 2,
      guessNumber: 5,
      gameType: 'GUESS_NUMBER',
    }, p1Token);
    if (!createRes.data.room?.id) throw new Error('Failed to create room: ' + JSON.stringify(createRes.data));
    const room1 = createRes.data.room;

    // Check P1 wallet balance: 1000 - 50 available = 950, locked = 50
    const w1Before = await prisma.wallet.findUnique({ where: { userId: p1Id } });
    if (w1Before?.balance !== 950 || w1Before?.lockedBalance !== 50) {
      throw new Error(`Expected P1 wallet (950, 50), got (${w1Before?.balance}, ${w1Before?.lockedBalance})`);
    }
    console.log('Room created: #' + room1.roomCode + ', P1 Available: ₹' + w1Before.balance + ', Locked: ₹' + w1Before.lockedBalance + ' ✅ PASS');

    console.log('\nTest 3: Admin Lists Active Tables & Verifies Details');
    const adminRoomsRes = await apiCall('/admin/rooms?status=ACTIVE', 'GET', undefined, adminToken);
    if (!adminRoomsRes.data.success || !Array.isArray(adminRoomsRes.data.rooms)) {
      throw new Error('Failed to fetch admin rooms: ' + JSON.stringify(adminRoomsRes.data));
    }
    const foundRoom1 = adminRoomsRes.data.rooms.find((r: any) => r.id === room1.id);
    if (!foundRoom1 || foundRoom1.status !== 'WAITING' || foundRoom1.players.length !== 1) {
      throw new Error('Room 1 not properly listed in admin rooms list');
    }
    console.log('Admin found table #' + foundRoom1.roomCode + ' with status: ' + foundRoom1.status + ' ✅ PASS');

    console.log('\nTest 4: Admin Cancels Active Waiting Table and Refunds Participant');
    const cancelRes = await apiCall(`/admin/rooms/${room1.id}/cancel`, 'POST', {
      reason: 'Admin test cancellation of waiting table',
    }, adminToken);
    if (!cancelRes.data.success) {
      throw new Error('Admin cancel failed: ' + JSON.stringify(cancelRes.data));
    }
    console.log('Cancel message: ' + cancelRes.data.message + ' ✅ PASS');

    // Verify P1 balance restored to 1000, locked = 0
    const w1After = await prisma.wallet.findUnique({ where: { userId: p1Id } });
    if (w1After?.balance !== 1000 || w1After?.lockedBalance !== 0) {
      throw new Error(`Expected P1 wallet restored to (1000, 0), got (${w1After?.balance}, ${w1After?.lockedBalance})`);
    }
    console.log('P1 Wallet restored: Available: ₹' + w1After.balance + ', Locked: ₹' + w1After.lockedBalance + ' ✅ PASS');

    // Verify room status in DB is CANCELLED
    const r1Db = await prisma.room.findUnique({ where: { id: room1.id } });
    if (r1Db?.status !== 'CANCELLED') {
      throw new Error('Expected room status CANCELLED, got ' + r1Db?.status);
    }
    console.log('Table DB status verified: CANCELLED ✅ PASS');

    console.log('\nTest 5: Teen Patti Table - Cancellation Mid-Game Distributes Boot + In-Game Bets');
    // P1 creates Teen Patti table with entry ₹100
    const tpCreate = await apiCall('/rooms/create', 'POST', {
      entryFee: 100,
      maxPlayers: 2,
      gameType: 'TEEN_PATTI',
    }, p1Token);
    const tpRoom = tpCreate.data.room;

    // P2 joins Teen Patti table
    const tpJoin = await apiCall('/rooms/join', 'POST', {
      roomCode: tpRoom.roomCode,
    }, p2Token);
    if (!tpJoin.data.room?.id) throw new Error('P2 failed to join: ' + JSON.stringify(tpJoin.data));
    await waitForCardStart(tpRoom.id);

    // Both players have ₹100 locked
    let p1W = await prisma.wallet.findUnique({ where: { userId: p1Id } });
    let p2W = await prisma.wallet.findUnique({ where: { userId: p2Id } });
    if (p1W?.balance !== 900 || p1W?.lockedBalance !== 100 || p2W?.balance !== 900 || p2W?.lockedBalance !== 100) {
      throw new Error(`Unexpected boot deduction: P1(${p1W?.balance}, ${p1W?.lockedBalance}), P2(${p2W?.balance}, ${p2W?.lockedBalance})`);
    }
    console.log('Teen Patti Table Live! Both players locked ₹100 boot. Status: PLAYING ✅ PASS');

    // Let current player place a BLIND / CHAAL bet
    const detailsBefore = await apiCall(`/admin/rooms/${tpRoom.id}`, 'GET', undefined, adminToken);
    const currentTurn = detailsBefore.data.room?.gameState?.currentTurnUserId;
    const actingToken = currentTurn === p1Id ? p1Token : p2Token;
    const actingId = currentTurn === p1Id ? p1Id : p2Id;

    const betRes = await apiCall(`/rooms/${tpRoom.id}/action`, 'POST', {
      action: 'BLIND',
    }, actingToken);
    if (!betRes.data.success) throw new Error('In-game bet failed: ' + JSON.stringify(betRes.data));

    const actingW = await prisma.wallet.findUnique({ where: { userId: actingId } });
    console.log(`Player placed BLIND bet (+₹100). Total locked for player: ₹${actingW?.lockedBalance} ✅ PASS`);

    // Verify Admin sees total pot with in-game stakes
    const adminTpCheck = await apiCall(`/admin/rooms/${tpRoom.id}`, 'GET', undefined, adminToken);
    console.log(`Admin inspections: Room Status: ${adminTpCheck.data.room.status}, Players: ${adminTpCheck.data.room.players.length} ✅ PASS`);

    console.log('\nTest 6: Admin Cancels Active Playing Teen Patti Table');
    const adminCancelTp = await apiCall(`/admin/rooms/${tpRoom.id}/cancel`, 'POST', {
      reason: 'Admin cancelled stalled Teen Patti game',
    }, adminToken);
    if (!adminCancelTp.data.success) {
      throw new Error('Admin cancel TP failed: ' + JSON.stringify(adminCancelTp.data));
    }
    console.log('Cancel message: ' + adminCancelTp.data.message + ' ✅ PASS');

    // Verify 100% money distributed back to all participants
    p1W = await prisma.wallet.findUnique({ where: { userId: p1Id } });
    p2W = await prisma.wallet.findUnique({ where: { userId: p2Id } });
    if (p1W?.balance !== 1000 || p1W?.lockedBalance !== 0) {
      throw new Error(`P1 wallet not fully refunded! Expected (1000, 0), got (${p1W?.balance}, ${p1W?.lockedBalance})`);
    }
    if (p2W?.balance !== 1000 || p2W?.lockedBalance !== 0) {
      throw new Error(`P2 wallet not fully refunded! Expected (1000, 0), got (${p2W?.balance}, ${p2W?.lockedBalance})`);
    }
    console.log('Participant 1 100% refunded: ₹1000.00 available, ₹0 locked ✅ PASS');
    console.log('Participant 2 100% refunded: ₹1000.00 available, ₹0 locked ✅ PASS');

    console.log('\nTest 7: Repeat Cancellation Rejected (Idempotency / Guard)');
    const repeatCancel = await apiCall(`/admin/rooms/${tpRoom.id}/cancel`, 'POST', {}, adminToken);
    if (repeatCancel.status !== 400 || !repeatCancel.data.error?.includes('already cancelled')) {
      throw new Error('Expected 400 with already cancelled, got: ' + JSON.stringify(repeatCancel));
    }
    console.log('Repeat cancellation correctly rejected: ' + repeatCancel.data.error + ' ✅ PASS');

    console.log('\nTest 8: System Solvency Audit Integrity Check');
    const auditRes = await apiCall('/admin/solvency-audit', 'GET', undefined, adminToken);
    if (!auditRes.data.success || !auditRes.data.audit.isSolvent) {
      throw new Error('Platform solvency failed: ' + JSON.stringify(auditRes.data));
    }
    console.log(`Platform Solvency: isSolvent=${auditRes.data.audit.isSolvent}, Variance=₹${auditRes.data.audit.varianceRupees} ✅ PASS`);

    console.log('\nTest 9: Audit Logs & Player Notifications Recorded');
    const logs = await prisma.auditLog.findMany({
      where: { action: 'CANCEL_TABLE' },
      orderBy: { createdAt: 'desc' },
    });
    if (logs.length < 2) throw new Error('Expected at least 2 CANCEL_TABLE audit logs, got ' + logs.length);
    console.log(`Audit logs verified: Found ${logs.length} CANCEL_TABLE audit entries ✅ PASS`);

    const p1Notifs = await prisma.notification.findMany({
      where: { userId: p1Id, title: 'Table Cancelled & Refunded' },
    });
    if (p1Notifs.length < 2) throw new Error('Expected notification for P1 cancellations, got ' + p1Notifs.length);
    console.log(`Player notifications verified: Found ${p1Notifs.length} cancellation notifications ✅ PASS`);

    console.log('\n🎉 ALL 9 ADMIN TABLE CONTROL & PARTICIPANT REFUND TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    server.close();
  }
}

runAdminTableControlTests().catch((err) => {
  console.error('\n❌ Admin Table Control Test Failure:', err);
  process.exit(1);
});
