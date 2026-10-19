#!/bin/sh
set -eu

case "${DATABASE_URL:-}" in
  postgres://*|postgresql://*)
    cp prisma/schema.postgresql.prisma prisma/schema.prisma
    rm -rf prisma/migrations
    cp -R prisma/migrations-postgresql prisma/migrations
    ;;
  file:/*) ;;
  *) echo 'Set DATABASE_URL to PostgreSQL or an absolute SQLite file path on a persistent volume.' >&2; exit 1 ;;
esac

if [ "${PRISMA_FORCE_RESET:-false}" = "true" ]; then
  echo 'Automatic database resets are disabled. Apply reviewed migrations instead.' >&2
  exit 1
fi

# Validate secrets before connecting to the database or changing its schema.
node -e "require('./dist/config')"
node scripts/ensure-sqlite.cjs
npx prisma generate
case "${1:-start}" in
  baseline)
    # Explicit one-time adoption of the pre-migration schema; see PAYMENT_FIXES.md.
    exec npx prisma migrate resolve --applied 20261019000000_baseline
    ;;
  start|migrate|rotate-admin) ;;
  *) echo 'Usage: start | migrate | baseline | rotate-admin' >&2; exit 1 ;;
esac

# Auto-resolve previously failed migration if present, so the corrected migration can deploy
node scripts/auto-resolve-migration.cjs


attempt=0
until npx prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 5 ]; then
    echo 'Migration failed. Refusing to start with an outdated schema.' >&2
    exit 1
  fi
  sleep 2
done
case "${1:-start}" in
  migrate) exit 0 ;;
  rotate-admin) exec node scripts/set-admin-password.cjs ;;
  start) exec node dist/server.js ;;
esac
