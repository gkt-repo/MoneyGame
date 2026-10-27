import React, { useEffect, useState } from 'react';
import { UserProfileDTO } from '@moneygame/shared-types';
import { userApi, UserProfile, TransactionItem } from '../services/api';
import { AVATAR_ICONS } from '../components/ProfileModal';
import { ArrowLeft, ArrowRight, Bell, LogOut, Pencil, ReceiptText, HelpCircle } from 'lucide-react';

export const PersonalProfileView: React.FC<{
  user: UserProfile; balance: number; lockedBalance: number; version: string;
  onBack: () => void; onEdit: () => void; onDeposit: () => void; onWithdraw: () => void;
  onHistory: () => void; onNotifications: () => void; onSupport: () => void; onLogout: () => void;
}> = ({user, balance, lockedBalance, version, onBack, onEdit, onDeposit, onWithdraw, onHistory, onNotifications, onSupport, onLogout}) => {
  const [profile, setProfile] = useState<UserProfileDTO | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => { let live = true; setError(''); userApi.getUserProfile().then(p => {if (live) setProfile(p);}).catch(() => {if (live) setError('Could not load profile details.');}); return () => {live = false;}; }, [user.id, version, retry]);
  const fields = [['Email', user.email || 'Not provided'], ['Phone', user.phone || 'Not provided'], ['Account ID', user.id], ['Status', user.status], ['Role', user.role], ['Member since', profile ? new Date(profile.createdAt).toLocaleDateString() : '—']];
  return <section className="personal-profile">
    <div className="profile-page-heading"><button onClick={onBack} aria-label="Back to tables"><ArrowLeft size={20}/></button><h1>My profile</h1><button onClick={onEdit} aria-label="Edit profile"><Pencil size={18}/></button></div>
    <div className="profile-identity"><span>{AVATAR_ICONS[user.avatar || 'avatar_1']}</span><div><h2>{user.displayName || user.username}</h2><p>@{user.username}</p></div></div>
    <div className="profile-balance"><span className="eyebrow">AVAILABLE BALANCE</span><strong>₹{balance.toFixed(2)}</strong><p>In play / reserved ₹{lockedBalance.toFixed(2)}</p><div><button onClick={onDeposit}>Deposit</button><button onClick={onWithdraw}>Withdraw</button></div></div>
    <button className="profile-menu-row" onClick={onHistory}><ReceiptText/><span><strong>Transaction history</strong><small>All deposits, withdrawals and game activity</small></span><ArrowRight size={18}/></button>
    <section className="profile-details"><h3 className="eyebrow">ACCOUNT DETAILS</h3>{fields.map(([label, value]) => <div key={label}><span>{label}</span><span>{value}</span></div>)}</section>
    {error && <p role="alert">{error} <button className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {profile && <section className="profile-results"><h3 className="eyebrow">YOUR GAME RECORD</h3><div className="profile-stats"><span><strong>{profile.stats.totalGames}</strong>played</span><span><strong>{profile.stats.totalWins}</strong>won</span><span><strong>{profile.stats.winRatePercent}%</strong>win rate</span></div>
      {Object.entries(profile.stats.byGame).map(([game, stats]) => <p key={game}>{game.replaceAll('_', ' ')} · {stats.played} played · {stats.won} won</p>)}
      <h3>Recent results</h3>{profile.recentGames.length === 0 && <p>Your completed games will appear here.</p>}
      {profile.recentGames.map(g => <div className="profile-result" key={g.roomId}><span>{g.gameType.replaceAll('_', ' ')}<small>#{g.roomCode} · {new Date(g.settledAt).toLocaleDateString()}</small></span><strong>{g.isWin ? `+₹${g.prize.toFixed(2)}` : 'Lost'}</strong></div>)}</section>}
    <button className="profile-menu-row" onClick={onNotifications}><Bell/><span>Notifications</span><ArrowRight size={18}/></button>
    <button className="profile-menu-row" onClick={onSupport}><HelpCircle/><span>Help & support</span><ArrowRight size={18}/></button>
    <button className="profile-menu-row" onClick={onLogout}><LogOut/><span>Log out</span></button>
  </section>;
};

export const TransactionHistoryView: React.FC<{onBack: () => void}> = ({onBack}) => {
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async (next?: string) => {
    if (loading) return;
    setLoading(true); setError('');
    try { const page = await userApi.getTransactionPage(next); setItems(prev => next ? [...prev, ...page.transactions] : page.transactions); setCursor(page.nextCursor); setHasMore(Boolean(page.nextCursor)); }
    catch { setError('Could not load history. Please retry.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {void load();}, []);
  return <section className="personal-profile"><div className="profile-page-heading"><button aria-label="Back to profile" onClick={onBack}><ArrowLeft size={20}/></button><h1>Transaction history</h1></div>
    <p className="text-sm text-neutral-500 mb-6">Your complete wallet ledger</p>
    {items.map(tx => <article key={tx.id} className="history-entry"><div><strong>{tx.description || tx.type.replaceAll('_', ' ')}</strong><small>{new Date(tx.createdAt).toLocaleString()}</small><small>{tx.referenceId || tx.id}</small></div><b>{tx.amount > 0 ? '+' : tx.amount < 0 ? '−' : ''}₹{Math.abs(tx.amount).toFixed(2)}</b></article>)}
    {!items.length && !loading && !error && <p>No transactions yet.</p>}
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">Loading history…</p> : (hasMore || error) ? <button className="mono-secondary mt-5" onClick={() => load(cursor || undefined)}>{error ? 'Retry' : 'Load older transactions'}</button> : <p className="text-sm text-neutral-500 mt-6">All transactions shown.</p>}
  </section>;
};
