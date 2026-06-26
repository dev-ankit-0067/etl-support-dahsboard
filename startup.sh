#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/pids"
mkdir -p "$LOG_DIR"

if [ -f "$PID_FILE" ]; then
  rm -f "$PID_FILE"
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is not installed. Please install Python 3 first." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Please install Node.js first." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not installed. Please install pnpm first." >&2
  exit 1
fi

if [ ! -d "$ROOT_DIR/.venv" ]; then
  echo "Virtual environment not found. Run ./setup.py first." >&2
  exit 1
fi

SUDO_CMD=""
if command -v sudo >/dev/null 2>&1; then
  SUDO_CMD="sudo"
fi

for port in 3000 8080; do
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "$port/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$port" | xargs -r kill 2>/dev/null || true
  fi
done

pkill -f 'vite preview' 2>/dev/null || true
pkill -f 'uvicorn app.main:app' 2>/dev/null || true

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  set +e
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    rm -f "$BACKEND_LOG" 2>/dev/null || true
  fi
  if [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    rm -f "$FRONTEND_LOG" 2>/dev/null || true
  fi
  if [ -f "$PID_FILE" ]; then
    rm -f "$PID_FILE"
  fi
  if command -v nginx >/dev/null 2>&1; then
    $SUDO_CMD nginx -s quit 2>/dev/null || $SUDO_CMD service nginx stop 2>/dev/null || true
  fi
  set -e
}
trap cleanup EXIT

# shellcheck disable=SC1091
source "$ROOT_DIR/.venv/bin/activate"

cd "$ROOT_DIR/aws-backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080 >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
printf '%s\n' "$BACKEND_PID" >> "$PID_FILE"

cd "$ROOT_DIR"
pnpm --dir artifacts/etl-dashboard run serve >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
printf '%s\n' "$FRONTEND_PID" >> "$PID_FILE"

$SUDO_CMD cp "$ROOT_DIR/nginx/default.conf" /etc/nginx/conf.d/default.conf
$SUDO_CMD nginx -t
$SUDO_CMD service nginx restart || $SUDO_CMD systemctl restart nginx

echo "Starting services..."
echo "- Backend: http://127.0.0.1:8080"
echo "- Frontend: http://127.0.0.1:3000"
echo "- Public site: http://127.0.0.1/"
echo "- Logs: $LOG_DIR"
echo "Press Ctrl+C to stop the services."

wait "$BACKEND_PID"
