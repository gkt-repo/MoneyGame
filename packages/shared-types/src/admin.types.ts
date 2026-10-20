import { DepositDTO, WithdrawalDTO } from './wallet.types';

export interface DashboardStatsDTO {
  totalDeposited: number;
  totalWithdrawn: number;
  platformProfit: number;
  activeRooms: number;
  pendingWithdrawalsCount: number;
  totalUsersCount: number;
  openFeedbacksCount?: number;
  adminUpiId?: string;
  adminUpiName?: string;
  supportEmail?: string;
  supportWhatsapp?: string;
  supportTelegram?: string;
  supportHours?: string;
}

export interface UpdateUpiSettingsDTO {
  upiId: string;
  upiName: string;
}

export interface UpdateSupportSettingsDTO {
  email?: string;
  whatsapp?: string;
  telegram?: string;
  hours?: string;
}

export interface SupportSettingsDTO {
  email: string;
  whatsapp: string;
  telegram: string;
  hours: string;
  upiHelpText: string;
}

export interface CompleteWithdrawalDTO {
  withdrawalId: string;
  payoutUtr: string;
}

export interface RejectWithdrawalDTO {
  withdrawalId: string;
  reason: string;
}

export interface FeedbackDTO {
  id: string;
  userId: string;
  category: string;
  subject: string;
  message: string;
  contactInfo?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  adminReply?: string | null;
  repliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    username: string;
    phone?: string | null;
    email?: string | null;
  };
}

export interface CreateFeedbackDTO {
  category: string;
  subject: string;
  message: string;
  contactInfo?: string;
}

export interface ReplyFeedbackDTO {
  adminReply: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
}

export interface UserAdminListItemDTO {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
  balance: number;
  lockedBalance: number;
  totalDepositsCount: number;
  totalDepositedAmount: number;
  totalWithdrawalsCount: number;
  totalWithdrawnAmount: number;
  roomsPlayedCount: number;
  roomsWonCount: number;
}

export interface UserProfileDetailDTO {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  wallet: {
    balance: number;
    lockedBalance: number;
    updatedAt: string;
  } | null;
  metrics: {
    totalDepositsCount: number;
    approvedDepositsSum: number;
    totalWithdrawalsCount: number;
    completedWithdrawalsSum: number;
    roomsPlayed: number;
    roomsWon: number;
    winRate: number;
    netProfitLoss: number;
  };
  recentTransactions: Array<{
    id: string;
    amount: number;
    type: string;
    referenceId: string | null;
    description: string | null;
    createdAt: string;
  }>;
  recentDeposits: Array<{
    id: string;
    baseAmount: number;
    totalAmount: number;
    status: string;
    utr: string | null;
    receivingUpi: string;
    createdAt: string;
  }>;
  recentWithdrawals: Array<{
    id: string;
    amount: number;
    upiId: string;
    status: string;
    payoutUtr: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  recentGames: Array<{
    id: string;
    roomId: string;
    roomCode: string;
    entryFee: number;
    guessNumber: number;
    winningNumber: number | null;
    isWinner: boolean;
    status: string;
    createdAt: string;
  }>;
  feedbacks: FeedbackDTO[];
  auditLogs: Array<{
    id: string;
    action: string;
    actor: {
      id: string;
      username: string;
    };
    details: string | null;
    ipAddress: string | null;
    createdAt: string;
  }>;
}

export interface UpdateUserStatusDTO {
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  reason?: string;
}

export interface AdjustUserBalanceDTO {
  amount: number;
  reason: string;
}

