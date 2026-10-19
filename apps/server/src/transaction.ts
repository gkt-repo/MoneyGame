import { Prisma } from '@prisma/client';
import { prisma } from './db';

// Retry the whole unit of work after a serialization/unique-reservation conflict.
// Callbacks must contain database work only; publish events after commit.
export async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 10000,
      });
    } catch (error: any) {
      if (attempt >= 5 || !['P2034', 'P2002', 'P1008'].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}
