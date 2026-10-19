import './test-env';
import express from 'express';
import { evaluateTeenPattiHand } from '../src/modules/game/engines/teen-patti/hand-evaluator';
import { createDeck, shuffleDeck } from '../src/modules/game/engines/teen-patti/deck';
import { PlayingCard } from '@moneygame/shared-types';
import { prisma } from '../src/db';
import { walletService } from '../src/modules/wallet/wallet.service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log('🧪 Starting Teen Patti Unit Tests...\n');

  // Test 1: Deck creation & shuffle
  const deck = createDeck();
  assert(deck.length === 52, 'Deck should contain 52 cards');
  const shuffled = shuffleDeck(deck);
  assert(shuffled.length === 52, 'Shuffled deck must preserve 52 cards');
  const uniqueKeys = new Set(shuffled.map(c => `${c.suit}-${c.rank}`));
  assert(uniqueKeys.size === 52, 'All cards in shuffled deck must be unique');
  console.log('Test 1: Deck creation & Fisher-Yates shuffle ✅ PASS');

  // Test 2: Trail / Trio (AAA > KKK > 222)
  const aaa: PlayingCard[] = [
    { suit: 'SPADES', rank: 14, label: 'A' },
    { suit: 'HEARTS', rank: 14, label: 'A' },
    { suit: 'DIAMONDS', rank: 14, label: 'A' },
  ];
  const kkk: PlayingCard[] = [
    { suit: 'SPADES', rank: 13, label: 'K' },
    { suit: 'HEARTS', rank: 13, label: 'K' },
    { suit: 'CLUBS', rank: 13, label: 'K' },
  ];
  const two22: PlayingCard[] = [
    { suit: 'SPADES', rank: 2, label: '2' },
    { suit: 'HEARTS', rank: 2, label: '2' },
    { suit: 'CLUBS', rank: 2, label: '2' },
  ];

  const resA = evaluateTeenPattiHand(aaa);
  const resK = evaluateTeenPattiHand(kkk);
  const res2 = evaluateTeenPattiHand(two22);

  assert(resA.type === 'TRAIL', 'AAA must be TRAIL');
  assert(resK.type === 'TRAIL', 'KKK must be TRAIL');
  assert(res2.type === 'TRAIL', '222 must be TRAIL');
  assert(resA.score > resK.score, 'AAA must beat KKK');
  assert(resK.score > res2.score, 'KKK must beat 222');
  console.log('Test 2: Trail evaluation and ranking ✅ PASS');

  // Test 3: Pure Sequence (Straight Flush) with A-2-3 rule
  const akqPure: PlayingCard[] = [
    { suit: 'HEARTS', rank: 14, label: 'A' },
    { suit: 'HEARTS', rank: 13, label: 'K' },
    { suit: 'HEARTS', rank: 12, label: 'Q' },
  ];
  const a23Pure: PlayingCard[] = [
    { suit: 'HEARTS', rank: 14, label: 'A' },
    { suit: 'HEARTS', rank: 3, label: '3' },
    { suit: 'HEARTS', rank: 2, label: '2' },
  ];
  const kqjPure: PlayingCard[] = [
    { suit: 'HEARTS', rank: 13, label: 'K' },
    { suit: 'HEARTS', rank: 12, label: 'Q' },
    { suit: 'HEARTS', rank: 11, label: 'J' },
  ];

  const rAKQ = evaluateTeenPattiHand(akqPure);
  const rA23 = evaluateTeenPattiHand(a23Pure);
  const rKQJ = evaluateTeenPattiHand(kqjPure);

  assert(rAKQ.type === 'PURE_SEQUENCE', 'AKQ must be PURE_SEQUENCE');
  assert(rA23.type === 'PURE_SEQUENCE', 'A23 must be PURE_SEQUENCE');
  assert(rAKQ.score > rA23.score, 'AKQ must beat A23');
  assert(rA23.score > rKQJ.score, 'A23 must beat KQJ in traditional Teen Patti');
  console.log('Test 3: Pure sequence and A-2-3 rule ✅ PASS');

  // Test 4: Overall hierarchy
  const trail: PlayingCard[] = [
    { suit: 'SPADES', rank: 2, label: '2' },
    { suit: 'HEARTS', rank: 2, label: '2' },
    { suit: 'DIAMONDS', rank: 2, label: '2' },
  ];
  const pureSeq: PlayingCard[] = [
    { suit: 'SPADES', rank: 14, label: 'A' },
    { suit: 'SPADES', rank: 13, label: 'K' },
    { suit: 'SPADES', rank: 12, label: 'Q' },
  ];
  const normalSeq: PlayingCard[] = [
    { suit: 'SPADES', rank: 14, label: 'A' },
    { suit: 'HEARTS', rank: 13, label: 'K' },
    { suit: 'CLUBS', rank: 12, label: 'Q' },
  ];
  const color: PlayingCard[] = [
    { suit: 'DIAMONDS', rank: 14, label: 'A' },
    { suit: 'DIAMONDS', rank: 10, label: '10' },
    { suit: 'DIAMONDS', rank: 4, label: '4' },
  ];
  const pair: PlayingCard[] = [
    { suit: 'SPADES', rank: 14, label: 'A' },
    { suit: 'CLUBS', rank: 14, label: 'A' },
    { suit: 'HEARTS', rank: 9, label: '9' },
  ];
  const highCard: PlayingCard[] = [
    { suit: 'SPADES', rank: 14, label: 'A' },
    { suit: 'CLUBS', rank: 12, label: 'Q' },
    { suit: 'HEARTS', rank: 8, label: '8' },
  ];

  const sTrail = evaluateTeenPattiHand(trail).score;
  const sPure = evaluateTeenPattiHand(pureSeq).score;
  const sSeq = evaluateTeenPattiHand(normalSeq).score;
  const sColor = evaluateTeenPattiHand(color).score;
  const sPair = evaluateTeenPattiHand(pair).score;
  const sHigh = evaluateTeenPattiHand(highCard).score;

  assert(sTrail > sPure, 'Trail beats Pure Sequence');
  assert(sPure > sSeq, 'Pure Sequence beats Normal Sequence');
  assert(sSeq > sColor, 'Sequence beats Color (Flush)');
  assert(sColor > sPair, 'Color beats Pair');
  assert(sPair > sHigh, 'Pair beats High Card');
  console.log('Test 4: Complete hand hierarchy (Trail > Pure > Seq > Color > Pair > High) ✅ PASS');

  // Test 5: Real-time game bet deduction & balance locking
  const testUser = await prisma.user.create({
    data: {
      username: `tp_bettor_${Date.now()}`,
      phone: `999${Math.floor(1000000 + Math.random() * 9000000)}`,
      passwordHash: 'dummy',
      wallet: {
        create: {
          balance: 100.0,
          lockedBalance: 0.0,
        },
      },
    },
    include: { wallet: true },
  });

  const roomId = 'test_room_chaal_1';
  // 1. Lock a chaal bet of 20
  const afterChaal1 = await walletService.lockGameBet(testUser.id, roomId, 20.0, 'CHAAL');
  assert(Math.abs(afterChaal1.balance - 80.0) < 0.001, 'Available balance should reduce from 100 to 80');
  assert(Math.abs(afterChaal1.lockedBalance - 20.0) < 0.001, 'Locked balance should increase from 0 to 20');

  // 2. Attempt bet exceeding available balance
  let caughtError = false;
  try {
    await walletService.lockGameBet(testUser.id, roomId, 150.0, 'CHAAL');
  } catch (err: any) {
    caughtError = true;
    assert(err.message.includes('Insufficient balance'), 'Must throw Insufficient balance error');
  }
  assert(caughtError, 'Should have thrown error on insufficient balance');

  // 3. Lock another bet of 30
  const afterChaal2 = await walletService.lockGameBet(testUser.id, roomId, 30.0, 'BLIND');
  assert(Math.abs(afterChaal2.balance - 50.0) < 0.001, 'Available balance should reduce from 80 to 50');
  assert(Math.abs(afterChaal2.lockedBalance - 50.0) < 0.001, 'Locked balance should increase from 20 to 50');

  // 4. Verify transaction ledger entries
  const txs = await prisma.transaction.findMany({
    where: { userId: testUser.id, type: 'ROOM_BET' },
  });
  assert(txs.length === 2, 'Should have 2 ROOM_BET transaction records');
  assert(txs[0].amount === -20.0, 'First transaction should be -20.0');
  assert(txs[1].amount === -30.0, 'Second transaction should be -30.0');

  console.log('Test 5: Real-time game bet deduction & balance locking ✅ PASS');

  console.log('\n🎉 ALL TEEN PATTI UNIT TESTS PASSED SUCCESSFULLY!\n');
}

run().catch(err => {
  console.error('❌ FAIL:', err.message);
  process.exit(1);
});
