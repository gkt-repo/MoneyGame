import { prisma } from '../../db';
import { moveWallet } from '../../wallet-ledger';
import { Prisma } from '@prisma/client';
import { serializable } from '../../transaction';
import { money, bankReference, toPaise } from '../../money';
import { notificationService } from '../notification/notification.service';

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
  async lockRoomEntry(
    tx: Prisma.TransactionClient,
    userId: string,
    roomId: string,
    entryFee: number,
    guessNumber?: number | null,
    seatIndex?: number,
    skipTransaction = false
  ) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet || toPaise(wallet.balance) < toPaise(entryFee)) {
      throw new Error(`Insufficient wallet balance. Required: ₹${entryFee.toFixed(2)}, Available: ₹${wallet?.balance.toFixed(2) || '0.00'}`);
    }

    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw new Error('Room not found');

    // Check if guess is already taken in this room (only for games that require unique numbers like GUESS_NUMBER)
    if (room.gameType === 'GUESS_NUMBER' && guessNumber !== undefined && guessNumber !== null) {
      const existingGuess = await tx.roomPlayer.findFirst({
        where: { roomId, guessNumber },
      });
      if (existingGuess) {
        throw new Error(`Number ${guessNumber} has already been taken by another player!`);
      }
    }

    // Check if user is already in this room
    const existingPlayer = await tx.roomPlayer.findFirst({
      where: { roomId, userId },
    });
    if (existingPlayer) {
      throw new Error('You have already joined this room.');
    }

    // Assign next available seat if seatIndex not specified
    if (seatIndex === undefined || seatIndex === null) {
      const takenSeats = await tx.roomPlayer.findMany({ where: { roomId }, select: { seatIndex: true } });
      const takenSet = new Set(takenSeats.map(s => s.seatIndex));
      seatIndex = 0;
      while (takenSet.has(seatIndex)) seatIndex++;
    } else {
      if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= room.maxPlayers) {
        throw new Error(`Invalid seat index: ${seatIndex}. Must be between 0 and ${room.maxPlayers - 1}`);
      }
      const existingSeat = await tx.roomPlayer.findFirst({
        where: { roomId, seatIndex },
      });
      if (existingSeat) {
        throw new Error(`Seat ${seatIndex} is already occupied`);
      }
    }

    // Deduct available balance and add to lockedBalance
    const updatedWallet = await moveWallet(tx, userId, -entryFee, entryFee);

    // Register player in room
    const playerRecord = await tx.roomPlayer.create({
      data: {
        roomId,
        userId,
        seatIndex,
        guessNumber: guessNumber ?? null,
      },
    });

    // Audit ledger - only if not deferred to round settlement
    if (!skipTransaction) {
      await tx.transaction.create({
        data: {
          userId,
          amount: -entryFee,
          type: 'ROOM_ENTRY',
          referenceId: roomId,
          description: `Entry fee locked for Room #${roomId.slice(0, 8)}${guessNumber != null ? ` (Guess: ${guessNumber})` : ''}`,
        },
      });
    }

    return { wallet: updatedWallet, player: playerRecord };
  }

  /**
   * Deducts in-game bet (Chaal, Blind, Show) from available balance and moves to lockedBalance in real-time.
   * Atomically verifies balance to strictly prevent negative balance, persists the room stake, and skips intermediate passbook records
   * so only the final round settlement is shown in transaction history.
   */
  async lockGameBet(userId: string, roomId: string, amount: number, actionName: string) {
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(toPaise(amount))) {
      throw new Error(`Invalid bet amount for ${actionName}: ₹${amount}`);
    }

    return serializable(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || toPaise(wallet.balance) < toPaise(amount)) {
        throw new Error(
          `Insufficient balance for ${actionName}. Available: ₹${wallet?.balance.toFixed(2) || '0.00'}, Required: ₹${amount.toFixed(2)}`
        );
      }

      const updatedWallet = await moveWallet(tx, userId, -amount, amount);

      // Persist accumulated in-game bet for this user and room
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (room) {
        let configObj: Record<string, any> = {};
        try {
          if (room.customConfig) configObj = JSON.parse(room.customConfig);
        } catch (_) {}
        configObj.playerStakes = configObj.playerStakes || {};
        configObj.playerStakes[userId] = (configObj.playerStakes[userId] || 0) + amount;
        await tx.room.update({
          where: { id: roomId },
          data: { customConfig: JSON.stringify(configObj) },
        });
      }

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
    winningNumber: number | null,
    totalPool: number,
    commissionPercent: number,
    playerBets?: Record<string, number>
  ) {
    return serializable(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: true },
      });

      if (!room) throw new Error('Room not found');

      if (room.gameType === 'GUESS_NUMBER') {
        if (room.status !== 'ROLLING') throw new Error('Room is not awaiting settlement');
        if (!room.players.some(p => p.userId === winnerId && p.guessNumber === winningNumber)) {
          throw new Error('Invalid winner');
        }
        totalPool = (toPaise(room.entryFee) * room.players.length) / 100;
      } else {
        if (!['PLAYING', 'ROLLING'].includes(room.status)) {
          throw new Error('Room is not awaiting settlement');
        }
        if (!room.players.some(p => p.userId === winnerId)) {
          throw new Error('Winner is not a participant in this room');
        }
        const minPool = (toPaise(room.entryFee) * room.players.length) / 100;
        totalPool = Math.max(totalPool || 0, minPool);
      }

      if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
        throw new Error('Invalid commission');
      }

      // Strict conservation check: totalPool must equal the exact sum of released stakes
      let expectedPoolPaise = 0;
      for (const p of room.players) {
        const lockedToRelease = playerBets && typeof playerBets[p.userId] === 'number'
          ? playerBets[p.userId]
          : room.entryFee;
        expectedPoolPaise += toPaise(lockedToRelease);
      }
      if (toPaise(totalPool) !== expectedPoolPaise) {
        throw new Error(`Mismatched settlement pool. Expected: ₹${expectedPoolPaise / 100}, Provided: ₹${totalPool}`);
      }

      const entryFee = room.entryFee;
      const commissionAmount = Math.round(toPaise(totalPool) * commissionPercent / 100) / 100;
      const winnerPrize = (toPaise(totalPool) - toPaise(commissionAmount)) / 100;

      // 1. Release locked balances for all participating players
      for (const p of room.players) {
        const lockedToRelease = playerBets && typeof playerBets[p.userId] === 'number'
          ? playerBets[p.userId]
          : entryFee;
        await moveWallet(tx, p.userId, 0, -lockedToRelease);
      }

      // 2. Credit the winner's available balance
      const winnerWallet = await moveWallet(tx, winnerId, winnerPrize);

      const resolvedWinningNumber = room.gameType === 'GUESS_NUMBER' ? winningNumber : null;

      // 3. Mark room completed and durably record settled pool and commission
      let configObj: Record<string, any> = {};
      try {
        if (room.customConfig) configObj = JSON.parse(room.customConfig);
      } catch (_) {}
      configObj.settledPool = totalPool;
      configObj.platformCommission = commissionAmount;

      await tx.room.update({
        where: { id: roomId },
        data: {
          status: 'COMPLETED',
          winningNumber: resolvedWinningNumber,
          winnerId,
          winnerPrize,
          customConfig: JSON.stringify(configObj),
        },
      });

      // 4. Log transactions: For dynamic round-settled games (TEEN_PATTI), record final settlement per participant
      if (room.gameType === 'TEEN_PATTI' || playerBets) {
        for (const p of room.players) {
          const totalBet = playerBets && typeof playerBets[p.userId] === 'number'
            ? playerBets[p.userId]
            : entryFee;

          if (p.userId === winnerId) {
            const netEarnings = (toPaise(winnerPrize) - toPaise(totalBet)) / 100;
            if (netEarnings >= 0) {
              await tx.transaction.create({
                data: {
                  userId: winnerId,
                  amount: netEarnings,
                  type: 'ROOM_WIN',
                  idempotencyKey: `room-win:${roomId}`,
                  referenceId: roomId,
                  description: `Won Table #${room.roomCode} (${room.gameType}). Net prize: ₹${netEarnings.toFixed(2)} (Prize: ₹${winnerPrize.toFixed(2)} - Bet: ₹${totalBet.toFixed(2)})`,
                },
              });
            } else {
              await tx.transaction.create({
                data: {
                  userId: winnerId,
                  amount: netEarnings,
                  type: 'ROOM_ENTRY',
                  idempotencyKey: `room-win:${roomId}`,
                  referenceId: roomId,
                  description: `Table #${room.roomCode} (${room.gameType}). Net settlement: -₹${Math.abs(netEarnings).toFixed(2)}`,
                },
              });
            }
          } else {
            await tx.transaction.create({
              data: {
                userId: p.userId,
                amount: -totalBet,
                type: 'ROOM_ENTRY',
                idempotencyKey: `room-loss:${roomId}:${p.userId}`,
                referenceId: roomId,
                description: `Table #${room.roomCode} (${room.gameType}): Round settlement (Lost ₹${totalBet.toFixed(2)})`,
              },
            });
          }
        }
      } else {
        await tx.transaction.create({
          data: {
            userId: winnerId,
            amount: winnerPrize,
            type: 'ROOM_WIN',
            idempotencyKey: `room-win:${roomId}`,
            referenceId: roomId,
            description: room.gameType === 'GUESS_NUMBER'
              ? `Won Room #${room.roomCode} (Roll: ${winningNumber}). Net prize: ₹${winnerPrize.toFixed(2)}`
              : `Won Room #${room.roomCode} (${room.gameType}). Net prize: ₹${winnerPrize.toFixed(2)}`,
          },
        });
      }

      return {
        winnerId,
        winnerPrize,
        commissionAmount,
        winningNumber: resolvedWinningNumber,
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

    // Trigger in-app notification for the player
    notificationService.create({
      userId: result.withdrawal.userId,
      title: 'Withdrawal Completed',
      message: `Your withdrawal of ₹${result.withdrawal.amount.toFixed(2)} has been sent to your UPI ID (${result.withdrawal.upiId}). Bank Payout UTR: ${cleanUtr}`,
      type: 'WITHDRAWAL_COMPLETED',
      metadata: {
        withdrawalId: result.withdrawal.id,
        amount: result.withdrawal.amount,
        upiId: result.withdrawal.upiId,
        payoutUtr: cleanUtr,
      },
    }).catch(err => console.error('Failed to create withdrawal completed notification:', err));

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

    // Trigger in-app notification for the player
    notificationService.create({
      userId: result.withdrawal.userId,
      title: 'Withdrawal Rejected',
      message: `Your withdrawal request of ₹${result.withdrawal.amount.toFixed(2)} was rejected${reason ? `: ${reason}` : ''}. ₹${result.withdrawal.amount.toFixed(2)} has been refunded to your wallet.`,
      type: 'WITHDRAWAL_REJECTED',
      metadata: {
        withdrawalId: result.withdrawal.id,
        amount: result.withdrawal.amount,
        reason: reason || 'Declined by administrator',
      },
    }).catch(err => console.error('Failed to create withdrawal rejected notification:', err));

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
          type: roundedAmount >= 0 ? 'MANUAL_CREDIT' : 'MANUAL_DEBIT',
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

export async function getEffectiveCommissionPercent(): Promise<number> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'platform_commission' } });
    if (setting?.value && !isNaN(parseFloat(setting.value))) {
      return parseFloat(setting.value);
    }
  } catch {}
  const { config } = await import('../../config');
  return config.platformCommissionPercent || 0;
}

