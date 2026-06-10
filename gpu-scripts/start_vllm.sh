#!/bin/bash
# Gemma 3 4B — default model for this benchmark project
# Requires: huggingface-cli login (Gemma is a gated model)
# Run this on the Vast.ai GPU instance before starting benchmarks

vllm serve google/gemma-3-4b-it \
  --host 0.0.0.0 \
  --port 8000 \
  --dtype float16 \
  --gpu-memory-utilization 0.90 \
  --max-model-len 4096 \
  --max-num-seqs 256 \
  --disable-log-requests
