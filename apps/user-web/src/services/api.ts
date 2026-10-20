declare const __VITE_API_URL__: string | undefined;
const API_BASE = typeof __VITE_API_URL__ !== 'undefined' && __VITE_API_URL__
  ? `${__VITE_API_URL__.replace(/\/+$/, '')}/api`
  : '/api';

export interface UserProfile {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  role: string;
  status: string;
  wallet?: {
    balance: number;
    lockedBalance: number;
  };
}

export interface DepositResponse {
  success: boolean;
  depositId: string;
  totalAmount: number;
  baseAmount: number;
  offsetPaise: number;
  receivingUpi: string;
  receivingName?: string;
  qrCodeUrl?: string;
  qrCodeDataUrl?: string;
  upiDeepLink?: string;
  upiUri?: string;
  expiresAt: string;
  expiresInSeconds?: number;
}

export interface DepositItem {
  id: string;
  userId: string;
  baseAmount: number;
  offsetPaise: number;
  totalAmount: number;
  receivingUpi: string;
  status: 'PENDING' | 'CLAIMED' | 'APPROVED' | 'EXPIRED' | 'REJECTED';
  utr?: string | null;
  userClaimedUtr?: string | null;
  claimStatus?: string | null;
  approvedAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface TransactionItem {
  id: string;
  userId: string;
  amount: number;
  type: string;
  referenceId?: string | null;
  description?: string | null;
  createdAt: string;
}

export interface WithdrawalItem {
  id: string;
  userId: string;
  amount: number;
  upiId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  payoutUtr?: string | null;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomItem {
  id: string;
  roomCode: string;
  gameType: string;
  entryFee: number;
  maxPlayers: number;
  status: string;
  winningNumber?: number | null;
  winnerPrize?: number | null;
  winnerId?: string | null;
  winner?: { username: string } | null;
  gameState?: any;
  customConfig?: any;
  players: Array<{
    id: string;
    userId: string;
    seatIndex: number;
    status?: string;
    guessNumber?: number | null;
    user?: { username: string };
  }>;
}

export interface UserFeedbackItem {
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
}

export interface SupportContactInfo {
  email: string;
  telegram: string;
  whatsapp: string;
  hours: string;
  upiHelpText: string;
}


class UserApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('moneygame_user_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('moneygame_user_token', token);
    } else {
      localStorage.removeItem('moneygame_user_token');
      localStorage.removeItem('moneygame_user_refresh_token');
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
        const refreshToken = localStorage.getItem('moneygame_user_refresh_token');
        if (!refreshToken) { this.setToken(null); return null; }
        const response = await fetch(`${API_BASE}/v1/auth/refresh-token`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401) { this.setToken(null); window.location.reload(); }
          throw new Error(data.error || 'Unable to refresh session');
        }
        // A logout or new login while this request was in flight wins.
        if (localStorage.getItem('moneygame_user_refresh_token') !== refreshToken) return this.token;
        this.setToken(data.accessToken);
        localStorage.setItem('moneygame_user_refresh_token', data.refreshToken);
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

  async register(username: string, phone: string, email: string, password: string): Promise<UserProfile> {
    const res = await this.request<{
      success: boolean;
      user: UserProfile;
      tokens?: { accessToken: string; refreshToken: string };
      accessToken?: string;
      refreshToken?: string;
    }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, phone, email, password }),
    });

    const accessToken = res.tokens?.accessToken || res.accessToken;
    const refreshToken = res.tokens?.refreshToken || res.refreshToken;

    if (!accessToken) {
      throw new Error((res as any)?.error || 'Registration succeeded but no access token was received.');
    }

    this.setToken(accessToken);
    if (refreshToken) {
      localStorage.setItem('moneygame_user_refresh_token', refreshToken);
    }
    return res.user;
  }

  async login(phone: string, password: string): Promise<UserProfile> {
    const res = await this.request<{
      success: boolean;
      user: UserProfile;
      tokens?: { accessToken: string; refreshToken: string };
      accessToken?: string;
      refreshToken?: string;
    }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });

    const accessToken = res.tokens?.accessToken || res.accessToken;
    const refreshToken = res.tokens?.refreshToken || res.refreshToken;

    if (!accessToken) {
      throw new Error((res as any)?.error || 'Login succeeded but no access token was received.');
    }

    this.setToken(accessToken);
    if (refreshToken) {
      localStorage.setItem('moneygame_user_refresh_token', refreshToken);
    }
    return res.user;
  }

  async forgotPassword(identifier: string): Promise<{ success: boolean; message: string; maskedEmail?: string }> {
    return this.request('/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    });
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return this.request('/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, newPassword }),
    });
  }

  async getMe(): Promise<UserProfile> {
    const res = await this.request<{ success: boolean; user: UserProfile }>('/v1/auth/me');
    return res.user;
  }

  async getWallet(userId: string): Promise<{ balance: number; lockedBalance: number }> {
    const res = await this.request<{ success: boolean; wallet: { balance: number; lockedBalance: number } }>(
      `/wallet/${userId}`
    );
    return res.wallet;
  }

  async createDeposit(userId: string, amount: number): Promise<DepositResponse> {
    return this.request('/deposits/create', {
      method: 'POST',
      body: JSON.stringify({ userId, amount }),
    });
  }

  async getDepositStatus(depositId: string): Promise<any> {
    return this.request(`/deposits/status/${depositId}`);
  }

  async claimDepositUtr(depositId: string, utr: string): Promise<{ success: boolean; message: string; instantApproval?: boolean; deposit?: any }> {
    return this.request('/deposits/claim-utr', {
      method: 'POST',
      body: JSON.stringify({ depositId, utr }),
    });
  }

  async getMyDeposits(): Promise<DepositItem[]> {
    const res = await this.request<{ success: boolean; deposits: DepositItem[] }>('/user/deposits/my');
    return res.deposits || [];
  }

  async getMyTransactions(): Promise<TransactionItem[]> {
    const res = await this.request<{ success: boolean; transactions: TransactionItem[] }>('/user/transactions');
    return res.transactions || [];
  }

  async requestWithdrawal(userId: string, amount: number, upiId: string): Promise<any> {
    return this.request('/withdrawals/request', {
      method: 'POST',
      body: JSON.stringify({ userId, amount, upiId }),
    });
  }

  async getUserWithdrawals(userId: string): Promise<WithdrawalItem[]> {
    const res = await this.request<{ success: boolean; withdrawals: WithdrawalItem[] }>(
      `/withdrawals/user/${userId}`
    );
    return res.withdrawals || [];
  }

  async getSupportedGames(): Promise<any[]> {
    const res = await this.request<{ success: boolean; games: any[] }>('/games');
    return res.games || [];
  }

  async getRooms(): Promise<RoomItem[]> {
    const res = await this.request<{ success: boolean; rooms: RoomItem[] }>('/rooms');
    return res.rooms;
  }

  async createRoom(
    userId: string,
    entryFee: number,
    maxPlayers: number,
    guessNumber?: number | null,
    gameType: string = 'TEEN_PATTI',
    customConfig?: Record<string, any>
  ): Promise<any> {
    return this.request('/rooms/create', {
      method: 'POST',
      body: JSON.stringify({ userId, entryFee, maxPlayers, guessNumber, gameType, customConfig }),
    });
  }

  async joinRoom(
    userId: string,
    roomCode: string,
    guessNumber?: number | null,
    seatIndex?: number
  ): Promise<any> {
    return this.request('/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ userId, roomCode, guessNumber, seatIndex }),
    });
  }

  async sendGameAction(roomId: string, action: string, payload?: any): Promise<any> {
    return this.request(`/rooms/${roomId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    });
  }

  async cancelRoom(roomId: string): Promise<void> {
    await this.request(`/rooms/${roomId}/cancel`, { method: 'POST' });
  }

  async getRoomDetails(roomId: string): Promise<RoomItem> {
    const res = await this.request<{ success: boolean; room: RoomItem }>(`/rooms/${roomId}`);
    return res.room;
  }

  async getContactInfo(): Promise<SupportContactInfo> {
    const res = await this.request<{ success: boolean; contact: SupportContactInfo }>('/support/contact-info');
    return res.contact;
  }

  async submitFeedback(data: {
    category: string;
    subject: string;
    message: string;
    contactInfo?: string;
  }): Promise<{ success: boolean; feedback: UserFeedbackItem }> {
    return this.request('/support/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMyFeedbacks(): Promise<UserFeedbackItem[]> {
    const res = await this.request<{ success: boolean; feedbacks: UserFeedbackItem[] }>('/support/my-feedback');
    return res.feedbacks || [];
  }

  async getSportsMatches(sport?: string): Promise<any[]> {
    const query = sport ? `?sport=${encodeURIComponent(sport)}` : '';
    const res = await this.request<{ success: boolean; matches: any[] }>(`/sports/matches${query}`);
    return res.matches || [];
  }

  async getSportsMatch(matchId: string): Promise<any | null> {
    const res = await this.request<{ success: boolean; match: any }>(`/sports/matches/${matchId}`);
    return res.match || null;
  }

  async settleSportsRoom(
    roomId: string,
    winningTeamIndex: number,
    winningTeamName?: string,
    refund?: boolean
  ): Promise<any> {
    return this.request(`/sports/rooms/${roomId}/settle`, {
      method: 'POST',
      body: JSON.stringify({ winningTeamIndex, winningTeamName, refund }),
    });
  }

  async syncSports(): Promise<void> {
    await this.request('/sports/sync', { method: 'POST' });
  }

  logout() {
    this.setToken(null);
  }
}

export const userApi = new UserApiService();
