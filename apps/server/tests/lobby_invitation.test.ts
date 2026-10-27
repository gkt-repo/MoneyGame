import './test-env';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { gameManager } from '../src/modules/game/game.manager';

async function main() {
  console.log('🧪 Starting Lobby & Room Invitation Tests...');

  // ─── Test 1: Public vs Private Room Isolation ─────────────────────────────
  console.log('\nTest 1: Public vs Private Room Listing Isolation');
  const [host, guest1, guest2] = await Promise.all([
    prisma.user.create({ data: { username: 'inv_host', wallet: { create: { balance: 1000 } } } }),
    prisma.user.create({ data: { username: 'inv_guest1', wallet: { create: { balance: 1000 } } } }),
    prisma.user.create({ data: { username: 'inv_guest2', wallet: { create: { balance: 1000 } } } }),
  ]);

  // Create 1 public room and 1 private room
  const publicRoom = await gameManager.createRoom(host.id, 50, 2, 5, 'GUESS_NUMBER', {}, false);
  const privateRoom = await gameManager.createRoom(host.id, 100, 2, 6, 'GUESS_NUMBER', {}, true);

  assert(publicRoom?.invitationToken, 'Public room must have an invitation token');
  assert(privateRoom?.invitationToken, 'Private room must have an invitation token');
  assert.notEqual(publicRoom?.invitationToken, privateRoom?.invitationToken, 'Tokens must be distinct and unguessable');

  const activeRooms = await gameManager.getActiveRooms();
  const roomCodes = activeRooms.map(r => r.roomCode);
  assert(roomCodes.includes(publicRoom!.roomCode), 'Public room must appear in active lobby listing');
  assert(!roomCodes.includes(privateRoom!.roomCode), 'Private room MUST NOT appear in active lobby listing');
  console.log('   Public room listed, private room strictly hidden from lobby ✅ PASS');

  // ─── Test 2: Room Invitation Preview ──────────────────────────────────────
  console.log('\nTest 2: Invitation Token Preview Resolution');
  const preview = await gameManager.getRoomPreviewByInvitation(privateRoom!.invitationToken!);
  assert(preview, 'Preview must resolve from invitation token');
  assert.equal(preview.id, privateRoom!.id);
  assert.equal(preview.roomCode, privateRoom!.roomCode);
  assert.equal(preview.gameType, 'GUESS_NUMBER');
  assert.equal(preview.entryFee, 100);
  assert.equal(preview.maxPlayers, 2);
  assert.equal(preview.occupiedSeats, 1);
  assert.equal(preview.available, true);
  assert.equal(preview.unavailabilityReason, null);
  assert.equal(preview.host.username, 'inv_host');

  // Ensure no seat was reserved merely by previewing
  const guestWalletBefore = await prisma.wallet.findUniqueOrThrow({ where: { userId: guest1.id } });
  assert.equal(guestWalletBefore.balance, 1000);
  assert.equal(guestWalletBefore.lockedBalance, 0);
  console.log('   Preview resolves metadata without reserving seats or charging ✅ PASS');

  // ─── Test 3: Join via Invitation Token ────────────────────────────────────
  console.log('\nTest 3: Explicit Join via Invitation Token');
  const joined = await gameManager.joinRoomByInvitation(guest1.id, privateRoom!.invitationToken!, 7);
  assert.equal(joined?.id, privateRoom!.id);

  const guestWalletAfter = await prisma.wallet.findUniqueOrThrow({ where: { userId: guest1.id } });
  assert.equal(guestWalletAfter.lockedBalance, 100);
  assert.equal(guestWalletAfter.balance, 900);
  console.log('   Join via invitation locks fee and seats player ✅ PASS');

  // ─── Test 4: Full Room Preview Explanations ───────────────────────────────
  console.log('\nTest 4: Full Room Preview Explanation');
  const fullPreview = await gameManager.getRoomPreviewByInvitation(privateRoom!.invitationToken!);
  assert.equal(fullPreview?.available, false);
  // Status transitioned to COUNTDOWN/PLAYING because room has 2/2 players
  assert(fullPreview?.unavailabilityReason === 'FULL' || fullPreview?.unavailabilityReason === 'STARTED');

  // Overfill attempt rejected
  await assert.rejects(
    () => gameManager.joinRoomByInvitation(guest2.id, privateRoom!.invitationToken!, 8),
    /already full|not available/
  );
  console.log('   Full/started table prevents overfill and explains status ✅ PASS');

  // ─── Test 5: Missing / Invalid Invitation Token ───────────────────────────
  console.log('\nTest 5: Invalid Invitation Token Handling');
  const missingPreview = await gameManager.getRoomPreviewByInvitation('inv-nonexistent-token');
  assert.equal(missingPreview, null);

  await assert.rejects(
    () => gameManager.joinRoomByInvitation(guest2.id, 'inv-nonexistent-token'),
    /Room not found/
  );
  console.log('   Missing invitation token correctly returns null/error ✅ PASS');

  console.log('\n🎉 ALL 5 LOBBY & INVITATION TESTS PASSED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
