#!/usr/bin/env bash
#
# launch.sh — one command to bring up the whole LLM benchmarking stack:
#   Redis (docker)  +  API :3001  +  Frontend :7755  +  Worker
#
# A GPU server is optional. If you have one up with Cloudflare tunnel URLs for
# the vLLM server and the GPU agent, launch.sh can flush DNS, wait for both to
# report healthy, and write them into .env (via scripts/set_endpoints.sh)
# before starting the stack. If you don't have GPU URLs yet, it skips that
# entirely (no DNS flush, no health polling) and starts the app as-is so the
# UI still comes up (e.g. against mock data).
#
# Endpoints can be supplied non-interactively as args, or — if omitted and
# running in a terminal — launch.sh will ask interactively.
#
# Usage:
#   ./launch.sh                                   ask whether you have GPU URLs, then start
#   ./launch.sh <vllm_url> <gpu_agent_url>        resolve DNS + set endpoints, then start
#   ./launch.sh --force                           start, killing any process on 3001/7755 without asking
#   ./launch.sh --stop                            stop everything, including the Redis container
#
set -euo pipefail
cd "$(dirname "$0")"

API_PORT=3001
WEB_PORT=7755
FORCE=0
VLLM_ARG=""
GPU_AGENT_ARG=""

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
      echo "Usage: ./launch.sh [<vllm_url> <gpu_agent_url>] [--force|-y] [--stop]"
      echo "  (no args)                    ask whether you have GPU tunnel URLs; skip config if not"
      echo "  <vllm_url> <gpu_agent_url>   flush DNS, wait for /health, write both into .env, then start"
      echo "  --force, -y                  kill any process on $API_PORT/$WEB_PORT without prompting"
      echo "  --stop                       stop API, frontend, worker, and Redis"
      exit 0 ;;
    http://*|https://*)
      if [[ -z "$VLLM_ARG" ]]; then
        VLLM_ARG="$arg"
      elif [[ -z "$GPU_AGENT_ARG" ]]; then
        GPU_AGENT_ARG="$arg"
      else
        echo "Unexpected extra endpoint: $arg (expected at most vllm_url and gpu_agent_url)" >&2
        exit 1
      fi ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

if [[ -n "$VLLM_ARG" && -z "$GPU_AGENT_ARG" ]]; then
  echo "✗ Two endpoints are required: ./launch.sh <vllm_url> <gpu_agent_url>" >&2
  exit 1
fi

# --- preflight ---
# Docker/Redis only back the BullMQ worker queue (backend/consumers) — the
# live benchmark run path (routes/run.ts) doesn't touch Redis at all. So a
# missing Docker daemon is a warning, not a hard stop: the frontend + API
# still come up fine, just without the queue worker's Redis connection.
DOCKER_UP=1
WORKER_ENABLED=true
if ! docker info >/dev/null 2>&1; then
  DOCKER_UP=0
  echo "⚠ Docker isn't running — Redis won't be available, so the queue worker (backend/consumers) can't connect."
  if [[ -t 0 ]]; then
    read -r -p "  Start it anyway? It'll just retry against Redis in the background. [y/N] " start_worker
    if [[ "$start_worker" =~ ^[Yy]$ ]]; then
      echo "  Starting worker anyway — expect Redis connection retries in its logs."
    else
      WORKER_ENABLED=false
      echo "  Skipping the worker (WORKER_ENABLED=false). Frontend/API still start normally."
    fi
  else
    WORKER_ENABLED=false
    echo "  No terminal to confirm — skipping the worker (WORKER_ENABLED=false). Frontend/API still start normally."
  fi
fi
export WORKER_ENABLED

# --- Ask interactively if no endpoints were passed on the command line ---
# GPU setup is optional — plenty of runs are against mock data with no GPU at
# all. Only prompt when we have a TTY to read from; a non-interactive shell
# with no args just skips straight to launch.
if [[ -z "$VLLM_ARG" && -t 0 ]]; then
  read -r -p "Do you have a GPU server set up with tunnel URLs for the Agent Server and vLLM Server? [y/N] " have_urls
  if [[ "$have_urls" =~ ^[Yy]$ ]]; then
    read -r -p "  Agent Server URL (e.g. https://xxx.trycloudflare.com): " GPU_AGENT_ARG
    read -r -p "  vLLM Server URL  (e.g. https://yyy.trycloudflare.com): " VLLM_ARG
    if [[ -z "$VLLM_ARG" || -z "$GPU_AGENT_ARG" ]]; then
      echo "✗ Both URLs are required — skipping endpoint configuration." >&2
      VLLM_ARG=""
      GPU_AGENT_ARG=""
    fi
  else
    echo "  No GPU URLs — skipping DNS flush/health check, launching with the current .env."
  fi
  echo
fi

# --- Resolve DNS + set endpoints (only when tunnel URLs were passed/entered) ---
# set_endpoints.sh flushes the DNS cache, polls each <url>/health until HTTP 200,
# and writes VLLM_URL / GPU_AGENT_URL into .env (creating it from .env.example
# if absent). It exits non-zero if an endpoint never becomes healthy, which
# aborts launch before we start anything.
if [[ -n "$VLLM_ARG" ]]; then
  echo "▶ Configuring endpoints (DNS flush + health check)…"
  scripts/set_endpoints.sh "$VLLM_ARG" "$GPU_AGENT_ARG"
  echo
fi

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    echo "▶ No .env found — creating one from .env.example (no GPU URLs set, mock data will be used)."
    cp .env.example .env
  else
    echo "✗ No .env at project root and no .env.example to copy from. Create .env and set GPU_SERVER_IP / VLLM_URL etc." >&2
    exit 1
  fi
fi

# --- Free required ports (kill stale runs holding them) ---
echo "▶ Checking ports…"
free_port "$API_PORT" "API"
free_port "$WEB_PORT" "Frontend"

# --- Redis (skipped if Docker isn't up) ---
if [[ "$DOCKER_UP" == "1" ]]; then
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
else
  echo "▶ Skipping Redis (Docker not running)."
fi

# --- App (API + frontend + worker via concurrently) ---
# Ctrl+C propagates to concurrently, which shuts down all three.
# Redis is left running; stop it with: ./launch.sh --stop
echo "▶ Starting API (:$API_PORT), Frontend (:$WEB_PORT), Worker…"
echo "  Open http://localhost:$WEB_PORT  ·  health: http://localhost:$API_PORT/health"
echo "  (Ctrl+C stops the app; Redis stays up — './launch.sh --stop' to stop everything)"
echo
exec npm run dev
