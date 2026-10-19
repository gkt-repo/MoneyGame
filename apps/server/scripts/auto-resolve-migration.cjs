const { execSync } = require('child_process');

async function main() {
  console.log('[Migration Watchdog] Checking database migration status...');
  let statusOutput = '';
  try {
    statusOutput = execSync('npx prisma migrate status', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    statusOutput = stdout + '\n' + stderr;
  }

  if (statusOutput.includes('failed migrations') || statusOutput.includes('failed')) {
    console.log('[Migration Watchdog] Detected failed migration in status output.');
    const matches = statusOutput.match(/[0-9]{14}_[a-zA-Z0-9_]+/g);
    if (matches && matches.length > 0) {
      const uniqueNames = [...new Set(matches)];
      for (const migrationName of uniqueNames) {
        console.log(`[Migration Watchdog] Resolving failed migration: ${migrationName} as rolled-back...`);
        try {
          execSync(`npx prisma migrate resolve --rolled-back "${migrationName}"`, {
            stdio: 'inherit',
          });
          console.log(`[Migration Watchdog] Successfully marked ${migrationName} as rolled-back.`);
        } catch (resolveErr) {
          console.warn(`[Migration Watchdog] prisma migrate resolve warning:`, resolveErr.message);
        }
      }
    }
  } else {
    console.log('[Migration Watchdog] Migration status clean.');
  }

  // Fallback: If PostgreSQL, ensure any migration with finished_at = null is marked rolled-back in _prisma_migrations
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      try {
        const count = await prisma.$executeRawUnsafe(
          `UPDATE "_prisma_migrations" SET "rolled_back_at" = NOW() WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL;`
        );
        if (count > 0) {
          console.log(`[Migration Watchdog] DB fallback: marked ${count} unfinished migration(s) as rolled-back.`);
        }
      } catch (sqlErr) {
        // Table may not exist yet if database is completely new
      } finally {
        await prisma.$disconnect();
      }
    } catch (clientErr) {
      // Prisma client might not be available or connectable yet
    }
  }
}

main().catch(err => {
  console.warn('[Migration Watchdog] Non-fatal check error:', err.message);
});
