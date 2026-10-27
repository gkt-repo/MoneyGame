import './test-env';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { profileService } from '../src/modules/profile/profile.service';
import { gameManager } from '../src/modules/game/game.manager';

async function main() {
  console.log('🧪 Starting Player Profile & Dynamic Statistics Tests...');

  // ─── Test 1: Fetch Profile & Defaults ─────────────────────────────────────
  console.log('\nTest 1: Fetch Authenticated User Profile & Defaults');
  const user = await prisma.user.create({
    data: {
      username: 'profile_tester',
      email: 'tester@example.com',
      phone: '9876543210',
      wallet: { create: { balance: 500 } },
    },
  });

  const profile = await profileService.getUserProfile(user.id);
  assert.equal(profile.id, user.id);
  assert.equal(profile.username, 'profile_tester');
  assert.equal(profile.displayName, 'profile_tester', 'Default displayName should equal username');
  assert.equal(profile.avatar, 'avatar_1', 'Default avatar should be avatar_1');
  assert.equal(profile.phone, '9876543210');
  assert.equal(profile.email, 'tester@example.com');
  assert.equal(profile.stats.totalGames, 0);
  assert.equal(profile.stats.totalWins, 0);
  assert.equal(profile.recentGames.length, 0);
  console.log('   Default profile fields and stats verified ✅ PASS');

  // ─── Test 2: Update Profile (Display Name & Curated Avatar) ────────────────
  console.log('\nTest 2: Update Profile Validation');
  // Update with valid displayName and avatar
  const updated = await profileService.updateProfile(user.id, {
    displayName: 'Golden Knight',
    avatar: 'avatar_5',
  });
  assert.equal(updated.displayName, 'Golden Knight');
  assert.equal(updated.avatar, 'avatar_5');

  // Reject display name < 2 chars
  await assert.rejects(
    () => profileService.updateProfile(user.id, { displayName: 'A' }),
    /between 2 and 30 characters/
  );

  // Reject display name > 30 chars
  await assert.rejects(
    () => profileService.updateProfile(user.id, { displayName: 'A'.repeat(31) }),
    /between 2 and 30 characters/
  );

  // Reject display name with malicious characters
  await assert.rejects(
    () => profileService.updateProfile(user.id, { displayName: '<script>alert(1)</script>' }),
    /invalid characters/
  );

  // Reject uncurated avatar
  await assert.rejects(
    () => profileService.updateProfile(user.id, { avatar: 'custom_hacked_avatar.png' }),
    /Invalid avatar selection/
  );
  console.log('   Profile updates and validations enforced ✅ PASS');

  // ─── Test 3: Restricted Public Profile (Zero Privacy Leaks) ───────────────
  console.log('\nTest 3: Restricted Public Profile Privacy Isolation');
  const publicProf = await profileService.getPublicProfile(user.id);
  assert.equal(publicProf.id, user.id);
  assert.equal(publicProf.username, 'profile_tester');
  assert.equal(publicProf.displayName, 'Golden Knight');
  assert.equal(publicProf.avatar, 'avatar_5');
  assert(publicProf.createdAt);
  assert(publicProf.stats);

  // Assert NO private sensitive account data leaked
  assert.equal((publicProf as any).phone, undefined, 'Phone must not leak in public profile');
  assert.equal((publicProf as any).email, undefined, 'Email must not leak in public profile');
  assert.equal((publicProf as any).wallet, undefined, 'Wallet must not leak in public profile');
  assert.equal((publicProf as any).balance, undefined, 'Balance must not leak in public profile');
  assert.equal((publicProf as any).tokenVersion, undefined, 'TokenVersion must not leak in public profile');
  assert.equal((publicProf as any).passwordHash, undefined, 'PasswordHash must not leak in public profile');
  console.log('   Zero private fields leaked in public profile endpoint ✅ PASS');

  // ─── Test 4: Dynamic Statistics & Cancelled Games Exclusion ───────────────
  console.log('\nTest 4: Dynamic Statistics & Exclusion of Cancelled Games');
  const opponent = await prisma.user.create({
    data: { username: 'opp_player', wallet: { create: { balance: 500 } } },
  });

  // Create a game that completes with user as winner
  const room1 = await prisma.room.create({
    data: {
      roomCode: 'R-STAT1',
      gameType: 'GUESS_NUMBER',
      entryFee: 50,
      maxPlayers: 2,
      status: 'COMPLETED',
      winnerId: user.id,
      winnerPrize: 90,
      players: {
        create: [
          { userId: user.id, seatIndex: 0 },
          { userId: opponent.id, seatIndex: 1 },
        ],
      },
    },
  });

  // Create a game that is CANCELLED (must be excluded from stats!)
  await prisma.room.create({
    data: {
      roomCode: 'R-CANCELLED',
      gameType: 'GUESS_NUMBER',
      entryFee: 50,
      maxPlayers: 2,
      status: 'CANCELLED',
      players: {
        create: [
          { userId: user.id, seatIndex: 0 },
          { userId: opponent.id, seatIndex: 1 },
        ],
      },
    },
  });

  const statsAfterGN = await profileService.getUserProfile(user.id);
  assert.equal(statsAfterGN.stats.totalGames, 1, 'Cancelled game must be excluded');
  assert.equal(statsAfterGN.stats.totalWins, 1);
  assert.equal(statsAfterGN.stats.winRatePercent, 100);
  assert.equal(statsAfterGN.stats.byGame['GUESS_NUMBER'].played, 1);
  assert.equal(statsAfterGN.stats.byGame['GUESS_NUMBER'].won, 1);
  assert.equal(statsAfterGN.recentGames.length, 1);
  assert.equal(statsAfterGN.recentGames[0].roomCode, 'R-STAT1');
  console.log('   Completed game counted, cancelled game successfully excluded ✅ PASS');

  // ─── Test 5: 29 Card Game Team Results Counted for Both Teammates ─────────
  console.log('\nTest 5: 29 Card Game Team Win Credits Both Teammates');
  const [p2, p3] = await Promise.all([
    prisma.user.create({ data: { username: 'p2_team', wallet: { create: { balance: 500 } } } }),
    prisma.user.create({ data: { username: 'p3_team', wallet: { create: { balance: 500 } } } }),
  ]);

  // Team 0: user (seat 0) & p2 (seat 2). Team 1: opponent (seat 1) & p3 (seat 3).
  // Team 0 wins!
  await prisma.room.create({
    data: {
      roomCode: 'R-29TEAM',
      gameType: 'TWENTY_NINE',
      entryFee: 25,
      maxPlayers: 4,
      status: 'COMPLETED',
      winnerId: user.id, // primary winner
      winnerPrize: 90,
      customConfig: JSON.stringify({
        gameType: 'TWENTY_NINE',
        winningTeamIndex: 0,
        winnerUserIds: [user.id, p2.id],
        payouts: [
          { userId: user.id, amount: 45 },
          { userId: p2.id, amount: 45 },
        ],
      }),
      players: {
        create: [
          { userId: user.id, seatIndex: 0 },
          { userId: opponent.id, seatIndex: 1 },
          { userId: p2.id, seatIndex: 2 },
          { userId: p3.id, seatIndex: 3 },
        ],
      },
    },
  });

  // Verify partner p2 (who was NOT winnerId in room table, but in winnerUserIds) receives a WIN!
  const p2Profile = await profileService.getUserProfile(p2.id);
  assert.equal(p2Profile.stats.totalGames, 1);
  assert.equal(p2Profile.stats.totalWins, 1, 'Partner in 29 must receive a win');
  assert.equal(p2Profile.stats.byGame['TWENTY_NINE'].won, 1);
  assert.equal(p2Profile.recentGames[0].isWin, true);
  assert.equal(p2Profile.recentGames[0].prize, 45);

  // Defending player p3 receives a loss
  const p3Profile = await profileService.getUserProfile(p3.id);
  assert.equal(p3Profile.stats.totalGames, 1);
  assert.equal(p3Profile.stats.totalWins, 0, 'Defending loser must receive 0 wins');
  assert.equal(p3Profile.recentGames[0].isWin, false);

  // User has 2 games, 2 wins (1 Guess Number + 1 Twenty Nine)
  const userProfileFinal = await profileService.getUserProfile(user.id);
  assert.equal(userProfileFinal.stats.totalGames, 2);
  assert.equal(userProfileFinal.stats.totalWins, 2);
  assert.equal(userProfileFinal.stats.winRatePercent, 100);
  console.log('   Both 29 teammates accurately credited with team win ✅ PASS');

  console.log('\n🎉 ALL 5 PROFILE & STATS TESTS PASSED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
