import crypto from 'crypto';
import { CardSuit, PlayingCard } from '@moneygame/shared-types';

export const TWENTY_NINE_SUITS: CardSuit[] = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];

export const TWENTY_NINE_RANKS: { label: string; rank: number; points: number; power: number }[] = [
  { label: 'J', rank: 11, points: 3, power: 8 },
  { label: '9', rank: 9, points: 2, power: 7 },
  { label: 'A', rank: 14, points: 1, power: 6 },
  { label: '10', rank: 10, points: 1, power: 5 },
  { label: 'K', rank: 13, points: 0, power: 4 },
  { label: 'Q', rank: 12, points: 0, power: 3 },
  { label: '8', rank: 8, points: 0, power: 2 },
  { label: '7', rank: 7, points: 0, power: 1 },
];

export function getCardPoints(card: PlayingCard): number {
  const match = TWENTY_NINE_RANKS.find(r => r.label === card.label || r.rank === card.rank);
  return match ? match.points : 0;
}

export function getCardPower(card: PlayingCard): number {
  const match = TWENTY_NINE_RANKS.find(r => r.label === card.label || r.rank === card.rank);
  return match ? match.power : 0;
}

export function createTwentyNineDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (const suit of TWENTY_NINE_SUITS) {
    for (const r of TWENTY_NINE_RANKS) {
      deck.push({
        suit,
        rank: r.rank,
        label: r.label,
      });
    }
  }
  return deck;
}

/**
 * Cryptographically secure Fisher-Yates shuffle
 */
export function shuffleDeck(deck: PlayingCard[]): PlayingCard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Compare two cards of the same suit in 29: returns > 0 if cardA is higher than cardB
 */
export function compareCards(cardA: PlayingCard, cardB: PlayingCard): number {
  return getCardPower(cardA) - getCardPower(cardB);
}
