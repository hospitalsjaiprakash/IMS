#!/usr/bin/env bash
# ==============================================================================
# JPHRC IMS - Production Auto-Deployment Script
#
# Executed on the VPS to deploy updates with zero downtime.
# Can be executed directly or triggered remotely via GitHub Actions.
# ==============================================================================

set -eo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="main"
HEALTH_CHECK_URL="http://127.0.0.1:5000/health"
MAX_HEALTH_ATTEMPTS=6
SLEEP_BETWEEN_ATTEMPTS=3

log() {
  echo -e "\033[1;34m[DEPLOY - $(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"
}

success() {
  echo -e "\033[1;32m[SUCCESS - $(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"
}

error() {
  echo -e "\033[1;31m[ERROR - $(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"
}

# 1. Navigate to application root
log "Navigating to application directory: $APP_DIR"
cd "$APP_DIR" || { error "Directory $APP_DIR not found"; exit 1; }

# Record previous stable commit for automated rollback if needed
PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")

# Create logs directory if needed
mkdir -p "$APP_DIR/logs"

# 2. Pull latest code from GitHub
log "Fetching latest changes from origin/$BRANCH..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B | head -n 1)
log "Target commit: $COMMIT_HASH (\"$COMMIT_MSG\")"

# 3. Install backend dependencies
log "Installing backend dependencies..."
cd "$APP_DIR/server"
if [ -f "package-lock.json" ]; then
  npm ci --omit=dev --prefer-offline || npm install --omit=dev
else
  npm install --omit=dev
fi

# 4. Run automated database migrations
log "Running database migrations..."
npm run migrate

# 5. Install frontend dependencies and build assets
log "Building frontend client bundle..."
cd "$APP_DIR/client"
if [ -f "package-lock.json" ]; then
  npm ci --prefer-offline || npm install
else
  npm install
fi
npm run build

# If public_html exists outside client/dist, sync built assets to public_html
if [ -d "/home/ims/public_html" ] && [ "$APP_DIR/client/dist" != "/home/ims/public_html" ]; then
  log "Syncing client build assets to /home/ims/public_html..."
  # Cleanly prune old hashed bundle assets while safeguarding OVIPanel / system files
  mkdir -p /home/ims/public_html/assets
  rsync -av --delete "$APP_DIR/client/dist/assets/" /home/ims/public_html/assets/
  # Copy root static assets
  cp "$APP_DIR/client/dist/index.html" /home/ims/public_html/
  cp "$APP_DIR/client/dist/"*.svg /home/ims/public_html/ 2>/dev/null || true
  cp "$APP_DIR/client/dist/.htaccess" /home/ims/public_html/ 2>/dev/null || true
  chown -R ims:ims /home/ims/public_html/assets /home/ims/public_html/index.html 2>/dev/null || true
fi

# 6. Run automated test suite before reload
log "Executing automated server tests..."
cd "$APP_DIR/server"
npm test

# 7. Zero-downtime rolling reload via PM2
log "Reloading PM2 cluster with updated environment..."
cd "$APP_DIR"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

# 8. Post-deployment health verification
log "Verifying backend health check at $HEALTH_CHECK_URL..."
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
  success "Health check passed! Deployment of commit $COMMIT_HASH completed successfully."
else
  error "Health check failed after $MAX_HEALTH_ATTEMPTS attempts!"
  error "Dumping recent PM2 logs for diagnostics:"
  pm2 logs jphrc-ims-api --lines 40 --nostream
  if [ -n "$PREV_COMMIT" ] && [ "$PREV_COMMIT" != "$COMMIT_HASH" ]; then
    error "Initiating automated rollback to previous stable commit: $PREV_COMMIT..."
    cd "$APP_DIR"
    git reset --hard "$PREV_COMMIT"
    cd "$APP_DIR/server" && (npm ci --omit=dev || npm install --omit=dev)
    cd "$APP_DIR" && pm2 reload ecosystem.config.js --update-env
    error "Rollback to $PREV_COMMIT completed. Application restored to previous version."
  fi
  exit 1
fi
