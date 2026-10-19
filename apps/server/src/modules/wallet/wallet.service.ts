import { prisma } from '../../db';
import { moveWallet } from '../../wallet-ledger';
import { Prisma } from '@prisma/client';
import { serializable } from '../../transaction';
import { money, bankReference, toPaise } from '../../money';

export class WalletService {
  private io: any = null;

  setSocketServer(io: any) {
    this.io = io;
  }

  /**
   * Fetch all withdrawals for a specific user
   */
  async getUserWithdrawals(userId: string) {
    return prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Fetch complete financial transaction ledger/passbook for a user
   */
  async getUserTransactions(userId: string, limit = 50) {
    return prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Fetch or auto-create a user and initialize their zero-balance wallet
   */
  async getOrCreateUser(username: string) {
    let user = await prisma.user.findUnique({
      where: { username },
      include: { wallet: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          username,
          passwordHash: '$2a$10$placeholder.hash.for.legacy.users.only.need.reset',
          wallet: {
            create: {
              balance: 0.0,
              lockedBalance: 0.0,
            },
          },
        },
        include: { wallet: true },
      });
    }

    return user;
  }

  /**
   * Get user wallet details
   */
  async getWallet(userId: string) {
    return prisma.wallet.findUnique({
      where: { userId },
    });
  }

  /**
   * Atomic deduction & lock when a player enters a room
   */
  async lockRoomEntry(tx: Prisma.TransactionClient, userId: string, roomId: string, entryFee: number, guessNumber: number) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet || toPaise(wallet.balance) < toPaise(entryFee)) {
      throw new Error(`Insufficient wallet balance. Required: ₹${entryFee.toFixed(2)}, Available: ₹${wallet?.balance.toFixed(2) || '0.00'}`);
    }

    // Check if guess is already taken in this room
    const existingGuess = await tx.roomPlayer.findFirst({
      where: { roomId, guessNumber },
    });
    if (existingGuess) {
      throw new Error(`Number ${guessNumber} has already been taken by another player!`);
    }

    // Check if user is already in this room
    const existingPlayer = await tx.roomPlayer.findFirst({
      where: { roomId, userId },
    });
    if (existingPlayer) {
      throw new Error('You have already joined this room.');
    }

    // Deduct available balance and add to lockedBalance
    const updatedWallet = await moveWallet(tx, userId, -entryFee, entryFee);

    // Register player in room
    const playerRecord = await tx.roomPlayer.create({
      data: {
        roomId,
        userId,
        guessNumber,
      },
    });

    // Audit ledger
    await tx.transaction.create({
      data: {
        userId,
        amount: -entryFee,
        type: 'ROOM_ENTRY',
        referenceId: roomId,
        description: `Entry fee locked for Room #${roomId.slice(0, 8)} (Guess: ${guessNumber})`,
      },
    });

    return { wallet: updatedWallet, player: playerRecord };
  }

  /**
   * Settle room: Release locked balances from all players, deduct platform commission,
   * and credit the net pool to the winner's wallet.
   */
  async settleRoomWinner(
    roomId: string,
    winnerId: string,
    winningNumber: number,
    totalPool: number,
    commissionPercent: number
  ) {
    return serializable(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: true },
      });

      if (!room) throw new Error('Room not found');
      if (room.status !== 'ROLLING') throw new Error('Room is not awaiting settlement');
      if (!room.players.some(p => p.userId === winnerId && p.guessNumber === winningNumber)) throw new Error('Invalid winner');
      totalPool = toPaise(room.entryFee) * room.players.length / 100;
      if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) throw new Error('Invalid commission');

      const entryFee = room.entryFee;
      const commissionAmount = Math.round(toPaise(totalPool) * commissionPercent / 100) / 100;
      const winnerPrize = (toPaise(totalPool) - toPaise(commissionAmount)) / 100;

      // 1. Release locked balances for all participating players
      for (const p of room.players) {
        await moveWallet(tx, p.userId, 0, -entryFee);
      }

      // 2. Credit the winner's available balance
      const winnerWallet = await moveWallet(tx, winnerId, winnerPrize);

      // 3. Mark room completed
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: 'COMPLETED',
          winningNumber,
          winnerId,
          winnerPrize,
        },
      });

      // 4. Log winner transaction
      await tx.transaction.create({
        data: {
          userId: winnerId,
          amount: winnerPrize,
          type: 'ROOM_WIN',
          idempotencyKey: `room-win:${roomId}`,
          referenceId: roomId,
          description: `Won Room #${room.roomCode} (Roll: ${winningNumber}). Net prize: ₹${winnerPrize.toFixed(2)}`,
        },
      });

      return {
        winnerId,
        winnerPrize,
        commissionAmount,
        winningNumber,
        winnerWallet,
      };
    });
  }

  /**
   * Request withdrawal: locks balance immediately to prevent double spending
   * Enforces single active pending request limit and strict UPI address format
   */
  async requestWithdrawal(userId: string, amount: number, upiId: string) {
    const roundedAmount = money(amount, 10);
    if (isNaN(roundedAmount) || roundedAmount <= 0) {
      throw new Error('Withdrawal amount must be greater than 0');
    }
    if (roundedAmount < 10) {
      throw new Error('Minimum withdrawal limit is ₹10.00');
    }

    const cleanUpi = typeof upiId === 'string' ? upiId.trim() : '';
    const vpaRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    if (!vpaRegex.test(cleanUpi)) {
      throw new Error('Valid UPI ID is required (e.g., 9876543210@paytm or user@okhdfcbank)');
    }

    const result = await serializable(async (tx) => {
      const existingPending = await tx.withdrawal.findFirst({
        where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
      });
      if (existingPending) throw new Error('You already have a pending withdrawal request under review.');
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet || toPaise(wallet.balance) < toPaise(roundedAmount)) {
        throw new Error(`Insufficient balance. Available: ₹${wallet?.balance.toFixed(2) || '0.00'}`);
      }

      // Move balance to lockedBalance
      const updatedWallet = await moveWallet(tx, userId, -roundedAmount, roundedAmount);

      const withdrawal = await tx.withdrawal.create({
        data: {
          userId,
          amount: roundedAmount,
          upiId: cleanUpi,
          status: 'PENDING',
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          amount: -roundedAmount,
          type: 'WITHDRAWAL_LOCK',
          referenceId: withdrawal.id,
          description: `Withdrawal request of ₹${roundedAmount.toFixed(2)} to ${cleanUpi} (Pending Admin Payout)`,
        },
      });

      return { withdrawal, wallet: updatedWallet };
    });

    if (this.io) {
      this.io.to(`user:${userId}`).emit('balance_updated', {
        balance: result.wallet.balance,
        lockedBalance: result.wallet.lockedBalance,
      });
      this.io.to('admin_channel').emit('admin_new_withdrawal', {
        withdrawalId: result.withdrawal.id,
        amount: result.withdrawal.amount,
        userId,
      });
    }

    return result;
  }

  /**
   * Admin approves & completes withdrawal after sending money via UPI
   * Verifies UTR uniqueness to prevent duplicate settlements
   */
  async completeWithdrawal(withdrawalId: string, payoutUtr: string) {
    const cleanUtr = bankReference(payoutUtr);
    if (!cleanUtr) throw new Error('Bank payout UTR is required');

    const duplicateUtr = await prisma.withdrawal.findFirst({
      where: { payoutUtr: cleanUtr, status: 'COMPLETED' },
    });
    if (duplicateUtr && duplicateUtr.id !== withdrawalId) {
      throw new Error(`Bank payout UTR ${cleanUtr} has already been recorded for a previous withdrawal (#${duplicateUtr.id.slice(0, 8)})`);
    }

    const result = await serializable(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
      });

      if (!withdrawal) throw new Error('Withdrawal request not found');
      if (withdrawal.status !== 'PENDING') throw new Error(`Withdrawal is already ${withdrawal.status}`);

      // Deduct permanently from lockedBalance
      const wallet = await moveWallet(tx, withdrawal.userId, 0, -withdrawal.amount);

      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'COMPLETED',
          payoutUtr: cleanUtr,
        },
      });

      await tx.transaction.create({
        data: {
          userId: withdrawal.userId,
          amount: 0,
          type: 'WITHDRAWAL_COMPLETE',
          referenceId: withdrawal.id,
          description: `Withdrawal of ₹${withdrawal.amount.toFixed(2)} completed. Payout UTR: ${payoutUtr}`,
        },
      });

      return { withdrawal: updatedWithdrawal, wallet };
    });

    if (this.io) {
      this.io.to(`user:${result.withdrawal.userId}`).emit('withdrawal_completed', {
        withdrawalId: result.withdrawal.id,
        payoutUtr,
      });
      this.io.to(`user:${result.withdrawal.userId}`).emit('balance_updated', {
        balance: result.wallet.balance,
        lockedBalance: result.wallet.lockedBalance,
      });
    }

    return result;
  }

  /**
   * Admin rejects withdrawal and refunds locked balance back to available balance
   */
  async rejectWithdrawal(withdrawalId: string, reason?: string) {
    const result = await serializable(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
      });

      if (!withdrawal) throw new Error('Withdrawal request not found');
      if (withdrawal.status !== 'PENDING') throw new Error(`Withdrawal is already ${withdrawal.status}`);

      // Refund from lockedBalance to balance
      const wallet = await moveWallet(tx, withdrawal.userId, withdrawal.amount, -withdrawal.amount);

      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'REJECTED',
          reason: reason || 'Declined by administrator',
        },
      });

      await tx.transaction.create({
        data: {
          userId: withdrawal.userId,
          amount: withdrawal.amount,
          type: 'REFUND',
          referenceId: withdrawal.id,
          description: `Withdrawal of ₹${withdrawal.amount.toFixed(2)} rejected${reason ? `: ${reason}` : ''}. Funds refunded.`,
        },
      });

      return { withdrawal: updatedWithdrawal, wallet };
    });

    if (this.io) {
      this.io.to(`user:${result.withdrawal.userId}`).emit('withdrawal_rejected', {
        withdrawalId: result.withdrawal.id,
        reason,
      });
      this.io.to(`user:${result.withdrawal.userId}`).emit('balance_updated', {
        balance: result.wallet.balance,
        lockedBalance: result.wallet.lockedBalance,
      });
    }

    return result;
  }

  /**
   * Admin manual balance adjustment (credit or debit)
   */
  async adjustBalance(userId: string, amount: number, reason: string, adminId: string) {
    const roundedAmount = Math.sign(amount) * money(Math.abs(amount));
    if (isNaN(roundedAmount) || roundedAmount === 0) {
      throw new Error('Adjustment amount cannot be zero');
    }

    const result = await serializable(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) throw new Error('User wallet not found');

      if (roundedAmount < 0 && toPaise(wallet.balance) + toPaise(roundedAmount) < 0) {
        throw new Error(`Insufficient balance to deduct ₹${Math.abs(roundedAmount).toFixed(2)}. Available: ₹${wallet.balance.toFixed(2)}`);
      }

      const updatedWallet = await moveWallet(tx, userId, roundedAmount);

      const txRecord = await tx.transaction.create({
        data: {
          userId,
          amount: roundedAmount,
          type: 'MANUAL_ADJUST',
          description: `Admin balance adjustment (${roundedAmount > 0 ? '+' : ''}₹${roundedAmount.toFixed(2)}): ${reason}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          targetId: userId,
          action: 'MANUAL_ADJUST',
          details: JSON.stringify({
            amount: roundedAmount,
            reason,
            prevBalance: wallet.balance,
            newBalance: updatedWallet.balance,
            transactionId: txRecord.id,
          }),
        },
      });

      return { wallet: updatedWallet, transaction: txRecord };
    });

    if (this.io) {
      this.io.to(`user:${userId}`).emit('balance_updated', {
        balance: result.wallet.balance,
        lockedBalance: result.wallet.lockedBalance,
      });
    }

    return result;
  }
}

export const walletService = new WalletService();

