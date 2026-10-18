export interface WalletDTO {
  id: string;
  userId: string;
  balance: number;
  lockedBalance: number;
  updatedAt: string | Date;
}

export type DepositStatus = 'PENDING' | 'APPROVED' | 'EXPIRED' | 'REJECTED';

export interface DepositDTO {
  id: string;
  userId: string;
  baseAmount: number;
  offsetPaise: number;
  totalAmount: number;
  receivingUpi: string;
  status: DepositStatus;
  utr?: string | null;
  expiresAt: string | Date;
  createdAt: string | Date;
  user?: {
    username: string;
    phone?: string | null;
  };
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
