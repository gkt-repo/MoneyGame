const API_BASE = '/api';

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
  entryFee: number;
  maxPlayers: number;
  status: string;
  winningNumber?: number | null;
  winnerId?: string | null;
  winner?: { username: string } | null;
  players: Array<{
    id: string;
    userId: string;
    guessNumber: number;
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

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401 && this.token) {
        this.setToken(null);
        window.location.reload();
      }
      throw new Error(data.error || `HTTP error ${res.status}`);
    }

    return data;
  }

  async register(username: string, phone: string, email: string, password: string): Promise<UserProfile> {
    const res = await this.request<{
      success: boolean;
      user: UserProfile;
      tokens: { accessToken: string; refreshToken: string };
    }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, phone, email, password }),
    });

    this.setToken(res.tokens.accessToken);
    localStorage.setItem('moneygame_user_refresh_token', res.tokens.refreshToken);
    return res.user;
  }

  async login(phone: string, password: string): Promise<UserProfile> {
    const res = await this.request<{
      success: boolean;
      user: UserProfile;
      tokens: { accessToken: string; refreshToken: string };
    }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });

    this.setToken(res.tokens.accessToken);
    localStorage.setItem('moneygame_user_refresh_token', res.tokens.refreshToken);
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

  async getRooms(): Promise<RoomItem[]> {
    const res = await this.request<{ success: boolean; rooms: RoomItem[] }>('/rooms');
    return res.rooms;
  }

  async createRoom(userId: string, entryFee: number, maxPlayers: number, guessNumber: number): Promise<any> {
    return this.request('/rooms/create', {
      method: 'POST',
      body: JSON.stringify({ userId, entryFee, maxPlayers, guessNumber }),
    });
  }

  async joinRoom(userId: string, roomCode: string, guessNumber: number): Promise<any> {
    return this.request('/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ userId, roomCode, guessNumber }),
    });
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

  logout() {
    this.setToken(null);
  }
}

export const userApi = new UserApiService();
