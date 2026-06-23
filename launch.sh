#!/usr/bin/env bash
#
# launch.sh — one command to bring up the whole LLM benchmarking stack:
#   Redis (docker)  +  API :3001  +  Frontend :7755  +  Worker
#
# Usage:
#   ./launch.sh           start everything (Ctrl+C stops API/frontend/worker)
#   ./launch.sh --force   start, killing any process on 3001/7755 without asking
#   ./launch.sh --stop    stop everything, including the Redis container
#
set -euo pipefail
cd "$(dirname "$0")"

API_PORT=3001
WEB_PORT=7755
FORCE=0

# If a port is taken, report who holds it and ask before killing.
# --force (or a non-TTY shell with --force) skips the prompt.
free_port() {
  local port="$1" label="$2" pids ans
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -z "$pids" ]]; then
    echo "  Port $port ($label) is free."
    return 0
  fi

  echo "⚠ Port $port ($label) is in use by PID(s): $(echo "$pids" | tr '\n' ' ')"
  ps -o pid=,comm= -p $(echo "$pids" | tr '\n' ' ') 2>/dev/null | sed 's/^/    /' || true

  if [[ "$FORCE" == "1" ]]; then
    echo "  --force set — terminating without asking."
  elif [[ ! -t 0 ]]; then
    echo "✗ Port $port is busy and there's no terminal to confirm." >&2
    echo "  Re-run with --force to terminate it, or free the port manually." >&2
    exit 1
  else
    read -r -p "  Terminate this process and run the app on $port? [y/N] " ans
    if [[ ! "$ans" =~ ^[Yy]$ ]]; then
      echo "✗ Aborted — port $port left untouched. (Free it yourself, pick another, or use --force.)" >&2
      exit 1
    fi
  fi

  echo "  Terminating PID(s) to free $port…"
  echo "$pids" | xargs kill 2>/dev/null || true
  sleep 1
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "  Still holding $port — force killing (kill -9)…"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
  if lsof -ti :"$port" >/dev/null 2>&1; then
    echo "✗ Could not free port $port. Stop whatever is using it and retry." >&2
    exit 1
  fi
  echo "  ✓ Port $port released."
}

stop_all() {
  echo "▶ Stopping API/frontend/worker…"
  lsof -ti :"$API_PORT" :"$WEB_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
  echo "▶ Stopping Redis…"
  docker compose down >/dev/null 2>&1 || true
  echo "✓ All stopped."
}

for arg in "$@"; do
  case "$arg" in
    --stop)        stop_all; exit 0 ;;
    --force|-y)    FORCE=1 ;;
    -h|--help)
      echo "Usage: ./launch.sh [--force|-y] [--stop]"
      echo "  --force, -y   kill any process on $API_PORT/$WEB_PORT without prompting"
      echo "  --stop        stop API, frontend, worker, and Redis"
      exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

# --- preflight ---
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker isn't running. Start Docker Desktop and retry." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "✗ No .env at project root. Copy .env.example → .env and set GPU_SERVER_IP / VLLM_URL etc." >&2
  exit 1
fi

# --- Free required ports (kill stale runs holding them) ---
echo "▶ Checking ports…"
free_port "$API_PORT" "API"
free_port "$WEB_PORT" "Frontend"

# --- Redis ---
echo "▶ Starting Redis…"
docker compose up -d redis >/dev/null

echo "▶ Waiting for Redis…"
for _ in $(seq 1 20); do
  if docker compose exec -T redis redis-cli ping >/dev/null 2>&1; then
    echo "  Redis ready."
    break
  fi
  sleep 0.5
done

# --- App (API + frontend + worker via concurrently) ---
# Ctrl+C propagates to concurrently, which shuts down all three.
# Redis is left running; stop it with: ./launch.sh --stop
echo "▶ Starting API (:$API_PORT), Frontend (:$WEB_PORT), Worker…"
echo "  Open http://localhost:$WEB_PORT  ·  health: http://localhost:$API_PORT/health"
echo "  (Ctrl+C stops the app; Redis stays up — './launch.sh --stop' to stop everything)"
echo
exec npm run dev
