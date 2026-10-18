import { prisma } from '../../db';

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
      take: 30,
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
   * Atomic credit of an approved deposit
   */
  async creditDeposit(userId: string, amount: number, utr?: string, depositId?: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Update wallet balance
      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: amount },
        },
      });

      // 2. Record immutable audit transaction
      await tx.transaction.create({
        data: {
          userId,
          amount,
          type: 'DEPOSIT',
          referenceId: depositId,
          description: `UPI deposit credited: ₹${amount.toFixed(2)}${utr ? ` (UTR: ${utr})` : ''}`,
        },
      });

      return wallet;
    });
  }

  /**
   * Atomic deduction & lock when a player enters a room
   */
  async lockRoomEntry(userId: string, roomId: string, entryFee: number, guessNumber: number) {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet || wallet.balance < entryFee) {
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
      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: entryFee },
          lockedBalance: { increment: entryFee },
        },
      });

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
    });
  }

  /**
   * Refund entry fee if room is cancelled or player leaves before match starts
   */
  async refundRoomEntry(userId: string, roomId: string, entryFee: number) {
    return prisma.$transaction(async (tx) => {
      await tx.roomPlayer.deleteMany({
        where: { roomId, userId },
      });

      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: entryFee },
          lockedBalance: { decrement: entryFee },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          amount: entryFee,
          type: 'REFUND',
          referenceId: roomId,
          description: `Entry fee refunded for Room #${roomId.slice(0, 8)}`,
        },
      });

      return updatedWallet;
    });
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
    return prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: true },
      });

      if (!room) throw new Error('Room not found');
      if (room.status === 'COMPLETED') throw new Error('Room already settled');

      const entryFee = room.entryFee;
      const commissionAmount = (totalPool * commissionPercent) / 100;
      const winnerPrize = totalPool - commissionAmount;

      // 1. Release locked balances for all participating players
      for (const p of room.players) {
        await tx.wallet.update({
          where: { userId: p.userId },
          data: {
            lockedBalance: { decrement: entryFee },
          },
        });
      }

      // 2. Credit the winner's available balance
      const winnerWallet = await tx.wallet.update({
        where: { userId: winnerId },
        data: {
          balance: { increment: winnerPrize },
        },
      });

      // 3. Mark room completed
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: 'COMPLETED',
          winningNumber,
          winnerId,
        },
      });

      // 4. Log winner transaction
      await tx.transaction.create({
        data: {
          userId: winnerId,
          amount: winnerPrize,
          type: 'ROOM_WIN',
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
   */
  async requestWithdrawal(userId: string, amount: number, upiId: string) {
    const roundedAmount = parseFloat(amount.toFixed(2));
    if (isNaN(roundedAmount) || roundedAmount <= 0) {
      throw new Error('Withdrawal amount must be greater than 0');
    }
    const cleanUpi = upiId.trim();
    if (!cleanUpi || !cleanUpi.includes('@')) {
      throw new Error('Valid UPI ID is required (e.g., name@upi)');
    }

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet || wallet.balance < roundedAmount) {
        throw new Error(`Insufficient balance. Available: ₹${wallet?.balance.toFixed(2) || '0.00'}`);
      }

      // Move balance to lockedBalance
      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: roundedAmount },
          lockedBalance: { increment: roundedAmount },
        },
      });

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
      this.io.emit('admin_new_withdrawal', {
        withdrawalId: result.withdrawal.id,
        amount: result.withdrawal.amount,
        userId,
      });
    }

    return result;
  }

  /**
   * Admin approves & completes withdrawal after sending money via UPI
   */
  async completeWithdrawal(withdrawalId: string, payoutUtr: string) {
    const result = await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
      });

      if (!withdrawal) throw new Error('Withdrawal request not found');
      if (withdrawal.status !== 'PENDING') throw new Error(`Withdrawal is already ${withdrawal.status}`);

      // Deduct permanently from lockedBalance
      const wallet = await tx.wallet.update({
        where: { userId: withdrawal.userId },
        data: {
          lockedBalance: { decrement: withdrawal.amount },
        },
      });

      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'COMPLETED',
          payoutUtr,
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
    const result = await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
      });

      if (!withdrawal) throw new Error('Withdrawal request not found');
      if (withdrawal.status !== 'PENDING') throw new Error(`Withdrawal is already ${withdrawal.status}`);

      // Refund from lockedBalance to balance
      const wallet = await tx.wallet.update({
        where: { userId: withdrawal.userId },
        data: {
          balance: { increment: withdrawal.amount },
          lockedBalance: { decrement: withdrawal.amount },
        },
      });

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
    const roundedAmount = parseFloat(amount.toFixed(2));
    if (isNaN(roundedAmount) || roundedAmount === 0) {
      throw new Error('Adjustment amount cannot be zero');
    }

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) throw new Error('User wallet not found');

      if (roundedAmount < 0 && wallet.balance + roundedAmount < 0) {
        throw new Error(`Insufficient balance to deduct ₹${Math.abs(roundedAmount).toFixed(2)}. Available: ₹${wallet.balance.toFixed(2)}`);
      }

      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: roundedAmount },
        },
      });

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

