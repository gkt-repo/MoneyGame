import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

function secret(name: string) {
  const value = process.env[name]?.trim();
  if (process.env.NODE_ENV === 'production' && (!value || value.length < 32 || /moneygame-(super-secret|secret-key)|change-in-production|replace-with|your_secure/i.test(value))) {
    throw new Error(`${name} must be a unique secret of at least 32 characters in production`);
  }
  return value || crypto.randomBytes(32).toString('hex');
}


export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  adminUpiId: process.env.ADMIN_UPI_ID || '8340271508@ptsbi',
  adminUpiName: process.env.ADMIN_UPI_NAME || 'MoneyGame Admin',
  webhookSecret: secret('WEBHOOK_SECRET'),
  platformCommissionPercent: parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || '0'),
  depositExpiryMinutes: 10,

  // JWT & Security
  jwtSecret: secret('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresDays: 30,
  adminAudience: 'moneygame-admin',
  userAudience: 'moneygame-user',

  // Pre-seeded Super Admin
  adminInitialEmail: process.env.ADMIN_INITIAL_EMAIL || 'admin@moneygame.com',
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || '',
  adminInitialPhone: process.env.ADMIN_INITIAL_PHONE || '9999999999',

  // Email / SMTP for OTP
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'MoneyGame <no-reply@moneygame.com>',
};

if (!Number.isFinite(config.platformCommissionPercent) || config.platformCommissionPercent < 0 || config.platformCommissionPercent > 100) {
  throw new Error('PLATFORM_COMMISSION_PERCENT must be between 0 and 100');
}
