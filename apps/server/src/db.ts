import { PrismaClient } from '@prisma/client';
import { authService } from './modules/auth/auth.service';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function initDbDefaults() {
  const adminUpi = await prisma.systemSetting.findUnique({
    where: { key: 'admin_upi_id' },
  });

  if (!adminUpi) {
    await prisma.systemSetting.createMany({
      data: [
        { key: 'admin_upi_id', value: process.env.ADMIN_UPI_ID || '8340271508@ptsbi' },
        { key: 'admin_upi_name', value: process.env.ADMIN_UPI_NAME || 'MoneyGame' },
        { key: 'platform_commission', value: process.env.PLATFORM_COMMISSION_PERCENT || '0' },
      ],
    });
  }

  // Seed default support contact channels if missing
  const supportEmail = await prisma.systemSetting.findUnique({ where: { key: 'support_email' } });
  if (!supportEmail) {
    await prisma.systemSetting.createMany({
      data: [
        { key: 'support_email', value: process.env.SUPPORT_EMAIL || 'support@moneygame.com' },
        { key: 'support_whatsapp', value: process.env.SUPPORT_WHATSAPP || '+91 98765 43210' },
        { key: 'support_telegram', value: process.env.SUPPORT_TELEGRAM || '@MoneyGameSupport' },
        { key: 'support_hours', value: '24/7 Live Support' },
      ],
    });
  }

  // Seed Super Admin if none exists
  await authService.seedSuperAdmin();
}
