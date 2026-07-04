---
name: tunnel-serializes-benchmark
description: Benchmark "requests run one-at-a-time" traced to the trycloudflare quick tunnel, not the app or vLLM
metadata:
  type: project
---

Symptom: during a benchmark run, requests appeared to execute serially (one at a time) instead of at the configured concurrency.

Root cause (proven by direct probing 2026-07-04): NOT the app and NOT vLLM.
- `loadGenerator.makeLimit` correctly fires `concurrency` requests in parallel.
- vLLM batches fine — measured `vllm:num_requests_running=8.0` with 8 concurrent streaming completions.
- The `*.trycloudflare.com` quick tunnels (VLLM_URL / GPU_AGENT_URL) are the bottleneck: ephemeral and unstable under sustained concurrent streaming load. Observed serving 8 concurrent streams, then dropping to HTTP 000 minutes later.

Implication: benchmark TTFT/throughput measured through a quick tunnel are polluted by tunnel latency/throttling, not the GPU — undermines result validity.

**How to apply:** For real benchmarking, avoid trycloudflare quick tunnels. Prefer a direct connection to `GPU_SERVER_IP` (e.g. http://<ip>:8000), a persistent named Cloudflare tunnel, Tailscale, or SSH port-forward. When diagnosing "serial requests," probe the tunnel/vLLM directly (parallel curls + poll `vllm:num_requests_running`) before suspecting [[loadGenerator]] concurrency code.
