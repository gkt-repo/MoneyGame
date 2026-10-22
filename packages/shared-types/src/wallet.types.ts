export interface WalletDTO {
  id: string;
  userId: string;
  balance: number;
  lockedBalance: number;
  updatedAt: string | Date;
}

export type DepositStatus = 'PENDING' | 'CLAIMED' | 'APPROVED' | 'EXPIRED' | 'REJECTED';

export interface DepositDTO {
  id: string;
  userId: string;
  baseAmount: number;
  offsetPaise: number;
  totalAmount: number;
  receivingUpi: string;
  status: DepositStatus;
  utr?: string | null;
  userClaimedUtr?: string | null;
  claimStatus?: string | null;
  approvedAt?: string | Date | null;
  expiresAt: string | Date;
  createdAt: string | Date;
  user?: {
    username: string;
    phone?: string | null;
  };
}

export interface UnmatchedPaymentDTO {
  id: string;
  amount: number;
  utr?: string | null;
  senderUpi?: string | null;
  senderName?: string | null;
  status: 'UNCLAIMED' | 'ASSIGNED' | 'REFUNDED';
  assignedUserId?: string | null;
  assignedDepositId?: string | null;
  resolvedAt?: string | Date | null;
  createdAt: string | Date;
}

export interface ClaimDepositUtrDTO {
  depositId: string;
  utr: string;
}

export interface CreateDepositRequestDTO {
  userId: string;
  amount: number;
}

export interface CreateDepositResponseDTO {
  success: boolean;
  depositId: string;
  totalAmount: number;
  baseAmount: number;
  offsetPaise: number;
  receivingUpi: string;
  receivingName?: string;
  qrCodeUrl: string;
  qrCodeDataUrl?: string;
  upiDeepLink: string;
  upiUri?: string;
  expiresAt: string | Date;
  expiresInSeconds?: number;
}

export type WithdrawalStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

export interface WithdrawalDTO {
  id: string;
  userId: string;
  amount: number;
  upiId: string;
  status: WithdrawalStatus;
  assignedModeratorId?: string | null;
  assignedModeratorName?: string | null;
  assignedAt?: string | Date | null;
  payoutAccountId?: string | null;
  payoutAccountUpi?: string | null;
  fundingSource?: 'ACCOUNT' | 'EXTERNAL' | null;
  processingById?: string | null;
  processedById?: string | null;
  payoutUtr?: string | null;
  reason?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  user?: {
    username: string;
    phone?: string | null;
  };
}

export interface RequestWithdrawalDTO {
  userId: string;
  amount: number;
  upiId: string;
}

export interface TransactionDTO {
  id: string;
  userId: string;
  amount: number;
  type: string;
  referenceId?: string | null;
  description?: string | null;
  createdAt: string | Date;
}

export interface ModeratorBalanceSheetDTO {
  totalDeposited: number;
  totalPaidOut: number;
  currentBalance: number;
  reservedPayouts: number;
  availableBalance: number;
  openingAdjustment: number;
  floatReady: boolean;
}
