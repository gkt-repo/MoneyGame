import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  adminUpiId: process.env.ADMIN_UPI_ID || '8340271508@ptsbi',
  adminUpiName: process.env.ADMIN_UPI_NAME || 'MoneyGame Admin',
  webhookSecret: process.env.WEBHOOK_SECRET || 'moneygame-secret-key-1234',
  platformCommissionPercent: parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || '0'),
  depositExpiryMinutes: 10,

  // JWT & Security
  jwtSecret: process.env.JWT_SECRET || 'moneygame-super-secret-jwt-key-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresDays: 30,
  adminAudience: 'moneygame-admin',
  userAudience: 'moneygame-user',

  // Pre-seeded Super Admin
  adminInitialEmail: process.env.ADMIN_INITIAL_EMAIL || 'admin@moneygame.com',
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123456',
  adminInitialPhone: process.env.ADMIN_INITIAL_PHONE || '9999999999',

  // Email / SMTP for OTP
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'MoneyGame <no-reply@moneygame.com>',
};
