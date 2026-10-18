#!/bin/sh
set -e

echo "======================================================="
echo "  🚀 Starting MoneyGame Central Engine"
echo "======================================================="

# Auto-detect database provider based on DATABASE_URL
if echo "${DATABASE_URL:-}" | grep -qE '^postgres(ql)?://'; then
  echo "📦 Database: PostgreSQL connection detected."
  if [ -f prisma/schema.postgresql.prisma ]; then
    cp prisma/schema.postgresql.prisma prisma/schema.prisma
  fi
else
  echo "📦 Database: SQLite connection detected (${DATABASE_URL:-file:./dev.db})."
fi

# Generate Prisma Client for the active schema
echo "🔄 Generating Prisma Client..."
npx prisma generate

# Synchronize database schema with retry logic
echo "🔄 Synchronizing database schema (prisma db push)..."
MAX_RETRIES=15
RETRY_COUNT=0

if [ "${PRISMA_FORCE_RESET:-false}" = "true" ]; then
  echo "⚠️ PRISMA_FORCE_RESET=true detected. Dropping and re-creating database schema..."
  npx prisma db push --skip-generate --force-reset
else
  until npx prisma db push --skip-generate --accept-data-loss || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    echo "⏳ Database not ready yet... Waiting 2s (Attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
  done

  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "⚠️ Warning: Database synchronization timed out after $MAX_RETRIES attempts. Attempting to start server..."
  fi
fi

echo "🚀 MoneyGame Server listening on port ${PORT:-4000}"
exec node dist/server.js
