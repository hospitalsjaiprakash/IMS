#!/usr/bin/env bash
# ==============================================================================
# JPHRC IMS - Staging Deployment Script
# ==============================================================================

set -eo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="staging"
HEALTH_CHECK_URL="http://127.0.0.1:5002/health"
MAX_HEALTH_ATTEMPTS=6
SLEEP_BETWEEN_ATTEMPTS=3

log() {
  echo -e "\033[1;34m[STAGING DEPLOY - $(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"
}

success() {
  echo -e "\033[1;32m[SUCCESS - $(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"
}

error() {
  echo -e "\033[1;31m[ERROR - $(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"
}

log "Navigating to staging application directory: $APP_DIR"
cd "$APP_DIR" || { error "Directory $APP_DIR not found"; exit 1; }

mkdir -p "$APP_DIR/logs" "$APP_DIR/server/uploads"

log "Fetching latest changes from origin/$BRANCH..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

log "Installing staging backend dependencies..."
cd "$APP_DIR/server"
if [ -f "package-lock.json" ]; then
  npm ci --omit=dev --prefer-offline || npm install --omit=dev
else
  npm install --omit=dev
fi

log "Running database migrations on jaiprakash_ims_staging..."
npm run migrate

log "Building staging client bundle..."
cd "$APP_DIR/client"
if [ -f "package-lock.json" ]; then
  npm ci --prefer-offline || npm install
else
  npm install
fi
npm run build

log "Syncing staging client build assets to /home/ims/staging/public_html..."
mkdir -p /home/ims/staging/public_html/assets
rsync -av --delete "$APP_DIR/client/dist/assets/" /home/ims/staging/public_html/assets/
/bin/cp -f "$APP_DIR/client/dist/index.html" /home/ims/staging/public_html/
/bin/cp -f "$APP_DIR/client/dist/"*.svg /home/ims/staging/public_html/ 2>/dev/null || true
/bin/cp -f "$APP_DIR/client/dist/.htaccess" /home/ims/staging/public_html/ 2>/dev/null || true
chown -R ims:ims /home/ims/staging/public_html 2>/dev/null || true

log "Reloading staging PM2 service..."
cd "$APP_DIR"
pm2 reload ecosystem.staging.config.js || pm2 start ecosystem.staging.config.js

log "Verifying staging backend health check at $HEALTH_CHECK_URL..."
ATTEMPT=1
HEALTHY=false

while [ $ATTEMPT -le $MAX_HEALTH_ATTEMPTS ]; do
  log "Health check attempt $ATTEMPT of $MAX_HEALTH_ATTEMPTS..."
  if curl -sf -m 5 "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep $SLEEP_BETWEEN_ATTEMPTS
  ATTEMPT=$((ATTEMPT + 1))
done

if [ "$HEALTHY" = true ]; then
  success "Staging deployment completed successfully!"
else
  error "Staging health check failed!"
  pm2 logs jphrc-ims-staging-api --lines 40 --nostream
  exit 1
fi
