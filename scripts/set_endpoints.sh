#!/usr/bin/env bash
#
# set_endpoints.sh — point the platform at a fresh Cloudflare tunnel.
#
# Cloudflare `trycloudflare.com` hostnames are created on demand and their DNS
# takes a little while to become resolvable from the client machine. This script:
#   1. Takes the new vLLM + GPU-agent tunnel URLs (args or interactive prompt).
#   2. Flushes the local DNS cache so the fresh hostnames resolve immediately.
#   3. Polls each `<url>/health` (no API key) until it returns HTTP 200.
#   4. Writes the confirmed URLs into ./.env (VLLM_URL / GPU_AGENT_URL).
#
# Usage:
#   scripts/set_endpoints.sh                              # interactive
#   scripts/set_endpoints.sh <vllm_url> <gpu_agent_url>   # non-interactive
#
set -euo pipefail

# ---- config ----------------------------------------------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"   # health poll attempts per endpoint
RETRY_DELAY="${RETRY_DELAY:-5}"      # seconds between attempts

# ---- colours ---------------------------------------------------------------
if [[ -t 1 ]]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BOLD=''; RESET=''
fi
info()  { echo "${BOLD}==>${RESET} $*"; }
ok()    { echo "${GREEN}✓${RESET} $*"; }
warn()  { echo "${YELLOW}!${RESET} $*"; }
fail()  { echo "${RED}✗${RESET} $*" >&2; }

# ---- input -----------------------------------------------------------------
VLLM_URL="${1:-}"
GPU_AGENT_URL="${2:-}"

if [[ -z "$VLLM_URL" ]]; then
  read -r -p "vLLM server endpoint (e.g. https://xxx.trycloudflare.com): " VLLM_URL
fi
if [[ -z "$GPU_AGENT_URL" ]]; then
  read -r -p "GPU agent endpoint  (e.g. https://yyy.trycloudflare.com): " GPU_AGENT_URL
fi

# strip whitespace + any trailing slash
VLLM_URL="$(echo -n "$VLLM_URL" | tr -d '[:space:]')"; VLLM_URL="${VLLM_URL%/}"
GPU_AGENT_URL="$(echo -n "$GPU_AGENT_URL" | tr -d '[:space:]')"; GPU_AGENT_URL="${GPU_AGENT_URL%/}"

if [[ -z "$VLLM_URL" || -z "$GPU_AGENT_URL" ]]; then
  fail "Both vLLM and GPU agent endpoints are required."
  exit 1
fi
for url in "$VLLM_URL" "$GPU_AGENT_URL"; do
  if [[ "$url" != http://* && "$url" != https://* ]]; then
    fail "Endpoint must start with http:// or https:// — got: $url"
    exit 1
  fi
done

echo
info "vLLM URL:      $VLLM_URL"
info "GPU agent URL: $GPU_AGENT_URL"
echo

# ---- flush DNS cache -------------------------------------------------------
flush_dns() {
  info "Flushing local DNS cache..."
  case "$(uname -s)" in
    Darwin)
      if sudo dscacheutil -flushcache 2>/dev/null && sudo killall -HUP mDNSResponder 2>/dev/null; then
        ok "macOS DNS cache flushed."
      else
        warn "Could not flush DNS cache (needs sudo). Continuing — new hostnames may take longer to resolve."
      fi
      ;;
    Linux)
      if command -v resolvectl >/dev/null 2>&1; then
        sudo resolvectl flush-caches 2>/dev/null && ok "systemd-resolved cache flushed." || warn "resolvectl flush failed; continuing."
      elif command -v systemd-resolve >/dev/null 2>&1; then
        sudo systemd-resolve --flush-caches 2>/dev/null && ok "systemd-resolved cache flushed." || warn "flush failed; continuing."
      else
        warn "No known DNS cache tool found; continuing."
      fi
      ;;
    *)
      warn "Unknown OS — skipping DNS flush."
      ;;
  esac
}
flush_dns
echo

# ---- health probe ----------------------------------------------------------
# Poll <url>/health until it returns HTTP 200 (no auth header sent).
wait_for_health() {
  local name="$1" base="$2" endpoint="${2}/health"
  info "Waiting for ${name} health: ${endpoint}"
  for ((i = 1; i <= MAX_ATTEMPTS; i++)); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$endpoint" 2>/dev/null || echo 000)"
    if [[ "$code" == "200" ]]; then
      ok "${name} healthy (HTTP 200) after ${i} attempt(s)."
      return 0
    fi
    printf '   attempt %2d/%d — HTTP %s (DNS/tunnel warming up)\r' "$i" "$MAX_ATTEMPTS" "$code"
    sleep "$RETRY_DELAY"
  done
  echo
  fail "${name} did not return HTTP 200 at ${endpoint} after $((MAX_ATTEMPTS * RETRY_DELAY))s."
  return 1
}

HEALTHY=1
wait_for_health "vLLM"      "$VLLM_URL"      || HEALTHY=0
wait_for_health "GPU agent" "$GPU_AGENT_URL" || HEALTHY=0
echo

if [[ "$HEALTHY" -ne 1 ]]; then
  fail "One or more endpoints are not healthy — .env NOT updated."
  echo "   Check the tunnel is up and retry (or increase MAX_ATTEMPTS / RETRY_DELAY)."
  exit 1
fi

# ---- update .env -----------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  warn ".env not found — creating from .env.example"
  cp "${ROOT_DIR}/.env.example" "$ENV_FILE"
fi

# In-place set KEY=VALUE, preserving the rest of the file. Adds the key if absent.
set_env() {
  local key="$1" value="$2"
  local tmp; tmp="$(mktemp)"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # replace existing line (awk avoids sed escaping headaches with URLs)
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {print k"="v; next} {print}' "$ENV_FILE" > "$tmp"
  else
    cp "$ENV_FILE" "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" "$ENV_FILE"
  ok "Set ${key}"
}

info "Updating ${ENV_FILE}"
set_env "VLLM_URL"      "$VLLM_URL"
set_env "GPU_AGENT_URL" "$GPU_AGENT_URL"
echo
ok "Done. Restart the API server to pick up the new endpoints (e.g. pm2 restart api)."
