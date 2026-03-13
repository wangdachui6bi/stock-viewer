#!/usr/bin/env bash
set -euo pipefail

# ========================================
# Manual deploy script for vue-stock-viewer
# Usage: ./deploy.sh [user@host] [deploy-path]
# ========================================

SERVER="${1:?Usage: ./deploy.sh user@host [deploy-path]}"
DEPLOY_PATH="${2:-/opt/vue-stock-viewer}"

echo "==> Deploying to $SERVER:$DEPLOY_PATH"

echo "==> Syncing project files..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude .env.local \
  --exclude '*.log' \
  ./ "$SERVER:$DEPLOY_PATH/"

echo "==> Building and starting on server..."
ssh "$SERVER" "cd $DEPLOY_PATH && docker compose build && docker compose up -d --remove-orphans && docker image prune -f"

echo "==> Done! App is running at http://$SERVER"
