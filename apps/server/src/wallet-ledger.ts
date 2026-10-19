import { Prisma } from '@prisma/client';
import { toPaise } from './money';

// Call only inside a serializable transaction. Persist canonical two-decimal
// amounts instead of accumulating binary floating-point increments.
export async function moveWallet(tx: Prisma.TransactionClient, userId: string, availableDelta: number, lockedDelta = 0) {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error('Wallet not found');
  const balance = toPaise(wallet.balance) + toPaise(availableDelta);
  const locked = toPaise(wallet.lockedBalance) + toPaise(lockedDelta);
  if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(locked) || balance < 0 || locked < 0) {
    throw new Error('Insufficient wallet balance or invalid balance movement');
  }
  return tx.wallet.update({ where: { userId }, data: { balance: balance / 100, lockedBalance: locked / 100 } });
}
