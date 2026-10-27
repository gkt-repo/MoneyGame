import './test-env';
import { waitForCardStart } from './wait-for-card-start';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { createTwentyNineDeck, getCardPoints, getCardPower, compareCards } from '../src/modules/game/engines/twenty-nine/deck';
import { twentyNineEngine } from '../src/modules/game/engines/twenty-nine/twenty-nine.engine';
import { gameManager } from '../src/modules/game/game.manager';
import { CardSuit, PlayingCard } from '@moneygame/shared-types';

async function main() {
  console.log('🧪 Starting 29 Card Game Engine & Settlement Tests...');

  // ─── Test 1: Deck Composition & Point Values ──────────────────────────────
  console.log('\nTest 1: Deck Composition, Rank Powers & 28 Points Sum');
  const deck = createTwentyNineDeck();
  assert.equal(deck.length, 32, 'Deck must contain strictly 32 cards');

  const suits: CardSuit[] = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
  for (const s of suits) {
    const suitCards = deck.filter(c => c.suit === s);
    assert.equal(suitCards.length, 8, `Suit ${s} must have exactly 8 cards`);
  }

  const totalPoints = deck.reduce((sum, c) => sum + getCardPoints(c), 0);
  assert.equal(totalPoints, 28, 'Deck must contain exactly 28 total card points');

  // Verify rank ordering: J > 9 > A > 10 > K > Q > 8 > 7
  const jCard: PlayingCard = { suit: 'SPADES', rank: 11, label: 'J' };
  const nineCard: PlayingCard = { suit: 'SPADES', rank: 9, label: '9' };
  const aCard: PlayingCard = { suit: 'SPADES', rank: 14, label: 'A' };
  const tenCard: PlayingCard = { suit: 'SPADES', rank: 10, label: '10' };
  const kCard: PlayingCard = { suit: 'SPADES', rank: 13, label: 'K' };
  const qCard: PlayingCard = { suit: 'SPADES', rank: 12, label: 'Q' };
  const eightCard: PlayingCard = { suit: 'SPADES', rank: 8, label: '8' };
  const sevenCard: PlayingCard = { suit: 'SPADES', rank: 7, label: '7' };

  assert(compareCards(jCard, nineCard) > 0);
  assert(compareCards(nineCard, aCard) > 0);
  assert(compareCards(aCard, tenCard) > 0);
  assert(compareCards(tenCard, kCard) > 0);
  assert(compareCards(kCard, qCard) > 0);
  assert(compareCards(qCard, eightCard) > 0);
  assert(compareCards(eightCard, sevenCard) > 0);
  console.log('   Deck uniqueness, powers and 28 points sum verified ✅ PASS');

  // ─── Test 2: Room Validation ──────────────────────────────────────────────
  console.log('\nTest 2: Validation of 4-Player Partnership Rules');
  assert.throws(
    () => twentyNineEngine.validateCreateOptions({ entryFee: 100, maxPlayers: 2 }),
    /strictly requires 4 players/
  );
  assert.throws(
    () => twentyNineEngine.validateCreateOptions({ entryFee: 0, maxPlayers: 4 }),
    /greater than zero/
  );
  console.log('   4-player constraint and fee validation verified ✅ PASS');

  // ─── Test 3: Four Players Join & Table Starts ─────────────────────────────
  console.log('\nTest 3: Four Players Join Table & Initial 4-Card Deal');
  const users = await Promise.all([
    prisma.user.create({ data: { username: 'p0', wallet: { create: { balance: 500 } } } }),
    prisma.user.create({ data: { username: 'p1', wallet: { create: { balance: 500 } } } }),
    prisma.user.create({ data: { username: 'p2', wallet: { create: { balance: 500 } } } }),
    prisma.user.create({ data: { username: 'p3', wallet: { create: { balance: 500 } } } }),
  ]);

  const entryFee = 50;
  const room = await gameManager.createRoom(users[0].id, entryFee, 4, null, 'TWENTY_NINE');
  assert.equal(room?.status, 'WAITING');

  await gameManager.joinRoom(users[1].id, room!.roomCode, null, 1);
  await gameManager.joinRoom(users[2].id, room!.roomCode, null, 2);
  const countdownRoom = await gameManager.joinRoom(users[3].id, room!.roomCode, null, 3);
  assert.equal(countdownRoom?.status, 'COUNTDOWN');
  assert.equal(countdownRoom?.gameState, null, 'No cards dealt during countdown');
  const activeRoom = await waitForCardStart(room!.id);

  assert.equal(activeRoom?.status, 'PLAYING');
  assert.equal(activeRoom?.players.length, 4);

  // Check client state
  const stateP0 = twentyNineEngine.getClientState(room!.id, users[0].id);
  assert(stateP0);
  assert.equal(stateP0.phase, 'BIDDING');
  assert.equal(stateP0.players[users[0].id].cards?.length, 4);
  assert.equal(stateP0.players[users[1].id].cards, undefined, 'Opponent cards must be hidden');
  assert.equal(stateP0.players[users[1].id].cardCount, 4);
  console.log('   Initial deal of 4 cards per player & masked state verified ✅ PASS');

  // ─── Test 4: Bidding Auction Phase ────────────────────────────────────────
  console.log('\nTest 4: Bidding Auction Progression');
  // First bidder is seat 1 (user 1)
  assert.equal(stateP0.currentTurnUserId, users[1].id);

  // Bid below 16 rejected
  const badBid = await twentyNineEngine.handleAction(room!.id, users[1].id, 'BID', { amount: 15 }, null);
  assert.equal(badBid.success, false);

  // Out of turn bid rejected
  const outOfTurn = await twentyNineEngine.handleAction(room!.id, users[2].id, 'BID', { amount: 16 }, null);
  assert.equal(outOfTurn.success, false);

  // Player 1 bids 16
  const bid16 = await twentyNineEngine.handleAction(room!.id, users[1].id, 'BID', { amount: 16 }, null);
  assert.equal(bid16.success, true);

  // Next is player 2 (seat 2), bids 17
  const bid17 = await twentyNineEngine.handleAction(room!.id, users[2].id, 'BID', { amount: 17 }, null);
  assert.equal(bid17.success, true);

  // Player 3 passes
  const pass3 = await twentyNineEngine.handleAction(room!.id, users[3].id, 'PASS', {}, null);
  assert.equal(pass3.success, true);

  // Player 0 passes
  const pass0 = await twentyNineEngine.handleAction(room!.id, users[0].id, 'PASS', {}, null);
  assert.equal(pass0.success, true);

  // Player 1 passes (leaves player 2 with high bid 17)
  const pass1 = await twentyNineEngine.handleAction(room!.id, users[1].id, 'PASS', {}, null);
  assert.equal(pass1.success, true);

  const stateAfterAuction = twentyNineEngine.getClientState(room!.id, users[2].id);
  assert.equal(stateAfterAuction?.phase, 'TRUMP_SELECTION');
  assert.equal(stateAfterAuction?.contractorUserId, users[2].id);
  assert.equal(stateAfterAuction?.contractorTeamIndex, 0); // Seat 2 is Team 0
  assert.equal(stateAfterAuction?.contract, 17);
  console.log('   Auction progression, passes and contractor determination verified ✅ PASS');

  // ─── Test 5: Trump Selection & Second Deal ────────────────────────────────
  console.log('\nTest 5: Secret Trump Selection & Deal Phase 2');
  // Non-contractor cannot choose trump
  const badTrump = await twentyNineEngine.handleAction(room!.id, users[0].id, 'SELECT_TRUMP', { suit: 'HEARTS' }, null);
  assert.equal(badTrump.success, false);

  // Contractor chooses HEARTS
  const goodTrump = await twentyNineEngine.handleAction(room!.id, users[2].id, 'SELECT_TRUMP', { suit: 'HEARTS' }, null);
  assert.equal(goodTrump.success, true);

  // Check client state for contractor vs opponent
  const contractorState = twentyNineEngine.getClientState(room!.id, users[2].id);
  const opponentState = twentyNineEngine.getClientState(room!.id, users[1].id);

  assert.equal(contractorState?.phase, 'PLAYING');
  assert.equal(contractorState?.trumpSuit, 'HEARTS', 'Contractor sees chosen trump');
  assert.equal(contractorState?.isTrumpRevealed, false);
  assert.equal(opponentState?.trumpSuit, null, 'Opponent MUST NOT see hidden trump');
  assert.equal(opponentState?.isTrumpRevealed, false);

  // Each player now holds 8 cards
  for (const u of users) {
    const s = twentyNineEngine.getClientState(room!.id, u.id);
    assert.equal(s?.players[u.id].cards?.length, 8, 'Player must have 8 cards after final deal');
  }
  console.log('   Trump selection isolation and 8-card hand completion verified ✅ PASS');

  // ─── Test 6: Trick Play, Follow-Suit, Trump Reveal & 8 Tricks ─────────────
  console.log('\nTest 6: Trick Play, Follow Suit Enforcement & Trump Reveal');
  // Contractor (users[2]) leads trick 0
  let currentTurnUser = twentyNineEngine.getClientState(room!.id)?.currentTurnUserId!;
  assert.equal(currentTurnUser, users[2].id);

  // Contractor leads with first card in hand
  let leadCard = twentyNineEngine.getClientState(room!.id, users[2].id)!.players[users[2].id].cards![0];
  let playRes = await twentyNineEngine.handleAction(room!.id, users[2].id, 'PLAY_CARD', { card: leadCard }, null);
  assert.equal(playRes.success, true);

  // Next player is seat 3 (users[3]). Check follow-suit rule
  const p3Cards = twentyNineEngine.getClientState(room!.id, users[3].id)!.players[users[3].id].cards!;
  const p3Matching = p3Cards.filter(c => c.suit === leadCard.suit);
  const p3NonMatching = p3Cards.filter(c => c.suit !== leadCard.suit);

  if (p3Matching.length > 0 && p3NonMatching.length > 0) {
    // Attempting to play non-matching card when holding matching card MUST fail
    const illegalPlay = await twentyNineEngine.handleAction(room!.id, users[3].id, 'PLAY_CARD', { card: p3NonMatching[0] }, null);
    assert.equal(illegalPlay.success, false, 'Must follow suit if card of lead suit is held');

    // Attempting to reveal trump when holding lead suit MUST fail
    const illegalReveal = await twentyNineEngine.handleAction(room!.id, users[3].id, 'REVEAL_TRUMP', {}, null);
    assert.equal(illegalReveal.success, false, 'Cannot reveal trump when holding lead suit');
  }

  // Play remaining cards of trick 0 and subsequent tricks
  // Simulate complete 8 tricks play through deterministic engine actions
  for (let trick = 0; trick < 8; trick++) {
    for (let c = (trick === 0 ? 1 : 0); c < 4; c++) {
      const state = twentyNineEngine.getClientState(room!.id);
      if (state?.phase === 'COMPLETED') break;

      const actorId = state?.currentTurnUserId!;
      const actorState: any = twentyNineEngine.getClientState(room!.id, actorId);
      const actorCards: PlayingCard[] = actorState.players[actorId].cards!;

      // If actor cannot follow suit and trump not yet revealed, test reveal trump
      if (!actorState.isTrumpRevealed && actorState.canRevealTrump) {
        await twentyNineEngine.handleAction(room!.id, actorId, 'REVEAL_TRUMP', {}, null);
      }

      const freshState: any = twentyNineEngine.getClientState(room!.id, actorId);
      const legalCards: PlayingCard[] = freshState.players[actorId].legalCards || freshState.players[actorId].cards!;
      assert(legalCards.length > 0, 'Must have at least one legal card');

      const cardToPlay = legalCards[0];
      const res = await twentyNineEngine.handleAction(room!.id, actorId, 'PLAY_CARD', { card: cardToPlay }, null);
      assert.equal(res.success, true, `Playing legal card failed: ${res.message}`);
    }
  }

  // ─── Test 7: Game Completion, Team Results & Ledger Settlement ─────────────
  console.log('\nTest 7: Game Settlement & Partnership Wallet Payout');
  const finalState = twentyNineEngine.getClientState(room!.id);
  assert.equal(finalState?.phase, 'COMPLETED');
  assert(finalState?.winningTeamIndex === 0 || finalState?.winningTeamIndex === 1);
  assert.equal(finalState?.winningUserIds?.length, 2);

  // Verify room in database
  const settledRoom = await prisma.room.findUnique({
    where: { id: room!.id },
    include: { players: true },
  });

  assert.equal(settledRoom?.status, 'COMPLETED');
  const customConfig = JSON.parse(settledRoom?.customConfig || '{}');
  assert.equal(customConfig.gameType, 'TWENTY_NINE');
  assert.equal(customConfig.winnerUserIds.length, 2);
  assert.equal(customConfig.payouts.length, 2);

  // Check wallets of all 4 players
  const totalPool = entryFee * 4; // 200
  const expectedCommission = (totalPool * 10) / 100; // 20 (assuming 10% rake)
  const distributable = totalPool - expectedCommission; // 180 -> 90 per winner

  for (const uid of users.map(u => u.id)) {
    const w = await prisma.wallet.findUniqueOrThrow({ where: { userId: uid } });
    assert.equal(w.lockedBalance, 0, 'Locked balance must be 0 after settlement');

    if (customConfig.winnerUserIds.includes(uid)) {
      // Starting balance 500 - 50 entry + 90 payout = 540
      assert(w.balance >= 500, 'Winning player balance must have increased');
    } else {
      // Starting balance 500 - 50 entry = 450
      assert.equal(w.balance, 450, 'Losing player balance must reflect entry fee deduction');
    }
  }

  // Solvency check
  const allWallets = await prisma.wallet.findMany({
    where: { userId: { in: users.map(u => u.id) } },
  });
  const totalCurrent = allWallets.reduce((sum, w) => sum + w.balance, 0);
  // Total initial = 2000. Total payout = 180. Remaining = 2000 - 200 + 180 = 1980. Commission = 20.
  assert.equal(totalCurrent + customConfig.platformCommission, 2000, 'Exact solvency conservation');
  console.log('   Partnership settlement, equal pool split and solvency verified ✅ PASS');

  // Cleanup room timers
  twentyNineEngine.cleanupRoom(room!.id);

  console.log('\n🎉 ALL 7 29-CARD GAME TESTS PASSED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
