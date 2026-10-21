export type Role = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface TokenPayload {
  userId: string;
  role: Role;
  username: string;
  tokenVersion?: number;
  aud?: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface UserResponse {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAt: string | Date;
  wallet?: {
    balance: number;
    lockedBalance: number;
  } | null;
}

export interface RegisterDTO {
  username: string;
  phone: string;
  email: string;
  password: string;
}

export interface LoginDTO {
  phone?: string;
  identifier?: string;
  username?: string;
  password: string;
}

export interface AdminLoginDTO {
  identifier: string;
  password: string;
}

export interface ForgotPasswordDTO {
  identifier: string;
}

export interface ResetPasswordDTO {
  email: string;
  otp: string;
  newPassword: string;
}
