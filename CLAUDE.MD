# LLM Inference Benchmarking Platform — CLAUDE.md

> This file is the single source of truth for Claude Code when working on this project.
> Read this entire file before writing any code, creating any file, or running any command.

---

## Project Purpose

A real-time LLM inference benchmarking platform that:
- Runs concurrent requests against a vLLM / SGLang GPU server
- Collects live GPU metrics (nvidia-smi, pynvml) and vLLM Prometheus metrics
- Streams everything to a React dashboard via Socket.IO
- Stores all experiment results in SQLite for comparison
- Publishes benchmark jobs via BullMQ / Redis queue
- Enables before/after comparison across optimization experiments

---

## Folder Structure

```
llm-bench/
├── CLAUDE.md                          ← you are here
├── docker-compose.yml                 ← Redis + optional services
├── .env.example                       ← all env vars documented
│
├── frontend/                          ← React + Vite + TypeScript
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types/
│       │   ├── metrics.ts             ← GpuMetrics, VllmMetrics, RequestResult
│       │   └── experiment.ts          ← Experiment, RunConfig, ComparisonRow
│       ├── store/
│       │   ├── metricsStore.ts        ← Zustand: 60s rolling metrics buffer
│       │   ├── runStore.ts            ← Zustand: active run, phase, results
│       │   └── experimentStore.ts     ← Zustand: all experiments for comparison
│       ├── hooks/
│       │   ├── useSocket.ts           ← Socket.IO connection + event handlers
│       │   ├── useMetrics.ts          ← subscribe to metrics stream
│       │   └── useRun.ts              ← start/stop run, phase tracking
│       ├── components/
│       │   ├── chat/
│       │   │   ├── ChatPanel.tsx      ← left panel wrapper
│       │   │   ├── RequestCard.tsx    ← single request card (queued/prefilling/decoding/done)
│       │   │   ├── RunControls.tsx    ← run/stop button, concurrency slider
│       │   │   └── CategoryPills.tsx  ← random / shared-prefix / exact-repeat
│       │   ├── metrics/
│       │   │   ├── MetricsPanel.tsx   ← right panel wrapper
│       │   │   ├── StatCards.tsx      ← GPU%, VRAM, tok/s, KV cache — 4 cards
│       │   │   ├── GpuChart.tsx       ← GPU utilization line chart (60s)
│       │   │   ├── TpsChart.tsx       ← tokens/sec line chart (60s)
│       │   │   ├── TtftChart.tsx      ← TTFT distribution over run
│       │   │   ├── WarmupChart.tsx    ← TTFT stabilisation during warmup
│       │   │   ├── QueueBars.tsx      ← running/waiting/KV/TTFT progress bars
│       │   │   └── NetworkBadge.tsx   ← server TTFT vs client TTFT + RTT
│       │   ├── controls/
│       │   │   ├── ExperimentSelector.tsx  ← dropdown to name/select experiments
│       │   │   └── Phasebanner.tsx     ← warmup / benchmarking / complete banner
│       │   └── comparison/
│       │       └── ComparisonTable.tsx ← all experiments side by side
│       └── utils/
│           ├── percentile.ts          ← p50/p90/p99 from array
│           └── formatters.ts          ← ms, GB, tok/s display formatters
│
├── backend/
│   ├── api/                           ← Express + TypeScript — always-on app server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── server.ts              ← Express + Socket.IO entry point
│   │       ├── routes/
│   │       │   ├── run.ts             ← POST /run/start, POST /run/stop, GET /run/:id
│   │       │   ├── results.ts         ← GET /results/:runId, GET /results/:runId/export
│   │       │   ├── experiments.ts     ← GET /experiments, GET /compare?a=id&b=id
│   │       │   ├── prompts.ts         ← GET /prompts (load from Sheets or local)
│   │       │   └── health.ts          ← GET /health, GET /health/gpu, GET /health/vllm
│   │       ├── middleware/
│   │       │   ├── errorHandler.ts    ← global Express error handler
│   │       │   └── requestLogger.ts   ← morgan-style per-request logging
│   │       ├── db/
│   │       │   ├── connection.ts      ← better-sqlite3 singleton
│   │       │   ├── schema.ts          ← CREATE TABLE statements + migrations
│   │       │   └── queries/
│   │       │       ├── runs.ts        ← insert/select runs
│   │       │       ├── requests.ts    ← insert/select individual request results
│   │       │       ├── snapshots.ts   ← insert/select metric snapshots
│   │       │       └── warmup.ts      ← insert/select warmup results
│   │       ├── types/
│   │       │   ├── socket.ts          ← Socket.IO event payload types
│   │       │   ├── metrics.ts         ← GpuMetrics, VllmMetrics (shared with frontend)
│   │       │   └── run.ts             ← RunConfig, RunPhase, RequestResult
│   │       └── utils/
│   │           ├── loadGenerator.ts   ← concurrent request engine (p-limit)
│   │           ├── metricsCollector.ts ← polls GPU agent + vLLM /metrics every 500ms
│   │           ├── sheetsLoader.ts    ← Google Sheets API → prompt list
│   │           ├── prometheusParser.ts ← parse vLLM Prometheus text format
│   │           ├── aggregator.ts      ← p50/p90/p99 + stddev across 3 runs
│   │           └── warmup.ts          ← warmup phase orchestration
│   │
│   └── consumers/                     ← BullMQ worker — processes benchmark jobs
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── worker.ts              ← BullMQ worker entry point
│           ├── processors/
│           │   ├── benchmarkProcessor.ts  ← main job handler
│           │   ├── warmupProcessor.ts     ← warmup phase processor
│           │   └── metricsProcessor.ts    ← periodic metrics snapshot job
│           ├── types/
│           │   └── jobs.ts            ← BenchmarkJob, WarmupJob, MetricsJob
│           └── utils/
│               └── jobHelpers.ts      ← retry logic, job progress updates
```

---

## Tech Stack

### Frontend
| Package | Version | Purpose |
|---|---|---|
| react | ^18.3 | UI framework |
| react-dom | ^18.3 | DOM rendering |
| typescript | ^5.4 | Type safety |
| vite | ^5.2 | Build tool + dev server |
| zustand | ^4.5 | State management (metrics buffer, run state) |
| socket.io-client | ^4.7 | Real-time metrics stream from backend |
| recharts | ^2.12 | Line charts (GPU util, tok/s, TTFT) |
| @tanstack/react-query | ^5.40 | REST API data fetching (experiments, results) |
| tailwindcss | ^3.4 | Styling |
| clsx | ^2.1 | Conditional className utility |

### Backend — api
| Package | Version | Purpose |
|---|---|---|
| express | ^4.19 | HTTP server |
| typescript | ^5.4 | Type safety |
| ts-node | ^10.9 | TypeScript execution |
| socket.io | ^4.7 | Real-time events to frontend |
| better-sqlite3 | ^9.6 | SQLite — results persistence |
| bullmq | ^5.7 | Job queue — enqueue benchmark runs |
| ioredis | ^5.3 | Redis client (BullMQ transport) |
| p-limit | ^6.1 | Concurrent request throttle |
| node-fetch | ^3.3 | HTTP requests to vLLM + GPU agent |
| googleapis | ^140 | Google Sheets API — prompt loading |
| dotenv | ^16.4 | Environment variable loading |
| morgan | ^1.10 | HTTP request logging |
| cors | ^2.8 | CORS for frontend |
| zod | ^3.23 | Request validation |
| @types/express | ^4.17 | Express types |
| @types/better-sqlite3 | ^7.6 | SQLite types |
| @types/morgan | ^1.9 | Morgan types |
| @types/cors | ^2.8 | CORS types |

### Backend — consumers
| Package | Version | Purpose |
|---|---|---|
| bullmq | ^5.7 | BullMQ worker |
| ioredis | ^5.3 | Redis connection |
| typescript | ^5.4 | Type safety |
| ts-node | ^10.9 | TypeScript execution |
| dotenv | ^16.4 | Env vars |
| node-fetch | ^3.3 | Fetch to vLLM during job processing |

---

## Environment Variables

```bash
# .env — copy from .env.example

# GPU Server (set when you rent — changes per session)
GPU_SERVER_IP=203.0.113.45
VLLM_URL=http://${GPU_SERVER_IP}:8000
GPU_AGENT_URL=http://${GPU_SERVER_IP}:9100

# Redis (Docker or Railway Redis)
REDIS_URL=redis://localhost:6379

# SQLite
SQLITE_PATH=./data/bench.db

# Google Sheets (optional — fallback to local prompts.json)
GOOGLE_SHEETS_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY=./secrets/gcp-key.json

# API Server
PORT=3001
FRONTEND_URL=http://localhost:5173

# Benchmark defaults
DEFAULT_CONCURRENCY=10
DEFAULT_PROMPT_COUNT=100
WARMUP_REQUEST_COUNT=20
```

---

## SQLite Schema

```sql
-- runs: one row per experiment
CREATE TABLE runs (
  id          TEXT PRIMARY KEY,           -- uuid
  name        TEXT NOT NULL,              -- e.g. "baseline-vllm-0.6.3"
  config      TEXT NOT NULL,             -- JSON: vllm flags, model, concurrency
  phase       TEXT NOT NULL DEFAULT 'pending',  -- pending|warmup|benchmarking|complete|error
  started_at  INTEGER,                   -- unix ms
  ended_at    INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

-- requests: one row per individual LLM request
CREATE TABLE requests (
  id          TEXT PRIMARY KEY,           -- uuid
  run_id      TEXT NOT NULL REFERENCES runs(id),
  run_number  INTEGER NOT NULL,          -- 1, 2, or 3 (which of 3 runs)
  prompt_id   TEXT NOT NULL,
  category    TEXT NOT NULL,             -- random|shared_prefix|exact_repeat
  phase       TEXT NOT NULL,             -- warmup|benchmark
  prompt_text TEXT NOT NULL,
  -- timing (all ms)
  t0          INTEGER,                   -- request sent
  t1          INTEGER,                   -- headers received (prefill started)
  t2          INTEGER,                   -- first token (prefill done, decode started)
  t3          INTEGER,                   -- stream closed (decode done)
  ttft_ms     INTEGER,                   -- t2 - t0 (client-side, includes network)
  prefill_ms  INTEGER,                   -- t2 - t1 (pure prefill)
  decode_ms   INTEGER,                   -- t3 - t2
  total_ms    INTEGER,                   -- t3 - t0
  token_count INTEGER DEFAULT 0,
  tpot_ms     REAL,                      -- decode_ms / token_count
  finish_reason TEXT,                    -- stop|length|error
  error       TEXT
);

-- metric_snapshots: 500ms GPU + vLLM metric polls during a run
CREATE TABLE metric_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  ts              INTEGER NOT NULL,      -- GPU server timestamp (ms)
  transport_ms    INTEGER,               -- network latency to GPU agent
  gpu_util        INTEGER,               -- %
  vram_used_mb    INTEGER,
  vram_total_mb   INTEGER,
  power_w         REAL,
  temp_c          INTEGER,
  gpu_name        TEXT,
  kv_cache_pct    REAL,                  -- vllm:gpu_cache_usage_perc
  requests_running INTEGER,
  requests_waiting INTEGER,
  requests_swapped INTEGER,
  tokens_per_sec  REAL,
  ttft_p50_ms     REAL,                  -- from vLLM histogram
  ttft_p99_ms     REAL
);

-- aggregated_results: computed after all 3 runs complete
CREATE TABLE aggregated_results (
  run_id          TEXT PRIMARY KEY REFERENCES runs(id),
  -- TTFT (client-side, all 3 runs combined)
  ttft_p50_ms     REAL,
  ttft_p90_ms     REAL,
  ttft_p99_ms     REAL,
  ttft_stddev_ms  REAL,
  -- TTFT by category
  ttft_p50_random       REAL,
  ttft_p50_shared_prefix REAL,
  ttft_p50_exact_repeat  REAL,
  -- decode
  tpot_p50_ms     REAL,
  tpot_p90_ms     REAL,
  -- throughput
  tokens_per_sec_avg REAL,
  tokens_per_sec_peak REAL,
  -- GPU (avg over run duration)
  gpu_util_avg    REAL,
  gpu_util_peak   REAL,
  vram_peak_mb    INTEGER,
  kv_cache_avg    REAL,
  kv_cache_peak   REAL,
  -- metadata
  total_requests  INTEGER,
  warmup_excluded INTEGER DEFAULT 1,     -- always 1 — documents methodology
  run_count       INTEGER DEFAULT 3
);
```

---

## Socket.IO Events

### Server → Client (backend emits)

```typescript
// Phase transitions
socket.emit('phase:change', { phase: 'warmup' | 'benchmarking' | 'complete' | 'error', runId: string })

// GPU + vLLM metrics — emitted every 500ms
socket.emit('metrics:snapshot', {
  ts: number,                // GPU server timestamp
  transport_ms: number,      // network latency
  gpu_util: number,          // %
  vram_used_mb: number,
  vram_total_mb: number,
  power_w: number,
  temp_c: number,
  gpu_name: string,          // "NVIDIA A100-SXM4-80GB"
  kv_cache_pct: number,
  requests_running: number,
  requests_waiting: number,
  tokens_per_sec: number,
  ttft_p50_ms: number,       // from vLLM Prometheus histogram
  ttft_p99_ms: number,
})

// Individual request state changes
socket.emit('request:update', {
  id: string,
  state: 'queued' | 'prefilling' | 'decoding' | 'done' | 'error',
  ttft_ms?: number,
  prefill_ms?: number,
  token_count?: number,
  tokens_text?: string,      // batched, every 5 tokens
  tpot_ms?: number,
  total_ms?: number,
  finish_reason?: string,
  error?: string,
})

// Warmup TTFT stabilisation point (one per warmup request)
socket.emit('warmup:ttft', { req: number, ttft_ms: number })

// Run complete with aggregated summary
socket.emit('run:complete', { runId: string, summary: AggregatedResult })
```

### Client → Server (frontend emits)

```typescript
socket.emit('run:start', { name: string, concurrency: number, category: string, promptCount: number })
socket.emit('run:stop', { runId: string })
```

---

## REST API Routes

```
GET  /health                → { status, uptime, redis, sqlite, gpu?, vllm? }
GET  /health/gpu            → GPU agent health + last metric
GET  /health/vllm           → vLLM /health proxy + model info

POST /run/start             → body: RunConfig → { runId }
POST /run/stop              → body: { runId }
GET  /run/:id               → run row + phase

GET  /prompts               → { prompts: Prompt[], source: 'sheets' | 'local' }
GET  /prompts/reload        → force refresh from Google Sheets

GET  /results/:runId            → full aggregated_results row
GET  /results/:runId/requests   → all request rows for a run
GET  /results/:runId/snapshots  → all metric snapshots for a run
GET  /results/:runId/export     → JSON file download (for GitHub publishing)

GET  /experiments               → all runs ordered by created_at desc
GET  /compare?a=runId&b=runId   → diff object: metric A vs B with % change
```

---

## Health Checks

### GET /health (main)

```typescript
// Returns system-wide health. Always responds — never throws 500.
{
  status: 'healthy' | 'degraded' | 'unhealthy',
  uptime_s: number,
  checks: {
    redis: {
      status: 'ok' | 'error',
      latency_ms: number,
      error?: string
    },
    sqlite: {
      status: 'ok' | 'error',
      path: string,
      size_mb: number,
      error?: string
    },
    gpu_agent: {
      status: 'ok' | 'unreachable' | 'not_configured',
      url: string,
      last_metric?: { gpu_util: number, vram_used_mb: number },
      latency_ms?: number,
      error?: string
    },
    vllm: {
      status: 'ok' | 'unreachable' | 'not_configured',
      url: string,
      model?: string,
      latency_ms?: number,
      error?: string
    },
    bullmq: {
      status: 'ok' | 'error',
      queued: number,
      active: number,
      failed: number
    }
  }
}
```

### Health check implementation rules
- GPU agent and vLLM are `not_configured` when `GPU_SERVER_IP` is not set — not an error
- Redis failure = `unhealthy` (BullMQ cannot function)
- SQLite failure = `unhealthy` (results cannot be stored)
- GPU/vLLM unreachable = `degraded` (can still serve cached results)
- Health endpoint must respond within 3 seconds — use `Promise.race` with timeout

---

## BullMQ Queue Design

### Queue names
```
benchmark-jobs      ← main benchmark run jobs
metrics-jobs        ← periodic 500ms metric snapshot jobs (repeatable)
```

### Job types

```typescript
// BenchmarkJob — one per run:start event
interface BenchmarkJob {
  runId: string
  name: string
  config: RunConfig
  promptIds: string[]
}

// MetricsJob — repeatable, created when benchmark starts, removed when done
interface MetricsJob {
  runId: string
  repeat: { every: 500 }   // ms
}
```

### Worker behaviour
- `benchmarkProcessor`: orchestrates warmup → 3 benchmark runs → aggregation
- `metricsProcessor`: polls GPU agent + vLLM /metrics, saves snapshot, emits Socket.IO event
- On job failure: update run phase to `error` in SQLite, emit `phase:change` error event
- Concurrency: benchmark worker concurrency = 1 (one run at a time), metrics worker = 5

---

## loadGenerator.ts — Key Rules

```typescript
// ALWAYS use p-limit for concurrency control
import pLimit from 'p-limit'
const limit = pLimit(config.concurrency)

// NEVER use Promise.all with raw array — no concurrency control
// WRONG: await Promise.all(prompts.map(p => runRequest(p)))
// RIGHT:
await Promise.all(prompts.map(p => limit(() => runRequest(p, onUpdate))))

// Phase detection — four timestamps per request
// T0: fetch() fired          → state: 'queued'
// T1: response headers back  → state: 'prefilling'
// T2: first SSE chunk        → state: 'decoding', record TTFT
// T3: finish_reason: 'stop'  → state: 'done', record decode_ms

// Token batching — never emit every single token
// Emit every 5 tokens OR every 100ms, whichever comes first
const TOKEN_BATCH = 5
const TOKEN_BATCH_MS = 100
```

---

## metricsCollector.ts — Key Rules

```typescript
// Always use GPU server timestamp, NOT Date.now() on Node server
// gpu_agent.py sends { ts: time.time() } — preserve this in all payloads
const ts = gpuData.ts * 1000  // convert Python time() to ms

// Compute transport latency for transparency
const transport_ms = Date.now() - ts

// Parse vLLM Prometheus histogram for P50/P99
// Metric: vllm:time_to_first_token_seconds_bucket
// Use percentile bucket interpolation — see prometheusParser.ts

// Poll interval: exactly 500ms using setInterval
// If poll takes longer than 500ms, skip next tick (don't stack up)
let polling = false
setInterval(async () => {
  if (polling) return
  polling = true
  try { await collectAndEmit() }
  finally { polling = false }
}, 500)
```

---

## Warmup Phase Rules

1. Run `WARMUP_REQUEST_COUNT` requests (default 20) before benchmark
2. Use same concurrency as benchmark run
3. Use mix of short/medium/long prompts to capture all CUDA graph batch sizes
4. Emit `warmup:ttft` event for each request → WarmupChart shows stabilisation
5. Store warmup results in `requests` table with `phase = 'warmup'`
6. NEVER mix warmup results into aggregated_results
7. System is "warm" when last 3 TTFT values are within 20% of each other
8. If not warm after 20 requests: continue warmup (up to 40) then proceed anyway with warning

---

## Frontend State Architecture

### metricsStore (Zustand)
```typescript
interface MetricsStore {
  snapshots: MetricsSnapshot[]    // rolling 120-item buffer (60s at 500ms)
  latest: MetricsSnapshot | null
  addSnapshot: (s: MetricsSnapshot) => void
  clear: () => void
}
// MAX_SNAPSHOTS = 120
// On addSnapshot: if snapshots.length >= 120, shift() before push()
```

### runStore (Zustand)
```typescript
interface RunStore {
  runId: string | null
  phase: 'idle' | 'warmup' | 'benchmarking' | 'complete' | 'error'
  requests: Map<string, RequestResult>
  warmupTtfts: { req: number, ttft_ms: number }[]
  concurrency: number
  category: 'random' | 'shared_prefix' | 'exact_repeat'
  // actions
  startRun: (config: RunConfig) => void
  updateRequest: (update: RequestUpdate) => void
  addWarmupTtft: (point: WarmupTtft) => void
  setPhase: (phase: RunPhase) => void
  completeRun: (summary: AggregatedResult) => void
}
```

### experimentStore (Zustand)
```typescript
interface ExperimentStore {
  experiments: Run[]               // all past runs
  selectedIds: [string?, string?]  // for comparison (max 2)
  comparison: ComparisonResult | null
  fetchExperiments: () => Promise<void>
  selectForComparison: (id: string) => void
  fetchComparison: () => Promise<void>
}
```

---

## Chart Specifications

### GpuChart (recharts LineChart)
- Data: last 120 MetricsSnapshot.gpu_util values
- X axis: relative time labels (`-60s` → `now`)
- Y axis: 0–100%
- Line color: `#2563EB` (blue)
- Fill: `rgba(37,99,235,0.06)`
- Update: on every `metrics:snapshot` socket event
- No animation (animation: false) — live data flickers with animation

### TpsChart (recharts LineChart)
- Data: last 120 MetricsSnapshot.tokens_per_sec values
- Y axis: 0 → auto (don't fix max — throughput varies by experiment)
- Line color: `#059669` (green)
- Same fill/animation rules as GpuChart

### TtftChart (recharts BarChart or ScatterChart)
- Data: all completed requests in current run, TTFT value per request
- X axis: request sequence number
- Y axis: TTFT ms
- Color: blue for benchmark requests, amber for warmup
- Shows distribution — you can see outliers visually

### WarmupChart (recharts LineChart)
- Data: warmupTtfts array from runStore
- X axis: warmup request number (0–19)
- Y axis: TTFT ms
- Shows the stabilisation curve — starts high (cold), falls to steady state
- Render only during warmup phase — replace with TtftChart after warmup

### QueueBars (custom progress bars, NOT recharts)
- Four rows: Requests Running / Requests Waiting / KV Cache % / TTFT P50
- Each row: label | progress bar | value
- Animate with CSS transition-all duration-500
- Update every 500ms from metricsStore.latest

### ComparisonTable
- Columns: Experiment | TTFT P50 | TTFT P90 | TTFT P99 | Tok/s | GPU Util | KV Cache | TPOT
- Each cell shows value + % change vs baseline (first row)
- Green = improvement, red = regression
- Current running experiment highlighted in blue
- Not-yet-run experiments show `—`

---

## RequestCard States

```
queued     → grey border, "Waiting..." text, no metrics
prefilling → amber pulsing left border, shimmer animation
decoding   → blue pulsing left border, streaming tokens visible, tps updating
done       → green left border, grey background, all metrics shown
error      → red left border, error message shown
```

Each card shows:
- Request ID + category badge
- Prompt preview (1 line, truncated with ellipsis)
- Streaming token text (truncated to last 100 chars during decode)
- Metrics row: `TTFT: 287ms | Tokens: 143 | 38 tok/s`
- Progress bar: % of expected output tokens generated (token_count / 200)

---

## npm Workspaces Setup

```json
// root package.json
{
  "name": "llm-bench",
  "private": true,
  "workspaces": ["frontend", "backend/api", "backend/consumers"],
  "scripts": {
    "dev": "concurrently \"npm run dev -w frontend\" \"npm run dev -w backend/api\" \"npm run dev -w backend/consumers\"",
    "build": "npm run build -w frontend && npm run build -w backend/api && npm run build -w backend/consumers",
    "health": "curl -s http://localhost:3001/health | jq"
  },
  "devDependencies": {
    "concurrently": "^8.2"
  }
}
```

```json
// backend/api/package.json
{
  "name": "@llm-bench/api",
  "scripts": {
    "dev": "ts-node --watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

```json
// backend/consumers/package.json
{
  "name": "@llm-bench/consumers",
  "scripts": {
    "dev": "ts-node --watch src/worker.ts",
    "build": "tsc",
    "start": "node dist/worker.ts"
  }
}
```

---

## Docker Compose (Redis only)

```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

Start: `docker compose up -d redis`

---

## GPU Server Scripts

```bash
# gpu-scripts/start_vllm.sh — baseline config
#!/bin/bash
vllm serve Qwen/Qwen2.5-7B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --dtype float16 \
  --gpu-memory-utilization 0.90 \
  --max-model-len 4096 \
  --max-num-seqs 256 \
  --disable-log-requests

# gpu-scripts/start_agent.py — run before vLLM
# Exposes pynvml metrics on :9100/gpu
```

When GPU server IP changes (new Vast.ai instance):
1. Update `GPU_SERVER_IP` in `.env`
2. Run `pm2 restart api` (or `ts-node src/server.ts`)
3. Check `/health/gpu` and `/health/vllm` — both should show `ok`

---

## Coding Standards

### TypeScript
- Strict mode enabled in all tsconfig.json files
- No `any` — use `unknown` and narrow with guards
- All Socket.IO events typed in `types/socket.ts`
- Zod validation on all incoming REST request bodies

### Error handling
- All async functions: try/catch, never let errors bubble unhandled
- loadGenerator: catch per-request errors, set `state: 'error'`, continue other requests
- metricsCollector: log poll errors but never crash the interval
- BullMQ jobs: use `job.updateProgress()` for warmup % — visible in Bull Board

### Logging
- Use `console.log` with structured JSON objects, not string concatenation
- Always include `{ runId, phase, ts: Date.now() }` context in log lines
- GPU server timestamp vs Node receive time: always log both when relevant

### Never do
- Never emit a Socket.IO event for every single token (batch to 5 tokens or 100ms)
- Never re-download model weights on GPU server restart (use persistent volume)
- Never mix warmup results with benchmark results in any query or aggregate
- Never use `Promise.all` without `p-limit` for concurrent vLLM requests
- Never timestamp metrics at the Node receiver — always use GPU server timestamp

---

## Development Workflow

### Phase 1 — Build with mock data (no GPU needed)
1. `docker compose up -d redis`
2. `npm run dev` from root
3. In `metricsCollector.ts`: return mock data when `GPU_SERVER_IP` is not set
4. In `loadGenerator.ts`: return mock SSE responses when `VLLM_URL` is not set
5. Full UI works — charts animate, cards update — zero GPU cost

### Phase 2 — Connect real GPU
1. Rent A100 on Vast.ai or RunPod
2. SSH in, start `gpu_agent.py` then `start_vllm.sh`
3. Update `.env`: `GPU_SERVER_IP=<ip>`
4. Restart API: `pm2 restart api`
5. `GET /health` — verify gpu_agent and vllm both show `ok`
6. Run first warmup + benchmark from UI

### Phase 3 — Run experiments
```
Experiment 1: baseline        → name: "baseline-vllm-0.6.3"
Experiment 2: prefix cache    → add --enable-prefix-caching to start_vllm.sh
Experiment 3: chunked prefill → add --enable-chunked-prefill
Experiment 4: AWQ quant       → use quantized model, update name
Experiment 5: spec decode     → add --speculative-model flag
Experiment 6: SGLang          → swap start_vllm.sh for start_sglang.sh
```

Each experiment: restart vLLM with new config → run benchmark → export results JSON → commit to `/results/`

---

## Publishing Results

After each experiment:
```bash
# Export results for GitHub
curl http://localhost:3001/results/<runId>/export > results/<experiment-name>.json
git add results/
git commit -m "benchmark: add <experiment-name> results"
git push
```

Include in every LinkedIn article:
- Exact vLLM version and model name
- GPU hardware (from `gpu_name` field in metrics)
- Vast.ai instance screenshot
- Link to raw JSON in GitHub repo
- `warmup_excluded: true` confirmation — shows methodology
