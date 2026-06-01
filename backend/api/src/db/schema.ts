import db from './connection'

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      config      TEXT NOT NULL,
      phase       TEXT NOT NULL DEFAULT 'pending',
      started_at  INTEGER,
      ended_at    INTEGER,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS requests (
      id            TEXT PRIMARY KEY,
      run_id        TEXT NOT NULL REFERENCES runs(id),
      run_number    INTEGER NOT NULL,
      prompt_id     TEXT NOT NULL,
      category      TEXT NOT NULL,
      phase         TEXT NOT NULL,
      prompt_text   TEXT NOT NULL,
      t0            INTEGER,
      t1            INTEGER,
      t2            INTEGER,
      t3            INTEGER,
      ttft_ms       INTEGER,
      prefill_ms    INTEGER,
      decode_ms     INTEGER,
      total_ms      INTEGER,
      token_count   INTEGER DEFAULT 0,
      tpot_ms       REAL,
      finish_reason TEXT,
      error         TEXT
    );

    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id            TEXT NOT NULL REFERENCES runs(id),
      ts                INTEGER NOT NULL,
      transport_ms      INTEGER,
      gpu_util          INTEGER,
      vram_used_mb      INTEGER,
      vram_total_mb     INTEGER,
      power_w           REAL,
      temp_c            INTEGER,
      gpu_name          TEXT,
      kv_cache_pct      REAL,
      requests_running  INTEGER,
      requests_waiting  INTEGER,
      requests_swapped  INTEGER,
      tokens_per_sec    REAL,
      ttft_p50_ms       REAL,
      ttft_p99_ms       REAL
    );

    CREATE TABLE IF NOT EXISTS aggregated_results (
      run_id                  TEXT PRIMARY KEY REFERENCES runs(id),
      ttft_p50_ms             REAL,
      ttft_p90_ms             REAL,
      ttft_p99_ms             REAL,
      ttft_stddev_ms          REAL,
      ttft_p50_random         REAL,
      ttft_p50_shared_prefix  REAL,
      ttft_p50_exact_repeat   REAL,
      tpot_p50_ms             REAL,
      tpot_p90_ms             REAL,
      tokens_per_sec_avg      REAL,
      tokens_per_sec_peak     REAL,
      gpu_util_avg            REAL,
      gpu_util_peak           REAL,
      vram_peak_mb            INTEGER,
      kv_cache_avg            REAL,
      kv_cache_peak           REAL,
      total_requests          INTEGER,
      warmup_excluded         INTEGER DEFAULT 1,
      run_count               INTEGER DEFAULT 3
    );
  `)
}
