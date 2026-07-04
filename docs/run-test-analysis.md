# "Run Test" — End-to-End Flow & Metrics Analysis

> Traced from the actual code on 2026-06-27. Covers what happens when a user clicks
> **Run Test**, what the prompts are, what "concurrency" means, how each metric is
> calculated, and which metrics are correct vs. broken.

---

## 1. What happens when you click "Run Test"

**Frontend** — [`RunControls.tsx`](../frontend/src/components/chat/RunControls.tsx) → [`useRun.ts`](../frontend/src/hooks/useRun.ts) `start()`:

1. Builds a `RunConfig` = `{ name, concurrency, category, promptCount }`.
2. Sends a **REST** `POST /api/run/start` (note: **not** a socket emit — the
   `run:start` socket event documented in CLAUDE.md does not exist; the pipeline
   is a REST route. The code comment in `useRun.ts` says so explicitly).
3. Receives `{ runId }`, calls `startRun(...)` to seed local run state.

**Backend** — [`routes/run.ts`](../backend/api/src/routes/run.ts):

1. Validates the body with Zod (`RunStartSchema`).
2. Guards "one run at a time" (`runInProgress`).
3. Inserts a `runs` row, responds `{ runId }` immediately.
4. Runs the pipeline asynchronously via `setImmediate`:
   - `selectPrompts(category, promptCount)`
   - phase **warmup** → `startMetricsCollector()` → `runWarmup` (20 requests)
   - phase **benchmarking** → **3 benchmark runs**, each over the full prompt list
   - `stopMetricsCollector()` → `computeAggregatedResult` → `saveAggregatedResult`
   - phase **complete** → emits `run:complete` with the summary

**Live stream** — the socket then pushes to the UI:
- `phase:change` on each transition
- `metrics:snapshot` every 500ms (always-on loop)
- `request:update` per request (`queued → prefilling → decoding → done`)

---

## 2. What the prompts are

Defined locally in [`sheetsLoader.ts`](../backend/api/src/utils/sheetsLoader.ts).
Source is `local` unless Google Sheets is configured (it is not in this setup).

| Category | Count | Description |
|---|---|---|
| `random` | 15 | Short distinct questions ("Explain KV cache…", "What is speculative decoding?", …) |
| `shared_prefix` | 6 | All share one long ~60-word prefix + a different tail — designed to exercise vLLM prefix caching |
| `exact_repeat` | 1 | A single fixed prompt sent repeatedly — strongest possible cache hit |

`selectPrompts(category, count)`:
- Filters the pool to the chosen category (falls back to the whole pool only if a
  category is empty, so a run never starts empty).
- Cycles that pool with `i % pool.length` until it has `count` prompts.

> **Implication:** picking `random` with `promptCount = 100` sends the same 15
> prompts ~7× over. After the first pass, even "random" produces cache hits.

Each request is sent to `POST /v1/completions` with `max_tokens: 256, stream: true`.

---

## 3. What "concurrency 10" means

In [`loadGenerator.ts`](../backend/api/src/utils/loadGenerator.ts), `makeLimit(10)`
caps **at most 10 streaming `/v1/completions` requests open against the server at
once**. As one finishes, the next dequeues. All `promptCount` requests run, but only
10 are in flight simultaneously.

> Note: this is a hand-rolled limiter, not `p-limit` as CLAUDE.md mandates. It works
> but deviates from the documented standard.

---

## 4. Metrics — approach & what is actually broken

Two **independent** sources feed each `metrics:snapshot`
([`metricsCollector.ts`](../backend/api/src/utils/metricsCollector.ts)):

| Metric | Source | Status |
|---|---|---|
| GPU util, VRAM, power, temp | GPU agent `GET /gpu` (:9100 tunnel) | ✅ **works** |
| tok/s, KV cache %, requests running/waiting, server TTFT p50/p99 | vLLM `GET /metrics` (Prometheus) | ❌ **dead (404)** |

### Root cause: `VLLM_URL/metrics` returns HTTP 404

Probed live on 2026-06-27:

```
HTTP 404  <- /metrics
HTTP 404  <- /version
HTTP 200  <- /health
HTTP 200  <- /v1/models
```

The collector checks `if (vllmRes.ok)`. A 404 is not ok, so it keeps the **all-zeros
default** `vllmData` on every tick. Therefore:

- `tokens_per_sec` is derived from the `vllm:generation_tokens_total` counter delta
  → the counter is never read → **always 0**.
- `kv_cache_pct`, `requests_running`, `requests_waiting`, server TTFT p50/p99
  → **always 0**.

This is exactly the observed symptom: **GPU util + VRAM move (agent works), while
tok/s and KV cache stay frozen (vLLM metrics 404).** It is not a UI bug.

### Why 404?

The server behind `VLLM_URL` serves the OpenAI subset (`/health`, `/v1/models`,
`/v1/completions`) but **not** vLLM's `/metrics` or `/version`, and `/v1/models`
reports `owned_by: "huggingface"`. That suggests it is **not vanilla vLLM** (or vLLM
started with stats disabled) — possibly HF TGI's OpenAI shim, a LiteLLM/proxy, or a
wrapper. No Prometheus endpoint = no live throughput / KV data.

---

## 5. Are the final (aggregated) numbers correct?

[`aggregator.ts`](../backend/api/src/utils/aggregator.ts) splits cleanly between two
data origins:

| Aggregated field | Source | Trustworthy? |
|---|---|---|
| TTFT p50/p90/p99, TTFT stddev, per-category TTFT, TPOT p50/p90 | `requests` table (**client-side** `t0..t3` timestamps) | ✅ Yes — independent of the broken `/metrics` |
| `gpu_util_avg/peak`, `vram_peak_mb` | `metric_snapshots` (GPU agent) | ✅ Yes |
| `tokens_per_sec_avg/peak`, `kv_cache_avg/peak` | `metric_snapshots` (vLLM `/metrics`) | ❌ **Always 0** — inherits the 404 |

**Headline latency numbers (TTFT/TPOT) are sound.** Only the throughput and KV-cache
aggregates are garbage because their snapshot source is dead.

---

## 6. Loose ends / correctness notes

Even if `/metrics` were live, these remain:

1. **Server TTFT p50/p99 from the histogram is cumulative since server start**, not
   windowed per run ([`prometheusParser.ts`](../backend/api/src/utils/prometheusParser.ts)
   `interpolatePercentile` uses lifetime bucket totals). The client-side per-request
   TTFT is the accurate one — and that is what the aggregator uses for the report.
2. **`tokens_per_sec` is a server-wide counter**, not scoped to the run. Fine on a
   dedicated box, misleading if anything else shares the server.
3. **"random" is not really random** — cycling 15 prompts 7× means everything after
   the first 15 is a cache hit, so the three categories partly converge at high count.
4. **Warmup uses `prompts.slice(0, 20)`** of the already-cycled list.
5. **Custom `makeLimit`** instead of the `p-limit` mandated by CLAUDE.md.
6. **`/health/vllm` does not surface the 404** — the dead metrics endpoint fails
   silently to zero instead of reporting "metrics endpoint missing."

---

## 7. Fix path

Throughput + KV cards will stay flat until one of:

- **(A) Client-side throughput fallback** — derive tok/s from the tokens already
  streamed in `loadGenerator` (`token_count / decode_ms` per request, summed over the
  concurrency window). Works regardless of `/metrics`. **Recommended** — makes the
  dashboard useful with the current server.
- **(B) Surface the failure** — make `/health/vllm` explicitly report
  "metrics endpoint missing (404)" so the dead data is visible, not silently zero.
- **(C) Point at a real Prometheus source** — connect to a server that actually
  exposes vLLM `/metrics` (recovers KV cache %, which cannot be derived client-side).

> KV cache % genuinely cannot be recovered without the server endpoint — only
> options A/C address throughput, and only C recovers KV cache.
