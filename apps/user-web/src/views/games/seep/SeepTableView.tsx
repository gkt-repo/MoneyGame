import React, { useEffect, useState } from 'react';
import { SeepCard, SeepGameState, SeepMove } from '@moneygame/shared-types';
import { RoomItem, UserProfile, userApi } from '../../../services/api';
import { connectSocket } from '../../../services/socket';
import './seep.css';

const suit = { SPADES: '♠', HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣' };
const cardPoints = (card: SeepCard) => card.suit === 'SPADES' ? card.rank === 14 ? 1 : card.rank : card.rank === 14 ? 1 : card.suit === 'DIAMONDS' && card.rank === 10 ? 6 : 0;

function Card({ card, selected, disabled, onClick, small = false, index = 0 }: { card: SeepCard; selected?: boolean; disabled?: boolean; onClick?: () => void; small?: boolean; index?: number }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={`${card.label} of ${card.suit.toLowerCase()}${selected ? ', selected' : ''}`} aria-pressed={onClick ? !!selected : undefined}
    className={`seep-card ${small ? 'seep-card-small' : ''} ${selected ? 'is-selected' : ''} ${['HEARTS', 'DIAMONDS'].includes(card.suit) ? 'is-red' : ''}`}
    style={{ '--deal-delay': `${index * 35}ms` } as React.CSSProperties}>
    <span className="seep-card-corner">{card.label}<span>{suit[card.suit]}</span></span>
    <span className="seep-card-pip">{suit[card.suit]}</span>
    <span className="seep-card-bottom">{card.label} {suit[card.suit]}</span>
  </button>;
}

export function SeepTableView({ room, user, onRefreshBalance }: { room: RoomItem; user: UserProfile; onRefreshBalance: () => void }) {
  const [state, setState] = useState<SeepGameState | null>(room.gameState as SeepGameState || null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<SeepMove | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rules, setRules] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [inspect, setInspect] = useState<string | null>(null);
  const accept = (incoming: SeepGameState) => {
    if (incoming?.roomId !== room.id) return;
    setState(previous => previous && incoming.sequence < previous.sequence ? previous : incoming);
  };
  const refresh = async () => {
    const data = await userApi.getRoomDetails(room.id);
    if (data.gameState) accept(data.gameState as SeepGameState);
  };
  useEffect(() => {
    const socket = connectSocket();
    const onState = (incoming: SeepGameState) => accept(incoming);
    const onConnect = () => { socket.emit('join_room_channel', room.id); void refresh().catch(() => {}); };
    socket.on('seep_state', onState);
    socket.on('connect', onConnect);
    onConnect();
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    const poll = window.setInterval(() => { void refresh().catch(() => {}); }, 4000);
    return () => { socket.off('seep_state', onState); socket.off('connect', onConnect); window.clearInterval(tick); window.clearInterval(poll); socket.disconnect(); };
  }, [room.id, user.id]);
  useEffect(() => { setSelected(null); setPreview(null); setInspect(null); }, [state?.sequence]);
  useEffect(() => { if (state?.phase === 'COMPLETED') onRefreshBalance(); }, [state?.phase]);
  const act = async (action: string, payload: object) => {
    if (busy || !state) return;
    setBusy(true); setError('');
    try {
      const response = await userApi.sendGameAction(room.id, action, { ...payload, expectedSequence: state.sequence, actionId: crypto.randomUUID() });
      if (response.success === false) throw new Error(response.message || 'Unable to play');
      if (response.gameState) accept(response.gameState);
      else await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Connection lost. Try again.'); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  };
  if (!state) return <div className="seep-shell seep-connecting">Dealing your table…</div>;
  const me = state.players[user.id];
  const myTeam = me?.teamIndex ?? 0;
  const myTurn = state.currentTurnUserId === user.id;
  const players = Object.values(state.players).sort((a, b) => a.seatIndex - b.seatIndex);
  const active = state.players[state.currentTurnUserId || ''];
  const seconds = state.turnExpiresAt ? Math.max(0, Math.ceil((state.turnExpiresAt - now) / 1000)) : 0;
  const moves = (state.legalMoves || []).filter(m => m.cardId === selected);
  const highlighted = new Set(preview?.floorIds || []);
  const completed = state.phase === 'COMPLETED';
  const hand = [...(me?.cards || [])].sort((a, b) => (a.rank === 14 ? 1 : a.rank) - (b.rank === 14 ? 1 : b.rank) || a.suit.localeCompare(b.suit));
  const inspected = state.floor.find(i => i.id === inspect);
  return <section className="seep-shell" aria-label="Seep card table">
    <header className="seep-topbar"><div><span className="seep-eyebrow">THE CLASSIC CARD CLUB</span><h1>SEEP <span>♠</span></h1></div><div className="seep-table-meta"><span>{state.maxPlayers === 4 ? 'PARTNERS · 2 vs 2' : 'HEAD TO HEAD'}</span><button onClick={() => setRules(true)} aria-label="Read Seep rules">How to play ↗</button></div></header>
    <div className="seep-scoreboard">{[myTeam, 1 - myTeam].map((team, index) => <div key={team}><span className={index === 0 ? 'seep-team-dot' : 'seep-team-dot opponent'} /> <div><b>{me ? index === 0 ? 'Your side' : 'Opponents' : `Team ${team === 0 ? 'A' : 'B'}`}</b><small>{state.teams[team].cardPoints} cards + {state.teams[team].sweepPoints} sweeps</small></div><strong>{state.teams[team].points}</strong></div>)}</div>
    <div className="seep-arena">
      <div className="seep-rail" /><div className="seep-felt"><div className="seep-felt-brand">SEEP<span>BUILD · CAPTURE · SWEEP</span></div></div>
      {players.map(p => {
        const relative = (p.seatIndex - (me?.seatIndex ?? 0) + state.maxPlayers) % state.maxPlayers;
        const position = state.maxPlayers === 2 ? relative === 0 ? 'south' : 'north' : ['south', 'east', 'north', 'west'][relative];
        const isActive = p.userId === state.currentTurnUserId;
        return <div className={`seep-seat seep-seat-${position} ${isActive ? 'active' : ''}`} key={p.userId}>
          <div className="seep-avatar">{p.username.slice(0, 1).toUpperCase()}{isActive && <span className={seconds <= 5 ? 'urgent' : ''}>{seconds}s</span>}</div>
          <b>{p.userId === user.id ? 'You' : p.username}</b><small>{p.teamIndex === myTeam && p.userId !== user.id && me ? 'PARTNER · ' : ''}{p.cardCount} cards</small>
          {p.userId !== user.id && <div className="seep-mini-hand">{Array.from({ length: Math.min(5, p.cardCount) }, (_, i) => <i key={i} style={{ transform: `rotate(${(i - 2) * 8}deg)` }}>♠</i>)}</div>}
        </div>;
      })}
      <div className="seep-floor" aria-label="Cards on the floor">
        {state.phase === 'BIDDING' ? <div className="seep-opening"><div className="seep-card-back">♠</div><b>The opening bid</b><p>{myTurn ? 'Choose 9–13 from your four cards. The floor is revealed after your bid.' : `${active?.username || 'The bidder'} is choosing the opening value.`}</p></div> : !state.floor.length ? <p className="seep-empty">{completed ? 'All cards counted' : state.phase === 'SETTLING' ? 'Counting the scores…' : 'A clean table. Make your move.'}</p> : state.floor.map((item, index) => <div key={item.id} className={`seep-floor-item ${highlighted.has(item.id) ? 'is-target' : ''}`}>
          {item.isHouse ? <button className={`seep-house ${item.cemented ? 'cemented' : ''}`} onClick={() => setInspect(item.id)} aria-label={`Inspect ${item.value} ${item.cemented ? 'cemented' : 'open'} house, ${item.cards.length} cards`}>
            <span>{item.cemented ? '◆ PUKKA' : '⌂ HOUSE'}</span><strong>{item.value}</strong><small>{item.cards.length} cards · {item.cards.reduce((n, c) => n + cardPoints(c), 0)} pts</small><i>{item.owners.some(id => state.players[id]?.teamIndex === myTeam) ? 'Your side' : 'Other side'}</i>
          </button> : <Card card={item.cards[0]} small index={index} />}
        </div>)}
      </div>
      {state.lastMove && <div key={state.lastMove.sequence} className={`seep-play-flash ${state.lastMove.sweep ? 'is-sweep' : ''}`} aria-live="polite">
        {state.lastMove.sweep ? <><strong>SEEP!</strong><span>+{state.lastMove.sweep} sweep points</span></> : <><span>{state.players[state.lastMove.userId]?.username}</span><b>{state.lastMove.card.label}{suit[state.lastMove.card.suit]} · {state.lastMove.label}</b></>}
      </div>}
      {state.lastMove && (() => {
        const actor = state.players[state.lastMove.userId];
        const relative = ((actor?.seatIndex ?? 0) - (me?.seatIndex ?? 0) + state.maxPlayers) % state.maxPlayers;
        const direction = state.maxPlayers === 2 ? relative === 0 ? [0, 140] : [0, -140] : [[0, 140], [160, 0], [0, -140], [-160, 0]][relative];
        return <div key={`flight-${state.lastMove.sequence}`} aria-hidden="true" className={`seep-card-flight ${state.lastMove.type === 'CAPTURE' ? 'capturing' : 'playing'}`} style={{ '--flight-x': `${direction[0]}px`, '--flight-y': `${direction[1]}px` } as React.CSSProperties}><Card card={state.lastMove.card} small /></div>;
      })()}
      <div className="seep-deal-info">DEAL {state.dealNumber}{state.maxPlayers === 2 ? ' / 2' : ' / 1'} · {state.stockCount} in stock{state.bid && ` · Bid ${state.bid}`}</div>
    </div>
    <div className="seep-bottom">
      {completed ? <div className="seep-result" role="status"><span>♛</span><h2>{state.winningTeamIndex == null ? 'Honours even' : state.winningUserIds?.includes(user.id) ? 'Beautifully played. You win!' : 'The other side takes it'}</h2><p>{state.explanation}</p>{state.payouts?.find(p => p.userId === user.id) && <b>₹{state.payouts.find(p => p.userId === user.id)!.amount.toFixed(2)} credited to your wallet</b>}</div> : <>
        <div className="seep-turn-status"><span className={myTurn ? 'live' : ''} />{state.phase === 'SETTLING' ? 'Confirming the result…' : myTurn ? state.phase === 'BIDDING' ? 'Your bid · choose an opening value' : 'Your turn · select a card, then a move' : `${active?.username || 'Player'}’s turn`}{state.turnExpiresAt && <b>{seconds}s</b>}</div>
        <div className="seep-hand" aria-label="Your hand">{hand.map((card, index) => <Card key={`${state.dealNumber}-${card.id}`} card={card} index={index} selected={selected === card.id} disabled={!myTurn || busy || state.phase !== 'PLAYING'} onClick={() => { setSelected(card.id); setPreview(null); }} />)}</div>
        {state.phase === 'BIDDING' && myTurn && <div className="seep-bid-actions">{state.bidOptions?.map(bid => <button disabled={busy} key={bid} onClick={() => void act('BID', { bid })}>Bid {bid}</button>)}</div>}
        {myTurn && state.phase === 'PLAYING' && <div className="seep-actions">{!selected ? <span>Select a card to see its legal moves</span> : !moves.length ? <span>Keep this card to collect your house. Choose another card.</span> : <><div className="seep-move-options">{moves.map(move => <button key={move.id} className={preview?.id === move.id ? 'chosen' : ''} onClick={() => setPreview(move)}>{move.label}{move.floorIds.length > 0 && <small>{move.floorIds.map(id => { const i = state.floor.find(item => item.id === id); return i?.isHouse ? `House ${i.value}` : `${i?.cards[0].label}${i ? suit[i.cards[0].suit] : ''}`; }).join(' + ')}</small>}</button>)}</div><button className="seep-confirm" disabled={!preview || busy} onClick={() => preview && void act('PLAY_MOVE', { moveId: preview.id })}>{busy ? 'Playing…' : preview ? `Play · ${preview.label}` : 'Choose your move'}</button></>}</div>}
      </>}
      {error && <p className="seep-error" role="alert">{error}</p>}
      <footer>♠ Spades score their value · Aces 1 · 10♦ 6 <span>₹{room.entryFee} entry · ₹{room.entryFee * room.maxPlayers} total pool before commission</span></footer>
    </div>
    {(rules || inspected) && <div className="seep-modal-backdrop" onClick={() => { setRules(false); setInspect(null); }}><section className="seep-modal" role="dialog" aria-modal="true" aria-label={rules ? 'Seep rules' : 'House cards'} onClick={event => event.stopPropagation()}><button className="seep-close" autoFocus onClick={() => { setRules(false); setInspect(null); }}>Close ✕</button>{rules ? <><span className="seep-eyebrow">SEEP · SINGLE DEAL</span><h2>A little strategy. A big sweep.</h2><p>Play one card per turn. Ace = 1, Jack = 11, Queen = 12, King = 13. The opening bid must match one of the bidder’s first four cards (9–13); the first move builds or plays that value.</p><p><b>Capture:</b> Match a loose card, a sum of loose cards, or a house. All available disjoint matching sets are collected. Houses can only be captured at their own value.</p><p><b>Build:</b> Combine cards into a 9–13 house while keeping a matching card in your hand. Raise someone else’s open house with a hand card, or cement a matching set into a house. Pukka houses cannot be raised. You can add to your partner’s house using their reservation.</p><p><b>Score:</b> Spades score 1–13, the other aces 1 each, and 10♦ scores 6: 100 card points. Clearing the floor adds 50, the opening sweep adds 25, and the final play adds 0. Leftovers go to the last capturing side.</p><p>Two players receive two hands of 12. Four players receive one hand of 12, with partners opposite. Play moves counterclockwise. Highest score wins this single deal; a draw returns every entry without commission. Winners share the pool after platform commission. Turns last 30 seconds, then a legal move is played automatically.</p></> : <><h2>{inspected?.value} {inspected?.cemented ? 'pukka' : 'open'} house</h2><p>Owned by {inspected?.owners.map(id => state.players[id]?.username).join(' & ')}</p><div className="seep-inspect-cards">{inspected?.cards.map(card => <Card key={card.id} card={card} small />)}</div></>}</section></div>}
  </section>;
}
