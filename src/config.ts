import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  adminUpiId: process.env.ADMIN_UPI_ID || 'admin@okhdfcbank',
  adminUpiName: process.env.ADMIN_UPI_NAME || 'MoneyGame Admin',
  webhookSecret: process.env.WEBHOOK_SECRET || 'moneygame-secret-key-1234',
  platformCommissionPercent: parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || '10'),
  depositExpiryMinutes: 10,
};
