declare const __VITE_API_URL__: string | undefined;
const API_BASE = typeof __VITE_API_URL__ !== 'undefined' && __VITE_API_URL__
  ? `${__VITE_API_URL__.replace(/\/+$/, '')}/api`
  : '/api';

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
  listenerStatus?: 'ONLINE' | 'OFFLINE';
  lastHeartbeatAt?: string | null;
  listenerMetadata?: { batteryLevel?: number; phoneModel?: string; updatedAt?: string } | null;
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

export interface AdminRoomPlayer {
  id: string;
  userId: string;
  username: string;
  phone?: string;
  userStatus?: string;
  userBalance?: number;
  seatIndex: number;
  status: string;
  guessNumber?: number | null;
  inGameStake: number;
  totalPaid: number;
  joinedAt: string;
}

export interface AdminRoomItem {
  id: string;
  roomCode: string;
  gameType: string;
  entryFee: number;
  maxPlayers: number;
  status: string;
  winningNumber?: number | null;
  winnerId?: string | null;
  winnerUsername?: string | null;
  winnerPrize?: number | null;
  totalPot: number;
  customConfig?: any;
  createdAt: string;
  players: AdminRoomPlayer[];
}

export interface AdminRoomsResponse {
  success: boolean;
  rooms: AdminRoomItem[];
  totalCount: number;
  activeCount: number;
  completedCount: number;
  cancelledCount: number;
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

  private refreshPromise: Promise<string | null> | null = null;

  async getValidToken(force = false): Promise<string | null> {
    if (!this.token) return null;
    try {
      const payload = JSON.parse(atob(this.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!force && payload.exp * 1000 > Date.now() + 30000) return this.token;
    } catch { /* Refresh malformed or expired access tokens. */ }
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const refreshToken = localStorage.getItem('moneygame_admin_refresh_token');
        if (!refreshToken) { this.setToken(null); return null; }
        const response = await fetch(`${API_BASE}/v1/admin/auth/refresh-token`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401) { this.setToken(null); window.location.reload(); }
          throw new Error(data.error || 'Unable to refresh session');
        }
        // A logout or new login while this request was in flight wins.
        if (localStorage.getItem('moneygame_admin_refresh_token') !== refreshToken) return this.token;
        this.setToken(data.accessToken);
        localStorage.setItem('moneygame_admin_refresh_token', data.refreshToken);
        return this.token;
      })().finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, retried = false): Promise<T> {
    const publicAuth = ['/login', '/register', '/forgot-password', '/reset-password'].some(path => endpoint.endsWith(path));
    const token = publicAuth ? null : await this.getValidToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const contentType = response.headers?.get ? (response.headers.get('content-type') || '') : 'application/json';
    const isJson = !response.headers || contentType.includes('application/json');
    const data = isJson ? await response.json().catch(() => ({})) : {};

    if (!response.ok) {
      if (response.status === 401 && data.code === 'TOKEN_EXPIRED' && token && !retried) {
        if (this.token === token) await this.getValidToken(true);
        if (this.token) return this.request<T>(endpoint, options, true);
      }
      if (response.status === 401 && token && !endpoint.endsWith('/login')) {
        this.setToken(null);
        window.location.reload();
      }
      throw new Error(data.error || `HTTP error ${response.status}`);
    }

    if (!isJson && response.status !== 204) {
      throw new Error(`Unexpected non-JSON response from server (${response.status})`);
    }

    return data;
  }

  async login(identifier: string, password: string): Promise<{ admin: AdminUser; token: string }> {
    const res = await this.request<{
      success: boolean;
      user: AdminUser;
      tokens?: { accessToken: string; refreshToken: string };
      accessToken?: string;
      refreshToken?: string;
    }>('/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });

    const accessToken = res.tokens?.accessToken || res.accessToken;
    const refreshToken = res.tokens?.refreshToken || res.refreshToken;

    if (!accessToken) {
      throw new Error((res as any)?.error || 'Admin login succeeded but no access token was received.');
    }

    this.setToken(accessToken);
    if (refreshToken) {
      localStorage.setItem('moneygame_admin_refresh_token', refreshToken);
    }
    return { admin: res.user, token: accessToken };
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

  async getRooms(status?: string, search?: string): Promise<AdminRoomsResponse> {
    const params = new URLSearchParams();
    if (status && status !== 'ALL') params.append('status', status);
    if (search && search.trim()) params.append('search', search.trim());
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<AdminRoomsResponse>(`/admin/rooms${query}`);
  }

  async getRoomDetails(roomId: string): Promise<any> {
    const res = await this.request<{ success: boolean; room: any }>(`/admin/rooms/${roomId}`);
    return res.room;
  }

  async cancelRoom(roomId: string, reason?: string): Promise<{ success: boolean; message: string; refundedCount: number; totalRefunded: number }> {
    return this.request(`/admin/rooms/${roomId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
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

  async getSolvencyAudit(): Promise<{ success: boolean; audit: any }> {
    return this.request('/admin/solvency-audit');
  }

  logout() {
    this.setToken(null);
  }
}

export const adminApi = new AdminApiService();
