import { randomInt } from 'crypto';
import { SeepCard, SeepFloorItem, SeepGameState, SeepMove, SeepPlayer } from '@moneygame/shared-types';

export interface SeepInternal extends Omit<SeepGameState, 'players'> {
  players: Record<string, SeepPlayer & { cards: SeepCard[] }>;
  stock: SeepCard[];
  order: string[];
  entryFee: number;
  turnsPlayed: number;
  lastCaptureTeam: number | null;
  captured: SeepCard[][];
  recentActions: Array<{ id: string; userId: string }>;
}

export const value = (c: SeepCard) => c.rank === 14 ? 1 : c.rank;
export const points = (c: SeepCard) => c.suit === 'SPADES' ? value(c) : value(c) === 1 ? 1 : c.suit === 'DIAMONDS' && c.rank === 10 ? 6 : 0;
export const loose = (card: SeepCard): SeepFloorItem => ({ id: card.id, value: value(card), cards: [card], isHouse: false, cemented: false, owners: [] });

export function deck(): SeepCard[] {
  const cards: SeepCard[] = [];
  for (const suit of ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'] as const) {
    for (let rank = 2; rank <= 14; rank++) cards.push({ id: `${suit}-${rank}`, suit, rank, label: ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] || String(rank) });
  }
  for (let i = cards.length - 1; i > 0; i--) { const j = randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}

export function createGame(roomId: string, entryFee: number, players: Array<{ userId: string; seatIndex: number; user?: { username: string } }>): SeepInternal {
  const sorted = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  let stock: SeepCard[];
  do { stock = deck(); } while (!stock.slice(0, 4).some(c => value(c) >= 9));
  const hands: SeepInternal['players'] = {};
  sorted.forEach(p => { hands[p.userId] = { userId: p.userId, username: p.user?.username || 'Player', seatIndex: p.seatIndex, teamIndex: p.seatIndex % 2, cards: [], cardCount: 0 }; });
  hands[sorted[0].userId].cards = stock.splice(0, 4);
  hands[sorted[0].userId].cardCount = 4;
  return {
    roomId, entryFee, sequence: 0, rulesVersion: 'seep-single-deal-v1', phase: 'BIDDING', maxPlayers: sorted.length,
    currentTurnUserId: sorted[0].userId, turnExpiresAt: null, bid: null, dealNumber: 1, stockCount: stock.length,
    floor: [], players: hands, stock, order: sorted.map(p => p.userId), turnsPlayed: 0, lastCaptureTeam: null,
    captured: [[], []], recentActions: [], teams: [0, 1].map(() => ({ points: 0, cardPoints: 0, sweepPoints: 0, capturedCount: 0, sweeps: 0 })),
  };
}

/** All disjoint loose-card subsets with a particular capture value. Houses never participate in sums. */
function subsets(items: SeepFloorItem[], target: number): SeepFloorItem[][] {
  const result: SeepFloorItem[][] = [];
  function visit(start: number, remaining: number, chosen: SeepFloorItem[]) {
    if (remaining === 0) { result.push(chosen); return; }
    for (let i = start; i < items.length; i++) if (items[i].value <= remaining) visit(i + 1, remaining - items[i].value, [...chosen, items[i]]);
  }
  if (target >= 0) visit(0, target, []);
  return result;
}

/** Enumerate maximal captures, including alternative overlapping sums, with memoized floor subsets. */
function captures(floor: SeepFloorItem[], target: number): SeepFloorItem[][] {
  const houses = floor.filter(i => i.isHouse && i.value === target);
  const groups = subsets(floor.filter(i => !i.isHouse), target).filter(g => g.length);
  if (!groups.length) return houses.length ? [houses] : [];
  const results = new Map<string, SeepFloorItem[]>();
  const visited = new Set<string>();
  const visit = (selected: SeepFloorItem[]) => {
    const ids = new Set(selected.map(i => i.id));
    const key = [...ids].sort().join(',');
    if (visited.has(key)) return;
    visited.add(key);
    const available = groups.filter(g => g.every(i => !ids.has(i.id)));
    if (!available.length) { results.set(key, [...houses, ...selected]); return; }
    for (const group of available) visit([...selected, ...group]);
  };
  visit([]);
  return [...results.values()];
}

function makeMove(type: SeepMove['type'], card: SeepCard, items: SeepFloorItem[], houseValue?: number): SeepMove {
  const floorIds = items.map(i => i.id).sort();
  return { id: `${type}:${card.id}:${houseValue || 0}:${floorIds.join(',')}`, type, cardId: card.id, floorIds, houseValue,
    label: type === 'CAPTURE' ? `Capture ${items.reduce((n, i) => n + i.cards.length, 0)} cards` : type === 'BUILD' ? `${items.some(i => i.isHouse && i.value === houseValue) ? 'Cement' : items.some(i => i.isHouse) ? 'Raise' : 'Build'} ${houseValue} house` : 'Throw loose' };
}

export function legalMoves(game: SeepInternal, uid: string): SeepMove[] {
  if (game.phase !== 'PLAYING' || game.currentTurnUserId !== uid) return [];
  const player = game.players[uid];
  if (!player) return [];
  const result = new Map<string, SeepMove>();
  const add = (move: SeepMove) => {
    if (game.turnsPlayed === 0 && (move.type === 'BUILD' ? move.houseValue !== game.bid : value(player.cards.find(c => c.id === move.cardId)!) !== game.bid)) return;
    // Every owner must retain a matching card for every house still on the floor.
    const remaining = player.cards.filter(c => c.id !== move.cardId);
    if (game.floor.some(i => i.isHouse && i.owners.includes(uid) && !move.floorIds.includes(i.id) && !remaining.some(c => value(c) === i.value))) return;
    result.set(move.id, move);
  };
  for (const card of player.cards) {
    const v = value(card);
    const takes = captures(game.floor, v);
    takes.forEach(items => add(makeMove('CAPTURE', card, items)));
    if (!takes.length) add(makeMove('THROW', card, []));
    for (let target = 9; target <= 13; target++) {
      const existing = game.floor.find(i => i.isHouse && i.value === target);
      const partnerOwns = existing?.owners.some(owner => owner !== uid && game.players[owner].teamIndex === player.teamIndex);
      const retains = player.cards.some(c => c.id !== card.id && value(c) === target);
      if (!retains && !partnerOwns) continue;
      const seeds = subsets(game.floor.filter(i => !i.isHouse), target - v).filter(g => g.length || existing);
      // A matching card plus a matching loose card creates a cemented house directly.
      if (v === target && !existing) for (const g of subsets(game.floor.filter(i => !i.isHouse), target)) seeds.push(g);
      // Raise only someone else's uncemented house, using exactly the hand card.
      for (const h of game.floor.filter(i => i.isHouse && !i.cemented && !i.owners.includes(uid) && i.value + v === target)) seeds.push([h]);
      for (const seed of seeds) {
        const ids = new Set(seed.map(i => i.id));
        if (existing) ids.add(existing.id);
        const rest = game.floor.filter(i => !ids.has(i.id) && !i.isHouse);
        // All additional matching sets automatically cement into the new house.
        const extras = captures(rest, target);
        for (const extra of extras.length ? extras : [[]]) {
          const items = [...game.floor.filter(i => ids.has(i.id)), ...extra];
          if (!items.length) continue;
          // Partner's reservation only applies when adding to their existing house.
          if (!retains && !existing) continue;
          add(makeMove('BUILD', card, items, target));
        }
      }
    }
  }
  return [...result.values()];
}

export function bidOptions(game: SeepInternal): number[] {
  return [...new Set(game.players[game.currentTurnUserId!]?.cards.map(value).filter(v => v >= 9))].sort((a, b) => a - b);
}

function score(game: SeepInternal) {
  game.teams.forEach((team, index) => {
    team.cardPoints = game.captured[index].reduce((n, c) => n + points(c), 0);
    team.capturedCount = game.captured[index].length;
    team.points = team.cardPoints + team.sweepPoints;
  });
  game.stockCount = game.stock.length;
  Object.values(game.players).forEach(p => { p.cardCount = p.cards.length; });
}

export function applyBid(game: SeepInternal, bid: number) {
  if (game.phase !== 'BIDDING' || !bidOptions(game).includes(bid)) throw new Error('Choose a bid from 9–13 matching your opening hand');
  game.bid = bid;
  game.floor = game.stock.splice(0, 4).map(loose);
  game.phase = 'PLAYING';
  score(game);
}

export function applyMove(game: SeepInternal, move: SeepMove) {
  const uid = game.currentTurnUserId!;
  const p = game.players[uid];
  const card = p.cards.find(c => c.id === move.cardId)!;
  const selected = game.floor.filter(i => move.floorIds.includes(i.id));
  p.cards = p.cards.filter(c => c.id !== card.id);
  game.floor = game.floor.filter(i => !move.floorIds.includes(i.id));
  let sweep = 0;
  if (move.type === 'CAPTURE') {
    game.captured[p.teamIndex].push(card, ...selected.flatMap(i => i.cards));
    game.lastCaptureTeam = p.teamIndex;
    if (!game.floor.length) {
      sweep = game.turnsPlayed === 47 ? 0 : game.turnsPlayed === 0 ? 25 : 50;
      game.teams[p.teamIndex].sweepPoints += sweep;
      if (sweep) game.teams[p.teamIndex].sweeps++;
    }
  } else if (move.type === 'BUILD') {
    const target = move.houseValue!;
    const previous = selected.find(i => i.isHouse && i.value === target);
    const partnerOwns = previous?.owners.some(owner => owner !== uid && game.players[owner].teamIndex === p.teamIndex);
    const owners = [...new Set([...(previous?.owners || []), ...(partnerOwns ? [] : [uid])])];
    const cards = [card, ...selected.flatMap(i => i.cards)];
    game.floor.push({ id: `house-${game.sequence + 1}`, value: target, cards, isHouse: true,
      cemented: cards.reduce((n, c) => n + value(c), 0) > target, owners });
  } else game.floor.push(loose(card));
  game.lastMove = { sequence: game.sequence + 1, userId: uid, card, type: move.type, floorIds: move.floorIds, cards: selected.flatMap(i => i.cards), sweep, label: move.label };
  game.turnsPlayed++;
  if (game.turnsPlayed === 1) {
    // Finish the opening deal only after the bidder has played from their four cards.
    p.cards.push(...game.stock.splice(0, 8));
    for (const other of game.order.filter(id => id !== uid)) game.players[other].cards.push(...game.stock.splice(0, 12));
  }
  if (game.maxPlayers === 2 && game.turnsPlayed === 24) {
    game.dealNumber = 2;
    for (const id of game.order) game.players[id].cards.push(...game.stock.splice(0, 12));
  }
  if (game.turnsPlayed === 48) {
    // The last capturing side receives leftovers without a sweep bonus.
    game.captured[game.lastCaptureTeam ?? p.teamIndex].push(...game.floor.flatMap(i => i.cards));
    game.floor = [];
    game.phase = 'SETTLING'; game.currentTurnUserId = null; game.turnExpiresAt = null;
  } else {
    game.currentTurnUserId = game.order[(game.order.indexOf(uid) + game.order.length - 1) % game.order.length];
  }
  score(game);
}

export function clientState(game: SeepInternal, uid?: string): SeepGameState {
  const { stock, order, entryFee, turnsPlayed, lastCaptureTeam, captured, recentActions, ...state } = game;
  const safe = structuredClone(state) as SeepGameState;
  for (const player of Object.values(safe.players)) if (player.userId !== uid) delete player.cards;
  if (uid === game.currentTurnUserId) {
    safe.legalMoves = legalMoves(game, uid);
    if (game.phase === 'BIDDING') safe.bidOptions = bidOptions(game);
  }
  return safe;
}
