# LLM Inference Benchmarking Platform

A real-time platform for benchmarking LLM inference on a **vLLM / SGLang GPU server**. It fires concurrent requests at the model, streams live GPU + vLLM metrics into a React dashboard over Socket.IO, persists every request and metric snapshot to SQLite, and lets you compare optimization experiments (prefix caching, chunked prefill, quantization, speculative decoding, …) side by side.

It also ships a **live chat mode** — talk to the connected model directly while watching the same GPU/vLLM metrics update per message.

> Default model: `google/gemma-3-4b-it` (configurable via `.env`). The stack runs fully with **mock data** when no GPU server is configured, so you can develop the entire UI without renting a GPU.

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Layout](#project-layout)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Running Against a Real GPU](#running-against-a-real-gpu)
- [REST API](#rest-api)
- [Socket.IO Events](#socketio-events)
- [Data Model (SQLite)](#data-model-sqlite)
- [Benchmark Methodology](#benchmark-methodology)
- [Development Workflow](#development-workflow)
- [Publishing Results](#publishing-results)

---

## Features

- **Concurrent load generation** against an OpenAI-compatible vLLM endpoint, throttled with `p-limit`.
- **Four-timestamp request tracing** per request — `queued → prefilling → decoding → done` — capturing TTFT, prefill, decode, TPOT and total latency.
- **Always-on live metrics** — GPU utilization, VRAM, power, temp, KV-cache %, running/waiting queue depth, tokens/sec and vLLM TTFT percentiles, polled every 500 ms and streamed to the dashboard.
- **Warmup phase** that captures CUDA-graph batch sizes and TTFT stabilization, kept strictly separate from benchmark results.
- **Prompt categories** — `random`, `shared_prefix`, `exact_repeat` — to exercise and measure prefix-cache behavior.
- **Experiment comparison** — every run persisted to SQLite and diffable side by side with % change vs. baseline.
- **Live chat mode** — session-scoped conversation against the connected model, with per-message GPU/vLLM metrics.
- **Health & doctor diagnostics** — `/health` never throws and reports Redis, SQLite, GPU agent, vLLM and BullMQ status; `/health/doctor` runs deeper checks.
- **Mock data mode** — full UI (charts, request cards, queue bars) animates with synthetic data when no GPU is connected.

---

## Architecture

```
┌────────────────────┐        Socket.IO (metrics, phases,        ┌─────────────────────┐
│  React + Vite UI   │  ◄───  request updates, run:complete) ───►│   API (Express)     │
│  :7755             │        REST (runs, results, health, chat) │   :3001             │
└────────────────────┘                                           └─────────┬───────────┘
                                                                            │
                    ┌───────────────────────────────────────────┬──────────┼───────────┐
                    ▼                                             ▼          ▼           ▼
            ┌───────────────┐                            ┌──────────────┐ ┌──────┐ ┌──────────┐
            │  loadGenerator│  concurrent requests ────► │  vLLM server │ │SQLite│ │  Redis   │
            │  metricsColl. │  poll /metrics + GPU agent │  :8000       │ │bench │ │ (BullMQ) │
            └───────┬───────┘                            │  GPU agent   │ │ .db  │ └────┬─────┘
                    │                                    │  :9100       │ └──────┘      │
                    └────────────────────────────────────┴──────────────┘        ┌─────▼──────┐
                                                                                  │  Consumers │
                                                                                  │  (worker)  │
                                                                                  └────────────┘
```

- **`backend/api`** — always-on Express + Socket.IO server. Owns the DB, health checks, the live metrics loop, and the run pipeline. The current run pipeline (warmup → benchmark → aggregate) executes **in-process** from `routes/run.ts`, guarded so only one run is active at a time.
- **`backend/consumers`** — BullMQ worker (`benchmark-jobs`, `metrics-jobs`) for queue-driven job processing, backed by Redis.
- **`frontend`** — React dashboard: left panel (chat / request cards / run controls), right panel (metrics: stat cards, GPU & TPS charts, queue bars), plus a benchmarks/comparison view. State via Zustand, data fetching via React Query.

---

## Tech Stack

| Layer | Key packages |
|---|---|
| Frontend | React 18, Vite 5, TypeScript 5, Zustand, `@tanstack/react-query`, `socket.io-client`, Recharts, Tailwind CSS |
| API | Express 4, Socket.IO 4, `better-sqlite3`, BullMQ, `ioredis`, `p-limit`, `node-fetch`, `googleapis`, Zod, Morgan |
| Consumers | BullMQ, `ioredis`, `node-fetch` |
| Infra | Redis (Docker), SQLite (file), optional Google Sheets for prompts |

Managed as **npm workspaces**: `frontend`, `backend/api`, `backend/consumers`.

---

## Project Layout

```
LLM-Benchmarking/
├── launch.sh                  ← one command to bring up Redis + API + Frontend + Worker
├── docker-compose.yml         ← Redis
├── package.json               ← npm workspaces + `dev` / `build` / `health` scripts
├── .env.example               ← documented environment variables
├── CLAUDE.MD                  ← full design spec / source of truth
├── gpu-scripts/
│   └── start_vllm.sh          ← vLLM launch command for the GPU instance
├── frontend/                  ← React + Vite dashboard (port 7755)
│   └── src/
│       ├── components/        ← chat/, metrics/, benchmarks/, comparison/, controls/, conversation/
│       ├── hooks/             ← useSocket, useMetrics, useRun, useHealth, usePrompts, useChatSession
│       ├── store/             ← Zustand: metrics / run / experiment / theme
│       ├── types/ · utils/    ← shared types, formatters, percentile, chart colors, mock data
├── backend/
│   ├── api/src/
│   │   ├── server.ts          ← Express + Socket.IO entry point
│   │   ├── routes/            ← run, results, experiments, prompts, health, chat
│   │   ├── db/                ← connection, schema/migrations, queries/
│   │   ├── utils/             ← loadGenerator, metricsCollector, prometheusParser,
│   │   │                        aggregator, warmup, sheetsLoader, doctor
│   │   └── types/             ← socket, metrics, run
│   └── consumers/src/         ← BullMQ worker + processors (benchmark, metrics)
└── docs/                      ← analysis notes
```

---

## Quick Start

### Prerequisites

- **Node.js 20+** and npm
- **Docker** (for Redis) — Docker Desktop must be running

### 1. Install

```bash
npm install         # installs all workspaces
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — leave GPU_SERVER_IP/VLLM_URL at defaults to run in mock-data mode.
```

### 3. Launch everything

```bash
./launch.sh
```

This starts Redis (Docker), the API on **:3001**, the frontend on **:7755**, and the worker — via `concurrently`. Then open:

- Dashboard → http://localhost:7755
- Health → http://localhost:3001/health

`launch.sh` flags:

| Command | Effect |
|---|---|
| `./launch.sh` | Start everything; prompts before killing anything on 3001/7755 |
| `./launch.sh --force` (`-y`) | Start, killing stale processes on those ports without asking |
| `./launch.sh --stop` | Stop API, frontend, worker **and** the Redis container |

Prefer to run pieces yourself?

```bash
docker compose up -d redis
npm run dev          # runs frontend + api + consumers together
npm run health       # curl the /health endpoint (needs jq)
```

---

## Configuration

All configuration is via `.env` at the project root (see `.env.example`):

| Variable | Purpose | Default |
|---|---|---|
| `GPU_SERVER_IP` | GPU instance IP; when unset/default the GPU + vLLM are treated as *not configured* (mock mode) | `203.0.113.45` |
| `VLLM_URL` | vLLM OpenAI-compatible base URL | `http://${GPU_SERVER_IP}:8000` |
| `VLLM_API_KEY` | Sent as `Authorization: Bearer` if vLLM was launched with `--api-key` | _(empty)_ |
| `GPU_AGENT_URL` | GPU metrics agent (pynvml) endpoint | `http://${GPU_SERVER_IP}:9100` |
| `GPU_AGENT_API_KEY` | Sent as `x-api-key` to the GPU agent `/gpu` route | _(empty)_ |
| `MODEL_NAME` | HuggingFace model ID being benchmarked | `google/gemma-3-4b-it` |
| `REDIS_URL` | Redis connection (BullMQ transport) | `redis://localhost:6379` |
| `SQLITE_PATH` | SQLite database file path | `./data/bench.db` |
| `GOOGLE_SHEETS_ID` / `GOOGLE_SERVICE_ACCOUNT_KEY` | Optional prompt source; falls back to local prompts | _(optional)_ |
| `PORT` | API server port | `3001` |
| `FRONTEND_URL` | Allowed CORS origin / frontend URL | `http://localhost:7755` |
| `DEFAULT_CONCURRENCY` | Default concurrent requests | `10` |
| `DEFAULT_PROMPT_COUNT` | Default prompts per run | `100` |
| `WARMUP_REQUEST_COUNT` | Warmup requests before benchmarking | `20` |

---

## Running Against a Real GPU

1. Rent a GPU (e.g. A100 on Vast.ai / RunPod).
2. On the instance, start the GPU metrics agent (pynvml, port 9100), then start vLLM:
   ```bash
   # gpu-scripts/start_vllm.sh — Gemma 3 4B (gated: requires huggingface-cli login)
   vllm serve google/gemma-3-4b-it \
     --host 0.0.0.0 --port 8000 \
     --dtype float16 --gpu-memory-utilization 0.90 \
     --max-model-len 4096 --max-num-seqs 256 --disable-log-requests
   ```
3. Update `.env`: set `GPU_SERVER_IP=<instance-ip>` (and API keys if used).
4. Restart the API (Ctrl+C + `./launch.sh`, or `pm2 restart api`).
5. Verify `GET /health/gpu` and `GET /health/vllm` both report `ok`.
6. Run warmup + benchmark from the dashboard.

---

## REST API

Base URL: `http://localhost:3001`

**Health**
```
GET  /health                     system-wide health (never 500s): redis, sqlite, gpu, vllm, bullmq
GET  /health/doctor              deeper diagnostics
GET  /health/gpu                 GPU agent health + last metric
GET  /health/vllm                vLLM /health proxy + model info
GET  /health/experiment          current experiment / model info
```

**Runs**
```
POST /run/start                  body: { name, concurrency, category, promptCount } → { runId }
POST /run/stop                   body: { runId }
GET  /run/:id                    run row + phase
```

**Results**
```
GET  /results/:runId             aggregated results row
GET  /results/:runId/requests    all request rows for a run
GET  /results/:runId/snapshots   all metric snapshots for a run
GET  /results/:runId/export      JSON download (for publishing)
```

**Experiments**
```
GET  /experiments                all runs, newest first
GET  /experiments/compare?a=&b=  diff of two runs with % change
```

**Prompts**
```
GET  /prompts                    prompts + source ('sheets' | 'local')
GET  /prompts/reload             force refresh from Google Sheets
```

**Chat**
```
POST /chat                       send a message to the connected model
GET  /chat/session/:id           session + messages
GET  /chat/session/:id/metrics   metrics captured during that session
```

---

## Socket.IO Events

**Server → Client**

| Event | Payload |
|---|---|
| `metrics:snapshot` | GPU + vLLM metrics (util, VRAM, power, temp, KV %, running/waiting, tok/s, TTFT p50/p99) — every 500 ms |
| `phase:change` | `{ phase: 'warmup' \| 'benchmarking' \| 'complete' \| 'error', runId }` |
| `request:update` | per-request state (`queued`/`prefilling`/`decoding`/`done`/`error`) + timing/token fields, token text batched |
| `warmup:ttft` | `{ req, ttft_ms }` per warmup request |
| `run:complete` | `{ runId, summary }` aggregated result |

**Client → Server**

| Event | Payload |
|---|---|
| `chat:session` | `{ sessionId }` — tag live metrics to a chat session (or `null` on leave) |

> Token streaming is **batched** (every 5 tokens or 100 ms) — never one event per token.

---

## Data Model (SQLite)

Tables created/migrated on startup (`backend/api/src/db/schema.ts`):

- **`runs`** — one row per experiment (name, config JSON, phase, timing).
- **`requests`** — one row per LLM request: four timestamps (`t0–t3`), `ttft_ms`, `prefill_ms`, `decode_ms`, `total_ms`, `token_count`, `tpot_ms`, `finish_reason`, category, and `phase` (`warmup` | `benchmark`).
- **`metric_snapshots`** — 500 ms GPU + vLLM polls (util, VRAM, power, temp, KV cache, queue depth, tok/s, TTFT percentiles, raw vLLM text, optional `chat_session_id`).
- **`aggregated_results`** — computed after a run: TTFT/TPOT percentiles + stddev, per-category TTFT, throughput, GPU/VRAM/KV stats, `warmup_excluded` flag.
- **`chat_sessions`** / **`chat_messages`** — live chat mode persistence.

Metrics always carry the **GPU server timestamp** (from the agent), not the Node receive time; `transport_ms` records network latency for transparency.

---

## Benchmark Methodology

- **Warmup is never mixed into results.** Warmup requests (`phase = 'warmup'`) run first at the same concurrency, using a mix of short/medium/long prompts to trigger all CUDA-graph batch sizes. The system is "warm" when the last 3 TTFTs are within 20% of each other.
- **Three benchmark runs** per experiment; aggregates report p50/p90/p99 + stddev.
- **Prompt categories** isolate prefix-cache effects: `random`, `shared_prefix`, `exact_repeat`.
- Results always record `warmup_excluded: true` to document the methodology.

---

## Development Workflow

**Phase 1 — mock data (no GPU):** leave `GPU_SERVER_IP` at its default; the metrics collector and load generator return synthetic data so the full UI works at zero GPU cost.

**Phase 2 — real GPU:** see [Running Against a Real GPU](#running-against-a-real-gpu).

**Phase 3 — experiments:** restart vLLM with a new config for each run, e.g.

| Experiment | Change |
|---|---|
| baseline | default config |
| prefix cache | `--enable-prefix-caching` |
| chunked prefill | `--enable-chunked-prefill` |
| AWQ quant | quantized model |
| spec decode | `--speculative-model …` |
| SGLang | swap in an SGLang launch script |

---

## Publishing Results

After each experiment, export and commit the raw JSON:

```bash
curl http://localhost:3001/results/<runId>/export > results/<experiment-name>.json
git add results/
git commit -m "benchmark: add <experiment-name> results"
git push
```

Include with every published writeup: exact vLLM version + model name, GPU hardware (from the `gpu_name` metric), the instance details, a link to the raw JSON, and confirmation of `warmup_excluded: true`.

---

## Reference

See [`CLAUDE.MD`](./CLAUDE.MD) for the complete design specification — component-by-component behavior, chart specs, queue design, and coding standards.
