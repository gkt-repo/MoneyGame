#!/usr/bin/env bash
set -euo pipefail

# =======================================================
# 💾 MoneyGame Automated Production Database Backup Script
# =======================================================

BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

echo "======================================================="
echo "  💾 MoneyGame Database Backup: $TIMESTAMP"
echo "======================================================="

# Check if PostgreSQL container is running
if docker ps --format '{{.Names}}' | grep -q "^money_game_db$"; then
  BACKUP_FILE="$BACKUP_DIR/moneygame_pg_${TIMESTAMP}.sql.gz"
  echo "📦 Backing up PostgreSQL container (money_game_db) -> $BACKUP_FILE..."
  docker exec -t money_game_db pg_dump -U "${POSTGRES_USER:-money_user}" "${POSTGRES_DB:-money_game}" | gzip > "$BACKUP_FILE"
  echo "✅ PostgreSQL backup completed: $(du -h "$BACKUP_FILE" | cut -f1)"

elif [ -f "$(dirname "$0")/../apps/server/prisma/dev.db" ]; then
  # Fallback SQLite backup
  SQLITE_SRC="$(dirname "$0")/../apps/server/prisma/dev.db"
  BACKUP_FILE="$BACKUP_DIR/moneygame_sqlite_${TIMESTAMP}.db"
  echo "📦 Backing up SQLite database ($SQLITE_SRC) -> $BACKUP_FILE..."
  sqlite3 "$SQLITE_SRC" ".backup '$BACKUP_FILE'"
  gzip "$BACKUP_FILE"
  echo "✅ SQLite backup completed: $(du -h "${BACKUP_FILE}.gz" | cut -f1)"

else
  echo "⚠️ No running money_game_db container or dev.db file found. Checking DATABASE_URL..."
  if [[ "${DATABASE_URL:-}" =~ postgres(ql)?://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/([^?]+) ]]; then
    BACKUP_FILE="$BACKUP_DIR/moneygame_pg_${TIMESTAMP}.sql.gz"
    pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
    echo "✅ Remote PostgreSQL backup completed: $(du -h "$BACKUP_FILE" | cut -f1)"
  else
    echo "❌ Backup aborted: No supported database source detected."
    exit 1
  fi
fi

# Clean up backups older than RETENTION_DAYS
echo "🧹 Purging backups older than $RETENTION_DAYS days in $BACKUP_DIR..."
find "$BACKUP_DIR" -type f \( -name "*.sql.gz" -o -name "*.db.gz" \) -mtime +$RETENTION_DAYS -delete
echo "✨ Backup job finished successfully!"
