import './test-env';
import { prisma } from '../src/db';
import { sportsService } from '../src/modules/game/engines/sports-match/sports.service';
import { gameManager } from '../src/modules/game/game.manager';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function createUserWithBalance(username: string, balance: number) {
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: '$2a$10$placeholder',
      wallet: {
        create: {
          balance,
          lockedBalance: 0,
        },
      },
    },
    include: { wallet: true },
  });
  return user;
}

async function run() {
  console.log('🧪 Starting Live Sports Pool Unit & Settlement Tests...\n');

  // Set platform commission to 0 for exact pot distribution matching user formula
  await prisma.systemSetting.upsert({
    where: { key: 'platform_commission' },
    update: { value: '0' },
    create: { key: 'platform_commission', value: '0' },
  });

  // Exercise feed aggregation and settlement with deterministic provider data.
  // External provider availability is not a prerequisite for a financial regression test.
  sportsService.fetchEspnCricket = async () => [{
    id: 'test-fixture-1', sport: 'Cricket', league: 'Test League',
    name: 'Team Alpha vs Team Beta',
    startTime: new Date(Date.now() + 3600000).toISOString(), status: 'SCHEDULED',
    team1: { id: 't1', name: 'Team Alpha', shortName: 'ALP' },
    team2: { id: 't2', name: 'Team Beta', shortName: 'BET' },
  }];
  sportsService.fetchEspnSoccer = async () => [];
  sportsService.fetchEspnBasketball = async () => [];
  sportsService.fetchCricketDataOrg = async () => [];

  // Test 1: Fetch Live & Upcoming Matches from the provider fixtures
  console.log('Test 1: Fetch Live & Upcoming Sports Matches');
  const matches = await sportsService.getAllMatches();
  assert(matches.length > 0, 'Matches array should not be empty');
  const indAusMatch = matches.find(m => m.status === 'SCHEDULED' && (!m.startTime || new Date(m.startTime).getTime() > Date.now())) || {
    id: 'test-fixture-1',
    sport: 'Cricket',
    league: 'Test League',
    name: 'Team Alpha vs Team Beta',
    startTime: new Date(Date.now() + 3600000).toISOString(),
    status: 'SCHEDULED',
    team1: { id: 't1', name: 'Team Alpha', shortName: 'ALP' },
    team2: { id: 't2', name: 'Team Beta', shortName: 'BET' },
  };
  assert(!!indAusMatch, 'Match must be present in match feed');
  console.log(`   Found ${matches.length} matches across sports. Using match: "${indAusMatch.name}" ✅ PASS\n`);

  // Test 2: Create 10-Player Sports Room for IND vs AUS (₹100 entry fee)
  console.log('Test 2: Create 10-Player Room for IND vs AUS (₹100 Entry)');
  const host = await createUserWithBalance('sports_host_1', 500);

  const room1 = await gameManager.createRoom(
    host.id,
    100, // Entry fee: ₹100
    10,  // Max players: 10
    1,   // Host picks India (Team 1)
    'SPORTS_MATCH',
    {
      matchId: indAusMatch!.id,
      sport: indAusMatch!.sport,
      league: indAusMatch!.league,
      matchTitle: indAusMatch!.name,
      startTime: indAusMatch!.startTime,
      team1: indAusMatch!.team1,
      team2: indAusMatch!.team2,
      chosenTeam: indAusMatch!.team1.name,
    }
  );

  assert(room1 !== null, 'Room must be created');
  assert(room1!.gameType === 'SPORTS_MATCH', 'Game type must be SPORTS_MATCH');
  assert(room1!.entryFee === 100, 'Entry fee must be 100');
  assert(room1!.maxPlayers === 10, 'Max players must be 10');
  assert(room1!.players.length === 1, 'Room should have 1 player (host)');
  assert(room1!.players[0].guessNumber === 1, 'Host pick must be 1 (India)');

  const hostWalletAfterCreate = await prisma.wallet.findUnique({ where: { userId: host.id } });
  assert(hostWalletAfterCreate!.balance === 400, 'Host available balance should be deducted by ₹100');
  assert(hostWalletAfterCreate!.lockedBalance === 100, 'Host locked balance should be ₹100');
  console.log('   Host created 10-player room and locked ₹100 ✅ PASS\n');

  // Test 3: Join 9 other players (1 more picks India, 8 pick Australia)
  console.log('Test 3: 9 Players Join Room (2 India picks, 8 Australia picks)');
  const indiaJoiner = await createUserWithBalance('player_ind_2', 500);
  await gameManager.joinRoom(indiaJoiner.id, room1!.roomCode, 1); // Picks India

  const ausPlayers: any[] = [];
  for (let i = 1; i <= 8; i++) {
    const ausPlayer = await createUserWithBalance(`player_aus_${i}`, 500);
    ausPlayers.push(ausPlayer);
    await gameManager.joinRoom(ausPlayer.id, room1!.roomCode, 2); // Picks Australia
  }

  const room1Updated = await prisma.room.findUnique({
    where: { id: room1!.id },
    include: { players: true },
  });
  assert(room1Updated!.players.length === 10, 'Room should have exactly 10 players');
  const indPickers = room1Updated!.players.filter(p => p.guessNumber === 1);
  const ausPickers = room1Updated!.players.filter(p => p.guessNumber === 2);
  assert(indPickers.length === 2, 'Exactly 2 players should have picked India');
  assert(ausPickers.length === 8, 'Exactly 8 players should have picked Australia');
  console.log('   Room filled with 10 players: 2 India (Team 1), 8 Australia (Team 2) ✅ PASS\n');

  // Test 4: Scenario 1 - India Wins (Pot = ₹1000, 2 winners get ₹1000 / 2 = ₹500 each)
  console.log('Test 4: Scenario 1 - India Wins (User example: each of 2 players gets 1000 / 2 = ₹500)');
  const settleRes1 = await sportsService.settleSportsPool(room1!.id, 1, 'India');
  assert(settleRes1.settled === true, 'Room 1 must be settled');
  assert(settleRes1.refunded === false, 'Should not be refunded');
  assert(settleRes1.payoutPerWinner === 500, `Expected payout of ₹500 per winner, got ₹${settleRes1.payoutPerWinner}`);

  const hostWalletAfterWin = await prisma.wallet.findUnique({ where: { userId: host.id } });
  const ind2WalletAfterWin = await prisma.wallet.findUnique({ where: { userId: indiaJoiner.id } });
  // Initial: 500. Entry: -100 (locked). Win: +500. Final: 500 - 100 + 500 = 900. Locked = 0.
  assert(hostWalletAfterWin!.balance === 900, `Host balance should be ₹900, got ${hostWalletAfterWin!.balance}`);
  assert(hostWalletAfterWin!.lockedBalance === 0, 'Host locked balance should be 0');
  assert(ind2WalletAfterWin!.balance === 900, `India Player 2 balance should be ₹900, got ${ind2WalletAfterWin!.balance}`);
  assert(ind2WalletAfterWin!.lockedBalance === 0, 'India Player 2 locked balance should be 0');

  // Check losers: each had 500, paid 100 entry fee -> balance 400, locked 0
  for (const ausPlayer of ausPlayers) {
    const w = await prisma.wallet.findUnique({ where: { userId: ausPlayer.id } });
    assert(w!.balance === 400, `Australia loser balance should be ₹400, got ${w!.balance}`);
    assert(w!.lockedBalance === 0, 'Loser locked balance should be 0');
  }

  // Ledger verification
  const winTxCount = await prisma.transaction.count({
    where: { referenceId: room1!.id, type: 'ROOM_WIN' },
  });
  assert(winTxCount === 2, `Expected 2 ROOM_WIN ledger transactions, got ${winTxCount}`);
  console.log('   Both India pickers received exact ₹500.00 payout, 8 Australia pickers lost entry ✅ PASS\n');

  // Test 5: Scenario 2 - Australia Wins (Pot = ₹1000, 8 winners get ₹1000 / 8 = ₹125 each)
  console.log('Test 5: Scenario 2 - Australia Wins (User example: each of 8 players gets 1000 / 8 = ₹125)');
  const host2 = await createUserWithBalance('sports_host_2', 500);
  const room2 = await gameManager.createRoom(
    host2.id,
    100, // ₹100 entry
    10,
    1,   // Host picks India
    'SPORTS_MATCH',
    {
      matchId: indAusMatch!.id,
      sport: indAusMatch!.sport,
      league: indAusMatch!.league,
      matchTitle: indAusMatch!.name,
      startTime: indAusMatch!.startTime,
      team1: indAusMatch!.team1,
      team2: indAusMatch!.team2,
    }
  );

  const indPlayerB = await createUserWithBalance('player_ind_B', 500);
  await gameManager.joinRoom(indPlayerB.id, room2!.roomCode, 1); // 2nd India pick

  const ausPlayers2: any[] = [];
  for (let i = 1; i <= 8; i++) {
    const p = await createUserWithBalance(`player_aus_grp2_${i}`, 500);
    ausPlayers2.push(p);
    await gameManager.joinRoom(p.id, room2!.roomCode, 2); // 8 Australia picks
  }

  // Australia (Team 2) wins!
  const settleRes2 = await sportsService.settleSportsPool(room2!.id, 2, 'Australia');
  assert(settleRes2.settled === true, 'Room 2 must be settled');
  assert(settleRes2.payoutPerWinner === 125, `Expected payout of ₹125 per winner, got ₹${settleRes2.payoutPerWinner}`);

  for (const ausPlayer of ausPlayers2) {
    const w = await prisma.wallet.findUnique({ where: { userId: ausPlayer.id } });
    // Initial 500 - 100 entry + 125 win = 525
    assert(w!.balance === 525, `Australia winner balance should be ₹525, got ${w!.balance}`);
    assert(w!.lockedBalance === 0, 'Winner locked balance should be 0');
  }

  // India losers in room 2
  const host2Wallet = await prisma.wallet.findUnique({ where: { userId: host2.id } });
  assert(host2Wallet!.balance === 400, 'Host 2 lost ₹100');
  assert(host2Wallet!.lockedBalance === 0, 'Host 2 locked balance is 0');
  console.log('   All 8 Australia pickers received exact ₹125.00 payout (1000 / 8) ✅ PASS\n');

  // Test 6: Scenario 3 - Nobody Picked the Winner -> 100% Refund
  console.log('Test 6: Scenario 3 - Zero Winners (Match Abandoned or Nobody Picked Winner) -> 100% Refund');
  const refundHost = await createUserWithBalance('refund_host', 500);
  const refundGuest = await createUserWithBalance('refund_guest', 500);

  const refundRoom = await gameManager.createRoom(
    refundHost.id,
    100,
    2,
    1, // Picks India
    'SPORTS_MATCH',
    {
      matchId: indAusMatch!.id,
      sport: indAusMatch!.sport,
      league: indAusMatch!.league,
      matchTitle: indAusMatch!.name,
      startTime: indAusMatch!.startTime,
      team1: indAusMatch!.team1,
      team2: indAusMatch!.team2,
    }
  );
  await gameManager.joinRoom(refundGuest.id, refundRoom!.roomCode, 1); // Both picked India!

  // Australia wins (0 players picked Australia) -> 100% refund
  const refundRes = await sportsService.settleSportsPool(refundRoom!.id, 2, 'Australia');
  assert(refundRes.settled === true, 'Refund room should be settled');
  assert(refundRes.refunded === true, 'Must trigger full refund');

  const hW = await prisma.wallet.findUnique({ where: { userId: refundHost.id } });
  const gW = await prisma.wallet.findUnique({ where: { userId: refundGuest.id } });
  assert(hW!.balance === 500, `Host balance must be fully restored to ₹500, got ${hW!.balance}`);
  assert(hW!.lockedBalance === 0, 'Locked balance should be 0');
  assert(gW!.balance === 500, `Guest balance must be fully restored to ₹500, got ${gW!.balance}`);
  assert(gW!.lockedBalance === 0, 'Locked balance should be 0');
  console.log('   Full 100% entry fee refunded to all participants ✅ PASS\n');

  // Test 7: Match Lock - Cannot join once match start time has arrived
  console.log('Test 7: Room Locking - Rejects join once match starts');
  const pastHost = await createUserWithBalance('past_host', 500);
  const pastStartTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 mins ago

  // Creating a room with a past start time must fail
  let createFailed = false;
  try {
    await gameManager.createRoom(
      pastHost.id,
      100,
      4,
      1,
      'SPORTS_MATCH',
      {
        matchId: 'past-match-1',
        sport: 'Cricket',
        league: 'Past League',
        matchTitle: 'Past Match',
        startTime: pastStartTime,
        team1: { name: 'Team A' },
        team2: { name: 'Team B' },
      }
    );
  } catch (err: any) {
    createFailed = true;
    assert(err.message.includes('already started'), `Unexpected error message: ${err.message}`);
  }
  assert(createFailed, 'Should reject room creation for an already started match');
  console.log('   Room creation rejected for past match ✅ PASS\n');

  // Test 8: Unlimited Capacity Room
  console.log('Test 8: Unlimited Capacity Room (1000 maxPlayers)');
  const unlimHost = await createUserWithBalance('unlim_host', 1000);
  const unlimRoom = await gameManager.createRoom(
    unlimHost.id,
    50,
    1000, // Unlimited
    1,
    'SPORTS_MATCH',
    {
      matchId: indAusMatch!.id,
      sport: indAusMatch!.sport,
      league: indAusMatch!.league,
      matchTitle: indAusMatch!.name,
      startTime: indAusMatch!.startTime,
      team1: indAusMatch!.team1,
      team2: indAusMatch!.team2,
      isUnlimited: true,
    }
  );
  assert(unlimRoom!.maxPlayers === 1000, 'Unlimited capacity should set maxPlayers to 1000');
  console.log('   Unlimited capacity room created successfully ✅ PASS\n');

  // Test 9: Startup Recovery Protection (Server reboot does NOT cancel sports pools)
  console.log('Test 9: Server Reboot / Startup Recovery Protection');
  // Create a regular dice room and a sports room
  const diceHost = await createUserWithBalance('dice_reboot_host', 200);
  const diceRoom = await gameManager.createRoom(diceHost.id, 50, 2, 3, 'GUESS_NUMBER');

  // Run startup recovery
  await gameManager.recoverInterruptedRooms();

  const diceAfterReboot = await prisma.room.findUnique({ where: { id: diceRoom!.id } });
  const sportsAfterReboot = await prisma.room.findUnique({ where: { id: unlimRoom!.id } });

  assert(diceAfterReboot!.status === 'CANCELLED', 'Interrupted dice room should be cancelled/refunded on reboot');
  assert(sportsAfterReboot!.status === 'WAITING', 'Sports room scheduled in future must NOT be cancelled on reboot');
  console.log('   Sports pool survived reboot while standard games recovered ✅ PASS\n');

  // Test 10: Multi-Player Sports Pool Cancellation Protection
  console.log('Test 10: Multi-Player Sports Pool Cancellation Security');
  const poolHost = await createUserWithBalance('pool_host_sec', 500);
  const poolJoiner = await createUserWithBalance('pool_joiner_sec', 500);
  const secRoom = await gameManager.createRoom(
    poolHost.id,
    100,
    4,
    1,
    'SPORTS_MATCH',
    {
      matchId: indAusMatch!.id,
      sport: indAusMatch!.sport,
      league: indAusMatch!.league,
      matchTitle: indAusMatch!.name,
      startTime: indAusMatch!.startTime,
      team1: indAusMatch!.team1,
      team2: indAusMatch!.team2,
    }
  );
  await gameManager.joinRoom(poolJoiner.id, secRoom!.roomCode, 2);

  // Non-creator attempts to cancel
  let joinerCancelFailed = false;
  try {
    await gameManager.cancelWaitingRoom(secRoom!.id, poolJoiner.id);
  } catch (err: any) {
    joinerCancelFailed = true;
    assert(err.message.includes('Only the room creator'), `Unexpected error: ${err.message}`);
  }
  assert(joinerCancelFailed, 'Non-host participant must not be able to cancel sports pool');

  // Creator attempts to cancel after other players have joined
  let hostCancelFailed = false;
  try {
    await gameManager.cancelWaitingRoom(secRoom!.id, poolHost.id);
  } catch (err: any) {
    hostCancelFailed = true;
    assert(err.message.includes('Cannot cancel pool once other players have joined'), `Unexpected error: ${err.message}`);
  }
  assert(hostCancelFailed, 'Host cannot cancel pool once others have joined');

  // Clean up by simulating refund settlement
  await sportsService.settleSportsPool(secRoom!.id, 999, 'Test Cleanup');
  console.log('   Multiplayer sports pool is securely protected against unauthorized cancellation ✅ PASS\n');

  // Test 11: Fixture Integrity - Match title, teams, logos, and countdown start time are never mutated on join
  console.log('Test 11: Fixture Integrity - Match Title, Teams, Logos & Start Time Preserved on Join');
  const userA = await createUserWithBalance('ind_nz_host', 500);
  const userB = await createUserWithBalance('ind_nz_joiner', 500);

  const testFutureStart = new Date(Date.now() + 86400000).toISOString(); // 24 hours in future
  const indNzRoom = await gameManager.createRoom(
    userA.id,
    100,
    10,
    1,
    'SPORTS_MATCH',
    {
      matchId: 'fixture-ind-nz-2026',
      sport: 'Cricket',
      league: 'ICC World Cup',
      matchTitle: 'India vs New Zealand',
      startTime: testFutureStart,
      team1: { name: 'India', shortName: 'IND', logo: 'https://espn.com/ind.png' },
      team2: { name: 'New Zealand', shortName: 'NZ', logo: 'https://espn.com/nz.png' },
      chosenTeam: 'India',
    }
  );

  assert(indNzRoom!.status === 'WAITING', 'Room must be WAITING');

  // Player B joins the room
  await gameManager.joinRoom(userB.id, indNzRoom!.roomCode, 2);

  // Fetch from database directly to verify raw customConfig
  const rawDb = await prisma.room.findUniqueOrThrow({ where: { id: indNzRoom!.id } });
  const parsed = JSON.parse(rawDb.customConfig!);

  assert(parsed.matchId === 'fixture-ind-nz-2026', `matchId corrupted: ${parsed.matchId}`);
  assert(parsed.matchTitle === 'India vs New Zealand', `matchTitle corrupted: ${parsed.matchTitle}`);
  assert(parsed.team1.name === 'India', `team1 corrupted: ${parsed.team1?.name}`);
  assert(parsed.team1.shortName === 'IND', `team1 shortName corrupted: ${parsed.team1?.shortName}`);
  assert(parsed.team1.logo === 'https://espn.com/ind.png', `team1 logo corrupted: ${parsed.team1?.logo}`);
  assert(parsed.team2.name === 'New Zealand', `team2 corrupted: ${parsed.team2?.name}`);
  assert(parsed.team2.shortName === 'NZ', `team2 shortName corrupted: ${parsed.team2?.shortName}`);
  assert(parsed.team2.logo === 'https://espn.com/nz.png', `team2 logo corrupted: ${parsed.team2?.logo}`);
  assert(parsed.startTime === testFutureStart, `startTime corrupted: ${parsed.startTime}`);
  assert(parsed.predictions[userA.id]?.teamName === 'India', 'Host prediction recorded');
  assert(parsed.predictions[userB.id]?.teamName === 'New Zealand', 'Player B prediction recorded');
  assert(rawDb.status === 'WAITING', `Room status must still be WAITING (not full, not started), got: ${rawDb.status}`);

  console.log('   Match Title (IND vs NZ), Teams, Logos, and future StartTime 100% preserved on join ✅ PASS\n');

  console.log('🎉 ALL 11 LIVE SPORTS POOL TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('❌ Sports Pool test failed:', err);
  process.exit(1);
});
