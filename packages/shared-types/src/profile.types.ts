export interface UserProfileDTO {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  phone?: string | null;
  email?: string | null;
  role: string;
  status: string;
  createdAt: string;
  stats: UserStatsDTO;
  recentGames: RecentGameDTO[];
}

export interface PublicProfileDTO {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  createdAt: string;
  stats: UserStatsDTO;
}

export interface UserStatsDTO {
  totalGames: number;
  totalWins: number;
  winRatePercent: number;
  byGame: Record<string, {
    played: number;
    won: number;
    winRatePercent: number;
  }>;
}

export interface RecentGameDTO {
  roomId: string;
  roomCode: string;
  gameType: string;
  entryFee: number;
  isWin: boolean;
  prize: number;
  settledAt: string;
}

export interface UpdateProfileDTO {
  displayName?: string;
  avatar?: string;
}

export const CURATED_AVATARS = [
  'avatar_1',
  'avatar_2',
  'avatar_3',
  'avatar_4',
  'avatar_5',
  'avatar_6',
  'avatar_7',
  'avatar_8',
  'avatar_9',
  'avatar_10',
  'avatar_11',
  'avatar_12',
] as const;

export type CuratedAvatar = typeof CURATED_AVATARS[number];
