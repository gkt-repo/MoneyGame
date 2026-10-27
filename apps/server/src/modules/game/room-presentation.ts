/** Recovery state is server-only, including snapshots written by older releases. */
export function publicRoomConfig(raw: unknown): Record<string, any> | null {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { twentyNineState, engineState, ...publicConfig } = parsed;
    return publicConfig;
  } catch { return null; }
}

/** Remaining server-controlled card-table countdown, including reconnects. */
export function roomCountdown(room: { status: string; customConfig: unknown }): number | null {
  const endsAt = publicRoomConfig(room.customConfig)?.countdownEndsAt;
  return room.status === 'COUNTDOWN' && typeof endsAt === 'number'
    ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    : null;
}

export function invitationUnavailable(room: {
  invitationExpiresAt: Date | null; invitationRevokedAt: Date | null;
}): boolean {
  return Boolean(room.invitationRevokedAt || !room.invitationExpiresAt || room.invitationExpiresAt.getTime() <= Date.now());
}
