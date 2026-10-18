import { PrismaClient } from '@prisma/client';

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
        { key: 'admin_upi_id', value: process.env.ADMIN_UPI_ID || 'admin@okhdfcbank' },
        { key: 'admin_upi_name', value: process.env.ADMIN_UPI_NAME || 'MoneyGame Admin' },
        { key: 'platform_commission', value: process.env.PLATFORM_COMMISSION_PERCENT || '10' },
      ],
    });
  }
}
