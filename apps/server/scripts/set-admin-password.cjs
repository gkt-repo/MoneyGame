// Explicit maintenance command; never executed automatically by startup.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const password = process.env.ADMIN_INITIAL_PASSWORD || '';
  const email = (process.env.ADMIN_INITIAL_EMAIL || 'admin@moneygame.com').trim().toLowerCase();
  if (password.length < 12 || password === 'Admin@123456') throw new Error('Set a unique ADMIN_INITIAL_PASSWORD of at least 12 characters');
  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin || !['ADMIN', 'SUPER_ADMIN'].includes(admin.role)) throw new Error('Admin account not found for ADMIN_INITIAL_EMAIL');
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: admin.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId: admin.id }, data: { revokedAt: new Date() } }),
  ]);
  console.log('Admin password updated and refresh sessions revoked.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
