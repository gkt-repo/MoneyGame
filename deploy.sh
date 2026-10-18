#!/usr/bin/env bash
set -e

# =======================================================
# 🚀 MoneyGame Production Engine Deploy & Always-On Script
# =======================================================

echo "======================================================="
echo "  🚀 MoneyGame Central Engine: Auto-Deploy"
echo "======================================================="

cd "$(dirname "$0")"

echo "📥 Pulling latest codebase from origin/main..."
git pull origin main

echo "🐳 Building unified Docker container (API + Web Portals + DB Sync)..."
docker compose up -d --build

echo "⏳ Waiting for health check..."
sleep 3

HEALTH_OK=false
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:4000/api/health > /dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  echo "⏳ Waiting for server to initialize... (attempt $i/15)"
  sleep 2
done

if [ "$HEALTH_OK" = true ]; then
  echo "======================================================="
  echo "  ✅ MoneyGame Server is HEALTHY & ALWAYS-ON!"
  echo "======================================================="
  echo "  🌐 Player Web Portal:  http://132.226.186.196:4000/"
  echo "  🛡️ Admin Web Portal:   http://132.226.186.196:4000/admin"
  echo "  📱 Mobile API Target:  http://132.226.186.196:4000"
  echo "  🩺 Health Check:       http://132.226.186.196:4000/api/health"
  echo "======================================================="
else
  echo "⚠️ Health check timed out. Inspecting recent container logs:"
  docker compose logs --tail=30 money_game_app
fi
