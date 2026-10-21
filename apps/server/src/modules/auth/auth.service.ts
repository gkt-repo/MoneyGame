import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { serializable } from '../../transaction';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db';
import { config } from '../../config';
import { emailService } from './email.service';
import {
  AuthTokens,
  LoginDTO,
  AdminLoginDTO,
  RegisterDTO,
  Role,
  TokenPayload,
  UserResponse,
} from './auth.types';

export class AuthService {
  /**
   * Normalize 10-digit Indian phone numbers
   */
  private cleanPhone(rawPhone: string): string {
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length > 10 && digits.startsWith('91')) {
      return digits.slice(-10);
    }
    return digits;
  }

  /**
   * Mask an email address for privacy (e.g., user@example.com -> u***@example.com)
   */
  private maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const name = parts[0];
    const domain = parts[1];
    const maskedName = name.length <= 2 ? name[0] + '***' : name[0] + '***' + name[name.length - 1];
    return `${maskedName}@${domain}`;
  }

  /**
   * Helper to hash refresh tokens before storing in DB
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate Access and Refresh tokens
   */
  private async issueTokens(
    user: { id: string; role: string; username: string; tokenVersion?: number },
    audience: string,
    deviceInfo?: string,
    ipAddress?: string,
    client: Prisma.TransactionClient = prisma
  ): Promise<AuthTokens> {
    const payload: TokenPayload = {
      userId: user.id,
      role: user.role as Role,
      username: user.username,
      tokenVersion: user.tokenVersion ?? 0,
    };

    const accessToken = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
      audience,
    } as jwt.SignOptions);

    // Refresh Token is a secure random string
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.jwtRefreshExpiresDays);

    await client.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        deviceInfo: deviceInfo || 'Unknown Device',
        ipAddress: ipAddress || 'Unknown IP',
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: config.jwtExpiresIn,
    };
  }

  /**
   * Format User for client response (strips sensitive hashes)
   */
  private formatUser(user: any): UserResponse {
    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      wallet: user.wallet
        ? {
            balance: user.wallet.balance,
            lockedBalance: user.wallet.lockedBalance,
          }
        : null,
    };
  }

  /**
   * Register a new player
   */
  async registerUser(
    dto: RegisterDTO,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    const username = dto.username?.trim();
    const phone = this.cleanPhone(dto.phone || '');
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password;

    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }
    if (!phone || phone.length !== 10) {
      throw new Error('Valid 10-digit mobile number is required');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Valid recovery email address is required');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Check unique constraints
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone) {
      throw new Error('A user with this mobile number is already registered');
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new Error('A user with this recovery email is already registered');
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw new Error('Username is already taken');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        phone,
        email,
        passwordHash,
        role: 'USER',
        status: 'ACTIVE',
        wallet: {
          create: {
            balance: 0.0,
            lockedBalance: 0.0,
          },
        },
      },
      include: { wallet: true },
    });

    const tokens = await this.issueTokens(user, config.userAudience, deviceInfo, ipAddress);

    return {
      user: this.formatUser(user),
      tokens,
    };
  }

  /**
   * User Login (Phone, Username, or Email + Password)
   */
  async loginUser(
    dto: LoginDTO,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    const rawIdentifier = (dto.identifier || dto.phone || dto.username || '').trim();
    const password = dto.password;

    if (!rawIdentifier || !password) {
      throw new Error('Mobile number, username, or email and password are required');
    }

    // Try finding by clean 10-digit phone, username, or email
    const cleanPhone = rawIdentifier.replace(/\D/g, '').slice(-10);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(cleanPhone.length === 10 ? [{ phone: cleanPhone }] : []),
          { username: rawIdentifier },
          { email: rawIdentifier.toLowerCase() },
        ],
      },
      include: { wallet: true },
    });

    if (!user) {
      throw new Error('Invalid mobile number, username, or password');
    }

    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      throw new Error(`Your account has been ${user.status.toLowerCase()}. Please contact support.`);
    }

    if (user.role !== 'USER') throw new Error('Use the admin sign-in page for this account');

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid mobile number, username, or password');
    }

    const tokens = await this.issueTokens(user, config.userAudience, deviceInfo, ipAddress);

    return {
      user: this.formatUser(user),
      tokens,
    };
  }

  /**
   * Admin Login (Email or Username + Password)
   */
  async loginAdmin(
    dto: AdminLoginDTO,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    const identifier = dto.identifier?.trim();
    const password = dto.password;

    if (!identifier || !password) {
      throw new Error('Admin identifier and password are required');
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { username: identifier },
          { phone: identifier },
        ],
      },
      include: { wallet: true },
    });

    if (!user) {
      throw new Error('Invalid admin credentials');
    }

    if (user.role !== 'MODERATOR' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: Admin privileges required');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error(`Admin account is ${user.status.toLowerCase()}`);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid admin credentials');
    }

    const tokens = await this.issueTokens(user, config.adminAudience, deviceInfo, ipAddress);

    return {
      user: this.formatUser(user),
      tokens,
    };
  }

  /**
   * Refresh Token rotation
   */
  async refreshAccessToken(
    refreshTokenStr: string,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    if (!refreshTokenStr) {
      throw new Error('Refresh token is required');
    }

    const tokenHash = this.hashToken(refreshTokenStr);
    const result = await serializable(async tx => {
      const token = await tx.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!token || token.expiresAt < new Date()) throw new Error('Invalid or expired refresh token');
      if (token.revokedAt) {
        await tx.refreshToken.updateMany({ where: { userId: token.userId }, data: { revokedAt: new Date() } });
        return null;
      }
      if (token.user.status !== 'ACTIVE') throw new Error('Account is inactive');
      await tx.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });
      const audience = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(token.user.role) ? config.adminAudience : config.userAudience;
      return this.issueTokens(token.user, audience, deviceInfo, ipAddress, tx);
    });
    if (!result) throw new Error('Token compromised: Session terminated');
    return result;
  }

  /**
   * Request 6-digit OTP for password reset (sent to backup email)
   */
  async forgotPassword(identifier: string): Promise<{ success: boolean; message: string; maskedEmail?: string }> {
    const cleanId = identifier?.trim();
    if (!cleanId) {
      throw new Error('Mobile number or email is required');
    }

    const phoneCandidate = this.cleanPhone(cleanId);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: phoneCandidate.length === 10 ? phoneCandidate : undefined },
          { email: cleanId.toLowerCase() },
          { username: cleanId },
        ],
      },
    });

    // Generic safe response if user not found to prevent account enumeration
    if (!user || !user.email) {
      return {
        success: true,
        message: 'If an account matches that identifier, a verification OTP has been sent to the registered email.',
      };
    }

    // Generate random 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry

    // Save in database
    const otpRecord = await prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt,
      },
    });

    // Send email
    try {
      await emailService.sendPasswordResetOtp(user.email, rawOtp, user.username);
    } catch (error) {
      await prisma.passwordResetOtp.delete({ where: { id: otpRecord.id } });
      throw error;
    }

    return {
      success: true,
      message: `Verification OTP sent to your recovery email: ${this.maskEmail(user.email)}`,
      maskedEmail: this.maskEmail(user.email),
    };
  }

  /**
   * Reset Password with OTP
   */
  async resetPassword(identifier: string, otp: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const cleanId = identifier?.trim();
    const cleanOtp = otp?.trim();

    if (!cleanId || !cleanOtp || !newPassword) {
      throw new Error('Email/phone, OTP, and new password are required');
    }

    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    return serializable(async (tx) => {
      const phoneCandidate = this.cleanPhone(cleanId);
      const user = await tx.user.findFirst({
        where: {
          OR: [
            { phone: phoneCandidate.length === 10 ? phoneCandidate : undefined },
            { email: cleanId.toLowerCase() },
            { username: cleanId },
          ],
        },
      });

      if (!user) {
        throw new Error('Invalid email or verification code');
      }

      // Find valid unconsumed OTPs
      const activeOtps = await tx.passwordResetOtp.findMany({
        where: {
          userId: user.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      let matchedOtpId: string | null = null;
      for (const record of activeOtps) {
        const match = await bcrypt.compare(cleanOtp, record.otpHash);
        if (match) {
          matchedOtpId = record.id;
          break;
        }
      }

      if (!matchedOtpId) {
        throw new Error('Invalid or expired verification code');
      }

      // Atomically claim the matching OTP
      const claimed = await tx.passwordResetOtp.updateMany({
        where: { id: matchedOtpId, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      if (claimed.count === 0) {
        throw new Error('Verification code has already been used');
      }

      // Invalidate ALL outstanding reset OTPs for this user
      await tx.passwordResetOtp.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      // Update password hash and revoke active sessions
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          tokenVersion: { increment: 1 },
        },
      });

      // Revoke all existing sessions for security
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return {
        success: true,
        message: 'Password successfully updated. You can now log in with your new password.',
      };
    });
  }

  /**
   * Logout (revoke refresh tokens and invalidate access tokens)
   */
  async logout(refreshTokenStr?: string, userId?: string): Promise<boolean> {
    let targetUserId = userId;
    if (refreshTokenStr) {
      const tokenHash = this.hashToken(refreshTokenStr);
      const tokenRecord = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true },
      });
      if (tokenRecord) {
        targetUserId = targetUserId || tokenRecord.userId;
      }
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (targetUserId) {
      await prisma.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.user.update({
        where: { id: targetUserId },
        data: { tokenVersion: { increment: 1 } },
      }).catch(() => {});
    }
    return true;
  }

  /**
   * Auto-seed initial super admin if none exists
   */
  async seedSuperAdmin(): Promise<void> {
    const adminCount = await prisma.user.count({
      where: {
        role: { in: ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] },
      },
    });

    if (config.nodeEnv === 'production' && adminCount > 0) {
      const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { passwordHash: true } });
      for (const admin of admins) {
        if (await bcrypt.compare('Admin@123456', admin.passwordHash)) {
          throw new Error('A legacy default admin password is still active. Run scripts/set-admin-password.cjs before starting production.');
        }
      }
    }

    if (adminCount === 0) {
      if (config.adminInitialPassword.length < 12 || config.adminInitialPassword === 'Admin@123456') {
        throw new Error('Set ADMIN_INITIAL_PASSWORD to a unique password of at least 12 characters to create the initial admin');
      }
      console.log('⚡ No admin account detected. Seeding initial Super Admin...');
      const passwordHash = await bcrypt.hash(config.adminInitialPassword, 10);

      const admin = await prisma.user.create({
        data: {
          username: 'admin',
          email: config.adminInitialEmail.toLowerCase(),
          phone: config.adminInitialPhone,
          passwordHash,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          wallet: {
            create: {
              balance: 0.0,
              lockedBalance: 0.0,
            },
          },
        },
      });

      console.log(`=======================================================`);
      console.log(`👑 [SUPER ADMIN CREATED]`);
      console.log(`👤 Username: ${admin.username}`);
      console.log(`📧 Email:    ${admin.email}`);
      console.log(`📱 Phone:    ${admin.phone}`);

      console.log(`=======================================================`);
    }
  }
}

export const authService = new AuthService();
