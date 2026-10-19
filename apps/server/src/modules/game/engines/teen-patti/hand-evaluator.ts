import { PlayingCard, TeenPattiHandResult } from '@moneygame/shared-types';

/**
 * Pure Teen Patti 3-card hand evaluator
 */
export function evaluateTeenPattiHand(cards: PlayingCard[]): TeenPattiHandResult {
  if (!cards || cards.length !== 3) {
    throw new Error('Teen Patti requires exactly 3 cards to evaluate');
  }

  // Sort descending by rank (14 down to 2)
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const [c1, c2, c3] = sorted;

  const isFlush = c1.suit === c2.suit && c2.suit === c3.suit;

  // Check sequence:
  // Standard consecutive: (c1.rank === c2.rank + 1 && c2.rank === c3.rank + 1)
  // Ace-low consecutive: A-2-3 (c1.rank === 14 && c2.rank === 3 && c3.rank === 2)
  const isNormalSeq = c1.rank === c2.rank + 1 && c2.rank === c3.rank + 1;
  const isA23Seq = c1.rank === 14 && c2.rank === 3 && c3.rank === 2;
  const isSeq = isNormalSeq || isA23Seq;

  // Sequence strength: In traditional Teen Patti:
  // A-K-Q is highest (value 14)
  // A-2-3 is 2nd highest (value 13.5 -> treated as 13.5)
  // K-Q-J is 3rd (value 13) ... down to 4-3-2 (value 4)
  const getSeqStrength = () => {
    if (isA23Seq) return 135; // Between AKQ (140) and KQJ (130)
    return c1.rank * 10;
  };

  // 1. Trail / Trio (Three of a kind)
  if (c1.rank === c2.rank && c2.rank === c3.rank) {
    const score = 60000000 + c1.rank * 10000;
    return {
      type: 'TRAIL',
      score,
      description: `Trail of ${c1.label}'s`,
      sortedCards: sorted,
    };
  }

  // 2. Pure Sequence (Straight Flush)
  if (isSeq && isFlush) {
    const score = 50000000 + getSeqStrength() * 10000;
    const label = isA23Seq ? 'A-2-3' : `${c1.label}-${c2.label}-${c3.label}`;
    return {
      type: 'PURE_SEQUENCE',
      score,
      description: `Pure Sequence (${label})`,
      sortedCards: sorted,
    };
  }

  // 3. Normal Sequence (Straight / Run)
  if (isSeq) {
    const score = 40000000 + getSeqStrength() * 10000;
    const label = isA23Seq ? 'A-2-3' : `${c1.label}-${c2.label}-${c3.label}`;
    return {
      type: 'SEQUENCE',
      score,
      description: `Sequence (${label})`,
      sortedCards: sorted,
    };
  }

  // 4. Color (Flush)
  if (isFlush) {
    const score = 30000000 + c1.rank * 10000 + c2.rank * 100 + c3.rank;
    return {
      type: 'COLOR',
      score,
      description: `Color (${c1.suit} ${c1.label} High)`,
      sortedCards: sorted,
    };
  }

  // 5. Pair
  if (c1.rank === c2.rank || c2.rank === c3.rank || c1.rank === c3.rank) {
    let pairRank: number;
    let kickerRank: number;
    let pairLabel: string;

    if (c1.rank === c2.rank) {
      pairRank = c1.rank;
      kickerRank = c3.rank;
      pairLabel = c1.label;
    } else if (c2.rank === c3.rank) {
      pairRank = c2.rank;
      kickerRank = c1.rank;
      pairLabel = c2.label;
    } else {
      pairRank = c1.rank;
      kickerRank = c2.rank;
      pairLabel = c1.label;
    }

    const score = 20000000 + pairRank * 10000 + kickerRank * 100;
    return {
      type: 'PAIR',
      score,
      description: `Pair of ${pairLabel}'s (${RANK_LABEL(kickerRank)} kicker)`,
      sortedCards: sorted,
    };
  }

  // 6. High Card
  const score = 10000000 + c1.rank * 10000 + c2.rank * 100 + c3.rank;
  return {
    type: 'HIGH_CARD',
    score,
    description: `High Card (${c1.label})`,
    sortedCards: sorted,
  };
}

function RANK_LABEL(rank: number): string {
  const map: Record<number, string> = {
    14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10',
    9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2',
  };
  return map[rank] || String(rank);
}
