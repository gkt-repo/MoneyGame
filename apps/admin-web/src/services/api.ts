const API_BASE = '/api';

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
}

export interface DashboardStats {
  totalDeposited?: number;
  totalDepositVolume?: number;
  totalWithdrawn?: number;
  totalPayoutVolume?: number;
  platformProfit?: number;
  activeRooms?: number;
  pendingWithdrawalsCount?: number;
  totalUsersCount?: number;
  totalUsers?: number;
  openFeedbacksCount?: number;
  adminUpiId?: string;
  adminUpiName?: string;
  commissionPercent?: string;
  supportEmail?: string;
  supportWhatsapp?: string;
  supportTelegram?: string;
  supportHours?: string;
}

export interface SupportContactSettings {
  email: string;
  whatsapp: string;
  telegram: string;
  hours: string;
  upiHelpText?: string;
}

export interface UnmatchedPaymentItem {
  id: string;
  amount: number;
  utr: string | null;
  senderUpi: string | null;
  senderName: string | null;
  status: 'UNCLAIMED' | 'ASSIGNED' | 'REFUNDED';
  assignedUserId: string | null;
  assignedDepositId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface DepositItem {
  id: string;
  userId: string;
  baseAmount: number;
  offsetPaise: number;
  totalAmount: number;
  receivingUpi: string;
  status: string;
  utr: string | null;
  userClaimedUtr?: string | null;
  claimStatus?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  expiresAt: string;
  user?: {
    username: string;
    phone?: string | null;
  };
}

export interface WithdrawalItem {
  id: string;
  userId: string;
  amount: number;
  upiId: string;
  status: string;
  payoutUtr: string | null;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    username: string;
    phone?: string | null;
  };
}

export interface FeedbackItem {
  id: string;
  userId: string;
  category: string;
  subject: string;
  message: string;
  contactInfo?: string | null;
  status: string;
  adminReply?: string | null;
  repliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    username: string;
    email?: string | null;
    phone?: string | null;
    status?: string;
    wallet?: { balance: number };
  };
}

export interface UserAdminListItem {
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
  feedbacksCount: number;
}

export interface UserProfileDetail {
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
  feedbacks: FeedbackItem[];
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


class AdminApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('moneygame_admin_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('moneygame_admin_token', token);
    } else {
      localStorage.removeItem('moneygame_admin_token');
      localStorage.removeItem('moneygame_admin_refresh_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && this.token) {
        this.setToken(null);
        window.location.reload();
      }
      throw new Error(data.error || `HTTP error ${response.status}`);
    }

    return data;
  }

  async login(identifier: string, password: string): Promise<{ admin: AdminUser; token: string }> {
    const res = await this.request<{
      success: boolean;
      user: AdminUser;
      tokens: { accessToken: string; refreshToken: string };
    }>('/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });

    this.setToken(res.tokens.accessToken);
    localStorage.setItem('moneygame_admin_refresh_token', res.tokens.refreshToken);
    return { admin: res.user, token: res.tokens.accessToken };
  }

  async getMe(): Promise<AdminUser> {
    const res = await this.request<{ success: boolean; admin: AdminUser }>('/v1/admin/auth/me');
    return res.admin;
  }

  async getStats(): Promise<DashboardStats> {
    const res = await this.request<{ success: boolean; stats: DashboardStats }>('/admin/stats');
    return res.stats;
  }

  async getDeposits(): Promise<DepositItem[]> {
    const res = await this.request<{ success: boolean; deposits: DepositItem[] }>('/admin/deposits');
    return res.deposits;
  }

  async approveDeposit(depositId: string, utr: string): Promise<any> {
    return this.request(`/admin/deposits/${depositId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ utr }),
    });
  }

  async rejectDeposit(depositId: string, reason?: string): Promise<any> {
    return this.request(`/admin/deposits/${depositId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Invalid or unverifiable payment' }),
    });
  }

  async getUnmatchedPayments(status?: string): Promise<UnmatchedPaymentItem[]> {
    const qs = status ? `?status=${status}` : '';
    const res = await this.request<{ success: boolean; unmatchedPayments: UnmatchedPaymentItem[] }>(`/admin/unmatched-payments${qs}`);
    return res.unmatchedPayments || [];
  }

  async assignUnmatchedPayment(id: string, userId: string): Promise<any> {
    return this.request(`/admin/unmatched-payments/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async getWithdrawals(): Promise<WithdrawalItem[]> {
    const res = await this.request<{ success: boolean; withdrawals: WithdrawalItem[] }>('/admin/withdrawals');
    return res.withdrawals;
  }

  async completeWithdrawal(withdrawalId: string, payoutUtr: string): Promise<any> {
    return this.request('/admin/withdrawals/complete', {
      method: 'POST',
      body: JSON.stringify({ withdrawalId, payoutUtr }),
    });
  }

  async rejectWithdrawal(withdrawalId: string, reason: string): Promise<any> {
    return this.request('/admin/withdrawals/reject', {
      method: 'POST',
      body: JSON.stringify({ withdrawalId, reason }),
    });
  }

  async updateUpiSettings(upiId: string, upiName: string): Promise<any> {
    return this.request('/admin/upi-settings', {
      method: 'POST',
      body: JSON.stringify({ upiId, upiName }),
    });
  }

  async simulatePayment(amount: number, utr?: string): Promise<any> {
    return this.request('/admin/simulate-payment', {
      method: 'POST',
      body: JSON.stringify({ amount, utr }),
    });
  }

  async getRooms(): Promise<any[]> {
    const res = await this.request<{ success: boolean; rooms: any[] }>('/rooms');
    return res.rooms;
  }

  async getUsers(search?: string, status?: string): Promise<UserAdminListItem[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ success: boolean; users: UserAdminListItem[] }>(`/admin/users${query}`);
    return res.users;
  }

  async getUserDetail(userId: string): Promise<UserProfileDetail> {
    const res = await this.request<{ success: boolean; user: UserProfileDetail }>(`/admin/users/${userId}`);
    return res.user;
  }

  async updateUserStatus(userId: string, status: string, reason?: string): Promise<any> {
    return this.request(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    });
  }

  async adjustUserBalance(userId: string, amount: number, reason: string): Promise<any> {
    return this.request(`/admin/users/${userId}/adjust-balance`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    });
  }

  async getFeedbacks(status?: string): Promise<FeedbackItem[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ success: boolean; feedbacks: FeedbackItem[] }>(`/admin/feedback${query}`);
    return res.feedbacks;
  }

  async replyFeedback(feedbackId: string, adminReply: string, status?: string): Promise<any> {
    return this.request(`/admin/feedback/${feedbackId}/reply`, {
      method: 'PATCH',
      body: JSON.stringify({ adminReply, status }),
    });
  }

  async getSupportSettings(): Promise<SupportContactSettings> {
    const res = await this.request<{ success: boolean; contact: SupportContactSettings }>('/admin/support-settings');
    return res.contact;
  }

  async updateSupportSettings(settings: {
    email?: string;
    whatsapp?: string;
    telegram?: string;
    hours?: string;
  }): Promise<SupportContactSettings> {
    const res = await this.request<{ success: boolean; contact: SupportContactSettings }>('/admin/support-settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
    return res.contact;
  }

  logout() {
    this.setToken(null);
  }
}

export const adminApi = new AdminApiService();
