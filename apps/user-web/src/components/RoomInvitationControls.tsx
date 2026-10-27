import React, { useState } from 'react';
import { RoomItem, userApi } from '../services/api';
import { roomInvitationMessage } from '../utils/roomInvitations';

export const RoomInvitationControls: React.FC<{room: RoomItem; userId: string; onChanged: () => void}> = ({room, userId, onChanged}) => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const member = room.players.some(p => p.userId === userId);
  const host = room.players.find(p => p.seatIndex === 0)?.userId === userId;
  if (!member || room.status !== 'WAITING') return null;
  const text = roomInvitationMessage(room.roomCode);
  const perform = async (work: () => Promise<unknown>, success = '') => {
    setBusy(true); setMessage('');
    try { await work(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to share invitation'); }
    finally { setBusy(false); }
  };
  const update = (operation: 'RENEW' | 'REVOKE') => perform(async () => {
    await userApi.updateInvitation(room.id, operation); onChanged();
  }, operation === 'RENEW' ? 'New invitation created. Previous links and codes no longer work.' : 'Invitation revoked. Create a new invitation to accept more players.');
  return <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-sm">
    <p>Invite friends · invitations expire after 24 hours</p>
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={() => perform(() => navigator.share ? navigator.share({title: 'MoneyGame table', text}) : navigator.clipboard.writeText(text), 'Invitation ready')}>Share website &amp; code</button>
      <button disabled={busy} onClick={() => perform(() => navigator.clipboard.writeText(text), 'Invitation copied')}>Copy invitation</button>
      <button disabled={busy} onClick={() => perform(() => navigator.clipboard.writeText(room.roomCode), 'Code copied')}>Copy code</button>
      {host && <><button disabled={busy} onClick={() => update('RENEW')}>New invitation</button><button disabled={busy} onClick={() => update('REVOKE')}>Revoke invitation</button></>}
    </div>
    {message && <p role="status">{message}</p>}
  </div>;
};
